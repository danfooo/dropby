import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth.js';
import { areFriends } from './friends.js';
import { sendInviteEmail } from '../services/email.js';
import { log } from '../services/analytics.js';
import { sanitizeNote, isNoteAllowed } from '../services/moderation.js';
import { normalizeToken, inviteUrl } from '../utils/invite-link.js';
import { notifyFriendJoined, notifyConnectionSuggestion } from '../services/notifications.js';
import { sendSSE } from '../services/sse.js';

const router = Router();

function generateToken(): string {
  return randomUUID().replace(/-/g, '');
}

function inviteIsOpen(invite: { revoked: number; expires_at: number }, nowUnix: number): boolean {
  return !invite.revoked && invite.expires_at > nowUnix;
}

function hasPendingInvite(fromId: string, toId: string): boolean {
  return !!db.prepare('SELECT id FROM pending_invites WHERE from_user_id = ? AND to_user_id = ?').get(fromId, toId);
}

function displayName(userId: string): string | null {
  const u = db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId) as any;
  return u?.display_name ?? null;
}

// Creates the friendship both sides have now asked for, and clears any pending rows.
// `sourceToken` only matters for a door-specific link: it is what lets the new friend
// into a door that is already open.
export function connectUsers(actorId: string, otherId: string, sourceToken?: string | null): void {
  if (actorId === otherId || areFriends(actorId, otherId)) return;
  const nowUnix = Math.floor(Date.now() / 1000);

  const [a, b] = [actorId, otherId].sort();
  db.prepare('INSERT OR IGNORE INTO friendships (id, user_a_id, user_b_id) VALUES (?, ?, ?)').run(randomUUID(), a, b);
  db.prepare('DELETE FROM pending_invites WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)')
    .run(actorId, otherId, otherId, actorId);

  const actorName = displayName(actorId);
  if (actorName) {
    notifyFriendJoined(otherId, actorName);
    sendSSE(otherId, 'friend:joined', { name: actorName });
  }

  if (sourceToken) {
    const invite = db.prepare('SELECT created_by, status_id FROM invite_links WHERE token = ?').get(sourceToken) as any;
    // Only the link's own creator can let someone into their open door — being picked off
    // a link by a third party never grants door access.
    if (invite?.status_id && (invite.created_by === actorId || invite.created_by === otherId)) {
      const guestId = invite.created_by === actorId ? otherId : actorId;
      const linkedStatus = db.prepare('SELECT id FROM statuses WHERE id = ? AND user_id = ? AND closed_at IS NULL AND closes_at > ?')
        .get(invite.status_id, invite.created_by, nowUnix) as any;
      if (linkedStatus) {
        db.prepare('INSERT OR IGNORE INTO status_recipients (id, status_id, user_id) VALUES (?, ?, ?)')
          .run(randomUUID(), linkedStatus.id, guestId);
      }
    }
  }
}

// Records one person's intent to connect. If the other side already asked, this connects
// them instead — order doesn't matter, and neither sees an accept step.
export function recordIntent(fromId: string, toId: string, sourceToken?: string | null): 'connected' | 'pending' | 'noop' {
  if (fromId === toId || areFriends(fromId, toId)) return 'noop';
  if (hasPendingInvite(toId, fromId)) {
    connectUsers(fromId, toId, sourceToken ?? db.prepare('SELECT source_token FROM pending_invites WHERE from_user_id = ? AND to_user_id = ?').get(toId, fromId) as any);
    return 'connected';
  }
  db.prepare(`
    INSERT INTO pending_invites (id, from_user_id, to_user_id, source_token) VALUES (?, ?, ?, ?)
    ON CONFLICT(from_user_id, to_user_id) DO UPDATE SET dismissed = 0
  `).run(randomUUID(), fromId, toId, sourceToken ?? null);
  return 'pending';
}

