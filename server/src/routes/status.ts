import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { announceDoorOpen, isHiddenEitherWay, notifyScheduledSession, notifyCalendarUpdate, notifyCalendarCancel } from '../services/notifications.js';
import { syncStatusJobs } from '../services/jobs.js';
import { broadcastSSE } from '../services/sse.js';
import { sanitizeNote, isNoteAllowed } from '../services/moderation.js';
import { log } from '../services/analytics.js';
import { validateBody } from '../middleware/validate.js';
import type { Status, FriendStatus } from '@dropby/shared';
import { createStatusBody, setDurationBody, updateStatusBody, updateStatusByIdBody } from '@dropby/shared';

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

function formatStatus(status: any, userId: string): Status | null {
  if (!status) return null;
  const recipients = db.prepare(`
    SELECT u.id, u.display_name, u.avatar_url FROM status_recipients sr
    JOIN users u ON u.id = sr.user_id
    WHERE sr.status_id = ?
  `).all(status.id) as Array<{ id: string; display_name: string; avatar_url: string | null }>;

  const goingSignals = db.prepare(`
    SELECT gs.id, gs.created_at, gs.rsvp, gs.note,
      u.id as user_id, u.display_name,
      gc.name as guest_name
    FROM going_signals gs
    LEFT JOIN users u ON u.id = gs.user_id
    LEFT JOIN guest_contacts gc ON gc.id = gs.guest_contact_id
    WHERE gs.status_id = ?
    ORDER BY gs.created_at
  `).all(status.id) as any[];

  const myGoing = userId
    ? db.prepare('SELECT id, rsvp, note FROM going_signals WHERE status_id = ? AND user_id = ?').get(status.id, userId) as any
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
    location: status.location || null,
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
      user_id: g.user_id || null,
      name: g.display_name || g.guest_name || 'Guest',
      rsvp: g.rsvp || 'going',
      note: g.note || null,
      created_at: g.created_at,
    })),
    my_going: Boolean(myGoing),
    my_rsvp: myGoing?.rsvp || null,
    my_note: myGoing?.note || null,
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
    SELECT s.*, u.display_name, u.avatar_url, u.id as owner_id
    FROM statuses s
    JOIN users u ON u.id = s.user_id
    JOIN status_recipients sr ON sr.status_id = s.id AND sr.user_id = ?
    JOIN friendships f ON
      (f.user_a_id = ? AND f.user_b_id = s.user_id) OR
      (f.user_b_id = ? AND f.user_a_id = s.user_id)
    LEFT JOIN friend_hides fh ON fh.user_id = ? AND fh.hidden_user_id = s.user_id
      AND (fh.expires_at IS NULL OR fh.expires_at > unixepoch())
    WHERE s.closed_at IS NULL AND fh.id IS NULL AND (
      ((s.starts_at IS NULL OR s.starts_at <= ?) AND s.closes_at > ?)
      OR s.starts_at > ?
    )
    ORDER BY COALESCE(s.starts_at, s.created_at) ASC
  `).all(userId, userId, userId, userId, nowUnix, nowUnix, nowUnix) as any[];

  const myRsvps = db.prepare(`
    SELECT status_id, rsvp, note FROM going_signals WHERE user_id = ?
  `).all(userId) as Array<{ status_id: string; rsvp: string; note: string | null }>;
  const rsvpMap = new Map(myRsvps.map(r => [r.status_id, r]));

  res.json(friendStatuses.map((s): FriendStatus => ({
    id: s.id,
    owner_id: s.owner_id,
    owner_name: s.display_name,
    owner_avatar_url: s.avatar_url || null,
    note: s.note,
    location: s.location || null,
    closes_at: s.closes_at,
    starts_at: s.starts_at || null,
    ends_at: s.ends_at || null,
    my_going: rsvpMap.has(s.id),
    my_rsvp: rsvpMap.get(s.id)?.rsvp || null,
    my_note: rsvpMap.get(s.id)?.note || null,
  })));
});

// Friend ids of a user, from whichever side of the friendship row they are on.
function friendIdsOf(userId: string): string[] {
  return (db.prepare(`
    SELECT CASE WHEN user_a_id = ? THEN user_b_id ELSE user_a_id END as fid
    FROM friendships WHERE user_a_id = ? OR user_b_id = ?
  `).all(userId, userId, userId) as Array<{ fid: string }>).map(r => r.fid);
}

function setRecipients(statusId: string, recipientIds: string[]) {
  db.prepare('DELETE FROM status_recipients WHERE status_id = ?').run(statusId);
  const insert = db.prepare('INSERT OR IGNORE INTO status_recipients (id, status_id, user_id) VALUES (?, ?, ?)');
  for (const rid of recipientIds) insert.run(randomUUID(), statusId, rid);
}

// Remember who was picked (and who was left out) as the default for next time.
function saveRecipientSelection(userId: string, selected: string[], friendIds: string[], nowUnix: number) {
  const unselected = friendIds.filter(id => !selected.includes(id));
  db.prepare(`
    INSERT INTO recipient_sessions (user_id, selected_ids, unselected_ids, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET selected_ids = excluded.selected_ids, unselected_ids = excluded.unselected_ids, updated_at = excluded.updated_at
  `).run(userId, JSON.stringify(selected), JSON.stringify(unselected), nowUnix);
}

function closeStatus(statusId: string, nowUnix: number) {
  db.prepare('UPDATE statuses SET closed_at = ? WHERE id = ?').run(nowUnix, statusId);
  syncStatusJobs(statusId);
}

type Cleaned = { ok: true; value: string | null | undefined } | { ok: false; error: string };

// Sanitise and moderate a free-text field. `undefined` means "not sent, leave as is";
// text that moderation rejects is dropped (stored as empty) rather than refused.
async function cleanText(raw: unknown, max: number, label: string): Promise<Cleaned> {
  if (raw === undefined) return { ok: true, value: undefined };
  if (!raw) return { ok: true, value: null };
  const text = sanitizeNote(String(raw));
  if (text.length > max) return { ok: false, error: `${label} max ${max} chars` };
  if (!(await isNoteAllowed(text))) return { ok: true, value: null };
  return { ok: true, value: text || null };
}

// POST /api/status — create (spontaneous or scheduled)
router.post('/', requireAuth, validateBody(createStatusBody), async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { recipient_ids = [], starts_at: rawStartsAt, ends_at: rawEndsAt, reminder_minutes: rawReminderMinutes } = req.body;

  const note = await cleanText(req.body.note, 160, 'Note');
  if (!note.ok) return res.status(400).json({ error: note.error });
  const location = await cleanText(req.body.location, 200, 'Location');
  if (!location.ok) return res.status(400).json({ error: location.error });

  const nowUnix = Math.floor(Date.now() / 1000);
  const isScheduled = rawStartsAt && Number(rawStartsAt) > nowUnix;

  const startsAt: number | null = isScheduled ? Number(rawStartsAt) : null;
  const endsAt: number | null = rawEndsAt ? Number(rawEndsAt) : null;
  const reminderMinutes: number | null = isScheduled ? (rawReminderMinutes ?? 30) : null;
  const user = db.prepare('SELECT default_door_minutes, display_name FROM users WHERE id = ?').get(userId) as any;
  const doorMinutes = user?.default_door_minutes ?? 60;
  const closesAt = isScheduled
    ? (endsAt ?? (Number(rawStartsAt) + doorMinutes * 60))
    : nowUnix + doorMinutes * 60;

  const statusId = randomUUID();
  // Spontaneous: friends are told after a 2-minute minimum open window (a job)
  const notifyAt = isScheduled ? null : nowUnix + 2 * 60;
  const friendIds = friendIdsOf(userId);
  const validRecipients = (recipient_ids as string[]).filter(id => friendIds.includes(id));

  db.transaction(() => {
    // Close any existing active status — but only for spontaneous opens (scheduled sessions coexist)
    if (!isScheduled) {
      const existing = getActiveStatus(userId);
      if (existing) closeStatus(existing.id, nowUnix);
    }

    db.prepare(`
      INSERT INTO statuses (id, user_id, note, location, closes_at, starts_at, ends_at, reminder_minutes, notify_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(statusId, userId, note.value || null, location.value || null, closesAt, startsAt, endsAt, reminderMinutes, notifyAt);

    setRecipients(statusId, validRecipients);
    saveRecipientSelection(userId, validRecipients, friendIds, nowUnix);
    syncStatusJobs(statusId);
  })();

  if (isScheduled) {
    // Tell invitees about the upcoming scheduled session right away
    for (const rid of validRecipients) {
      if (isHiddenEitherWay(userId, rid)) continue;
      notifyScheduledSession(rid, user.display_name, startsAt!);
    }
  }

  log('door.open', userId, { recipients: validRecipients.length, has_note: !!note.value });

  const status = formatStatus(db.prepare('SELECT * FROM statuses WHERE id = ?').get(statusId), userId);
  res.status(201).json(status);
});

