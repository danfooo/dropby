import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth.js';
import { areFriends } from './friends.js';

const router = Router();

function generateToken(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

// POST /api/invites — generate invite link
router.post('/', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { status_id } = req.body;
  const nowUnix = Math.floor(Date.now() / 1000);
  const expiresAt = nowUnix + 3600;

  let resolvedStatusId: string | null = null;
  if (status_id) {
    const status = db.prepare('SELECT id FROM statuses WHERE id = ? AND user_id = ? AND closed_at IS NULL AND closes_at > ?').get(status_id, userId, nowUnix);
    if (status) resolvedStatusId = status_id;
  } else {
    // Check if user has active status, auto-attach
    const active = db.prepare('SELECT id FROM statuses WHERE user_id = ? AND closed_at IS NULL AND closes_at > ?').get(userId, nowUnix) as any;
    if (active) resolvedStatusId = active.id;
  }

  const token = generateToken();
  const id = randomUUID();
  db.prepare('INSERT INTO invite_links (id, token, created_by, status_id, expires_at) VALUES (?, ?, ?, ?, ?)').run(id, token, userId, resolvedStatusId, expiresAt);

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  res.status(201).json({ token, url: `${appUrl}/invite/${token}`, expires_at: expiresAt });
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
    return res.status(410).json({ error: 'EXPIRED', expired_ago_seconds: agoSecs });
  }

  const inviter = db.prepare('SELECT id, display_name FROM users WHERE id = ?').get(invite.created_by) as any;
  let status = null;
  if (invite.status_id) {
    const s = db.prepare('SELECT * FROM statuses WHERE id = ? AND closed_at IS NULL AND closes_at > ?').get(invite.status_id, nowUnix) as any;
    if (s) status = { id: s.id, note: s.note, closes_at: s.closes_at };
  }

  let alreadyFriends = false;
  let isSelf = false;
  if (req.userId) {
    isSelf = req.userId === invite.created_by;
    alreadyFriends = !isSelf && areFriends(req.userId, invite.created_by);
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

// POST /api/invites/:token/revoke
router.post('/:token/revoke', requireAuth, (req: AuthRequest, res) => {
  const { token } = req.params;
  const result = db.prepare('UPDATE invite_links SET revoked = 1 WHERE token = ? AND created_by = ?').run(token, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
