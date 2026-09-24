import { Request, Response, NextFunction } from 'express';

// In-memory, fixed-window rate limits. One process serves everything, so memory is
// enough; a restart resets the windows, which is acceptable for this purpose.

// The caller's IP. Traffic to dropby.cc comes through Cloudflare, which passes the
// visitor as CF-Connecting-IP; traffic straight to fly.dev carries Fly-Client-IP.
// Either can be forged by someone calling fly.dev directly, which is why the
// sign-in limits also key on the email address being tried.
export function clientIp(req: Request): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf;
  const fly = req.headers['fly-client-ip'];
  if (typeof fly === 'string' && fly) return fly;
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private max: number, private windowMs: number) {}

  // Counts a hit for `key`; false once the key has used up its window.
  take(key: string, now = Date.now()): boolean {
    if (this.hits.size > 10_000) this.sweep(now);
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= this.max;
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}

interface LimitSpec {
  max: number;
  windowMs: number;
  // What to count against. Return null to skip this limit for the request.
  key: (req: Request) => string | null;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Middleware enforcing every given limit. The end-to-end tests create dozens of
// accounts from one address in a few minutes, so limits are off under NODE_ENV=test.
export function rateLimit(...specs: LimitSpec[]) {
  const limiters = specs.map(s => ({ spec: s, limiter: new RateLimiter(s.max, s.windowMs) }));
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'test') return next();
    for (const { spec, limiter } of limiters) {
      const key = spec.key(req);
      if (key !== null && !limiter.take(key)) {
        return res.status(429).json({ error: 'RATE_LIMITED' });
      }
    }
    next();
  };
}

const byIp = (req: Request) => clientIp(req);
const byEmail = (req: Request) =>
  typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : null;
const byUser = (req: Request & { userId?: string }) => req.userId ?? null;

export const limits = {
  // Password guessing: per address, and per account so rotating addresses doesn't help.
  login: rateLimit(
    { max: 30, windowMs: 15 * MINUTE, key: byIp },
    { max: 10, windowMs: 15 * MINUTE, key: byEmail },
  ),
  signup: rateLimit({ max: 10, windowMs: HOUR, key: byIp }),
  // These send email to the address given, so they are also capped per address.
  emailSending: rateLimit(
    { max: 10, windowMs: HOUR, key: byIp },
    { max: 3, windowMs: HOUR, key: byEmail },
  ),
  // Token checks (verify, reset, Google, Apple): enough for real use, not for guessing.
  tokenCheck: rateLimit({ max: 30, windowMs: 15 * MINUTE, key: byIp }),
  // Signed-in actions that send email on the user's behalf.
  perUserEmail: rateLimit({ max: 20, windowMs: 24 * HOUR, key: byUser }),
  feedback: rateLimit({ max: 10, windowMs: HOUR, key: byUser }),
};