// POST /api/status/:statusId/activate — open a scheduled session
router.post('/:statusId/activate', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { statusId } = req.params as { statusId: string };
  const nowUnix = Math.floor(Date.now() / 1000);

  const scheduled = db.prepare(`
    SELECT * FROM statuses WHERE id = ? AND user_id = ? AND closed_at IS NULL AND starts_at > ?
  `).get(statusId, userId, nowUnix) as any;
  if (!scheduled) return res.status(404).json({ error: 'No pending scheduled session found' });

  db.transaction(() => {
    // Close any currently active session
    const existing = getActiveStatus(userId);
    if (existing) closeStatus(existing.id, nowUnix);

    // Activate: clear starts_at (keep closes_at = ends_at)
    db.prepare('UPDATE statuses SET starts_at = NULL WHERE id = ?').run(statusId);
    syncStatusJobs(statusId);
  })();

  // Friends hear about it right away — the host chose to open early.
  announceDoorOpen(statusId);

  const status = formatStatus(db.prepare('SELECT * FROM statuses WHERE id = ?').get(statusId), userId);
  res.json(status);
});

// PUT /api/status — update note + recipients (+ ends_at) of the active or next scheduled status
router.put('/', requireAuth, validateBody(updateStatusBody), async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { recipient_ids, ends_at } = req.body;

  // Try active first, then scheduled
  const status = getActiveStatus(userId) || getScheduledStatus(userId);
  if (!status) return res.status(404).json({ error: 'No active status' });

  const note = await cleanText(req.body.note, 160, 'Note');
  if (!note.ok) return res.status(400).json({ error: note.error });
  const location = await cleanText(req.body.location, 200, 'Location');
  if (!location.ok) return res.status(400).json({ error: location.error });

  db.transaction(() => {
    if (note.value !== undefined) {
      db.prepare('UPDATE statuses SET note = ? WHERE id = ?').run(note.value, status.id);
    }
    if (location.value !== undefined) {
      db.prepare('UPDATE statuses SET location = ? WHERE id = ?').run(location.value, status.id);
    }
    if (ends_at !== undefined) {
      const newEndsAt = ends_at ? Number(ends_at) : null;
      db.prepare('UPDATE statuses SET ends_at = ?, closes_at = COALESCE(?, closes_at) WHERE id = ?').run(newEndsAt, newEndsAt, status.id);
    }
    if (recipient_ids !== undefined) {
      const friendIds = friendIdsOf(userId);
      const valid = (recipient_ids as string[]).filter(id => friendIds.includes(id));
      setRecipients(status.id, valid);
      saveRecipientSelection(userId, valid, friendIds, Math.floor(Date.now() / 1000));
    }
    syncStatusJobs(status.id);
  })();

  const updated = formatStatus(db.prepare('SELECT * FROM statuses WHERE id = ?').get(status.id), userId);
  res.json(updated);
});

