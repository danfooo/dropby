import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth.js';
import { notifyGoingSignal } from '../services/notifications.js';
import { sendWelcomeMessage } from '../services/email.js';

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

// POST /api/going/:statusId — logged-in going signal
router.post('/:statusId', requireAuth, (req: AuthRequest, res) => {
  const { statusId } = req.params;
  const userId = req.userId!;
  const nowUnix = Math.floor(Date.now() / 1000);

  const status = db.prepare('SELECT * FROM statuses WHERE id = ? AND closed_at IS NULL AND closes_at > ?').get(statusId, nowUnix) as any;
  if (!status) return res.status(404).json({ error: 'Status not found or expired' });

  // Idempotent
  const existing = db.prepare('SELECT id FROM going_signals WHERE status_id = ? AND user_id = ?').get(statusId, userId);
  if (existing) return res.json({ ok: true, already: true });

  db.prepare('INSERT INTO going_signals (id, status_id, user_id) VALUES (?, ?, ?)').run(randomUUID(), statusId, userId);

  const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId) as any;
  notifyGoingSignal(status.user_id, user.display_name);

  res.status(201).json({ ok: true });
});

// POST /api/going/:statusId/guest — web guest going signal
router.post('/:statusId/guest', optionalAuth, (req: AuthRequest, res) => {
  const { statusId } = req.params;
  const { name, contact, marketing_consent } = req.body;
  const nowUnix = Math.floor(Date.now() / 1000);

  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });

  const status = db.prepare('SELECT * FROM statuses WHERE id = ? AND closed_at IS NULL AND closes_at > ?').get(statusId, nowUnix) as any;
  if (!status) return res.status(404).json({ error: 'Status not found or expired' });

  let guestContactId: string | null = null;

  if (contact) {
    guestContactId = randomUUID();
    db.prepare(`
      INSERT INTO guest_contacts (id, name, contact, marketing_consent, status_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(guestContactId, name.trim(), contact.trim(), marketing_consent ? 1 : 0, statusId);

    if (marketing_consent) {
      const appUrl = process.env.APP_URL || 'http://localhost:5173';
      sendWelcomeMessage(contact.trim(), `${appUrl}/download`);
    }
  }

  db.prepare('INSERT INTO going_signals (id, status_id, user_id, guest_contact_id) VALUES (?, ?, NULL, ?)').run(
    randomUUID(), statusId, guestContactId
  );

  notifyGoingSignal(status.user_id, name.trim());
  res.status(201).json({ ok: true });
});

export default router;
