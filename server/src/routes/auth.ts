import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { join, extname } from 'path';
import { mkdirSync } from 'fs';
import multer from 'multer';
import { db } from '../db/index.js';
import { requireAuth, signJwt, AuthRequest } from '../middleware/auth.js';
import { sendVerificationEmail } from '../services/email.js';
import { acceptInviteToken } from './invites.js';
import { log } from '../services/analytics.js';

const avatarsDir = join(process.cwd(), 'data', 'avatars');
mkdirSync(avatarsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: avatarsDir,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'));
  },
});

const router = Router();

// Validate an invite token exists, is not revoked, and is not expired.
// Returns the inviter's user id, or null if the token is invalid.
function validateInviteToken(token: unknown): string | null {
  if (typeof token !== 'string' || !token) return null;
  const now = Math.floor(Date.now() / 1000);
  const row = db.prepare(
    'SELECT created_by FROM invite_links WHERE token = ? AND revoked = 0 AND expires_at > ?'
  ).get(token, now) as { created_by: string } | undefined;
  return row?.created_by ?? null;
}

function userResponse(u: any) {
  return {
    id: u.id,
    email: u.email,
    display_name: u.display_name,
    timezone: u.timezone,
    auto_nudge_enabled: Boolean(u.auto_nudge_enabled),
    notif_door_closed: u.notif_door_closed !== undefined ? Boolean(u.notif_door_closed) : true,
    going_reminder_1: u.going_reminder_1 ?? 'day',
    going_reminder_2: u.going_reminder_2 ?? '30m',
    avatar_seed: u.avatar_seed ?? 0,
    avatar_url: u.avatar_url ?? null,
    email_verified: Boolean(u.email_verified),
    default_door_minutes: u.default_door_minutes ?? 60,
  };
}

// GET /api/auth/me
router.get('/me', requireAuth, (req: AuthRequest, res) => {
  res.json(userResponse(req.user!));
});

// PUT /api/auth/me
router.put('/me', requireAuth, (req: AuthRequest, res) => {
  const { display_name, auto_nudge_enabled, notif_door_closed, going_reminder_1, going_reminder_2, avatar_seed } = req.body;
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
  if (notif_door_closed !== undefined) {
    updates.push('notif_door_closed = ?');
    values.push(notif_door_closed ? 1 : 0);
  }
  const validReminders = ['none', 'day', '120m', '60m', '30m', '15m', '0m'];
  if (going_reminder_1 !== undefined && validReminders.includes(going_reminder_1)) {
    updates.push('going_reminder_1 = ?');
    values.push(going_reminder_1);
  }
  if (going_reminder_2 !== undefined && validReminders.includes(going_reminder_2)) {
    updates.push('going_reminder_2 = ?');
    values.push(going_reminder_2);
  }
  if (avatar_seed !== undefined) {
    updates.push('avatar_seed = ?');
    values.push(Number(avatar_seed));
  }

  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

  values.push(req.userId);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as any;
  res.json(userResponse(user));
});

