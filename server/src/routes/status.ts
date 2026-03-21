import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { notifyFriendDoorOpen, notifyScheduledSession, notifyScheduledReminder, notifyCalendarUpdate, notifyCalendarCancel } from '../services/notifications.js';
import { broadcastSSE } from '../services/sse.js';
import { sanitizeNote, isNoteAllowed } from '../services/moderation.js';
import { log } from '../services/analytics.js';

const router = Router();

function getActiveStatus(userId: string) {
  const nowUnix = Math.floor(Date.now() / 1000);
  return db.prepare(`
    SELECT * FROM statuses
    WHERE user_id = ? AND closed_at IS NULL AND closes_at > ?
      AND (starts_at IS NULL OR starts_at <= ?)
  `).get(userId, nowUnix, nowUnix) as any | undefined;
}

function getScheduledStatus(userId: string) {
  const nowUnix = Math.floor(Date.now() / 1000);
  return db.prepare(`
    SELECT * FROM statuses
    WHERE user_id = ? AND closed_at IS NULL AND starts_at > ?
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
    SELECT gs.id, gs.created_at, gs.rsvp,
      u.id as user_id, u.display_name,
      gc.name as guest_name
    FROM going_signals gs
    LEFT JOIN users u ON u.id = gs.user_id
    LEFT JOIN guest_contacts gc ON gc.id = gs.guest_contact_id
    WHERE gs.status_id = ?
    ORDER BY gs.created_at
  `).all(status.id) as any[];

  const myGoing = userId
    ? db.prepare('SELECT id, rsvp FROM going_signals WHERE status_id = ? AND user_id = ?').get(status.id, userId) as any
    : null;

  const nowUnix = Math.floor(Date.now() / 1000);
  const inviteLinks = db.prepare(`
    SELECT token, created_at FROM invite_links
    WHERE status_id = ? AND revoked = 0 AND expires_at > ?
    ORDER BY created_at DESC
  `).all(status.id, nowUnix) as Array<{ token: string; created_at: number }>;

  return {
    id: status.id,
    note: status.note,
    closes_at: status.closes_at,
    closed_at: status.closed_at,
    created_at: status.created_at,
    starts_at: status.starts_at || null,
    ends_at: status.ends_at || null,
    notify_at: status.notify_at || null,
    notifications_sent: Boolean(status.notifications_sent),
    recipients,
    invite_links: inviteLinks,
    going_signals: goingSignals.map(g => ({
      id: g.id,
      name: g.display_name || g.guest_name || 'Guest',
      rsvp: g.rsvp || 'going',
      created_at: g.created_at,
    })),
    my_going: Boolean(myGoing),
    my_rsvp: myGoing?.rsvp || null,
  };
}

// GET /api/status — active status
router.get('/', requireAuth, (req: AuthRequest, res) => {
  const status = getActiveStatus(req.userId!);
  res.json(formatStatus(status, req.userId!));
});

// GET /api/status/scheduled — pending scheduled status
router.get('/scheduled', requireAuth, (req: AuthRequest, res) => {
  const status = getScheduledStatus(req.userId!);
  res.json(formatStatus(status, req.userId!));
});

