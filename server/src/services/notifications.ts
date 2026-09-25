import { db } from '../db/index.js';
import { createSign, randomUUID } from 'crypto';
import * as http2 from 'http2';
import { log } from './analytics.js';
import { broadcastSSE } from './sse.js';
import { formatScheduledDayTime, formatScheduledTime } from '../utils/time-format.js';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  actions?: Array<{ id: string; title: string }>;
}

// Quiet hours: suppress "friend opened their door" pushes between 22:00–08:00
// in the recipient's local time (falls back to UTC if no timezone is stored).
const QUIET_HOURS_START = 22;
const QUIET_HOURS_END = 8;

export function isQuietHours(userId: string): boolean {
  const user = db.prepare('SELECT timezone FROM users WHERE id = ?').get(userId) as { timezone: string | null } | undefined;
  const tz = user?.timezone || 'UTC';
  let hour: number;
  try {
    hour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date()));
  } catch {
    hour = new Date().getUTCHours();
  }
  return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
}

// Once-per-day cap: check whether this recipient was already notified about this
// host's door opening today (in the recipient's local timezone).
export function alreadyNotifiedToday(recipientId: string, lastNotifiedAt: number | null): boolean {
  if (!lastNotifiedAt) return false;
  const tz = (db.prepare('SELECT timezone FROM users WHERE id = ?').get(recipientId) as { timezone: string | null } | undefined)?.timezone || 'UTC';
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(new Date()) === fmt.format(new Date(lastNotifiedAt * 1000));
  } catch {
    return new Date().toISOString().slice(0, 10) === new Date(lastNotifiedAt * 1000).toISOString().slice(0, 10);
  }
}

// Record that a "door open" notification was sent, for the once-per-day cap.
export function recordDoorOpenNotified(recipientId: string, hostUserId: string, nowUnix: number): void {
  db.prepare(`
    INSERT INTO friend_notif_prefs (user_id, friend_user_id, pref, last_notified_at)
    VALUES (?, ?, 'default', ?)
    ON CONFLICT(user_id, friend_user_id) DO UPDATE SET last_notified_at = excluded.last_notified_at
  `).run(recipientId, hostUserId, nowUnix);
}

// True while `userId` has `otherId` hidden (muted). A mute with a passed expiry no longer counts.
export function isHidden(userId: string, otherId: string): boolean {
  return !!db.prepare(`
    SELECT 1 FROM friend_hides
    WHERE user_id = ? AND hidden_user_id = ? AND (expires_at IS NULL OR expires_at > unixepoch())
  `).get(userId, otherId);
}

// Either side has muted the other. A muted friend's doors are also left out of the
// muting person's feed, so a push about one would point at nothing.
export function isHiddenEitherWay(a: string, b: string): boolean {
  return isHidden(a, b) || isHidden(b, a);
}

// The one rule for whether a recipient gets a "door opened" push. Every path that
// announces an open door goes through announceDoorOpen, so the rule lives only here.
function shouldPushDoorOpen(recipientId: string, hostId: string): boolean {
  if (isHiddenEitherWay(recipientId, hostId)) return false;
  // Quiet hours: don't push "door opened" overnight in the recipient's timezone.
  if (isQuietHours(recipientId)) return false;
  const prefRow = db.prepare(
    'SELECT pref, last_notified_at FROM friend_notif_prefs WHERE user_id = ? AND friend_user_id = ?'
  ).get(recipientId, hostId) as { pref: string; last_notified_at: number | null } | undefined;
  const pref = prefRow?.pref ?? 'default';
  if (pref === 'none') return false;
  // Once per calendar day per recipient per host (in recipient's local timezone).
  // pref === 'all' bypasses this cap.
  if (pref === 'default' && alreadyNotifiedToday(recipientId, prefRow?.last_notified_at ?? null)) return false;
  return true;
}

// Tell a door's recipients it is open: a push to those the policy allows, a live update
// to all of them, and a mark on the status that friends now know (so a later close is
// announced too).
export function announceDoorOpen(statusId: string) {
  const status = db.prepare(`
    SELECT s.id, s.user_id, s.note, s.closes_at, u.display_name
    FROM statuses s JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `).get(statusId) as { id: string; user_id: string; note: string | null; closes_at: number; display_name: string } | undefined;
  if (!status) return;

  const nowUnix = Math.floor(Date.now() / 1000);
  const recipients = (db.prepare('SELECT user_id FROM status_recipients WHERE status_id = ?')
    .all(status.id) as Array<{ user_id: string }>).map(r => r.user_id);

  for (const rid of recipients) {
    if (!shouldPushDoorOpen(rid, status.user_id)) continue;
    notifyFriendDoorOpen(rid, status.display_name, status.note || null, status.id, status.user_id);
    recordDoorOpenNotified(rid, status.user_id, nowUnix);
  }

  broadcastSSE(recipients, 'status:open', {
    status_id: status.id,
    owner_id: status.user_id,
    owner_name: status.display_name,
    note: status.note || null,
    closes_at: status.closes_at,
  });

  db.prepare('UPDATE statuses SET notifications_sent = 1 WHERE id = ?').run(status.id);
}

