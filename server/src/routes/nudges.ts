import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

const VALID_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// GET /api/nudges
router.get('/', requireAuth, (req: AuthRequest, res) => {
  const nudges = db.prepare('SELECT id, day_of_week, hour, created_at FROM nudge_schedules WHERE user_id = ? ORDER BY created_at').all(req.userId);
  res.json(nudges);
});

// POST /api/nudges
router.post('/', requireAuth, (req: AuthRequest, res) => {
  const { day_of_week, hour } = req.body;
  if (!VALID_DAYS.includes(day_of_week)) return res.status(400).json({ error: 'Invalid day_of_week' });
  if (typeof hour !== 'number' || hour < 0 || hour > 23) return res.status(400).json({ error: 'Hour must be 0–23' });

  const id = randomUUID();
  db.prepare('INSERT INTO nudge_schedules (id, user_id, day_of_week, hour) VALUES (?, ?, ?, ?)').run(id, req.userId, day_of_week, hour);
  res.status(201).json({ id, day_of_week, hour });
});

// DELETE /api/nudges/:id
router.delete('/:id', requireAuth, (req: AuthRequest, res) => {
  db.prepare('DELETE FROM nudge_schedules WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

export default router;
