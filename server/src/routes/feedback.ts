import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { sendFeedbackNotification } from '../services/email.js';

const router = Router();

const VALID_TYPES = ['thought', 'bug'];

// POST /api/feedback
router.post('/', requireAuth, (req: AuthRequest, res) => {
  const { type, message, reply_email } = req.body;

  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });
  if (message.trim().length > 1000) return res.status(400).json({ error: 'Message too long (max 1000 chars)' });
  if (reply_email !== undefined && reply_email !== null) {
    if (typeof reply_email !== 'string' || !reply_email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email' });
    }
  }

  const id = randomUUID();
  db.prepare(
    'INSERT INTO feedback (id, user_id, type, message, reply_email) VALUES (?, ?, ?, ?, ?)'
  ).run(id, req.userId, type, message.trim(), reply_email?.trim() || null);

  const adminEmail = process.env.ADMIN_EMAIL || 'daniel.herzog@gmail.com';
  const sender = db.prepare('SELECT display_name, email FROM users WHERE id = ?').get(req.userId) as { display_name: string; email: string } | undefined;
  if (sender) {
    sendFeedbackNotification({
      to: adminEmail,
      type,
      message: message.trim(),
      fromName: sender.display_name,
      fromEmail: sender.email,
      replyEmail: reply_email?.trim() || null,
    }).catch(err => console.error('[feedback] email failed', err));
  }

  res.status(201).json({ id });
});

export default router;
