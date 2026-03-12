import { Request, Response, NextFunction } from 'express';
import { jwtVerify } from 'jose';
import { db } from '../db/index.js';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-change-in-production'
);

export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string;
    display_name: string;
    timezone: string | null;
    auto_nudge_enabled: number;
    avatar_seed: number;
    email_verified: number;
  };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.sub as string;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as AuthRequest['user'];
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.userId = userId;
    req.user = user;

    // Auto-update timezone if provided and different
    const clientTimezone = req.headers['x-timezone'] as string;
    if (clientTimezone && clientTimezone !== user.timezone) {
      db.prepare('UPDATE users SET timezone = ? WHERE id = ?').run(clientTimezone, userId);
    }

    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export async function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();

  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.sub as string;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as AuthRequest['user'];
    if (user) {
      req.userId = userId;
      req.user = user;
    }
  } catch {
    // ignore
  }
  next();
}

export async function signJwt(userId: string): Promise<string> {
  const { SignJWT } = await import('jose');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(JWT_SECRET);
}