// ── FCM (Android) ─────────────────────────────────────────────
let fcmAccessToken: { token: string; expires: number } | null = null;

async function getFcmAccessToken(): Promise<string | null> {
  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const privateKeyId = process.env.FCM_PRIVATE_KEY_ID;
  if (!projectId || !clientEmail || !privateKey || !privateKeyId) return null;

  if (fcmAccessToken && fcmAccessToken.expires > Date.now() + 60_000) {
    return fcmAccessToken.token;
  }

  try {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
      credentials: { client_email: clientEmail, private_key: privateKey },
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });
    const client = await auth.getClient();
    const { token, res } = await client.getAccessToken();
    if (!token) return null;
    const expires = res?.data?.expiry_date ?? Date.now() + 3_600_000;
    fcmAccessToken = { token, expires };
    return token;
  } catch (err: any) {
    console.error('[FCM] Auth error:', err.message);
    return null;
  }
}

async function sendFcm(token: string, payload: PushPayload) {
  const projectId = process.env.FCM_PROJECT_ID;
  const accessToken = await getFcmAccessToken();
  if (!accessToken || !projectId) return;

  const message = {
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
      android: {
        notification: {
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          channel_id: 'drop_by_default',
        },
      },
    },
  };

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error('[FCM] Send error:', err);
    throw new Error(`FCM ${res.status}: ${err.slice(0, 200)}`);
  }
}

// A data-only message: nothing is shown by the system, the app's own messaging service
// (android/.../DoorMessagingService.java) decides what to do. High priority so it is
// delivered promptly even when the phone is idle. Never throws.
export async function sendFcmData(token: string, data: Record<string, string>): Promise<void> {
  const projectId = process.env.FCM_PROJECT_ID;
  const accessToken = await getFcmAccessToken();
  if (!accessToken || !projectId) {
    console.log(`[FCM] not configured — data ${data.type ?? ''} ${token.slice(0, 20)}…`);
    return;
  }
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token, data, android: { priority: 'high' } } }),
    });
    if (!res.ok) console.error('[FCM] Data send error:', (await res.text()).slice(0, 200));
  } catch (err: any) {
    console.error('[FCM] Data send error:', err.message);
  }
}

// ── APNs (iOS) ────────────────────────────────────────────────
let apnsJwt: { token: string; issuedAt: number } | null = null;
let apnsSession: http2.ClientHttp2Session | null = null;

function getApnsJwt(teamId: string, keyId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  if (apnsJwt && now - apnsJwt.issuedAt < 3300) return apnsJwt.token;

  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ iss: teamId, iat: now })).toString('base64url');
  const signingInput = `${header}.${body}`;

  const sign = createSign('SHA256');
  sign.update(signingInput);
  const sig = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');

  apnsJwt = { token: `${signingInput}.${sig}`, issuedAt: now };
  return apnsJwt.token;
}

function getApnsSession(): http2.ClientHttp2Session {
  const sandbox = process.env.APNS_SANDBOX === 'true' || process.env.NODE_ENV !== 'production';
  const host = sandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  if (apnsSession && !apnsSession.destroyed && !apnsSession.closed) return apnsSession;
  apnsSession = http2.connect(host);
  apnsSession.on('error', (err) => {
    console.error('[APNs] Session error:', err.message);
    apnsSession = null;
  });
  return apnsSession;
}

function apnsConfig() {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const privateKey = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const bundleId = process.env.APNS_BUNDLE_ID ?? 'cc.dropby.app';
  if (!keyId || !teamId || !privateKey) return null;
  return { keyId, teamId, privateKey, bundleId };
}

