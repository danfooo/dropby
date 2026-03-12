import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { requireAuth, signJwt, AuthRequest } from '../middleware/auth.js';
import { sendVerificationEmail } from '../services/email.js';

const router = Router();

// GET /api/auth/me
router.get('/me', requireAuth, (req: AuthRequest, res) => {
  const u = req.user!;
  res.json({
    id: u.id,
    email: u.email,
    display_name: u.display_name,
    timezone: u.timezone,
    auto_nudge_enabled: Boolean(u.auto_nudge_enabled),
    email_verified: Boolean(u.email_verified),
  });
});

// PUT /api/auth/me
router.put('/me', requireAuth, (req: AuthRequest, res) => {
  const { display_name, auto_nudge_enabled } = req.body;
  const updates: string[] = [];
  const values: unknown[] = [];

  if (display_name !== undefined) {
    if (typeof display_name !== 'string' || display_name.trim().length === 0) {
      return res.status(400).json({ error: 'Invalid display name' });
    }
    updates.push('display_name = ?');
    values.push(display_name.trim());
  }
  if (auto_nudge_enabled !== undefined) {
    updates.push('auto_nudge_enabled = ?');
    values.push(auto_nudge_enabled ? 1 : 0);
  }

  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

  values.push(req.userId);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as any;
  res.json({
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    timezone: user.timezone,
    auto_nudge_enabled: Boolean(user.auto_nudge_enabled),
  });
});

// DELETE /api/auth/me
router.delete('/me', requireAuth, (req: AuthRequest, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.userId);
  res.json({ ok: true });
});

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { email, password, display_name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (!display_name?.trim()) return res.status(400).json({ error: 'Display name required' });

  const emailLower = email.toLowerCase().trim();
  const name = display_name.trim();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(emailLower);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const hash = await bcrypt.hash(password, 10);
  const id = randomUUID();
  const verificationToken = randomUUID().replace(/-/g, '');
  const verificationExpires = Math.floor(Date.now() / 1000) + 24 * 3600;

  db.prepare(`
    INSERT INTO users (id, email, display_name, password_hash, email_verified, email_verification_token, email_verification_expires_at)
    VALUES (?, ?, ?, ?, 0, ?, ?)
  `).run(id, emailLower, name, hash, verificationToken, verificationExpires);

  sendVerificationEmail(emailLower, name, verificationToken);

  res.status(201).json({ message: 'Check your email to verify your account' });
});

// GET /api/auth/verify-email/:token
router.get('/verify-email/:token', (req, res) => {
  const { token } = req.params;
  const now = Math.floor(Date.now() / 1000);

  const user = db.prepare(`
    SELECT id FROM users
    WHERE email_verification_token = ? AND email_verification_expires_at > ? AND email_verified = 0
  `).get(token, now) as { id: string } | undefined;

  if (!user) {
    // Redirect to auth with error if not API call
    return res.redirect(`${process.env.APP_URL || 'http://localhost:5173'}/auth?verified=invalid`);
  }

  db.prepare(`
    UPDATE users SET email_verified = 1, email_verification_token = NULL, email_verification_expires_at = NULL
    WHERE id = ?
  `).run(user.id);

  res.redirect(`${process.env.APP_URL || 'http://localhost:5173'}/auth?verified=true`);
});

// POST /api/auth/resend-verification
router.post('/resend-verification', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND email_verified = 0').get(email.toLowerCase()) as any;
  if (!user) return res.json({ message: 'If that email exists, a verification link was sent' });

  const token = randomUUID().replace(/-/g, '');
  const expires = Math.floor(Date.now() / 1000) + 24 * 3600;
  db.prepare('UPDATE users SET email_verification_token = ?, email_verification_expires_at = ? WHERE id = ?').run(token, expires, user.id);
  sendVerificationEmail(user.email, user.display_name, token);

  res.json({ message: 'If that email exists, a verification link was sent' });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as any;
  if (!user || !user.password_hash) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  if (!user.email_verified) {
    return res.status(403).json({ error: 'EMAIL_NOT_VERIFIED' });
  }

  const token = await signJwt(user.id);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      timezone: user.timezone,
      auto_nudge_enabled: Boolean(user.auto_nudge_enabled),
    },
  });
});

// POST /api/auth/google
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Google credential required' });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'Google OAuth not configured' });

  try {
    const { OAuth2Client } = await import('google-auth-library');
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) throw new Error('Invalid Google token');

    const { sub: googleId, email, name } = payload;
    const emailLower = email.toLowerCase();

    let user = db.prepare('SELECT * FROM users WHERE google_id = ? OR email = ?').get(googleId, emailLower) as any;

    if (!user) {
      const id = randomUUID();
      const displayName = name || emailLower.split('@')[0];
      db.prepare(`
        INSERT INTO users (id, email, display_name, google_id, email_verified)
        VALUES (?, ?, ?, ?, 1)
      `).run(id, emailLower, displayName, googleId);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    } else if (!user.google_id) {
      db.prepare('UPDATE users SET google_id = ?, email_verified = 1 WHERE id = ?').run(googleId, user.id);
    }

    const token = await signJwt(user.id);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        timezone: user.timezone,
        auto_nudge_enabled: Boolean(user.auto_nudge_enabled),
      },
    });
  } catch (err: any) {
    console.error('Google auth error:', err.message);
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

// POST /api/auth/push-token
router.post('/push-token', requireAuth, (req: AuthRequest, res) => {
  const { token, platform } = req.body;
  if (!token || !['ios', 'android'].includes(platform)) {
    return res.status(400).json({ error: 'token and platform (ios|android) required' });
  }
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO push_tokens (id, user_id, token, platform, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, token) DO UPDATE SET updated_at = excluded.updated_at
  `).run(randomUUID(), req.userId, token, platform, now);
  res.json({ ok: true });
});

export default router;
