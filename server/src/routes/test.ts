import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';

const router = Router();

// POST /api/test/reset — deletes all test users (cascade deletes everything related)
router.post('/reset', (_req, res) => {
  // Clean event_log for test users before deleting users (no FK cascade on event_log)
  const testUserIds = db.prepare("SELECT id FROM users WHERE email LIKE '%@dropby.test'")
    .all() as Array<{ id: string }>;
  for (const { id } of testUserIds) {
    db.prepare('DELETE FROM event_log WHERE user_id = ?').run(id);
  }
  db.prepare("DELETE FROM users WHERE email LIKE '%@dropby.test'").run();
  db.prepare("DELETE FROM waitlist WHERE email LIKE '%@dropby.test'").run();
  res.json({ ok: true });
});

// POST /api/test/seed-invite — creates a bootstrap invite token used by tests
// to bypass the invite-only signup gate. Returns a valid token that any test
// user can present at signup.
router.post('/seed-invite', (_req, res) => {
  let admin = db.prepare("SELECT id FROM users WHERE email = 'test-seed@dropby.test'").get() as { id: string } | undefined;
  if (!admin) {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO users (id, email, display_name, email_verified)
      VALUES (?, 'test-seed@dropby.test', 'Test Seed', 1)
    `).run(id);
    admin = { id };
  }
  const token = randomUUID().replace(/-/g, '');
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 86400;
  db.prepare(
    'INSERT INTO invite_links (id, token, created_by, expires_at) VALUES (?, ?, ?, ?)'
  ).run(randomUUID(), token, admin.id, expiresAt);
  res.json({ token });
});

// GET /api/test/verification-link/:email — returns the full verification URL for a test user
router.get('/verification-link/:email', (req, res) => {
  const { email } = req.params;
  const user = db.prepare(
    'SELECT email_verification_token FROM users WHERE email = ? AND email_verified = 0'
  ).get(email.toLowerCase()) as { email_verification_token: string } | undefined;

  if (!user || !user.email_verification_token) {
    return res.status(404).json({ error: 'No pending verification token found for this email' });
  }

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const url = `${appUrl}/verify-email?token=${user.email_verification_token}`;
  res.json({ url });
});

// GET /api/test/status/:userId — returns the current open status for a user including notify_at
router.get('/status/:userId', (req, res) => {
  const { userId } = req.params;
  const nowUnix = Math.floor(Date.now() / 1000);
  const status = db.prepare(`
    SELECT * FROM statuses
    WHERE user_id = ? AND closed_at IS NULL AND closes_at > ?
      AND (starts_at IS NULL OR starts_at <= ?)
    ORDER BY created_at DESC
    LIMIT 1
  `).get(userId, nowUnix, nowUnix) as any | undefined;

  if (!status) {
    return res.status(404).json({ error: 'No active status found' });
  }

  res.json({
    id: status.id,
    user_id: status.user_id,
    note: status.note,
    closes_at: status.closes_at,
    closed_at: status.closed_at,
    created_at: status.created_at,
    notify_at: status.notify_at || null,
    notifications_sent: Boolean(status.notifications_sent),
  });
});

// POST /api/test/make-friends — directly inserts a friendship row for two users by email
router.post('/make-friends', (req, res) => {
  const { emailA, emailB } = req.body;
  if (!emailA || !emailB) {
    return res.status(400).json({ error: 'emailA and emailB required' });
  }

  const userA = db.prepare('SELECT id FROM users WHERE email = ?').get(emailA.toLowerCase()) as { id: string } | undefined;
  const userB = db.prepare('SELECT id FROM users WHERE email = ?').get(emailB.toLowerCase()) as { id: string } | undefined;

  if (!userA) return res.status(404).json({ error: `User not found: ${emailA}` });
  if (!userB) return res.status(404).json({ error: `User not found: ${emailB}` });

  // Canonical ordering: lower UUID first
  const [a, b] = [userA.id, userB.id].sort();
  db.prepare('INSERT OR IGNORE INTO friendships (id, user_a_id, user_b_id) VALUES (?, ?, ?)').run(randomUUID(), a, b);

  res.json({ ok: true, userAId: userA.id, userBId: userB.id });
});

// GET /api/test/events/:userId — returns recent event_log rows for a user, newest first
router.get('/events/:userId', (req, res) => {
  const { userId } = req.params;
  const since = req.query.since ? Number(req.query.since) : 0;
  const rows = db.prepare(`
    SELECT ts, event, data FROM event_log
    WHERE user_id = ? AND ts >= ?
    ORDER BY ts DESC LIMIT 100
  `).all(userId, since) as Array<{ ts: number; event: string; data: string | null }>;

  res.json(rows.map(r => ({
    ts: r.ts,
    event: r.event,
    ...(r.data ? JSON.parse(r.data) : {}),
  })));
});

export default router;
