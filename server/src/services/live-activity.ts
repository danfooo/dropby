import { db } from '../db/index.js';
import { sendFcmData, sendLiveActivityPush } from './notifications.js';

// The host's own open door, kept live outside the app while it is open.
//
// iOS: a Live Activity on the Lock Screen and in the Dynamic Island. The app starts it
// and hands us its push token; from then on the server keeps it current, since the app
// is usually closed while guests say they're on their way. On iOS 17.2+ the server can
// also start it (push-to-start) when the door opens without the app: a scheduled
// session reaching its start, or a door opened on another device. The shape here must
// match DoorActivityAttributes.ContentState in ios/App/App/DoorActivityAttributes.swift.
//
// Android: an ongoing notification, promoted to a Live Update on Android 16+. The server
// drives it entirely, with data-only FCM messages to the host's Android devices
// (android/app/src/main/java/cc/dropby/app/DoorNotification.java).

export interface DoorActivityState {
  closesAt: number;
  note: string | null;
  location: string | null;
  going: string[];
  goingCount: number;
}

// Names shown on the activity; the rest are only counted.
const MAX_NAMES = 3;

interface DoorActivity {
  hostId: string;
  state: DoorActivityState;
  ended: boolean;
  // A scheduled session only shows once its start time has come.
  started: boolean;
}

export function doorActivityState(statusId: string): DoorActivity | null {
  const s = db.prepare('SELECT user_id, note, location, closes_at, closed_at, starts_at FROM statuses WHERE id = ?')
    .get(statusId) as {
      user_id: string; note: string | null; location: string | null;
      closes_at: number; closed_at: number | null; starts_at: number | null;
    } | undefined;
  if (!s) return null;
  const names = (db.prepare(`
    SELECT COALESCE(u.display_name, gc.name, 'Guest') AS name
    FROM going_signals gs
    LEFT JOIN users u ON u.id = gs.user_id
    LEFT JOIN guest_contacts gc ON gc.id = gs.guest_contact_id
    WHERE gs.status_id = ?
    ORDER BY gs.created_at, gs.rowid
  `).all(statusId) as Array<{ name: string }>).map(r => r.name);
  const now = Math.floor(Date.now() / 1000);
  return {
    hostId: s.user_id,
    state: {
      closesAt: s.closes_at,
      note: s.note || null,
      location: s.location || null,
      going: names.slice(0, MAX_NAMES),
      goingCount: names.length,
    },
    ended: s.closed_at !== null || s.closes_at <= now,
    started: s.starts_at === null || s.starts_at <= (s.closed_at ?? now),
  };
}

export function saveLiveActivityStartToken(userId: string, sessionId: string | null, token: string) {
  db.prepare(`
    INSERT INTO live_activity_start_tokens (token, user_id, session_id) VALUES (?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, session_id = excluded.session_id, updated_at = unixepoch()
  `).run(token, userId, sessionId);
}

// The door has just opened. Shows it on the host's Android phones, and starts it on
// their iPhones. `exceptSessionId` is the iPhone that opened the door, which starts its
// own; Android is always driven from here.
export function startLiveActivityRemotely(statusId: string, exceptSessionId?: string | null) {
  const current = doorActivityState(statusId);
  if (!current || current.ended || !current.started) return;
  syncAndroidDoor(statusId, current);
  if (db.prepare('SELECT 1 FROM live_activity_tokens WHERE status_id = ?').get(statusId)) return;

  const tokens = (db.prepare(`
    SELECT token FROM live_activity_start_tokens WHERE user_id = ? AND session_id IS NOT ?
  `).all(current.hostId, exceptSessionId ?? null) as Array<{ token: string }>).map(r => r.token);
  if (!tokens.length) return;

  const aps = {
    timestamp: Math.floor(Date.now() / 1000),
    event: 'start',
    'content-state': current.state,
    'stale-date': current.state.closesAt,
    'attributes-type': 'DoorActivityAttributes',
    attributes: { statusId },
    // Required for push-to-start; shown as the activity appears.
    alert: {
      title: 'Your door is open',
      body: current.state.note || current.state.location || 'Friends can drop by now',
    },
  };
  for (const t of tokens) {
    void sendLiveActivityPush(t, aps).then(({ status }) => {
      if (status === 410) db.prepare('DELETE FROM live_activity_start_tokens WHERE token = ?').run(t);
    });
  }
}

export function saveLiveActivityToken(statusId: string, token: string) {
  db.prepare('INSERT OR IGNORE INTO live_activity_tokens (status_id, token) VALUES (?, ?)').run(statusId, token);
}

// Push the door's current state to the host's devices, or end it once the door is
// closed. Call after anything it shows changes.
export function syncLiveActivity(statusId: string) {
  const current = doorActivityState(statusId);
  syncIosActivity(statusId, current);
  if (current) syncAndroidDoor(statusId, current);
}

function syncIosActivity(statusId: string, current: DoorActivity | null) {
  const tokens = (db.prepare('SELECT token FROM live_activity_tokens WHERE status_id = ?')
    .all(statusId) as Array<{ token: string }>).map(r => r.token);
  if (!tokens.length) return;
  const now = Math.floor(Date.now() / 1000);

  if (!current || current.ended) {
    // Ending removes it from the Lock Screen straight away: a closed door has nothing
    // left to say, and "Hope it was a good one" is the host push's job.
    db.prepare('DELETE FROM live_activity_tokens WHERE status_id = ?').run(statusId);
    const aps = {
      timestamp: now,
      event: 'end',
      'content-state': current?.state ?? { closesAt: now, note: null, location: null, going: [], goingCount: 0 },
      'dismissal-date': now,
    };
    for (const t of tokens) void sendLiveActivityPush(t, aps);
    return;
  }

  const aps = {
    timestamp: now,
    event: 'update',
    'content-state': current.state,
    'stale-date': current.state.closesAt,
  };
  for (const t of tokens) {
    void sendLiveActivityPush(t, aps).then(({ status }) => {
      // 410: the activity is gone (the host swiped it away or it ended on the device).
      if (status === 410) db.prepare('DELETE FROM live_activity_tokens WHERE status_id = ? AND token = ?').run(statusId, t);
    });
  }
}

// Every value is a string: FCM data payloads allow nothing else. `sentAt` (ms) lets the
// phone drop a message that arrives after a newer one.
export function androidDoorMessage(statusId: string, current: DoorActivity): Record<string, string> {
  const base = { type: 'door_live', statusId, sentAt: String(Date.now()) };
  if (current.ended) return { ...base, event: 'end' };
  return {
    ...base,
    event: 'update',
    closesAt: String(current.state.closesAt),
    note: current.state.note ?? '',
    location: current.state.location ?? '',
    going: JSON.stringify(current.state.going),
    goingCount: String(current.state.goingCount),
  };
}

function syncAndroidDoor(statusId: string, current: DoorActivity) {
  // A scheduled session that hasn't started was never shown, so there is nothing to end.
  if (!current.started) return;
  const tokens = (db.prepare("SELECT token FROM push_tokens WHERE user_id = ? AND platform = 'android'")
    .all(current.hostId) as Array<{ token: string }>).map(r => r.token);
  if (!tokens.length) return;
  const data = androidDoorMessage(statusId, current);
  for (const t of tokens) void sendFcmData(t, data);
}
