import { createHash, randomBytes } from 'crypto';
import { jwtVerify } from 'jose';
import { db } from '../db/index.js';

// Sign-in sessions. The client holds a random token; the database holds only its
// SHA-256, so a copy of the database can't be used to sign in. Sessions slide: each
// use (at most hourly) pushes the expiry out again, so someone who opens the app
// regularly stays signed in, and every session can be revoked — on logout, on a
// password reset, or by deleting the account.

const SESSION_DAYS = 180;
const TOUCH_INTERVAL = 3600;

const nowUnix = () => Math.floor(Date.now() / 1000);
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(userId: string, userAgent?: string): string {
  const token = randomBytes(32).toString('base64url');
  const now = nowUnix();
  db.prepare(`
    INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(hash(token), userId, now, now, now + SESSION_DAYS * 86400, userAgent?.slice(0, 255) ?? null);
  return token;
}

// The user a session token belongs to, or null if it is unknown or expired.
export function verifySession(token: string): string | null {
  const now = nowUnix();
  const row = db.prepare('SELECT id, user_id, last_seen_at, expires_at FROM sessions WHERE id = ?')
    .get(hash(token)) as { id: string; user_id: string; last_seen_at: number; expires_at: number } | undefined;
  if (!row || row.expires_at <= now) return null;
  if (now - row.last_seen_at >= TOUCH_INTERVAL) {
    db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
      .run(now, now + SESSION_DAYS * 86400, row.id);
  }
  return row.user_id;
}

export function revokeSession(token: string) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(hash(token));
}

export function revokeAllSessions(userId: string) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function purgeExpiredSessions() {
  return db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowUnix()).changes;
}

// ── Legacy JWTs ───────────────────────────────────────────────
// Before sessions, sign-in issued a 30-day JWT. Those still in people's apps keep
// working until they expire, and each one is swapped for a session on first use (see
// middleware/auth.ts). None issued after the switch, so this can go 30 days after it
// ships — tracked in TODO.md.

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET env var must be set in production');
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-in-production');

export function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3;
}

export async function verifyLegacyJwt(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
