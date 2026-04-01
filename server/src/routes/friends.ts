import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

function areFriends(userA: string, userB: string): boolean {
  return !!(db.prepare(`
    SELECT id FROM friendships
    WHERE (user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?)
  `).get(userA, userB, userB, userA));
}

function getFriendsOf(userId: string) {
  return db.prepare(`
    SELECT u.id, u.display_name, u.email, u.avatar_url,
      CASE WHEN fm.id IS NOT NULL THEN 1 ELSE 0 END AS muted,
      f.created_at AS friendship_created_at,
      COALESCE(fnp.pref, 'default') AS notif_pref
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.user_a_id = ? THEN f.user_b_id ELSE f.user_a_id END
    LEFT JOIN friend_mutes fm ON fm.user_id = ? AND fm.muted_user_id = u.id
    LEFT JOIN friend_notif_prefs fnp ON fnp.user_id = ? AND fnp.friend_user_id = u.id
    WHERE f.user_a_id = ? OR f.user_b_id = ?
    ORDER BY u.display_name
  `).all(userId, userId, userId, userId, userId) as Array<{
    id: string; display_name: string; email: string; avatar_url: string | null; muted: number; friendship_created_at: number; notif_pref: string;
  }>;
}

// GET /api/friends
router.get('/', requireAuth, (req: AuthRequest, res) => {
  const friends = getFriendsOf(req.userId!);
  res.json(friends.map(f => ({ ...f, muted: Boolean(f.muted) })));
});

// DELETE /api/friends/:friendId
router.delete('/:friendId', requireAuth, (req: AuthRequest, res) => {
  const { friendId } = req.params;
  const userId = req.userId!;

  db.prepare(`
    DELETE FROM friendships
    WHERE (user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?)
  `).run(userId, friendId, friendId, userId);

  // Remove from each other's active status recipients
  const nowUnix = Math.floor(Date.now() / 1000);
  const activeStatuses = db.prepare(`
    SELECT id FROM statuses WHERE (user_id = ? OR user_id = ?) AND closed_at IS NULL AND closes_at > ?
  `).all(userId, friendId, nowUnix) as Array<{ id: string }>;

  for (const s of activeStatuses) {
    db.prepare(`
      DELETE FROM status_recipients WHERE status_id = ? AND (user_id = ? OR user_id = ?)
    `).run(s.id, userId, friendId);
  }

  res.json({ ok: true });
});

// POST /api/friends/:friendId/mute
router.post('/:friendId/mute', requireAuth, (req: AuthRequest, res) => {
  const { friendId } = req.params;
  const userId = req.userId!;

  if (!areFriends(userId, friendId)) {
    return res.status(404).json({ error: 'Not friends' });
  }

  db.prepare(`
    INSERT OR IGNORE INTO friend_mutes (id, user_id, muted_user_id) VALUES (?, ?, ?)
  `).run(randomUUID(), userId, friendId);

  // Also mark as unselected in recipient sessions
  const sessionRow = db.prepare('SELECT unselected_ids FROM recipient_sessions WHERE user_id = ?').get(userId) as { unselected_ids: string } | undefined;
  const unselected: string[] = sessionRow ? JSON.parse(sessionRow.unselected_ids) : [];
  if (!unselected.includes(friendId)) {
    unselected.push(friendId);
    db.prepare(`
      INSERT INTO recipient_sessions (user_id, unselected_ids, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET unselected_ids = excluded.unselected_ids, updated_at = excluded.updated_at
    `).run(userId, JSON.stringify(unselected), Math.floor(Date.now() / 1000));
  }

  res.json({ ok: true });
});

// DELETE /api/friends/:friendId/mute
router.delete('/:friendId/mute', requireAuth, (req: AuthRequest, res) => {
  const { friendId } = req.params;
  db.prepare('DELETE FROM friend_mutes WHERE user_id = ? AND muted_user_id = ?').run(req.userId, friendId);
  res.json({ ok: true });
});

// POST /api/friends/:friendId/notif-pref
router.post('/:friendId/notif-pref', requireAuth, (req: AuthRequest, res) => {
  const { friendId } = req.params;
  const userId = req.userId!;
  const { pref } = req.body;

  if (!['none', 'default', 'all'].includes(pref)) {
    return res.status(400).json({ error: 'pref must be none, default, or all' });
  }
  if (!areFriends(userId, friendId)) {
    return res.status(404).json({ error: 'Not friends' });
  }

  db.prepare(`
    INSERT INTO friend_notif_prefs (user_id, friend_user_id, pref)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, friend_user_id) DO UPDATE SET pref = excluded.pref
  `).run(userId, friendId, pref);

  res.json({ ok: true });
});

export { areFriends, getFriendsOf };
export default router;
