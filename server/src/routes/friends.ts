import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { log } from '../services/analytics.js';

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
      CASE WHEN fh.id IS NOT NULL THEN 1 ELSE 0 END AS hidden,
      f.created_at AS friendship_created_at,
      COALESCE(fnp.pref, 'default') AS notif_pref
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.user_a_id = ? THEN f.user_b_id ELSE f.user_a_id END
    LEFT JOIN friend_hides fh ON fh.user_id = ? AND fh.hidden_user_id = u.id
      AND (fh.expires_at IS NULL OR fh.expires_at > unixepoch())
    LEFT JOIN friend_notif_prefs fnp ON fnp.user_id = ? AND fnp.friend_user_id = u.id
    WHERE f.user_a_id = ? OR f.user_b_id = ?
    ORDER BY u.display_name
  `).all(userId, userId, userId, userId, userId) as Array<{
    id: string; display_name: string; email: string; avatar_url: string | null; hidden: number; friendship_created_at: number; notif_pref: string;
  }>;
}

// GET /api/friends
router.get('/', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const friends = getFriendsOf(userId);
  // `selected` is the friend's own default recipient state, carried on the friend record itself
  // so the client never has to reconcile a separate list against this one.
  const sessionRow = db.prepare('SELECT unselected_ids FROM recipient_sessions WHERE user_id = ?').get(userId) as { unselected_ids: string } | undefined;
  const unselected: string[] = sessionRow ? JSON.parse(sessionRow.unselected_ids) : [];
  res.json(friends.map(f => ({
    ...f,
    hidden: Boolean(f.hidden),
    selected: !f.hidden && !unselected.includes(f.id),
  })));
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

// POST /api/friends/:friendId/hide
router.post('/:friendId/hide', requireAuth, (req: AuthRequest, res) => {
  const { friendId } = req.params as { friendId: string };
  const userId = req.userId!;
  const { duration_days } = req.body ?? {};

  if (!areFriends(userId, friendId)) {
    return res.status(404).json({ error: 'Not friends' });
  }

  const expiresAt = typeof duration_days === 'number' && duration_days > 0
    ? Math.floor(Date.now() / 1000) + duration_days * 86400
    : null;

  db.prepare(`
    INSERT INTO friend_hides (id, user_id, hidden_user_id, expires_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, hidden_user_id) DO UPDATE SET
      expires_at = excluded.expires_at,
      created_at = (unixepoch())
  `).run(randomUUID(), userId, friendId, expiresAt);

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

// DELETE /api/friends/:friendId/hide
router.delete('/:friendId/hide', requireAuth, (req: AuthRequest, res) => {
  const { friendId } = req.params;
  db.prepare('DELETE FROM friend_hides WHERE user_id = ? AND hidden_user_id = ?').run(req.userId, friendId);
  res.json({ ok: true });
});

// POST /api/friends/:friendId/notif-pref
router.post('/:friendId/notif-pref', requireAuth, (req: AuthRequest, res) => {
  const { friendId } = req.params as { friendId: string };
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

// GET /api/friends/suggestions — people you may know, from links you both opened.
//
// Ranked by the smallest link two people share: a link named for a group and opened by
// five people is strong evidence they know each other, while a door link broadcast to
// everyone is weak. Size ordering handles that without special-casing link types.
router.get('/suggestions', requireAuth, (req: AuthRequest, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.display_name, u.avatar_url, l.name AS link_name, sizes.n AS link_size
    FROM link_participants mine
    JOIN link_participants theirs ON theirs.token = mine.token AND theirs.user_id <> mine.user_id
    JOIN users u ON u.id = theirs.user_id
    JOIN invite_links l ON l.token = mine.token
    JOIN (SELECT token, COUNT(*) AS n FROM link_participants GROUP BY token) sizes ON sizes.token = mine.token
    WHERE mine.user_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM friendships f
        WHERE (f.user_a_id = mine.user_id AND f.user_b_id = theirs.user_id)
           OR (f.user_a_id = theirs.user_id AND f.user_b_id = mine.user_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM pending_invites p
        WHERE (p.from_user_id = mine.user_id AND p.to_user_id = theirs.user_id)
           OR (p.from_user_id = theirs.user_id AND p.to_user_id = mine.user_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM suggestion_dismissals d
        WHERE d.user_id = mine.user_id AND d.other_user_id = theirs.user_id
      )
    ORDER BY sizes.n ASC, theirs.created_at DESC
  `).all(req.userId) as Array<{ id: string; display_name: string; avatar_url: string | null; link_name: string | null; link_size: number }>;

  // Someone reachable through several links is listed once, under the smallest — the
  // strongest reason we have for suggesting them.
  const seen = new Set<string>();
  const suggestions = rows.filter(r => !seen.has(r.id) && seen.add(r.id)).slice(0, 10);
  if (suggestions.length) {
    log('suggestions.shown', req.userId!, {
      count: suggestions.length,
      // The strongest reason on offer — lets acceptance be read against link size.
      best_link_size: suggestions[0].link_size,
    });
  }
  res.json(suggestions);
});

// POST /api/friends/suggestions/dismiss — stop suggesting these people
router.post('/suggestions/dismiss', requireAuth, (req: AuthRequest, res) => {
  const ids: string[] = Array.isArray(req.body?.user_ids)
    ? req.body.user_ids.filter((id: unknown) => typeof id === 'string')
    : [];
  const stmt = db.prepare('INSERT OR IGNORE INTO suggestion_dismissals (id, user_id, other_user_id) VALUES (?, ?, ?)');
  ids.forEach(id => stmt.run(randomUUID(), req.userId, id));
  if (ids.length) log('suggestion.dismissed', req.userId!, { count: ids.length });
  res.json({ ok: true });
});

// POST /api/friends/connect — ask to connect with suggested people
router.post('/connect', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const ids: string[] = Array.isArray(req.body?.user_ids)
    ? req.body.user_ids.filter((id: unknown) => typeof id === 'string')
    : [];

  const { recordIntent } = await import('./invites.js');
  let connected = 0, pending = 0;
  for (const otherId of ids) {
    // Only people you actually share a link with — the suggestion is the authorisation.
    const shared = db.prepare(`
      SELECT mine.token FROM link_participants mine
      JOIN link_participants theirs ON theirs.token = mine.token
      WHERE mine.user_id = ? AND theirs.user_id = ?
      LIMIT 1
    `).get(userId, otherId) as { token: string } | undefined;
    if (!shared) continue;

    const size = (db.prepare('SELECT COUNT(*) AS n FROM link_participants WHERE token = ?').get(shared.token) as any)?.n ?? 0;
    // link_size here is the test of the ranking hypothesis: are suggestions from small
    // links acted on more often than suggestions from large ones?
    log('suggestion.connected', userId, { link_size: size });

    const result = recordIntent(userId, otherId, shared.token, 'suggestion');
    if (result === 'connected') connected++;
    else if (result === 'pending') pending++;
  }
  res.json({ ok: true, connected, pending });
});

export { areFriends, getFriendsOf };
export default router;