// Opening a link makes the opener a candidate for everyone else who opened it, and
// records the creator's standing intent toward them.
function recordInviteView(token: unknown, userId: string): void {
  if (typeof token !== 'string' || !token) return;
  const nowUnix = Math.floor(Date.now() / 1000);
  const invite = db.prepare('SELECT created_by FROM invite_links WHERE token = ? AND revoked = 0 AND expires_at > ?').get(token, nowUnix) as any;
  if (!invite || invite.created_by === userId) return;

  const isNewParticipant = db.prepare('SELECT id FROM link_participants WHERE token = ? AND user_id = ?').get(token, userId) === undefined;
  db.prepare('INSERT OR IGNORE INTO link_participants (id, token, user_id) VALUES (?, ?, ?)').run(randomUUID(), token, userId);

  if (isNewParticipant) {
    const name = displayName(userId);
    if (name) {
      for (const other of candidatesFor(token, userId)) {
        notifyConnectionSuggestion(other.id, name);
      }
    }
  }

  if (areFriends(userId, invite.created_by)) return;
  // Re-opening a link the user dismissed brings the decision back.
  recordIntent(invite.created_by, userId, token);
}

// Everyone else on this link the viewer could still connect with: not themselves, not the
// link's creator (offered separately), and nobody they are already friends with.
function candidatesFor(token: string, viewerId: string): Array<{ id: string; display_name: string; avatar_url: string | null }> {
  return db.prepare(`
    SELECT u.id, u.display_name, u.avatar_url
    FROM link_participants p
    JOIN users u ON u.id = p.user_id
    JOIN invite_links l ON l.token = p.token
    WHERE p.token = ? AND p.user_id <> ? AND l.created_by <> p.user_id
      AND NOT EXISTS (
        SELECT 1 FROM friendships f
        WHERE (f.user_a_id = p.user_id AND f.user_b_id = ?) OR (f.user_a_id = ? AND f.user_b_id = p.user_id)
      )
    ORDER BY p.created_at ASC
  `).all(token, viewerId, viewerId, viewerId) as any;
}

// Shared logic: create friendship from an invite token, used by accept endpoint and email verification
export function acceptInviteToken(rawToken: string, acceptorId: string): { ok: boolean; inviterName?: string } {
  const token = normalizeToken(rawToken);
  const nowUnix = Math.floor(Date.now() / 1000);
  const invite = db.prepare('SELECT * FROM invite_links WHERE token = ?').get(token) as any;
  if (!invite) return { ok: false };
  // Revoking is just "expire now": both only stop people who never opened the link.
  // Anyone who opened it while it was live holds a pending invite, and that pending
  // invite is the authorisation — "accept later" never silently dies.
  if (!inviteIsOpen(invite, nowUnix) && !hasPendingInvite(invite.created_by, acceptorId)) return { ok: false };

  const inviterId = invite.created_by;
  if (acceptorId === inviterId) return { ok: true };
  if (areFriends(acceptorId, inviterId)) return { ok: true };

  // Only a door-specific link (created from an open door) lets the acceptor into that door.
  // A generic friend link creates the friendship and nothing more.
  connectUsers(acceptorId, inviterId, token);
  return { ok: true, inviterName: displayName(inviterId) ?? undefined };
}

// Connect with the people picked off the link. Only genuine candidates count, so a
// crafted request can't reach anyone the viewer wasn't offered.
function connectAlso(raw: unknown, userId: string, token: string): { connected: number; pending: number } {
  const picked: string[] = Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  if (!picked.length) return { connected: 0, pending: 0 };

  const offerable = new Set(candidatesFor(token, userId).map(c => c.id));
  let connected = 0, pending = 0;
  for (const id of picked) {
    if (!offerable.has(id)) continue;
    const result = recordIntent(userId, id, token);
    if (result === 'connected') connected++;
    else if (result === 'pending') pending++;
  }
  return { connected, pending };
}

// POST /api/invites — generate invite link
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { status_id } = req.body;

  // The name is the creator's own words and ends up as a title card in other people's
  // chat apps, so it gets the same sanitising and moderation as a door note.
  let name: string | null = null;
  if (typeof req.body?.name === 'string' && req.body.name.trim()) {
    name = sanitizeNote(req.body.name).slice(0, 60);
    if (name && !(await isNoteAllowed(name))) return res.status(400).json({ error: 'NAME_NOT_ALLOWED' });
    if (!name) name = null;
  }
  const nowUnix = Math.floor(Date.now() / 1000);
  const expiresAt = nowUnix + 7 * 86400; // 7 days

  let resolvedStatusId: string | null = null;
  if (status_id) {
    const status = db.prepare('SELECT id FROM statuses WHERE id = ? AND user_id = ? AND closed_at IS NULL AND closes_at > ?').get(status_id, userId, nowUnix);
    if (status) resolvedStatusId = status_id;
  }

  const token = generateToken();
  const id = randomUUID();
  db.prepare('INSERT INTO invite_links (id, token, created_by, status_id, name, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, token, userId, resolvedStatusId, name, expiresAt);

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  res.status(201).json({ token, name, url: inviteUrl(appUrl, token, name), expires_at: expiresAt });
});

