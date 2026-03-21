import { Router } from 'express';
import { jwtVerify } from 'jose';
import { db } from '../db/index.js';
import { registerSSE, unregisterSSE } from '../services/sse.js';
import { log } from '../services/analytics.js';

const router = Router();

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-change-in-production'
);

// GET /api/events?token=xxx
router.get('/', async (req, res) => {
  const token = req.query.token as string;
  if (!token) return res.status(401).json({ error: 'Token required' });

  let userId: string;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    userId = payload.sub as string;
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) throw new Error('User not found');
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write('event: connected\ndata: {}\n\n');
  registerSSE(userId, res);
  log('session.start', userId);

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