// One request to APNs. Resolves with the HTTP status (0 if the request itself failed)
// and APNs' error reason, if any; never rejects.
async function postToApns(
  token: string,
  headers: { pushType: 'alert' | 'liveactivity'; topicSuffix?: string; priority?: 5 | 10 },
  body: string,
): Promise<{ status: number; reason?: string }> {
  const cfg = apnsConfig();
  if (!cfg) return { status: 0, reason: 'not configured' };
  const jwt = getApnsJwt(cfg.teamId, cfg.keyId, cfg.privateKey);
  const session = getApnsSession();
  const sandbox = process.env.APNS_SANDBOX === 'true' || process.env.NODE_ENV !== 'production';
  const host = sandbox ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';

  return new Promise((resolve) => {
    const req = session.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      ':authority': host,
      'authorization': `bearer ${jwt}`,
      'apns-topic': cfg.bundleId + (headers.topicSuffix ?? ''),
      'apns-push-type': headers.pushType,
      ...(headers.priority ? { 'apns-priority': String(headers.priority) } : {}),
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
    });

    req.write(body);
    req.end();

    let status = 0;
    req.on('response', (h) => { status = Number(h[':status']); });

    let responseData = '';
    req.on('data', (chunk) => { responseData += chunk; });
    req.on('end', () => {
      let reason: string | undefined;
      try { reason = responseData ? JSON.parse(responseData).reason : undefined; } catch { reason = responseData; }
      resolve({ status, reason });
    });
    req.on('error', (err) => {
      console.error('[APNs] Request error:', err.message);
      resolve({ status: 0, reason: err.message });
    });
  });
}

async function sendApns(token: string, payload: PushPayload): Promise<void> {
  if (!apnsConfig()) {
    console.log(`[APNs] not configured — ${token.slice(0, 20)}… | ${payload.title}: ${payload.body}`);
    return;
  }
  console.log(`[APNs] Sending — token=${token.slice(0, 20)}… | ${payload.title}`);

  const aps: Record<string, unknown> = {
    alert: { title: payload.title, body: payload.body },
    sound: 'default',
  };
  // Use the notification type as the category ID so iOS shows registered actions
  if (payload.actions?.length && payload.data?.type) {
    aps.category = payload.data.type;
  }
  const apnsBody = JSON.stringify({
    aps,
    ...payload.data,
  });

  const { status, reason } = await postToApns(token, { pushType: 'alert' }, apnsBody);
  if (status === 200) console.log(`[APNs] Delivered — token=${token.slice(0, 20)}…`);
  else console.error(`[APNs] ${status}:`, reason);
}

// A Live Activity update or end. The topic carries the `.push-type.liveactivity` suffix
// and the token is the activity's own, not the device's.
export async function sendLiveActivityPush(token: string, aps: Record<string, unknown>) {
  if (!apnsConfig()) {
    console.log(`[APNs] not configured — live activity ${String(aps.event)} ${token.slice(0, 20)}…`);
    return { status: 0, reason: 'not configured' };
  }
  const result = await postToApns(token, { pushType: 'liveactivity', topicSuffix: '.push-type.liveactivity', priority: 10 }, JSON.stringify({ aps }));
  if (result.status !== 200) console.error(`[APNs] live activity ${result.status}:`, result.reason);
  return result;
}

// ── Router ────────────────────────────────────────────────────
async function sendPush(userId: string, token: string, platform: string, payload: PushPayload) {
  const type = payload.data?.type ?? 'unknown';
  try {
    if (platform === 'android') {
      await sendFcm(token, payload);
    } else if (platform === 'ios') {
      await sendApns(token, payload);
    }
    log('push.sent', userId, { type, platform });
  } catch (err: any) {
    log('push.fail', userId, { type, platform, error: err.message });
  }
}

function getPushTokens(userId: string) {
  return db
    .prepare('SELECT token, platform FROM push_tokens WHERE user_id = ?')
    .all(userId) as Array<{ token: string; platform: string }>;
}

// ── Public notification functions ─────────────────────────────
export function notifyFriendDoorOpen(recipientId: string, openerName: string, note: string | null, statusId?: string, openerUserId?: string) {
  const tokens = getPushTokens(recipientId);
  if (!tokens.length) return;
  const body = note ? `"${note}"` : 'Come drop by!';
  const data: Record<string, string> = { type: 'door_open' };
  if (statusId) data.statusId = statusId;
  if (openerUserId) data.openerUserId = openerUserId;
  tokens.forEach(t =>
    sendPush(recipientId, t.token, t.platform, {
      title: `${openerName} opened their door`,
      body,
      data,
      actions: [
        { id: 'going', title: 'Mark as Going' },
        { id: 'mute_3d', title: 'Mute for 3 days' },
        { id: 'mute_forever', title: 'Mute permanently' },
      ],
    })
  );
}

