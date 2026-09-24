import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID, createHash } from 'crypto';
import type { Server } from 'http';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'dropby-auth-'));

type Db = import('better-sqlite3').Database;
let db: Db;
let sessions: typeof import('../../server/src/services/sessions.js');
let sse: typeof import('../../server/src/services/sse.js');
let rl: typeof import('../../server/src/services/rate-limit.js');
let server: Server;
let base = '';

before(async () => {
  db = (await import('../../server/src/db/index.js')).db;
  sessions = await import('../../server/src/services/sessions.js');
  sse = await import('../../server/src/services/sse.js');
  rl = await import('../../server/src/services/rate-limit.js');
  const { requireAuth, optionalAuth } = await import('../../server/src/middleware/auth.js');
  const express = (await import('express')).default;

  const app = express();
  app.get('/private', requireAuth, (req: any, res) => res.json({ userId: req.userId }));
  app.get('/public', optionalAuth, (req: any, res) => res.json({ userId: req.userId ?? null }));
  await new Promise<void>(resolve => {
    server = app.listen(0, () => {
      const addr = server.address();
      base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
      resolve();
    });
  });
});

after(() => server?.close());

function user(): string {
  const id = randomUUID();
  db.prepare('INSERT INTO users (id, email, display_name, email_verified) VALUES (?, ?, ?, 1)').run(id, `${id}@dropby.test`, 'U');
  return id;
}

const get = (path: string, token?: string) =>
  fetch(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

async function legacyJwt(sub: string, expiresIn = '30d') {
  const { SignJWT } = await import('jose');
  return new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(sub).setIssuedAt().setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode('dev-secret-change-in-production'));
}

// ── Sessions ──────────────────────────────────────────────────

test('sessions — a new token signs in, and only its hash is stored', () => {
  const u = user();
  const token = sessions.createSession(u, 'test-agent');
  assert.equal(sessions.verifySession(token), u);
  assert.equal(db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(token), undefined);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(u) as any).n, 1);
});

test('sessions — revoking one leaves the others', () => {
  const u = user();
  const phone = sessions.createSession(u);
  const laptop = sessions.createSession(u);
  sessions.revokeSession(phone);
  assert.equal(sessions.verifySession(phone), null);
  assert.equal(sessions.verifySession(laptop), u);
  sessions.revokeAllSessions(u);
  assert.equal(sessions.verifySession(laptop), null);
});

test('sessions — expired ones fail and are purged; used ones slide forward', () => {
  const u = user();
  const stale = sessions.createSession(u);
  const active = sessions.createSession(u);
  const hashOf = (t: string) => createHash('sha256').update(t).digest('hex');
  db.prepare('UPDATE sessions SET expires_at = unixepoch() - 1 WHERE id = ?').run(hashOf(stale));
  // `active` was last seen two hours ago and is close to expiring.
  db.prepare('UPDATE sessions SET last_seen_at = unixepoch() - 7200, expires_at = unixepoch() + 60 WHERE id = ?').run(hashOf(active));

  assert.equal(sessions.verifySession(stale), null);
  assert.equal(sessions.verifySession(active), u);
  const row = db.prepare('SELECT expires_at - unixepoch() AS left FROM sessions WHERE id = ?').get(hashOf(active)) as any;
  assert.ok(row.left > 170 * 86400, 'expiry pushed out again');
  assert.ok(sessions.purgeExpiredSessions() >= 1);
});

test('sessions — deleting the account removes its sessions', () => {
  const u = user();
  const token = sessions.createSession(u);
  db.prepare('DELETE FROM users WHERE id = ?').run(u);
  assert.equal(sessions.verifySession(token), null);
});

// ── Middleware ────────────────────────────────────────────────

test('auth — a session token is accepted without a replacement', async () => {
  const u = user();
  const res = await get('/private', sessions.createSession(u));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).userId, u);
  assert.equal(res.headers.get('x-session-token'), null);
});

test('auth — an old JWT still works and is swapped for a session', async () => {
  const u = user();
  const res = await get('/private', await legacyJwt(u));
  assert.equal(res.status, 200);
  const replacement = res.headers.get('x-session-token');
  assert.ok(replacement);
  assert.equal(sessions.verifySession(replacement!), u);
  const again = await get('/private', replacement!);
  assert.equal(again.status, 200);
});

test('auth — parallel requests with the same old JWT share one session', async () => {
  const u = user();
  const jwt = await legacyJwt(u);
  const responses = await Promise.all([1, 2, 3, 4].map(() => get('/private', jwt)));
  const tokens = new Set(responses.map(r => r.headers.get('x-session-token')));
  assert.equal(tokens.size, 1);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(u) as any).n, 1);
});

test('auth — expired, forged, unknown and missing tokens are refused', async () => {
  const u = user();
  assert.equal((await get('/private', await legacyJwt(u, '-1s'))).status, 401);
  const forged = (await legacyJwt(u)).slice(0, -3) + 'abc';
  assert.equal((await get('/private', forged)).status, 401);
  assert.equal((await get('/private', 'not-a-real-token')).status, 401);
  assert.equal((await get('/private')).status, 401);
  const gone = sessions.createSession(u);
  sessions.revokeSession(gone);
  assert.equal((await get('/private', gone)).status, 401);
});

test('auth — optional auth passes anonymous callers through', async () => {
  assert.deepEqual(await (await get('/public')).json(), { userId: null });
  assert.deepEqual(await (await get('/public', 'junk')).json(), { userId: null });
  const u = user();
  assert.deepEqual(await (await get('/public', sessions.createSession(u))).json(), { userId: u });
});

// ── Event stream tickets ──────────────────────────────────────

test('tickets — single use', () => {
  const t = sse.issueTicket('someone');
  assert.equal(sse.redeemTicket(t), 'someone');
  assert.equal(sse.redeemTicket(t), null);
  assert.equal(sse.redeemTicket('made-up'), null);
});

// ── Rate limits ───────────────────────────────────────────────

test('rate limiter — allows max per window, then refuses until it resets', () => {
  const limiter = new rl.RateLimiter(3, 1000);
  const t = 1_000_000;
  assert.deepEqual([1, 2, 3, 4].map(() => limiter.take('a', t)), [true, true, true, false]);
  assert.equal(limiter.take('b', t), true, 'keys are independent');
  assert.equal(limiter.take('a', t + 999), false);
  assert.equal(limiter.take('a', t + 1000), true, 'new window');
});

test('rate limiter — client IP prefers Cloudflare, then Fly, then the socket', () => {
  const req = (headers: Record<string, string>) => ({ headers, ip: '10.0.0.1', socket: {} }) as any;
  assert.equal(rl.clientIp(req({ 'cf-connecting-ip': '1.1.1.1', 'fly-client-ip': '2.2.2.2' })), '1.1.1.1');
  assert.equal(rl.clientIp(req({ 'fly-client-ip': '2.2.2.2' })), '2.2.2.2');
  assert.equal(rl.clientIp(req({})), '10.0.0.1');
});

test('rate limit middleware — answers 429 RATE_LIMITED once used up (outside test mode)', async () => {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production-like';
  try {
    const mw = rl.rateLimit({ max: 2, windowMs: 60_000, key: () => 'k' });
    const run = () => new Promise<number>(resolve => {
      const res: any = { status: (c: number) => ({ json: () => resolve(c) }) };
      mw({} as any, res, () => resolve(200));
    });
    assert.deepEqual([await run(), await run(), await run()], [200, 200, 429]);
  } finally {
    process.env.NODE_ENV = saved;
  }
});