// PUT /api/status/:statusId — update a specific session by ID
router.put('/:statusId', requireAuth, validateBody(updateStatusByIdBody), async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { statusId } = req.params as { statusId: string };
  const { recipient_ids, starts_at, ends_at } = req.body;

  const status = db.prepare('SELECT * FROM statuses WHERE id = ? AND user_id = ? AND closed_at IS NULL').get(statusId, userId) as any;
  if (!status) return res.status(404).json({ error: 'Session not found' });

  const note = await cleanText(req.body.note, 160, 'Note');
  if (!note.ok) return res.status(400).json({ error: note.error });
  const location = await cleanText(req.body.location, 200, 'Location');
  if (!location.ok) return res.status(400).json({ error: location.error });

  const timesChanged = starts_at !== undefined || ends_at !== undefined;

  db.transaction(() => {
    if (note.value !== undefined) {
      db.prepare('UPDATE statuses SET note = ? WHERE id = ?').run(note.value, statusId);
    }
    if (location.value !== undefined) {
      db.prepare('UPDATE statuses SET location = ? WHERE id = ?').run(location.value, statusId);
    }
    if (starts_at !== undefined) {
      db.prepare('UPDATE statuses SET starts_at = ? WHERE id = ?').run(starts_at ? Number(starts_at) : null, statusId);
    }
    if (ends_at !== undefined) {
      const newEndsAt = ends_at ? Number(ends_at) : null;
      db.prepare('UPDATE statuses SET ends_at = ?, closes_at = COALESCE(?, closes_at) WHERE id = ?').run(newEndsAt, newEndsAt, statusId);
    }
    if (timesChanged) {
      db.prepare('UPDATE statuses SET ics_sequence = ics_sequence + 1 WHERE id = ?').run(statusId);
    }
    if (recipient_ids !== undefined) {
      const friendIds = friendIdsOf(userId);
      setRecipients(statusId, (recipient_ids as string[]).filter(id => friendIds.includes(id)));
    }
    syncStatusJobs(statusId);
  })();

  if (timesChanged) {
    const downloads = db.prepare('SELECT user_id, token FROM status_ics_downloads WHERE status_id = ?').all(statusId) as Array<{ user_id: string | null; token: string | null }>;
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    for (const d of downloads) {
      if (d.user_id && d.token) {
        notifyCalendarUpdate(d.user_id, `${appUrl}/api/invites/${d.token}/calendar.ics`);
      }
    }
  }

  const updated = formatStatus(db.prepare('SELECT * FROM statuses WHERE id = ?').get(statusId), userId);
  res.json(updated);
});