export function notifyGoingSignal(hostId: string, guestName: string, note?: string | null, startsAt?: number | null) {
  const tokens = getPushTokens(hostId);
  if (!tokens.length) return;
  const isScheduled = startsAt && startsAt > Math.floor(Date.now() / 1000);
  let title: string;
  if (isScheduled) {
    const tz = (db.prepare('SELECT timezone FROM users WHERE id = ?').get(hostId) as { timezone: string | null } | undefined)?.timezone || 'UTC';
    title = `${guestName} is going to your event on ${formatScheduledDayTime(startsAt!, tz)}`;
  } else {
    title = `${guestName} is on their way`;
  }
  const body = note ? `"${note}"` : (isScheduled ? 'See you then!' : 'See you soon!');
  tokens.forEach(t =>
    sendPush(hostId, t.token, t.platform, {
      title,
      body,
      data: { type: 'going_signal' },
    })
  );
}

export function notifyGoingReminder(userId: string, hostName: string, startsAt: number, type: 'day' | 'soon' = 'soon') {
  const tokens = getPushTokens(userId);
  // In the recipient's timezone — the server runs in UTC.
  const tz = (db.prepare('SELECT timezone FROM users WHERE id = ?').get(userId) as { timezone: string | null } | undefined)?.timezone || 'UTC';
  const timeStr = formatScheduledTime(startsAt, tz);
  const body = type === 'day'
    ? `${hostName} is opening their door tomorrow at ${timeStr}`
    : `${hostName}'s starts at ${timeStr}`;
  tokens.forEach(t =>
    sendPush(userId, t.token, t.platform, {
      title: 'dropby',
      body,
      data: { type: 'going_reminder' },
    })
  );
}

// Connection pushes are coalesced instead of sent per event: several people accepting
// at once, or a group chat opening the same link within a minute, would otherwise land
// as a burst of near-identical notifications. Flushed once a minute by the cron.
export function queueNotification(userId: string, type: 'friend_joined' | 'friend_suggestion', subjectName: string) {
  db.prepare('INSERT INTO queued_notifications (id, user_id, type, subject_name) VALUES (?, ?, ?, ?)')
    .run(randomUUID(), userId, type, subjectName);
}

function coalescedBody(type: string, names: string[]): string {
  const [first, second] = names;
  // Deliberately says nothing about how the suggestion was made — the reason is a
  // human one when we have it (the link's name, shown in-app) and no explanation at all
  // when we don't. The mechanism is never the copy.
  if (type === 'friend_suggestion') {
    return names.length === 1
      ? `${first} might be someone you know`
      : `${first} and ${names.length - 1} others might be people you know`;
  }
  if (names.length === 1) return `${first} just joined your dropby!`;
  if (names.length === 2) return `${first} and ${second} just joined your dropby!`;
  return `${first} and ${names.length - 1} others just joined your dropby!`;
}

// A link dropped in a group chat is opened over an evening, not in a burst. Suggestions
// therefore sit for an hour before going out, so one notification covers everyone who
// turned up in that window rather than one arriving per person.
const SUGGESTION_DELAY_SECONDS = 3600;

export function flushQueuedNotifications() {
  const rows = db.prepare('SELECT id, user_id, type, subject_name, created_at FROM queued_notifications ORDER BY created_at ASC')
    .all() as Array<{ id: string; user_id: string; type: string; subject_name: string; created_at: number }>;
  if (!rows.length) return;

  const nowUnix = Math.floor(Date.now() / 1000);
  const groups = new Map<string, { userId: string; type: string; names: string[]; ids: string[]; oldest: number }>();
  for (const r of rows) {
    const key = `${r.user_id}:${r.type}`;
    let g = groups.get(key);
    if (!g) { g = { userId: r.user_id, type: r.type, names: [], ids: [], oldest: r.created_at }; groups.set(key, g); }
    g.names.push(r.subject_name);
    g.ids.push(r.id);
    g.oldest = Math.min(g.oldest, r.created_at);
  }

  const del = db.prepare('DELETE FROM queued_notifications WHERE id = ?');
  for (const g of groups.values()) {
    if (g.type === 'friend_suggestion') {
      if (nowUnix - g.oldest < SUGGESTION_DELAY_SECONDS) continue;
      // Suggestions wait out quiet hours rather than being dropped; they are not time-critical.
      if (isQuietHours(g.userId)) continue;
    }
    g.ids.forEach(id => del.run(id));
    const tokens = getPushTokens(g.userId);
    const body = coalescedBody(g.type, g.names);
    // batch tells us whether the coalescing window is actually bundling anything.
    log(g.type === 'friend_suggestion' ? 'suggestion.notified' : 'friend_joined.notified', g.userId, { batch: g.names.length });
    tokens.forEach(t =>
      sendPush(g.userId, t.token, t.platform, { title: 'dropby', body, data: { type: g.type } })
    );
  }
}

