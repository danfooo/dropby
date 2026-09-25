import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth.js';
import { notifyGoingSignal } from '../services/notifications.js';
import { sendWelcomeMessage } from '../services/email.js';
import { log } from '../services/analytics.js';
import { syncGoingJobs, cancelGoingJobs } from '../services/jobs.js';
import { syncLiveActivity } from '../services/live-activity.js';
import { sendSSE } from '../services/sse.js';
import { validateBody } from '../middleware/validate.js';
import { claimGuestBody, goingBody, guestGoingBody } from '@dropby/shared';

const router = Router();

// Refresh the host's view of who is coming, in the app and on their Live Activity.
function tellHost(hostId: string, statusId: string) {
  sendSSE(hostId, 'going:received', { status_id: statusId });
  syncLiveActivity(statusId);
}

// GET /api/going/ever-received — has this user ever had a going signal on any of their statuses?
router.get('/ever-received', requireAuth, (req: AuthRequest, res) => {
  const row = db.prepare(`
    SELECT COUNT(*) as n FROM going_signals gs
    JOIN statuses s ON s.id = gs.status_id
    WHERE s.user_id = ?
  `).get(req.userId) as { n: number };
  res.json({ received: row.n > 0 });
});

// POST /api/going/claim — claim a guest signal after login
router.post('/claim', requireAuth, validateBody(claimGuestBody), (req: AuthRequest, res) => {
  const { signal_id } = req.body;
  const userId = req.userId!;
  if (!signal_id) return res.status(400).json({ error: 'signal_id required' });

  const signal = db.prepare('SELECT * FROM going_signals WHERE id = ? AND user_id IS NULL').get(signal_id) as any;
  if (!signal) return res.status(404).json({ error: 'Not found' });

  const existing = db.prepare('SELECT id FROM going_signals WHERE status_id = ? AND user_id = ?').get(signal.status_id, userId) as any;
  if (existing) {
    db.prepare('DELETE FROM going_signals WHERE id = ?').run(signal_id);
  } else {
    db.transaction(() => {
      db.prepare('UPDATE going_signals SET user_id = ?, guest_contact_id = NULL WHERE id = ?').run(userId, signal_id);
      // Now a signed-in RSVP, so it gets reminders.
      syncGoingJobs(signal_id);
    })();
  }

  res.json({ ok: true });
});

// POST /api/going/:statusId — logged-in RSVP (going only), changeable; accepts optional note
router.post('/:statusId', requireAuth, validateBody(goingBody), (req: AuthRequest, res) => {
  const { statusId } = req.params as { statusId: string };
  const userId = req.userId!;
  const { note } = req.body;
  const nowUnix = Math.floor(Date.now() / 1000);

  // Accept active or scheduled statuses
  const status = db.prepare(`
    SELECT * FROM statuses WHERE id = ? AND closed_at IS NULL
      AND (closes_at > ? OR starts_at > ?)
  `).get(statusId, nowUnix, nowUnix) as any;
  if (!status) return res.status(404).json({ error: 'Status not found or expired' });

  const trimmedNote = note?.trim() || null;

  db.transaction(() => {
    // Upsert — allow updating RSVP and note
    db.prepare(`
      INSERT INTO going_signals (id, status_id, user_id, rsvp, note) VALUES (?, ?, ?, 'going', ?)
      ON CONFLICT(status_id, user_id) DO UPDATE SET rsvp = 'going', note = excluded.note
    `).run(randomUUID(), statusId, userId, trimmedNote);
    const signal = db.prepare('SELECT id FROM going_signals WHERE status_id = ? AND user_id = ?').get(statusId, userId) as { id: string };
    syncGoingJobs(signal.id);

    // Visiting resets the daily cap so the next door open always notifies
    db.prepare(`
      INSERT INTO friend_notif_prefs (user_id, friend_user_id, pref, last_notified_at)
      VALUES (?, ?, 'default', 0)
      ON CONFLICT(user_id, friend_user_id) DO UPDATE SET last_notified_at = 0
    `).run(userId, status.user_id);
  })();

  const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId) as any;
  notifyGoingSignal(status.user_id, user.display_name, trimmedNote, status.starts_at);
  tellHost(status.user_id, statusId);

  log('going.sent', userId, { rsvp: 'going', is_guest: false });

  res.status(201).json({ ok: true });
});

