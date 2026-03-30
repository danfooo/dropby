import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/notes
router.get('/', requireAuth, (req: AuthRequest, res) => {
  const notes = db.prepare(`
    SELECT id, text, hidden, created_at FROM user_notes
    WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.userId) as Array<{ id: string; text: string; hidden: number; created_at: number }>;
  res.json(notes.map(n => ({ ...n, hidden: Boolean(n.hidden) })));
});

// POST /api/notes — auto-called when user uses a custom note
router.post('/', requireAuth, (req: AuthRequest, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Text required' });
  if (text.length > 160) return res.status(400).json({ error: 'Max 160 chars' });

  // Check if already saved
  const existing = db.prepare('SELECT id FROM user_notes WHERE user_id = ? AND text = ?').get(req.userId, text.trim());
  if (existing) return res.json(existing);

  const id = randomUUID();
  db.prepare('INSERT INTO user_notes (id, user_id, text) VALUES (?, ?, ?)').run(id, req.userId, text.trim());

  // Keep only the 2 most recent notes; delete any older ones
  db.prepare(`
    DELETE FROM user_notes WHERE user_id = ? AND id NOT IN (
      SELECT id FROM user_notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 2
    )
  `).run(req.userId, req.userId);

  res.status(201).json({ id, text: text.trim(), hidden: false });
});

// PUT /api/notes/:id — hide/unhide
router.put('/:id', requireAuth, (req: AuthRequest, res) => {
  const { hidden } = req.body;
  db.prepare('UPDATE user_notes SET hidden = ? WHERE id = ? AND user_id = ?').run(hidden ? 1 : 0, req.params.id, req.userId);
  res.json({ ok: true });
});

// DELETE /api/notes/:id
router.delete('/:id', requireAuth, (req: AuthRequest, res) => {
  db.prepare('DELETE FROM user_notes WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

export default router;