// GET /api/status/friends — friends with active or upcoming statuses visible to this user
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
    LEFT JOIN friend_mutes fm ON fm.user_id = ? AND fm.muted_user_id = s.user_id
    WHERE s.closed_at IS NULL AND fm.id IS NULL AND (
      ((s.starts_at IS NULL OR s.starts_at <= ?) AND s.closes_at > ?)
      OR s.starts_at > ?
    )
    ORDER BY COALESCE(s.starts_at, s.created_at) ASC
  `).all(userId, userId, userId, userId, nowUnix, nowUnix, nowUnix) as any[];

  const myRsvps = db.prepare(`
    SELECT status_id, rsvp FROM going_signals WHERE user_id = ?
  `).all(userId) as Array<{ status_id: string; rsvp: string }>;
  const rsvpMap = new Map(myRsvps.map(r => [r.status_id, r.rsvp]));

  res.json(friendStatuses.map(s => ({
    id: s.id,
    owner_id: s.owner_id,
    owner_name: s.display_name,
    note: s.note,
    closes_at: s.closes_at,
    starts_at: s.starts_at || null,
    ends_at: s.ends_at || null,
    my_going: rsvpMap.has(s.id),
    my_rsvp: rsvpMap.get(s.id) || null,
  })));
});

// POST /api/status — create (spontaneous or scheduled)
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { recipient_ids = [], starts_at: rawStartsAt, ends_at: rawEndsAt, reminder_minutes: rawReminderMinutes } = req.body;

  let note: string | undefined = req.body.note;
  if (note) {
    note = sanitizeNote(note);
    if (note.length > 160) return res.status(400).json({ error: 'Note max 160 chars' });
    if (!(await isNoteAllowed(note))) note = undefined;
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  const isScheduled = rawStartsAt && Number(rawStartsAt) > nowUnix;

  if (isScheduled && !rawEndsAt) {
    return res.status(400).json({ error: 'ends_at required for scheduled sessions' });
  }

  const startsAt: number | null = isScheduled ? Number(rawStartsAt) : null;
  const endsAt: number | null = rawEndsAt ? Number(rawEndsAt) : null;
  const reminderMinutes: number | null = isScheduled ? (rawReminderMinutes ?? 30) : null;
  const user = db.prepare('SELECT default_door_minutes FROM users WHERE id = ?').get(userId) as any;
  const doorMinutes = user?.default_door_minutes ?? 60;
  const closesAt = isScheduled ? Number(rawEndsAt) : nowUnix + doorMinutes * 60;

  // Close any existing active status — but only for spontaneous opens (scheduled sessions coexist)
  if (!isScheduled) {
    const existing = getActiveStatus(userId);
    if (existing) {
      db.prepare('UPDATE statuses SET closed_at = ? WHERE id = ?').run(nowUnix, existing.id);
    }
  }

  const statusId = randomUUID();

  const notifyAt = isScheduled ? null : nowUnix + 2;

  db.prepare(`
    INSERT INTO statuses (id, user_id, note, closes_at, starts_at, ends_at, reminder_minutes, notify_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(statusId, userId, note || null, closesAt, startsAt, endsAt, reminderMinutes, notifyAt);

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
  const unselectedOnCreate = friendIds.filter((id: string) => !validRecipients.includes(id));
  db.prepare(`
    INSERT INTO recipient_sessions (user_id, selected_ids, unselected_ids, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET selected_ids = excluded.selected_ids, unselected_ids = excluded.unselected_ids, updated_at = excluded.updated_at
  `).run(userId, JSON.stringify(validRecipients), JSON.stringify(unselectedOnCreate), nowUnix);

  const userFull = db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId) as any;
  const mutedByMe = db.prepare('SELECT muted_user_id FROM friend_mutes WHERE user_id = ?').all(userId).map((r: any) => r.muted_user_id);

  if (isScheduled) {
    // Notify invitees about the upcoming scheduled session immediately
    for (const rid of validRecipients) {
      if (mutedByMe.includes(rid)) continue;
      notifyScheduledSession(rid, userFull.display_name, startsAt!);
    }
  }
  // Spontaneous: notifications are sent after 90s by the cron job

  log('door.open', userId, { recipients: validRecipients.length, has_note: !!note });

  const status = formatStatus(db.prepare('SELECT * FROM statuses WHERE id = ?').get(statusId), userId);
  res.status(201).json(status);
});

// POST /api/status/:statusId/activate — open a scheduled session
router.post('/:statusId/activate', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { statusId } = req.params;
  const nowUnix = Math.floor(Date.now() / 1000);

  const scheduled = db.prepare(`
    SELECT * FROM statuses WHERE id = ? AND user_id = ? AND closed_at IS NULL AND starts_at > ?
  `).get(statusId, userId, nowUnix) as any;
  if (!scheduled) return res.status(404).json({ error: 'No pending scheduled session found' });

  // Close any currently active session
  const existing = getActiveStatus(userId);
  if (existing) {
    db.prepare('UPDATE statuses SET closed_at = ? WHERE id = ?').run(nowUnix, existing.id);
  }

  // Activate: clear starts_at (keep closes_at = ends_at)
  db.prepare('UPDATE statuses SET starts_at = NULL WHERE id = ?').run(statusId);

  // Notify recipients that door is now open
  const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId) as any;
  const recipients = db.prepare('SELECT user_id FROM status_recipients WHERE status_id = ?').all(statusId).map((r: any) => r.user_id);
  const mutedByMe = db.prepare('SELECT muted_user_id FROM friend_mutes WHERE user_id = ?').all(userId).map((r: any) => r.muted_user_id);

  for (const rid of recipients) {
    if (mutedByMe.includes(rid)) continue;
    notifyFriendDoorOpen(rid, user.display_name, scheduled.note || null);
  }

  broadcastSSE(recipients, 'status:open', {
    status_id: statusId,
    owner_id: userId,
    owner_name: user.display_name,
    note: scheduled.note || null,
    closes_at: scheduled.closes_at,
  });

  const status = formatStatus(db.prepare('SELECT * FROM statuses WHERE id = ?').get(statusId), userId);
  res.json(status);
});

