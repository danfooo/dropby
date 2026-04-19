import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth.js';
import { areFriends } from './friends.js';
import { sendInviteEmail } from '../services/email.js';
import { log } from '../services/analytics.js';
import { notifyFriendJoined } from '../services/notifications.js';

const router = Router();

function generateToken(): string {
  return randomUUID().replace(/-/g, '');
}

// POST /api/invites — generate invite link
router.post('/', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { status_id } = req.body;
  const nowUnix = Math.floor(Date.now() / 1000);
  const expiresAt = nowUnix + 7 * 86400; // 7 days

  let resolvedStatusId: string | null = null;
  if (status_id) {
    const status = db.prepare('SELECT id FROM statuses WHERE id = ? AND user_id = ? AND closed_at IS NULL AND closes_at > ?').get(status_id, userId, nowUnix);
    if (status) resolvedStatusId = status_id;
  }

  const token = generateToken();
  const id = randomUUID();
  db.prepare('INSERT INTO invite_links (id, token, created_by, status_id, expires_at) VALUES (?, ?, ?, ?, ?)').run(id, token, userId, resolvedStatusId, expiresAt);

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  res.status(201).json({ token, url: `${appUrl}/invite/${token}`, expires_at: expiresAt });
});

// GET /api/invites/open-links — list active link-based invites created by the current user
router.get('/open-links', requireAuth, (req: AuthRequest, res) => {
  const nowUnix = Math.floor(Date.now() / 1000);
  const links = db.prepare(`
    SELECT token, created_at, expires_at FROM invite_links
    WHERE created_by = ? AND invited_email IS NULL AND revoked = 0 AND expires_at > ?
    ORDER BY created_at DESC
  `).all(req.userId, nowUnix) as Array<{ token: string; created_at: number; expires_at: number }>;
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  res.json(links.map(l => ({ ...l, url: `${appUrl}/invite/${l.token}` })));
});

// GET /api/invites/pending — list pending email invites sent by the current user
router.get('/pending', requireAuth, (req: AuthRequest, res) => {
  const nowUnix = Math.floor(Date.now() / 1000);
  const pending = db.prepare(`
    SELECT token, invited_email, created_at, expires_at
    FROM invite_links
    WHERE created_by = ? AND invited_email IS NOT NULL AND revoked = 0 AND expires_at > ?
    ORDER BY created_at DESC
  `).all(req.userId, nowUnix) as Array<{ token: string; invited_email: string; created_at: number; expires_at: number }>;
  res.json(pending);
});

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
}

// GET /api/invites/:token/calendar.ics — invitee calendar download (no auth required)
router.get('/:token/calendar.ics', optionalAuth, (req: AuthRequest, res) => {
  const { token } = req.params;
  const nowUnix = Math.floor(Date.now() / 1000);

  const invite = db.prepare('SELECT * FROM invite_links WHERE token = ? AND revoked = 0').get(token) as any;
  if (!invite) return res.status(404).send('Not found');

  if (!invite.status_id) return res.status(404).send('No session attached');

  const status = db.prepare('SELECT * FROM statuses WHERE id = ? AND starts_at IS NOT NULL').get(invite.status_id) as any;
  if (!status) return res.status(404).send('Session not found or not scheduled');

  const host = db.prepare('SELECT display_name FROM users WHERE id = ?').get(invite.created_by) as any;
  const method = status.closed_at ? 'CANCEL' : 'REQUEST';
  const sequence = method === 'CANCEL' ? 99 : (status.ics_sequence || 0);
  const summary = status.note ? `${host.display_name}'s drop-by: ${status.note}` : `${host.display_name}'s drop-by`;

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dropby//Dropby//EN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:dropby-${status.id}@dropby.app`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(new Date(status.starts_at * 1000))}`,
    `DTEND:${formatIcsDate(new Date((status.ends_at ?? status.closes_at) * 1000))}`,
    `SUMMARY:${summary}`,
    `SEQUENCE:${sequence}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  // Record download for push notifications on edits/cancels
  const userId = req.userId || null;
  db.prepare(`
    INSERT OR REPLACE INTO status_ics_downloads (status_id, user_id, token, downloaded_at)
    VALUES (?, ?, ?, ?)
  `).run(status.id, userId, token, nowUnix);

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="dropby-${status.id}.ics"`);
  res.send(ics);
});

