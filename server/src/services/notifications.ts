import { db } from '../db/index.js';
import { createSign } from 'crypto';
import * as http2 from 'http2';
import { log } from './analytics.js';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  actions?: Array<{ id: string; title: string }>;
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

async function sendApns(token: string, payload: PushPayload): Promise<void> {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const privateKey = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const bundleId = process.env.APNS_BUNDLE_ID ?? 'cc.dropby.app';

  if (!keyId || !teamId || !privateKey) {
    console.log(`[APNs] not configured — ${token.slice(0, 20)}… | ${payload.title}: ${payload.body}`);
    return;
  }
  const jwt = getApnsJwt(teamId, keyId, privateKey);
  const session = getApnsSession();
  const sandbox = process.env.APNS_SANDBOX === 'true' || process.env.NODE_ENV !== 'production';
  const host = sandbox ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
  console.log(`[APNs] Sending to ${host} — token=${token.slice(0, 20)}… | ${payload.title}`);

  const apnsBody = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: 'default',
    },
    ...payload.data,
  });

  return new Promise((resolve) => {
    const req = session.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      ':authority': host,
      'authorization': `bearer ${jwt}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(apnsBody)),
    });

    req.write(apnsBody);
    req.end();

    let status = 0;
    req.on('response', (headers) => { status = Number(headers[':status']); });

    let responseData = '';
    req.on('data', (chunk) => { responseData += chunk; });
    req.on('end', () => {
      if (status === 200) console.log(`[APNs] Delivered — token=${token.slice(0, 20)}…`);
      else console.error(`[APNs] ${status}:`, responseData);
      resolve();
    });
    req.on('error', (err) => {
      console.error('[APNs] Request error:', err.message);
      resolve();
    });
  });
}

// ── Router ────────────────────────────────────────────────────
async function sendPush(userId: string, token: string, platform: string, payload: PushPayload) {
  try {
    if (platform === 'android') {
      await sendFcm(token, payload);
    } else if (platform === 'ios') {
      await sendApns(token, payload);
    }
  } catch (err: any) {
    log('push.fail', userId, { type: payload.data?.type ?? 'unknown', platform, error: err.message });
  }
}

function getPushTokens(userId: string) {
  return db
    .prepare('SELECT token, platform FROM push_tokens WHERE user_id = ?')
    .all(userId) as Array<{ token: string; platform: string }>;
}

// ── Public notification functions ─────────────────────────────
export function notifyFriendDoorOpen(recipientId: string, openerName: string, note: string | null) {
  const tokens = getPushTokens(recipientId);
  if (!tokens.length) return;
  // Log once per recipient — used to measure door_open push → going conversion
  log('push.sent', recipientId, { type: 'door_open' });
  const body = note ? `"${note}"` : 'Come drop by!';
  tokens.forEach(t =>
    sendPush(recipientId, t.token, t.platform, {
      title: `${openerName} opened their door`,
      body,
      data: { type: 'door_open' },
    })
  );
}

export function notifyGoingSignal(hostId: string, guestName: string, note?: string | null) {
  const tokens = getPushTokens(hostId);
  console.log(`[Push] notifyGoingSignal — hostId=${hostId} tokens=${tokens.length}`);
  const body = note ? `"${note}"` : 'See you soon!';
  tokens.forEach(t =>
    sendPush(hostId, t.token, t.platform, {
      title: `${guestName} is on their way`,
      body,
      data: { type: 'going_signal' },
    })
  );
}

export function notifyGoingReminder(userId: string, hostName: string, startsAt: number, type: 'day' | 'soon' = 'soon') {
  const tokens = getPushTokens(userId);
  const date = new Date(startsAt * 1000);
  const timeStr = date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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

export function notifyFriendJoined(inviterId: string, newFriendName: string) {
  const tokens = getPushTokens(inviterId);
  tokens.forEach(t =>
    sendPush(inviterId, t.token, t.platform, {
      title: 'dropby',
      body: `${newFriendName} just joined your dropby!`,
      data: { type: 'friend_joined' },
    })
  );
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
    })
  );
}

export function notifyScheduledSession(recipientId: string, hostName: string, startsAt: number) {
  const tokens = getPushTokens(recipientId);
  const date = new Date(startsAt * 1000);
  const dayTime = date.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
  tokens.forEach(t =>
    sendPush(recipientId, t.token, t.platform, {
      title: `${hostName} scheduled a session`,
      body: `Opening ${dayTime}`,
      data: { type: 'scheduled_session' },
    })
  );
}

export function notifyScheduledReminder(userId: string, startsAt: number) {
  const tokens = getPushTokens(userId);
  const date = new Date(startsAt * 1000);
  const timeStr = date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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
      body: 'Open your door again? Change nudge timing anytime in Profile.',
      data: { type: 'auto_nudge' },
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