// PUT /api/status — update note + recipients (+ starts_at/ends_at for scheduled)
router.put('/', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  let { note, recipient_ids, ends_at } = req.body;

  // Try active first, then scheduled
  const status = getActiveStatus(userId) || getScheduledStatus(userId);
  if (!status) return res.status(404).json({ error: 'No active status' });

  if (note !== undefined) {
    if (note) {
      note = sanitizeNote(note);
      if (note.length > 160) return res.status(400).json({ error: 'Note max 160 chars' });
      if (!(await isNoteAllowed(note))) note = null;
    }
    db.prepare('UPDATE statuses SET note = ? WHERE id = ?').run(note || null, status.id);
  }

  if (ends_at !== undefined) {
    const newEndsAt = ends_at ? Number(ends_at) : null;
    db.prepare('UPDATE statuses SET ends_at = ?, closes_at = COALESCE(?, closes_at) WHERE id = ?').run(newEndsAt, newEndsAt, status.id);
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

    const unselectedOnUpdate = friendIds.filter((id: string) => !valid.includes(id));
    db.prepare(`
      INSERT INTO recipient_sessions (user_id, selected_ids, unselected_ids, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET selected_ids = excluded.selected_ids, unselected_ids = excluded.unselected_ids, updated_at = excluded.updated_at
    `).run(userId, JSON.stringify(valid), JSON.stringify(unselectedOnUpdate), Math.floor(Date.now() / 1000));
  }

  const updated = formatStatus(db.prepare('SELECT * FROM statuses WHERE id = ?').get(status.id), userId);
  res.json(updated);
});

// PUT /api/status/:statusId — update a specific session by ID
router.put('/:statusId', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { statusId } = req.params;
  let { note, recipient_ids, starts_at, ends_at } = req.body;

  const status = db.prepare('SELECT * FROM statuses WHERE id = ? AND user_id = ? AND closed_at IS NULL').get(statusId, userId) as any;
  if (!status) return res.status(404).json({ error: 'Session not found' });

  if (note !== undefined) {
    if (note) {
      note = sanitizeNote(note);
      if (note.length > 160) return res.status(400).json({ error: 'Note max 160 chars' });
      if (!(await isNoteAllowed(note))) note = null;
    }
    db.prepare('UPDATE statuses SET note = ? WHERE id = ?').run(note || null, statusId);
  }

  const timesChanged = starts_at !== undefined || ends_at !== undefined;

  if (starts_at !== undefined) {
    db.prepare('UPDATE statuses SET starts_at = ? WHERE id = ?').run(starts_at ? Number(starts_at) : null, statusId);
  }

  if (ends_at !== undefined) {
    const newEndsAt = ends_at ? Number(ends_at) : null;
    db.prepare('UPDATE statuses SET ends_at = ?, closes_at = COALESCE(?, closes_at) WHERE id = ?').run(newEndsAt, newEndsAt, statusId);
  }

  if (timesChanged) {
    db.prepare('UPDATE statuses SET ics_sequence = ics_sequence + 1 WHERE id = ?').run(statusId);
    const downloads = db.prepare('SELECT user_id, token FROM status_ics_downloads WHERE status_id = ?').all(statusId) as Array<{ user_id: string | null; token: string | null }>;
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    for (const d of downloads) {
      if (d.user_id && d.token) {
        notifyCalendarUpdate(d.user_id, `${appUrl}/api/invites/${d.token}/calendar.ics`);
      }
    }
  }

  if (recipient_ids !== undefined) {
    const friendIds = (db.prepare(`
      SELECT CASE WHEN user_a_id = ? THEN user_b_id ELSE user_a_id END as fid
      FROM friendships WHERE user_a_id = ? OR user_b_id = ?
    `).all(userId, userId, userId) as Array<{ fid: string }>).map(r => r.fid);

    const valid = (recipient_ids as string[]).filter(id => friendIds.includes(id));
    db.prepare('DELETE FROM status_recipients WHERE status_id = ?').run(statusId);
    for (const rid of valid) {
      db.prepare('INSERT OR IGNORE INTO status_recipients (id, status_id, user_id) VALUES (?, ?, ?)').run(randomUUID(), statusId, rid);
    }
  }

  const updated = formatStatus(db.prepare('SELECT * FROM statuses WHERE id = ?').get(statusId), userId);
  res.json(updated);
});