// PUT /api/auth/avatar
router.put('/avatar', requireAuth, upload.single('avatar'), (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const avatarUrl = `/avatars/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, req.userId);
  res.json({ avatar_url: avatarUrl });
});

// DELETE /api/auth/avatar
router.delete('/avatar', requireAuth, (req: AuthRequest, res) => {
  db.prepare('UPDATE users SET avatar_url = NULL WHERE id = ?').run(req.userId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as any;
  res.json(userResponse(user));
});

// DELETE /api/auth/me
router.delete('/me', requireAuth, (req: AuthRequest, res) => {
  db.prepare('DELETE FROM event_log WHERE user_id = ?').run(req.userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.userId);
  res.json({ ok: true });
});

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { email, password, display_name, locale, redirect_url, invite_token } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (!display_name?.trim()) return res.status(400).json({ error: 'Display name required' });
  const inviterId = validateInviteToken(invite_token);
  if (!inviterId) {
    return res.status(403).json({ error: 'INVITE_REQUIRED' });
  }

  const emailLower = email.toLowerCase().trim();
  const name = display_name.trim();

  const existing = db.prepare('SELECT id, email_verified FROM users WHERE email = ?').get(emailLower) as any;
  if (existing) {
    if (!existing.email_verified) return res.status(409).json({ error: 'EMAIL_EXISTS_UNVERIFIED' });
    return res.status(409).json({ error: 'Email already registered' });
  }

  const hash = await bcrypt.hash(password, 10);
  const id = randomUUID();
  const verificationToken = randomUUID().replace(/-/g, '');
  const verificationExpires = Math.floor(Date.now() / 1000) + 24 * 3600;

  db.prepare(`
    INSERT INTO users (id, email, display_name, password_hash, email_verified, email_verification_token, email_verification_expires_at, locale)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?)
  `).run(id, emailLower, name, hash, verificationToken, verificationExpires, locale ?? null);

  acceptInviteToken(invite_token as string, id);

  sendVerificationEmail(emailLower, name, verificationToken, locale, redirect_url);
  log('user.signup', id, { method: 'email' });

  res.status(201).json({ message: 'Check your email to verify your account' });
});

// GET /api/auth/verify-email/:token — legacy redirect for old email links
router.get('/verify-email/:token', (req, res) => {
  const { token } = req.params;
  const params = new URLSearchParams({ token });
  const redirectAfter = (req.query.redirect as string) || '';
  if (redirectAfter.startsWith('/')) params.set('redirect', redirectAfter);
  res.redirect(`${process.env.APP_URL || 'http://localhost:5173'}/verify-email?${params}`);
});

// POST /api/auth/verify-email — verify token, return JWT for auto-login
router.post('/verify-email', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  const now = Math.floor(Date.now() / 1000);
  const user = db.prepare(`
    SELECT * FROM users
    WHERE email_verification_token = ? AND email_verification_expires_at > ? AND email_verified = 0
  `).get(token, now) as any;

  if (!user) return res.status(400).json({ error: 'INVALID_OR_EXPIRED' });

  db.prepare(`
    UPDATE users SET email_verified = 1, email_verification_token = NULL, email_verification_expires_at = NULL
    WHERE id = ?
  `).run(user.id);
  log('user.verify', user.id);

  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as any;
  const jwt = await signJwt(user.id);
  res.json({ token: jwt, user: userResponse(updatedUser) });
});

// POST /api/auth/resend-verification
router.post('/resend-verification', (req, res) => {
  const { email, redirect_url } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND email_verified = 0').get(email.toLowerCase()) as any;
  if (!user) return res.json({ message: 'If that email exists, a verification link was sent' });

  const token = randomUUID().replace(/-/g, '');
  const expires = Math.floor(Date.now() / 1000) + 24 * 3600;
  db.prepare('UPDATE users SET email_verification_token = ?, email_verification_expires_at = ? WHERE id = ?').run(token, expires, user.id);
  sendVerificationEmail(user.email, user.display_name, token, user.locale, redirect_url);

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
  res.json({ token, user: userResponse(user) });
});

// POST /api/auth/google
router.post('/google', async (req, res) => {
  const { credential, invite_token } = req.body;
  if (!credential) return res.status(400).json({ error: 'Google credential required' });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'Google OAuth not configured' });

  try {
    const { OAuth2Client } = await import('google-auth-library');
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) throw new Error('Invalid Google token');

    const { sub: googleId, email, name, picture } = payload;
    const emailLower = email.toLowerCase();

    // gmail.com and googlemail.com are the same Google mailbox
    const altEmail = emailLower.endsWith('@gmail.com')
      ? emailLower.replace('@gmail.com', '@googlemail.com')
      : emailLower.endsWith('@googlemail.com')
      ? emailLower.replace('@googlemail.com', '@gmail.com')
      : null;

    let user = (altEmail
      ? db.prepare('SELECT * FROM users WHERE google_id = ? OR email = ? OR email = ?').get(googleId, emailLower, altEmail)
      : db.prepare('SELECT * FROM users WHERE google_id = ? OR email = ?').get(googleId, emailLower)
    ) as any;

    if (!user) {
      // Invite-only: new Google accounts must present a valid invite token
      if (!validateInviteToken(invite_token)) {
        return res.status(403).json({ error: 'INVITE_REQUIRED' });
      }
      const id = randomUUID();
      const displayName = name || emailLower.split('@')[0];
      db.prepare(`
        INSERT INTO users (id, email, display_name, google_id, avatar_url, email_verified)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(id, emailLower, displayName, googleId, picture ?? null);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
      log('user.signup', id, { method: 'google' });
      acceptInviteToken(invite_token as string, id);
    } else {
      const updates: string[] = ['email_verified = 1'];
      const values: unknown[] = [];
      if (!user.google_id) { updates.push('google_id = ?'); values.push(googleId); }
      // Only set Google picture if user has no custom avatar yet
      if (!user.avatar_url && picture) { updates.push('avatar_url = ?'); values.push(picture); }
      values.push(user.id);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as any;
    }

    const token = await signJwt(user.id);
    res.json({ token, user: userResponse(user) });
  } catch (err: any) {
    console.error('Google auth error:', err.message);
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

// POST /api/auth/apple
router.post('/apple', async (req, res) => {
  const { identityToken, fullName, invite_token } = req.body;
  if (!identityToken) return res.status(400).json({ error: 'Apple identity token required' });

  const bundleId = process.env.APPLE_BUNDLE_ID;
  const serviceId = process.env.APPLE_SERVICE_ID;
  if (!bundleId && !serviceId) return res.status(500).json({ error: 'Apple OAuth not configured' });

  try {
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    const JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
    const audiences = [bundleId, serviceId].filter(Boolean) as string[];
    const { payload } = await jwtVerify(identityToken, JWKS, {
      issuer: 'https://appleid.apple.com',
      audience: audiences.length === 1 ? audiences[0] : audiences,
    });

    const appleId = payload.sub as string;
    // Apple only sends email on first sign-in; it may be a relay address
    const email = (payload.email as string | undefined)?.toLowerCase();

    let user = db.prepare('SELECT * FROM users WHERE apple_id = ?').get(appleId) as any;

    // Try to link to existing account by email (if Apple provides it)
    if (!user && email) {
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    }

    if (!user) {
      // Invite-only: new Apple accounts must present a valid invite token
      if (!validateInviteToken(invite_token)) {
        return res.status(403).json({ error: 'INVITE_REQUIRED' });
      }
      // New user — Apple only gives us a name on the very first sign-in
      const givenName = fullName?.givenName;
      const familyName = fullName?.familyName;
      const displayName = (givenName && familyName)
        ? `${givenName} ${familyName}`.trim()
        : givenName || (email ? email.split('@')[0] : 'dropby user');

      // Apple relay emails look real but aren't reusable — still store them
      const userEmail = email || `${appleId}@privaterelay.appleid.com`;
      const id = randomUUID();
      db.prepare(`
        INSERT INTO users (id, email, display_name, apple_id, email_verified)
        VALUES (?, ?, ?, ?, 1)
      `).run(id, userEmail, displayName, appleId);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
      log('user.signup', id, { method: 'apple' });
      acceptInviteToken(invite_token as string, id);
    } else {
      const updates: string[] = ['email_verified = 1'];
      const values: unknown[] = [];
      if (!user.apple_id) { updates.push('apple_id = ?'); values.push(appleId); }
      values.push(user.id);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as any;
    }

    const token = await signJwt(user.id);
    res.json({ token, user: userResponse(user) });
  } catch (err: any) {
    console.error('Apple auth error:', err.message);
    res.status(401).json({ error: 'Invalid Apple token' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as any;
  // Always respond success to prevent email enumeration
  if (!user || !user.password_hash) {
    return res.json({ message: 'If that email exists, a reset link was sent' });
  }

  const token = randomUUID().replace(/-/g, '');
  const expires = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  db.prepare('UPDATE users SET password_reset_token = ?, password_reset_expires_at = ? WHERE id = ?')
    .run(token, expires, user.id);

  const { sendPasswordResetEmail } = await import('../services/email.js');
  sendPasswordResetEmail(user.email, user.display_name, token, user.locale);

  res.json({ message: 'If that email exists, a reset link was sent' });
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const now = Math.floor(Date.now() / 1000);
  const user = db.prepare(
    'SELECT * FROM users WHERE password_reset_token = ? AND password_reset_expires_at > ?'
  ).get(token, now) as any;

  if (!user) return res.status(400).json({ error: 'INVALID_OR_EXPIRED' });

  const hash = await bcrypt.hash(password, 10);
  db.prepare(
    'UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires_at = NULL, email_verified = 1 WHERE id = ?'
  ).run(hash, user.id);

  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as any;
  const jwt = await signJwt(user.id);
  res.json({ token: jwt, user: userResponse(updatedUser) });
});

// DELETE /api/auth/push-token — deregister current device token on logout
router.delete('/push-token', requireAuth, (req: AuthRequest, res) => {
  const { token } = req.body;
  if (token) {
    db.prepare('DELETE FROM push_tokens WHERE user_id = ? AND token = ?').run(req.userId, token);
  } else {
    db.prepare('DELETE FROM push_tokens WHERE user_id = ?').run(req.userId);
  }
  res.json({ ok: true });
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
  console.log(`[Push] Token registered — user=${req.userId} platform=${platform} token=${token.slice(0, 20)}…`);
  res.json({ ok: true });
});

export default router;