// GET /api/invites/:token — get invite info (no auth required)
router.get('/:token', optionalAuth, (req: AuthRequest, res) => {
  const { token } = req.params;
  const nowUnix = Math.floor(Date.now() / 1000);

  const invite = db.prepare('SELECT * FROM invite_links WHERE token = ?').get(token) as any;
  if (!invite) return res.status(404).json({ error: 'INVALID_TOKEN' });

  if (invite.revoked) return res.status(410).json({ error: 'REVOKED' });

  if (invite.expires_at < nowUnix) {
    const agoSecs = nowUnix - invite.expires_at;
    const expiredInviter = db.prepare('SELECT id, display_name FROM users WHERE id = ?').get(invite.created_by) as any;
    return res.status(410).json({ error: 'EXPIRED', expired_ago_seconds: agoSecs, inviter: expiredInviter || null });
  }

  const inviter = db.prepare('SELECT id, display_name FROM users WHERE id = ?').get(invite.created_by) as any;
  let status = null;
  if (invite.status_id) {
    const s = db.prepare(`
      SELECT * FROM statuses WHERE id = ? AND closed_at IS NULL
        AND (closes_at > ? OR starts_at > ?)
    `).get(invite.status_id, nowUnix, nowUnix) as any;
    if (s) status = { id: s.id, note: s.note, closes_at: s.closes_at, starts_at: s.starts_at || null, ends_at: s.ends_at || null };
  }

  let alreadyFriends = false;
  let isSelf = false;
  if (req.userId) {
    isSelf = req.userId === invite.created_by;
    alreadyFriends = !isSelf && areFriends(req.userId, invite.created_by);
  }

  // Only log for genuine views (valid, non-expired, non-own links by non-friends)
  if (!isSelf && !alreadyFriends) {
    log('invite.viewed', req.userId ?? null, { has_active_door: !!status });
  }

  res.json({ inviter, status, alreadyFriends, isSelf });
});

// POST /api/invites/:token/accept — accept invite (auth required)
router.post('/:token/accept', requireAuth, (req: AuthRequest, res) => {
  const { token } = req.params;
  const userId = req.userId!;
  const nowUnix = Math.floor(Date.now() / 1000);

  const invite = db.prepare('SELECT * FROM invite_links WHERE token = ? AND revoked = 0 AND expires_at > ?').get(token, nowUnix) as any;
  if (!invite) return res.status(404).json({ error: 'Invalid or expired invite' });

  const inviterId = invite.created_by;

  // Self-invite: no-op
  if (userId === inviterId) {
    return res.json({ ok: true, alreadyFriends: false, isSelf: true });
  }

  // Already friends: return current status
  if (areFriends(userId, inviterId)) {
    const activeStatus = db.prepare('SELECT * FROM statuses WHERE user_id = ? AND closed_at IS NULL AND closes_at > ?').get(inviterId, nowUnix) as any;
    return res.json({ ok: true, alreadyFriends: true, status: activeStatus ? { id: activeStatus.id, note: activeStatus.note, closes_at: activeStatus.closes_at } : null });
  }

  // Create friendship (canonical: lower UUID first)
  const [a, b] = [userId, inviterId].sort();
  db.prepare('INSERT OR IGNORE INTO friendships (id, user_a_id, user_b_id) VALUES (?, ?, ?)').run(randomUUID(), a, b);
  log('invite.accepted', userId);

  // Notify the inviter that their new friend joined
  const acceptor = db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId) as any;
  if (acceptor) notifyFriendJoined(inviterId, acceptor.display_name);

  // If inviter has active status, auto-add new friend as recipient (silently)
  if (invite.status_id) {
    const active = db.prepare('SELECT id FROM statuses WHERE id = ? AND closed_at IS NULL AND closes_at > ?').get(invite.status_id, nowUnix);
    if (active) {
      db.prepare('INSERT OR IGNORE INTO status_recipients (id, status_id, user_id) VALUES (?, ?, ?)').run(randomUUID(), invite.status_id, userId);
    }
  }

  const inviter = db.prepare('SELECT display_name FROM users WHERE id = ?').get(inviterId) as any;
  res.json({ ok: true, alreadyFriends: false, inviterName: inviter.display_name });
});

// POST /api/invites/email — send an email invite (30-day link)
router.post('/email', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { email } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const emailLower = (email as string).toLowerCase().trim();
  const nowUnix = Math.floor(Date.now() / 1000);
  const expiresAt = nowUnix + 30 * 24 * 3600; // 30 days

  const inviter = db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId) as any;

  const token = generateToken();
  const id = randomUUID();
  db.prepare(
    'INSERT INTO invite_links (id, token, created_by, invited_email, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, token, userId, emailLower, expiresAt);

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  await sendInviteEmail(emailLower, inviter.display_name, `${appUrl}/invite/${token}`);

  res.status(201).json({ ok: true, token });
});

// POST /api/invites/:token/revoke
router.post('/:token/revoke', requireAuth, (req: AuthRequest, res) => {
  const { token } = req.params;
  const result = db.prepare('UPDATE invite_links SET revoked = 1 WHERE token = ? AND created_by = ?').run(token, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
