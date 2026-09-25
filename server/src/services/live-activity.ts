import { db } from '../db/index.js';
import { sendLiveActivityPush } from './notifications.js';

// The iOS Live Activity that shows the host's own open door on the Lock Screen and in
// the Dynamic Island. The app starts it and hands us its push token; from then on the
// server keeps it current, since the app is usually closed while guests say they're
// on their way. On iOS 17.2+ the server can also start it (push-to-start) when the door
// opens without the app: a scheduled session reaching its start, or a door opened on
// another device. The shape here must match DoorActivityAttributes.ContentState in
// ios/App/App/DoorActivityAttributes.swift.

export interface DoorActivityState {
  closesAt: number;
  note: string | null;
  location: string | null;
  going: string[];
  goingCount: number;
}

// Names shown on the activity; the rest are only counted.
const MAX_NAMES = 3;

export function doorActivityState(statusId: string): { state: DoorActivityState; ended: boolean } | null {
  const s = db.prepare('SELECT note, location, closes_at, closed_at FROM statuses WHERE id = ?')
    .get(statusId) as { note: string | null; location: string | null; closes_at: number; closed_at: number | null } | undefined;
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
    state: {
      closesAt: s.closes_at,
      note: s.note || null,
      location: s.location || null,
      going: names.slice(0, MAX_NAMES),
      goingCount: names.length,
    },
    ended: s.closed_at !== null || s.closes_at <= now,
  };
}

export function saveLiveActivityStartToken(userId: string, sessionId: string | null, token: string) {
  db.prepare(`
    INSERT INTO live_activity_start_tokens (token, user_id, session_id) VALUES (?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, session_id = excluded.session_id, updated_at = unixepoch()
  `).run(token, userId, sessionId);
}

// Start the door's Live Activity on the host's iPhones. `exceptSessionId` is the device
// that opened the door, which starts its own. Does nothing once an activity is running.
export function startLiveActivityRemotely(statusId: string, exceptSessionId?: string | null) {
  const s = db.prepare('SELECT user_id FROM statuses WHERE id = ?').get(statusId) as { user_id: string } | undefined;
  const current = doorActivityState(statusId);
  if (!s || !current || current.ended) return;
  if (db.prepare('SELECT 1 FROM live_activity_tokens WHERE status_id = ?').get(statusId)) return;

  const tokens = (db.prepare(`
    SELECT token FROM live_activity_start_tokens WHERE user_id = ? AND session_id IS NOT ?
  `).all(s.user_id, exceptSessionId ?? null) as Array<{ token: string }>).map(r => r.token);
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

// Push the door's current state to its Live Activity, or end it once the door is closed.
// Call after anything the activity shows changes. Does nothing if no activity is running.
export function syncLiveActivity(statusId: string) {
  const tokens = (db.prepare('SELECT token FROM live_activity_tokens WHERE status_id = ?')
    .all(statusId) as Array<{ token: string }>).map(r => r.token);
  if (!tokens.length) return;
  const current = doorActivityState(statusId);
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
