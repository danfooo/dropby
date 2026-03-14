import { db } from '../db/index.js';

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
  }
}

// ── APNs (iOS) ────────────────────────────────────────────────
async function sendApns(token: string, payload: PushPayload) {
  // TODO: implement when APNs key is available
  console.log(`[APNs] ${token.slice(0, 20)}… | ${payload.title}: ${payload.body}`);
}

// ── Router ────────────────────────────────────────────────────
async function sendPush(token: string, platform: string, payload: PushPayload) {
  if (platform === 'android') {
    await sendFcm(token, payload);
  } else if (platform === 'ios') {
    await sendApns(token, payload);
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
  const body = note ? `"${note}"` : 'Come drop by!';
  tokens.forEach(t =>
    sendPush(t.token, t.platform, {
      title: `${openerName} opened their door`,
      body,
      data: { type: 'door_open' },
    })
  );
}

export function notifyGoingSignal(hostId: string, guestName: string) {
  const tokens = getPushTokens(hostId);
  tokens.forEach(t =>
    sendPush(t.token, t.platform, {
      title: "Someone's on their way!",
      body: `${guestName} is coming`,
      data: { type: 'going_signal' },
    })
  );
}

export function notifyDoorClosingSoon(userId: string, statusId: string) {
  const tokens = getPushTokens(userId);
  tokens.forEach(t =>
    sendPush(t.token, t.platform, {
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
    sendPush(t.token, t.platform, {
      title: 'dropby',
      body: `Hey, got a free ${dayName}? Open your door`,
      data: { type: 'nudge' },
    })
  );
}

export function notifyAutoNudge(userId: string) {
  const tokens = getPushTokens(userId);
  tokens.forEach(t =>
    sendPush(t.token, t.platform, {
      title: 'dropby',
      body: 'You opened your door this time last week — open it again?',
      data: { type: 'auto_nudge' },
    })
  );
}