// GET /api/invites/open-links — list active link-based invites created by the current user
router.get('/open-links', requireAuth, (req: AuthRequest, res) => {
  const nowUnix = Math.floor(Date.now() / 1000);
  const links = db.prepare(`
    SELECT token, name, created_at, expires_at FROM invite_links
    WHERE created_by = ? AND invited_email IS NULL AND revoked = 0 AND expires_at > ?
    ORDER BY created_at DESC
  `).all(req.userId, nowUnix) as Array<{ token: string; name: string | null; created_at: number; expires_at: number }>;
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  res.json(links.map(l => ({ ...l, url: inviteUrl(appUrl, l.token, l.name) })));
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

// GET /api/invites/incoming — invites this user opened but hasn't accepted yet
router.get('/incoming', requireAuth, (req: AuthRequest, res) => {
  const rows = db.prepare(`
    SELECT p.source_token, l.name AS source_name, p.created_at, u.id AS inviter_id, u.display_name, u.avatar_url
    FROM pending_invites p
    JOIN users u ON u.id = p.from_user_id
    LEFT JOIN invite_links l ON l.token = p.source_token
    WHERE p.to_user_id = ? AND p.dismissed = 0
      AND NOT EXISTS (
        SELECT 1 FROM friendships f
        WHERE (f.user_a_id = p.from_user_id AND f.user_b_id = p.to_user_id)
           OR (f.user_a_id = p.to_user_id AND f.user_b_id = p.from_user_id)
      )
    ORDER BY p.created_at DESC
  `).all(req.userId) as Array<{ source_token: string | null; source_name: string | null; created_at: number; inviter_id: string; display_name: string; avatar_url: string | null }>;
  res.json(rows.map(r => ({
    token: r.source_token,
    source_name: r.source_name,
    created_at: r.created_at,
    inviter: { id: r.inviter_id, display_name: r.display_name, avatar_url: r.avatar_url },
  })));
});

// POST /api/invites/pending/dismiss — clear pending invites without accepting them.
// The link itself stays live: opening it again brings the decision back.
router.post('/pending/dismiss', requireAuth, (req: AuthRequest, res) => {
  const ids = Array.isArray(req.body?.from_user_ids) ? req.body.from_user_ids : [];
  const stmt = db.prepare('UPDATE pending_invites SET dismissed = 1 WHERE from_user_id = ? AND to_user_id = ?');
  ids.filter((id: unknown) => typeof id === 'string').forEach((id: string) => stmt.run(id, req.userId));
  res.json({ ok: true });
});

// POST /api/invites/pending/accept — accept a batch of people who asked to connect
router.post('/pending/accept', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const ids: string[] = Array.isArray(req.body?.from_user_ids)
    ? req.body.from_user_ids.filter((id: unknown) => typeof id === 'string')
    : [];

  let connected = 0;
  for (const fromId of ids) {
    const pending = db.prepare('SELECT source_token FROM pending_invites WHERE from_user_id = ? AND to_user_id = ?').get(fromId, userId) as any;
    if (!pending) continue;
    connectUsers(userId, fromId, pending.source_token);
    connected++;
  }
  if (connected) log('invite.accepted', userId, { count: connected });
  res.json({ ok: true, connected });
});

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
}

