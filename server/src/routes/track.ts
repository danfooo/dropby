import { Router } from 'express';
import { log } from '../services/analytics.js';

const router = Router();

// Allowlist of events the client is permitted to log
const ALLOWED_CLIENT_EVENTS = new Set(['page.auth_viewed']);

// POST /api/track — unauthenticated client-side event tracking
router.post('/', (req, res) => {
  const { event, data } = req.body;

  if (!ALLOWED_CLIENT_EVENTS.has(event)) {
    return res.status(400).json({ error: 'Unknown event' });
  }

  log(event, null, data ?? undefined);
  res.json({ ok: true });
});

export default router;
