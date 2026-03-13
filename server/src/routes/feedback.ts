import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

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

  res.status(201).json({ id });
});

export default router;