// GET /api/invites/:token/calendar.ics — invitee calendar download (no auth required)
router.get('/:token/calendar.ics', optionalAuth, (req: AuthRequest, res) => {
  const token = normalizeToken(req.params.token as string);
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
    ...(status.location ? [`LOCATION:${status.location}`] : []),
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
  const token = normalizeToken(req.params.token as string);
  const nowUnix = Math.floor(Date.now() / 1000);

  const invite = db.prepare('SELECT * FROM invite_links WHERE token = ?').get(token) as any;
  if (!invite) return res.status(404).json({ error: 'INVALID_TOKEN' });

  const pendingForViewer = !!(req.userId && hasPendingInvite(invite.created_by, req.userId));

  if (invite.revoked && !pendingForViewer) return res.status(410).json({ error: 'REVOKED' });

  if (invite.expires_at < nowUnix && !pendingForViewer) {
    const agoSecs = nowUnix - invite.expires_at;
    const expiredInviter = db.prepare('SELECT id, display_name, avatar_url FROM users WHERE id = ?').get(invite.created_by) as any;
    return res.status(410).json({ error: 'EXPIRED', expired_ago_seconds: agoSecs, inviter: expiredInviter || null });
  }

  const inviter = db.prepare('SELECT id, display_name, avatar_url FROM users WHERE id = ?').get(invite.created_by) as any;
  let status = null;
  if (invite.status_id) {
    const s = db.prepare(`
      SELECT * FROM statuses WHERE id = ? AND closed_at IS NULL
        AND (closes_at > ? OR starts_at > ?)
    `).get(invite.status_id, nowUnix, nowUnix) as any;
    if (s) status = { id: s.id, note: s.note, location: s.location || null, closes_at: s.closes_at, starts_at: s.starts_at || null, ends_at: s.ends_at || null };
  }

  const candidates = req.userId ? candidatesFor(token, req.userId) : [];

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

  if (req.userId && !isSelf && !alreadyFriends) recordInviteView(token, req.userId);

  res.json({ inviter, status, alreadyFriends, isSelf, candidates, link_name: invite.name ?? null });
});

// POST /api/invites/:token/accept — accept invite (auth required)
router.post('/:token/accept', requireAuth, (req: AuthRequest, res) => {
  const token = normalizeToken(req.params.token as string);
  const userId = req.userId!;
  const nowUnix = Math.floor(Date.now() / 1000);

  const invite = db.prepare('SELECT * FROM invite_links WHERE token = ?').get(token) as any;
  if (!invite) return res.status(404).json({ error: 'Invalid or expired invite' });
  if (!inviteIsOpen(invite, nowUnix) && !hasPendingInvite(invite.created_by, userId)) {
    return res.status(404).json({ error: 'Invalid or expired invite' });
  }

  const inviterId = invite.created_by;

  if (userId === inviterId) {
    return res.json({ ok: true, alreadyFriends: false, isSelf: true, also: connectAlso(req.body?.also, userId, token) });
  }

  if (areFriends(userId, inviterId)) {
    const also = connectAlso(req.body?.also, userId, token);
    const activeStatus = db.prepare('SELECT * FROM statuses WHERE user_id = ? AND closed_at IS NULL AND closes_at > ?').get(inviterId, nowUnix) as any;
    return res.json({ ok: true, alreadyFriends: true, also, status: activeStatus ? { id: activeStatus.id, note: activeStatus.note, location: activeStatus.location || null, closes_at: activeStatus.closes_at } : null });
  }

  log('invite.accepted', userId);
  const result = acceptInviteToken(token, userId);
  const also = connectAlso(req.body?.also, userId, token);
  res.json({ ok: true, alreadyFriends: false, inviterName: result.inviterName, also });
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

// POST /api/invites/:token/rename — the name is cosmetic in the URL, so renaming never
// breaks a copy already shared; new copies just carry the new slug.
router.post('/:token/rename', requireAuth, async (req: AuthRequest, res) => {
  const token = normalizeToken(req.params.token as string);
  const raw = typeof req.body?.name === 'string' ? sanitizeNote(req.body.name).slice(0, 60) : '';
  const name = raw || null;
  if (name && !(await isNoteAllowed(name))) return res.status(400).json({ error: 'NAME_NOT_ALLOWED' });

  const result = db.prepare('UPDATE invite_links SET name = ? WHERE token = ? AND created_by = ?')
    .run(name, token, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  res.json({ ok: true, name, url: inviteUrl(appUrl, token, name) });
});

// POST /api/invites/:token/revoke
router.post('/:token/revoke', requireAuth, (req: AuthRequest, res) => {
  const token = normalizeToken(req.params.token as string);
  const result = db.prepare('UPDATE invite_links SET revoked = 1 WHERE token = ? AND created_by = ?').run(token, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
