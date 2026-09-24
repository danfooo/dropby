import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { registerSSE, unregisterSSE, issueTicket, redeemTicket } from '../services/sse.js';
import { log } from '../services/analytics.js';

const router = Router();

// POST /api/events/ticket — a single-use ticket for opening the event stream
router.post('/ticket', requireAuth, (req: AuthRequest, res) => {
  res.json({ ticket: issueTicket(req.userId!) });
});

// GET /api/events?ticket=xxx
router.get('/', (req, res) => {
  const ticket = req.query.ticket;
  const userId = typeof ticket === 'string' ? redeemTicket(ticket) : null;
  if (!userId || !db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) {
    return res.status(401).json({ error: 'Invalid ticket' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write('event: connected\ndata: {}\n\n');
  registerSSE(userId, res);

  // Dedup: only log once per hour per user to avoid SSE-reconnect inflation
  const hourAgo = Math.floor(Date.now() / 1000) - 3600;
  const recentSession = db.prepare(
    'SELECT id FROM event_log WHERE event = ? AND user_id = ? AND ts >= ? LIMIT 1'
  ).get('session.start', userId, hourAgo);
  if (!recentSession) log('session.start', userId);

  const keepAlive = setInterval(() => {
    try {
      res.write(':keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    unregisterSSE(userId, res);
  });
});

export default router;