// PATCH /api/going/:statusId — update note only (logged-in)
router.patch('/:statusId', requireAuth, validateBody(goingBody), (req: AuthRequest, res) => {
  const { statusId } = req.params as { statusId: string };
  const userId = req.userId!;
  const { note } = req.body;

  const trimmedNote = note?.trim() || null;

  const signal = db.prepare('SELECT id FROM going_signals WHERE status_id = ? AND user_id = ?').get(statusId, userId) as any;
  if (!signal) return res.status(404).json({ error: 'Not found' });

  db.prepare('UPDATE going_signals SET note = ? WHERE id = ?').run(trimmedNote, signal.id);

  // Notify host of note update
  const status = db.prepare('SELECT user_id, starts_at FROM statuses WHERE id = ?').get(statusId) as any;
  if (status) {
    const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId) as any;
    notifyGoingSignal(status.user_id, user.display_name, trimmedNote, status.starts_at);
    tellHost(status.user_id, statusId);
  }

  res.json({ ok: true });
});

// DELETE /api/going/:statusId — remove RSVP
router.delete('/:statusId', requireAuth, (req: AuthRequest, res) => {
  const { statusId } = req.params as { statusId: string };
  db.transaction(() => {
    const signal = db.prepare('SELECT id FROM going_signals WHERE status_id = ? AND user_id = ?').get(statusId, req.userId) as { id: string } | undefined;
    if (!signal) return;
    cancelGoingJobs(signal.id);
    db.prepare('DELETE FROM going_signals WHERE id = ?').run(signal.id);
  })();
  const host = db.prepare('SELECT user_id FROM statuses WHERE id = ?').get(statusId) as { user_id: string } | undefined;
  if (host) tellHost(host.user_id, statusId);
  res.json({ ok: true });
});

// POST /api/going/:statusId/guest — web guest RSVP
router.post('/:statusId/guest', optionalAuth, validateBody(guestGoingBody), (req: AuthRequest, res) => {
  const { statusId } = req.params as { statusId: string };
  const { name, contact, marketing_consent, note } = req.body;
  const nowUnix = Math.floor(Date.now() / 1000);

  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });

  // Accept active or scheduled statuses
  const status = db.prepare(`
    SELECT * FROM statuses WHERE id = ? AND closed_at IS NULL
      AND (closes_at > ? OR starts_at > ?)
  `).get(statusId, nowUnix, nowUnix) as any;
  if (!status) return res.status(404).json({ error: 'Status not found or expired' });

  const guestContactId = randomUUID();
  const trimmedNote = note?.trim() || null;
  const signalId = randomUUID();
  db.transaction(() => {
    db.prepare(`
      INSERT INTO guest_contacts (id, name, contact, marketing_consent, status_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(guestContactId, name.trim(), contact?.trim() || null, marketing_consent ? 1 : 0, statusId);
    db.prepare('INSERT INTO going_signals (id, status_id, user_id, guest_contact_id, rsvp, note) VALUES (?, ?, NULL, ?, \'going\', ?)').run(
      signalId, statusId, guestContactId, trimmedNote
    );
  })();

  if (contact?.trim() && marketing_consent) {
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    sendWelcomeMessage(contact.trim(), `${appUrl}/download`);
  }

  notifyGoingSignal(status.user_id, name.trim(), trimmedNote, status.starts_at);
  tellHost(status.user_id, statusId);
  log('going.sent', null, { rsvp: 'going', is_guest: true });

  res.status(201).json({ ok: true, signal_id: signalId, status_id: statusId });
});

// PATCH /api/going/guest/:signalId — update guest note
router.patch('/guest/:signalId', validateBody(goingBody), (req, res) => {
  const { signalId } = req.params;
  const { note } = req.body;
  const trimmedNote = note?.trim() || null;

  const signal = db.prepare(`
    SELECT gs.id, gs.status_id, s.user_id as host_id, s.starts_at, gc.name as guest_name
    FROM going_signals gs
    JOIN statuses s ON s.id = gs.status_id
    LEFT JOIN guest_contacts gc ON gc.id = gs.guest_contact_id
    WHERE gs.id = ? AND gs.user_id IS NULL
  `).get(signalId) as any;

  if (!signal) return res.status(404).json({ error: 'Not found' });

  db.prepare('UPDATE going_signals SET note = ? WHERE id = ?').run(trimmedNote, signalId);

  // Notify host of note update
  notifyGoingSignal(signal.host_id, signal.guest_name || 'Guest', trimmedNote, signal.starts_at);
  tellHost(signal.host_id, signal.status_id);

  res.json({ ok: true });
});

export default router;