export function notifyFriendJoined(inviterId: string, newFriendName: string) {
  queueNotification(inviterId, 'friend_joined', newFriendName);
}

// Someone new opened a link this user also opened — they are now offerable to each other.
export function notifyConnectionSuggestion(userId: string, newParticipantName: string) {
  const user = db.prepare('SELECT notif_friend_suggestions FROM users WHERE id = ?').get(userId) as any;
  if (user && user.notif_friend_suggestions === 0) return;
  queueNotification(userId, 'friend_suggestion', newParticipantName);
}

export function notifyReengagement(userId: string) {
  const tokens = getPushTokens(userId);
  tokens.forEach(t =>
    sendPush(userId, t.token, t.platform, {
      title: 'dropby',
      body: "It's been a while. Open your door?",
      data: { type: 'reengagement' },
    })
  );
}

export function notifyDoorClosingSoon(userId: string, statusId: string) {
  const tokens = getPushTokens(userId);
  tokens.forEach(t =>
    sendPush(userId, t.token, t.platform, {
      title: 'Your door closes soon',
      body: 'Your door closes in 10 minutes',
      data: { type: 'closing_soon', statusId },
      actions: [
        { id: 'prolong', title: 'Keep open' },
        { id: 'close', title: 'Close now' },
      ],
    })
  );
}

export function notifyNudge(userId: string, dayName: string) {
  const tokens = getPushTokens(userId);
  tokens.forEach(t =>
    sendPush(userId, t.token, t.platform, {
      title: 'dropby',
      body: `Hey, got a free ${dayName}? Open your door`,
      data: { type: 'nudge' },
      actions: [{ id: 'open_now', title: 'Open now' }],
    })
  );
}

export function notifyScheduledSession(recipientId: string, hostName: string, startsAt: number) {
  const tokens = getPushTokens(recipientId);
  const tz = (db.prepare('SELECT timezone FROM users WHERE id = ?').get(recipientId) as { timezone: string | null } | undefined)?.timezone || 'UTC';
  const dayTime = formatScheduledDayTime(startsAt, tz);
  tokens.forEach(t =>
    sendPush(recipientId, t.token, t.platform, {
      title: `${hostName} is opening their door`,
      body: dayTime,
      data: { type: 'scheduled_session' },
    })
  );
}

export function notifyScheduledReminder(userId: string, startsAt: number) {
  const tokens = getPushTokens(userId);
  const tz = (db.prepare('SELECT timezone FROM users WHERE id = ?').get(userId) as { timezone: string | null } | undefined)?.timezone || 'UTC';
  const timeStr = formatScheduledTime(startsAt, tz);
  tokens.forEach(t =>
    sendPush(userId, t.token, t.platform, {
      title: 'dropby',
      body: `Your door is scheduled to open at ${timeStr} — ready?`,
      data: { type: 'scheduled_reminder' },
    })
  );
}

export function notifyAutoNudge(userId: string) {
  const tokens = getPushTokens(userId);
  tokens.forEach(t =>
    sendPush(userId, t.token, t.platform, {
      title: 'dropby',
      body: 'Open your door again?',
      data: { type: 'auto_nudge' },
      actions: [
        { id: 'open_now', title: 'Open now' },
        { id: 'snooze_auto_nudge', title: "Don't show this" },
      ],
    })
  );
}

export function notifyCalendarUpdate(userId: string, icsUrl: string) {
  const tokens = getPushTokens(userId);
  tokens.forEach(t =>
    sendPush(userId, t.token, t.platform, {
      title: 'dropby',
      body: 'Time changed — tap to update your calendar',
      data: { type: 'calendar_update', icsUrl },
    })
  );
}

export function notifyDoorClosed(userId: string) {
  const tokens = getPushTokens(userId);
  tokens.forEach(t =>
    sendPush(userId, t.token, t.platform, {
      title: 'Your door is closed',
      body: 'Hope it was a good one. Open again?',
      data: { type: 'door_closed' },
    })
  );
}

export function notifyCalendarCancel(userId: string, icsUrl: string) {
  const tokens = getPushTokens(userId);
  tokens.forEach(t =>
    sendPush(userId, t.token, t.platform, {
      title: 'Session cancelled',
      body: 'Tap to remove from your calendar',
      data: { type: 'calendar_cancel', icsUrl },
    })
  );
}