// POST /api/status/duration — update auto-close duration for active session + save as user preference
router.post('/duration', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const minutes = Number(req.body.minutes);
  if (!minutes || minutes <= 0) return res.status(400).json({ error: 'Invalid minutes' });

  const status = getActiveStatus(userId);
  if (!status) return res.status(404).json({ error: 'No active status' });

  const nowUnix = Math.floor(Date.now() / 1000);
  const newClosesAt = Math.max(status.created_at + minutes * 60, nowUnix + 60);

  db.prepare('UPDATE statuses SET closes_at = ?, closing_notification_sent = 0 WHERE id = ?').run(newClosesAt, status.id);
  db.prepare('UPDATE users SET default_door_minutes = ? WHERE id = ?').run(minutes, userId);

  res.json({ closes_at: newClosesAt });
});

// DELETE /api/status — close active session
router.delete('/', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const status = getActiveStatus(userId);
  if (!status) return res.status(404).json({ error: 'No active status' });

  const nowUnix = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE statuses SET closed_at = ? WHERE id = ?').run(nowUnix, status.id);

  // Only broadcast close if friends were already notified of the open
  if (status.notifications_sent) {
    const recipients = db.prepare('SELECT user_id FROM status_recipients WHERE status_id = ?').all(status.id).map((r: any) => r.user_id);
    broadcastSSE(recipients, 'status:close', { status_id: status.id, owner_id: userId });
  }

  res.json({ ok: true });
});

// GET /api/status/upcoming — all pending scheduled sessions
router.get('/upcoming', requireAuth, (req: AuthRequest, res) => {
  const nowUnix = Math.floor(Date.now() / 1000);
  const sessions = db.prepare(`
    SELECT * FROM statuses
    WHERE user_id = ? AND closed_at IS NULL AND starts_at > ?
    ORDER BY starts_at ASC
  `).all(req.userId!, nowUnix) as any[];
  res.json(sessions.map(s => formatStatus(s, req.userId!)));
});

// DELETE /api/status/scheduled/:statusId — cancel a specific scheduled session
router.delete('/scheduled/:statusId', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { statusId } = req.params;
  const nowUnix = Math.floor(Date.now() / 1000);
  const status = db.prepare('SELECT id FROM statuses WHERE id = ? AND user_id = ? AND closed_at IS NULL AND starts_at > ?').get(statusId, userId, nowUnix) as any;
  if (!status) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE statuses SET closed_at = ? WHERE id = ?').run(nowUnix, statusId);

  const downloads = db.prepare('SELECT user_id, token FROM status_ics_downloads WHERE status_id = ?').all(statusId) as Array<{ user_id: string | null; token: string | null }>;
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  for (const d of downloads) {
    if (d.user_id && d.token) {
      notifyCalendarCancel(d.user_id, `${appUrl}/api/invites/${d.token}/calendar.ics`);
    }
  }

  res.json({ ok: true });
});

// DELETE /api/status/scheduled — cancel pending scheduled session (legacy, cancels first)
router.delete('/scheduled', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const status = getScheduledStatus(userId);
  if (!status) return res.status(404).json({ error: 'No scheduled session' });

  const nowUnix = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE statuses SET closed_at = ? WHERE id = ?').run(nowUnix, status.id);
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
  const row = db.prepare('SELECT unselected_ids FROM recipient_sessions WHERE user_id = ?').get(req.userId) as { unselected_ids: string } | undefined;
  res.json({
    unselected_ids: row ? JSON.parse(row.unselected_ids) : [],
  });
});

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
}

function generateIcs(status: any, hostName: string, method: 'REQUEST' | 'CANCEL'): string {
  const now = new Date();
  const summary = status.note ? `${hostName}'s drop-by: ${status.note}` : `${hostName}'s drop-by`;
  const sequence = method === 'CANCEL' ? 99 : (status.ics_sequence || 0);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dropby//Dropby//EN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:dropby-${status.id}@dropby.app`,
    `DTSTAMP:${formatIcsDate(now)}`,
    `DTSTART:${formatIcsDate(new Date(status.starts_at * 1000))}`,
    `DTEND:${formatIcsDate(new Date(status.ends_at * 1000))}`,
    `SUMMARY:${summary}`,
    `SEQUENCE:${sequence}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

// GET /api/status/:statusId/calendar.ics — host calendar download (public; UUID is unguessable)
router.get('/:statusId/calendar.ics', (req, res) => {
  const { statusId } = req.params;
  const cancel = req.query.cancel === '1';

  const status = db.prepare('SELECT * FROM statuses WHERE id = ? AND starts_at IS NOT NULL').get(statusId) as any;
  if (!status) return res.status(404).json({ error: 'Not found' });

  const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(status.user_id) as any;
  const method = cancel && status.closed_at ? 'CANCEL' : 'REQUEST';
  const ics = generateIcs(status, user.display_name, method);

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="dropby-${statusId}.ics"`);
  res.send(ics);
});

export default router;
