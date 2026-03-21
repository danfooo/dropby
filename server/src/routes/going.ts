import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth.js';
import { notifyGoingSignal } from '../services/notifications.js';
import { sendWelcomeMessage } from '../services/email.js';
import { log } from '../services/analytics.js';

const router = Router();

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
router.post('/claim', requireAuth, (req: AuthRequest, res) => {
  const { signal_id } = req.body;
  const userId = req.userId!;
  if (!signal_id) return res.status(400).json({ error: 'signal_id required' });

  const signal = db.prepare('SELECT * FROM going_signals WHERE id = ? AND user_id IS NULL').get(signal_id) as any;
  if (!signal) return res.status(404).json({ error: 'Not found' });

  const existing = db.prepare('SELECT id FROM going_signals WHERE status_id = ? AND user_id = ?').get(signal.status_id, userId) as any;
  if (existing) {
    db.prepare('DELETE FROM going_signals WHERE id = ?').run(signal_id);
  } else {
    db.prepare('UPDATE going_signals SET user_id = ?, guest_contact_id = NULL WHERE id = ?').run(userId, signal_id);
  }

  res.json({ ok: true });
});

// POST /api/going/:statusId — logged-in RSVP (going or maybe), changeable
router.post('/:statusId', requireAuth, (req: AuthRequest, res) => {
  const { statusId } = req.params;
  const userId = req.userId!;
  const { rsvp = 'going' } = req.body;
  const nowUnix = Math.floor(Date.now() / 1000);

  // Accept active or scheduled statuses
  const status = db.prepare(`
    SELECT * FROM statuses WHERE id = ? AND closed_at IS NULL
      AND (closes_at > ? OR starts_at > ?)
  `).get(statusId, nowUnix, nowUnix) as any;
  if (!status) return res.status(404).json({ error: 'Status not found or expired' });

  const validRsvp = rsvp === 'maybe' ? 'maybe' : 'going';

  // Upsert — allow changing RSVP
  db.prepare(`
    INSERT INTO going_signals (id, status_id, user_id, rsvp) VALUES (?, ?, ?, ?)
    ON CONFLICT(status_id, user_id) DO UPDATE SET rsvp = excluded.rsvp
  `).run(randomUUID(), statusId, userId, validRsvp);

  const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId) as any;
  if (validRsvp === 'going') notifyGoingSignal(status.user_id, user.display_name);
  log('going.sent', userId, { rsvp: validRsvp, is_guest: false });

  res.status(201).json({ ok: true });
});

// DELETE /api/going/:statusId — remove RSVP
router.delete('/:statusId', requireAuth, (req: AuthRequest, res) => {
  const { statusId } = req.params;
  db.prepare('DELETE FROM going_signals WHERE status_id = ? AND user_id = ?').run(statusId, req.userId);
  res.json({ ok: true });
});

// POST /api/going/:statusId/guest — web guest RSVP
router.post('/:statusId/guest', optionalAuth, (req: AuthRequest, res) => {
  const { statusId } = req.params;
  const { name, contact, marketing_consent, rsvp = 'going' } = req.body;
  const nowUnix = Math.floor(Date.now() / 1000);

  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });

  // Accept active or scheduled statuses
  const status = db.prepare(`
    SELECT * FROM statuses WHERE id = ? AND closed_at IS NULL
      AND (closes_at > ? OR starts_at > ?)
  `).get(statusId, nowUnix, nowUnix) as any;
  if (!status) return res.status(404).json({ error: 'Status not found or expired' });

  const guestContactId = randomUUID();
  db.prepare(`
    INSERT INTO guest_contacts (id, name, contact, marketing_consent, status_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(guestContactId, name.trim(), contact?.trim() || null, marketing_consent ? 1 : 0, statusId);

  if (contact?.trim() && marketing_consent) {
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    sendWelcomeMessage(contact.trim(), `${appUrl}/download`);
  }

  const validRsvp = rsvp === 'maybe' ? 'maybe' : 'going';

  const signalId = randomUUID();
  db.prepare('INSERT INTO going_signals (id, status_id, user_id, guest_contact_id, rsvp) VALUES (?, ?, NULL, ?, ?)').run(
    signalId, statusId, guestContactId, validRsvp
  );

  if (validRsvp === 'going') notifyGoingSignal(status.user_id, name.trim());
  log('going.sent', null, { rsvp: validRsvp, is_guest: true });

  res.status(201).json({ ok: true, signal_id: signalId, status_id: statusId });
});

// PATCH /api/going/guest/:signalId — update guest RSVP
router.patch('/guest/:signalId', (req, res) => {
  const { signalId } = req.params;
  const { rsvp } = req.body;
  const validRsvp = rsvp === 'maybe' ? 'maybe' : 'going';

  const result = db.prepare('UPDATE going_signals SET rsvp = ? WHERE id = ? AND user_id IS NULL').run(validRsvp, signalId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });

  res.json({ ok: true });
});

export default router;