// POST /api/status/duration — update auto-close duration for active session + save as user preference
router.post('/duration', requireAuth, validateBody(setDurationBody), (req: AuthRequest, res) => {
  const userId = req.userId!;
  const minutes = Number(req.body.minutes);
  if (!minutes || minutes <= 0) return res.status(400).json({ error: 'Invalid minutes' });

  const status = getActiveStatus(userId);
  if (!status) return res.status(404).json({ error: 'No active status' });

  const nowUnix = Math.floor(Date.now() / 1000);
  const newClosesAt = Math.max(status.created_at + minutes * 60, nowUnix + 60);

  db.transaction(() => {
    db.prepare('UPDATE statuses SET closes_at = ? WHERE id = ?').run(newClosesAt, status.id);
    db.prepare('UPDATE users SET default_door_minutes = ? WHERE id = ?').run(minutes, userId);
    syncStatusJobs(status.id);
  })();

  res.json({ closes_at: newClosesAt });
});

// DELETE /api/status — close active session
router.delete('/', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const status = getActiveStatus(userId);
  if (!status) return res.status(404).json({ error: 'No active status' });

  const nowUnix = Math.floor(Date.now() / 1000);
  closeStatus(status.id, nowUnix);

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
  const { statusId } = req.params as { statusId: string };
  const nowUnix = Math.floor(Date.now() / 1000);
  const status = db.prepare('SELECT id FROM statuses WHERE id = ? AND user_id = ? AND closed_at IS NULL AND starts_at > ?').get(statusId, userId, nowUnix) as any;
  if (!status) return res.status(404).json({ error: 'Not found' });
  closeStatus(statusId, nowUnix);

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

  closeStatus(status.id, Math.floor(Date.now() / 1000));
  res.json({ ok: true });
});

// POST /api/status/prolong
router.post('/prolong', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const status = getActiveStatus(userId);
  if (!status) return res.status(404).json({ error: 'No active status' });

  const newClosesAt = status.closes_at + 30 * 60;
  db.transaction(() => {
    db.prepare('UPDATE statuses SET closes_at = ? WHERE id = ?').run(newClosesAt, status.id);
    syncStatusJobs(status.id);
  })();

  res.json({ closes_at: newClosesAt });
});

// POST /api/status/quick-open — open with last selection + default duration (for notification actions)
router.post('/quick-open', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const nowUnix = Math.floor(Date.now() / 1000);

  // Already open? Just return it
  const existing = getActiveStatus(userId);
  if (existing) return res.json(formatStatus(existing, userId));

  const user = db.prepare('SELECT default_door_minutes FROM users WHERE id = ?').get(userId) as any;
  const doorMinutes = user?.default_door_minutes ?? 60;
  const closesAt = nowUnix + doorMinutes * 60;

  // Get all friends, then subtract unselected to get recipients
  const friendIds = friendIdsOf(userId);
  const sessionRow = db.prepare('SELECT unselected_ids FROM recipient_sessions WHERE user_id = ?').get(userId) as { unselected_ids: string } | undefined;
  const unselected: string[] = sessionRow ? JSON.parse(sessionRow.unselected_ids) : [];
  const recipientIds = friendIds.filter(id => !unselected.includes(id));

  const statusId = randomUUID();
  const notifyAt = nowUnix + 2 * 60;

  db.transaction(() => {
    db.prepare(`
      INSERT INTO statuses (id, user_id, closes_at, notify_at)
      VALUES (?, ?, ?, ?)
    `).run(statusId, userId, closesAt, notifyAt);
    setRecipients(statusId, recipientIds);
    syncStatusJobs(statusId);
  })();

  log('door.open', userId, { recipients: recipientIds.length, has_note: false, source: 'quick_open' });

  res.status(201).json(formatStatus(db.prepare('SELECT * FROM statuses WHERE id = ?').get(statusId), userId));
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
    `DTEND:${formatIcsDate(new Date((status.ends_at ?? status.closes_at) * 1000))}`,
    `SUMMARY:${summary}`,
    ...(status.location ? [`LOCATION:${status.location}`] : []),
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
