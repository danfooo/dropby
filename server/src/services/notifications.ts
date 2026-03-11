import { db } from '../db/index.js';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  actions?: Array<{ id: string; title: string }>;
}

// In production, replace with APNs/FCM implementation
function sendPush(token: string, platform: string, payload: PushPayload) {
  console.log(`[PUSH] ${platform.toUpperCase()} → ${token.slice(0, 20)}... | ${payload.title}: ${payload.body}`);
  if (payload.actions) {
    console.log(`[PUSH] Actions: ${payload.actions.map(a => a.title).join(', ')}`);
  }
}

function getPushTokens(userId: string) {
  return db
    .prepare('SELECT token, platform FROM push_tokens WHERE user_id = ?')
    .all(userId) as Array<{ token: string; platform: string }>;
}

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
      title: 'Someone\'s on their way!',
      body: `${guestName} said, they are going!`,
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
      title: 'Drop By',
      body: `Hey, got a free ${dayName}? Open your door`,
      data: { type: 'nudge' },
    })
  );
}

export function notifyAutoNudge(userId: string) {
  const tokens = getPushTokens(userId);
  tokens.forEach(t =>
    sendPush(t.token, t.platform, {
      title: 'Drop By',
      body: 'You opened your door this time last week — open it again?',
      data: { type: 'auto_nudge' },
    })
  );
}
