import { Router } from 'express';
import { log } from '../services/analytics.js';
import { optionalAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Allowlist of events the client is permitted to log
const ALLOWED_CLIENT_EVENTS = new Set(['page.auth_viewed', 'chip.selected']);

// POST /api/track — client-side event tracking (auth optional)
router.post('/', optionalAuth, (req: AuthRequest, res) => {
  const { event, data } = req.body;

  if (!ALLOWED_CLIENT_EVENTS.has(event)) {
    return res.status(400).json({ error: 'Unknown event' });
  }

  log(event, req.userId ?? null, data ?? undefined);
  res.json({ ok: true });
});

export default router;
