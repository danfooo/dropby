const SERVER_URL = 'http://localhost:3000';

export async function resetTestUsers(): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/test/reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`resetTestUsers failed: ${res.status}`);
}

export async function getVerificationLink(email: string): Promise<string> {
  const res = await fetch(`${SERVER_URL}/api/test/verification-link/${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error(`getVerificationLink failed for ${email}: ${res.status}`);
  const data = await res.json();
  return data.url as string;
}

export async function getUserStatus(userId: string): Promise<{
  id: string;
  user_id: string;
  note: string | null;
  closes_at: number;
  closed_at: number | null;
  created_at: number;
  notify_at: number | null;
  notifications_sent: boolean;
}> {
  const res = await fetch(`${SERVER_URL}/api/test/status/${userId}`);
  if (!res.ok) throw new Error(`getUserStatus failed for ${userId}: ${res.status}`);
  return res.json();
}

export async function makeFriends(emailA: string, emailB: string): Promise<{ userAId: string; userBId: string }> {
  const res = await fetch(`${SERVER_URL}/api/test/make-friends`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailA, emailB }),
  });
  if (!res.ok) throw new Error(`makeFriends failed: ${res.status}`);
  return res.json();
}

export async function getEvents(userId: string, since = 0): Promise<Array<{ ts: number; event: string; [key: string]: unknown }>> {
  const url = `${SERVER_URL}/api/test/events/${userId}?since=${since}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`getEvents failed for ${userId}: ${res.status}`);
  return res.json();
}
