import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { notifyFriendDoorOpen } from '../services/notifications.js';
import { broadcastSSE } from '../services/sse.js';
import { sanitizeNote, isNoteAllowed } from '../services/moderation.js';

const router = Router();

function getActiveStatus(userId: string) {
  const nowUnix = Math.floor(Date.now() / 1000);
  return db.prepare(`
    SELECT * FROM statuses WHERE user_id = ? AND closed_at IS NULL AND closes_at > ?
  `).get(userId, nowUnix) as any | undefined;
}

function formatStatus(status: any, userId: string) {
  if (!status) return null;
  const recipients = db.prepare(`
    SELECT u.id, u.display_name FROM status_recipients sr
    JOIN users u ON u.id = sr.user_id
    WHERE sr.status_id = ?
  `).all(status.id) as Array<{ id: string; display_name: string }>;

  const goingSignals = db.prepare(`
    SELECT gs.id, gs.created_at,
      u.id as user_id, u.display_name,
      gc.name as guest_name
    FROM going_signals gs
    LEFT JOIN users u ON u.id = gs.user_id
    LEFT JOIN guest_contacts gc ON gc.id = gs.guest_contact_id
    WHERE gs.status_id = ?
    ORDER BY gs.created_at
  `).all(status.id) as any[];

  const myGoing = userId
    ? db.prepare('SELECT id FROM going_signals WHERE status_id = ? AND user_id = ?').get(status.id, userId)
    : null;

  return {
    id: status.id,
    note: status.note,
    closes_at: status.closes_at,
    closed_at: status.closed_at,
    created_at: status.created_at,
    recipients,
    going_signals: goingSignals.map(g => ({
      id: g.id,
      name: g.display_name || g.guest_name || 'Guest',
      created_at: g.created_at,
    })),
    my_going: Boolean(myGoing),
  };
}

// GET /api/status
router.get('/', requireAuth, (req: AuthRequest, res) => {
  const status = getActiveStatus(req.userId!);
  res.json(formatStatus(status, req.userId!));
});

// GET /api/status/friends — friends with active statuses visible to this user
router.get('/friends', requireAuth, (req: AuthRequest, res) => {
  const nowUnix = Math.floor(Date.now() / 1000);
  const userId = req.userId!;

  const friendStatuses = db.prepare(`
    SELECT s.*, u.display_name, u.id as owner_id
    FROM statuses s
    JOIN users u ON u.id = s.user_id
    JOIN status_recipients sr ON sr.status_id = s.id AND sr.user_id = ?
    JOIN friendships f ON
      (f.user_a_id = ? AND f.user_b_id = s.user_id) OR
      (f.user_b_id = ? AND f.user_a_id = s.user_id)
    WHERE s.closed_at IS NULL AND s.closes_at > ?
    ORDER BY s.created_at DESC
  `).all(userId, userId, userId, nowUnix) as any[];

  const myGoing = db.prepare(`
    SELECT status_id FROM going_signals WHERE user_id = ?
  `).all(userId) as Array<{ status_id: string }>;
  const goingSet = new Set(myGoing.map(g => g.status_id));

  res.json(friendStatuses.map(s => ({
    id: s.id,
    owner_id: s.owner_id,
    owner_name: s.display_name,
    note: s.note,
    closes_at: s.closes_at,
    my_going: goingSet.has(s.id),
  })));
});

// POST /api/status — create
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { recipient_ids = [] } = req.body;

  let note: string | undefined = req.body.note;
  if (note) {
    note = sanitizeNote(note);
    if (note.length > 60) return res.status(400).json({ error: 'Note max 60 chars' });
    if (!(await isNoteAllowed(note))) note = undefined;
  }

  // Close any existing active status
  const existing = getActiveStatus(userId);
  if (existing) {
    db.prepare('UPDATE statuses SET closed_at = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), existing.id);
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  const closesAt = nowUnix + 30 * 60;
  const statusId = randomUUID();

  db.prepare(`
    INSERT INTO statuses (id, user_id, note, closes_at) VALUES (?, ?, ?, ?)
  `).run(statusId, userId, note || null, closesAt);

  // Add recipients (only friends)
  const friendIds = (db.prepare(`
    SELECT CASE WHEN user_a_id = ? THEN user_b_id ELSE user_a_id END as fid
    FROM friendships WHERE user_a_id = ? OR user_b_id = ?
  `).all(userId, userId, userId) as Array<{ fid: string }>).map(r => r.fid);

  const validRecipients = (recipient_ids as string[]).filter(id => friendIds.includes(id));

  for (const rid of validRecipients) {
    db.prepare('INSERT OR IGNORE INTO status_recipients (id, status_id, user_id) VALUES (?, ?, ?)').run(randomUUID(), statusId, rid);
  }

  // Save last selection
  db.prepare(`
    INSERT INTO recipient_sessions (user_id, selected_ids, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET selected_ids = excluded.selected_ids, updated_at = excluded.updated_at
  `).run(userId, JSON.stringify(validRecipients), nowUnix);

  // Send push notifications (exclude muted)
  const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId) as any;
  const mutedByMe = db.prepare('SELECT muted_user_id FROM friend_mutes WHERE user_id = ?').all(userId).map((r: any) => r.muted_user_id);

  for (const rid of validRecipients) {
    if (mutedByMe.includes(rid)) continue;
    notifyFriendDoorOpen(rid, user.display_name, note || null);
  }

  // Broadcast SSE to all recipients
  broadcastSSE(validRecipients, 'status:open', {
    status_id: statusId,
    owner_id: userId,
    owner_name: user.display_name,
    note: note || null,
    closes_at: closesAt,
  });

  const status = formatStatus(db.prepare('SELECT * FROM statuses WHERE id = ?').get(statusId), userId);
  res.status(201).json(status);
});

