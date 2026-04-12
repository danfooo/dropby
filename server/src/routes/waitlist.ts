import { Router, Request } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { log } from '../services/analytics.js';

const router = Router();

// In-memory IP rate limit. Acceptable for this volume — restarts reset the window.
const ipBuckets = new Map<string, number[]>();
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const MAX_PER_HOUR = 5;
const MAX_PER_DAY = 20;

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0]!.trim();
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const arr = (ipBuckets.get(ip) ?? []).filter(t => now - t < DAY);
  if (arr.filter(t => now - t < HOUR).length >= MAX_PER_HOUR) return false;
  if (arr.length >= MAX_PER_DAY) return false;
  arr.push(now);
  ipBuckets.set(ip, arr);
  return true;
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  // If not configured (local dev), skip verification
  if (!secret) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: ip });
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    const data = (await r.json()) as { success?: boolean };
    return !!data.success;
  } catch (err) {
    console.error('[waitlist] Turnstile verification failed:', err);
    return false;
  }
}

// POST /api/waitlist — join the waitlist
router.post('/', async (req, res) => {
  const { email, locale, turnstile_token, website } = req.body ?? {};

  // Honeypot: bots fill this hidden field
  if (typeof website === 'string' && website.trim().length > 0) {
    // Pretend success so bots don't probe
    return res.json({ ok: true });
  }

  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'INVALID_EMAIL' });
  }

  const ip = clientIp(req);
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'RATE_LIMITED' });
  }

  const ok = await verifyTurnstile(typeof turnstile_token === 'string' ? turnstile_token : '', ip);
  if (!ok) return res.status(400).json({ error: 'CAPTCHA_FAILED' });

  const emailLower = email.toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM waitlist WHERE email = ?').get(emailLower);
  if (existing) {
    // Idempotent: silently report success
    return res.json({ ok: true });
  }

  const localeStr = typeof locale === 'string' ? locale.slice(0, 16) : null;
  const ua = (req.headers['user-agent'] || '').toString().slice(0, 255);

  db.prepare(
    'INSERT INTO waitlist (id, email, locale, ip, user_agent) VALUES (?, ?, ?, ?, ?)'
  ).run(randomUUID(), emailLower, localeStr, ip.slice(0, 64), ua);

  log('waitlist.joined', null, { locale: localeStr });
  res.json({ ok: true });
});

export default router;