// PUT /api/status — update note + recipients
router.put('/', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  let { note, recipient_ids } = req.body;

  const status = getActiveStatus(userId);
  if (!status) return res.status(404).json({ error: 'No active status' });

  if (note !== undefined) {
    if (note) {
      note = sanitizeNote(note);
      if (note.length > 60) return res.status(400).json({ error: 'Note max 60 chars' });
      if (!(await isNoteAllowed(note))) note = null;
    }
    db.prepare('UPDATE statuses SET note = ? WHERE id = ?').run(note || null, status.id);
  }

  if (recipient_ids !== undefined) {
    const friendIds = (db.prepare(`
      SELECT CASE WHEN user_a_id = ? THEN user_b_id ELSE user_a_id END as fid
      FROM friendships WHERE user_a_id = ? OR user_b_id = ?
    `).all(userId, userId, userId) as Array<{ fid: string }>).map(r => r.fid);

    const valid = (recipient_ids as string[]).filter(id => friendIds.includes(id));
    db.prepare('DELETE FROM status_recipients WHERE status_id = ?').run(status.id);
    for (const rid of valid) {
      db.prepare('INSERT OR IGNORE INTO status_recipients (id, status_id, user_id) VALUES (?, ?, ?)').run(randomUUID(), status.id, rid);
    }

    db.prepare(`
      INSERT INTO recipient_sessions (user_id, selected_ids, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET selected_ids = excluded.selected_ids, updated_at = excluded.updated_at
    `).run(userId, JSON.stringify(valid), Math.floor(Date.now() / 1000));
  }

  const updated = formatStatus(db.prepare('SELECT * FROM statuses WHERE id = ?').get(status.id), userId);
  res.json(updated);
});

// DELETE /api/status — close
router.delete('/', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const status = getActiveStatus(userId);
  if (!status) return res.status(404).json({ error: 'No active status' });

  const nowUnix = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE statuses SET closed_at = ? WHERE id = ?').run(nowUnix, status.id);

  // Notify recipients via SSE
  const recipients = db.prepare('SELECT user_id FROM status_recipients WHERE status_id = ?').all(status.id).map((r: any) => r.user_id);
  broadcastSSE(recipients, 'status:close', { status_id: status.id, owner_id: userId });

  res.json({ ok: true });
});

// POST /api/status/prolong
router.post('/prolong', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const status = getActiveStatus(userId);
  if (!status) return res.status(404).json({ error: 'No active status' });

  const newClosesAt = status.closes_at + 30 * 60;
  db.prepare('UPDATE statuses SET closes_at = ?, closing_notification_sent = 0 WHERE id = ?').run(newClosesAt, status.id);

  res.json({ closes_at: newClosesAt });
});

// DELETE /api/status/recipients/:userId — remove a recipient
router.delete('/recipients/:recipientId', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { recipientId } = req.params;

  const status = getActiveStatus(userId);
  if (!status) return res.status(404).json({ error: 'No active status' });

  db.prepare('DELETE FROM status_recipients WHERE status_id = ? AND user_id = ?').run(status.id, recipientId);
  res.json({ ok: true });
});

// GET /api/status/last-selection
router.get('/last-selection', requireAuth, (req: AuthRequest, res) => {
  const row = db.prepare('SELECT selected_ids FROM recipient_sessions WHERE user_id = ?').get(req.userId) as { selected_ids: string } | undefined;
  const hasEverOpened = !!(db.prepare('SELECT id FROM statuses WHERE user_id = ? LIMIT 1').get(req.userId));
  res.json({
    selected_ids: row ? JSON.parse(row.selected_ids) : null,
    first_time: !hasEverOpened,
  });
});

export default router;
