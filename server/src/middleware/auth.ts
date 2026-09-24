import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { createSession, verifySession, looksLikeJwt, verifyLegacyJwt } from '../services/sessions.js';

export interface AuthRequest extends Request {
  userId?: string;
  sessionToken?: string;
  user?: {
    id: string;
    email: string;
    display_name: string;
    timezone: string | null;
    auto_nudge_enabled: number;
    avatar_seed: number;
    email_verified: number;
    avatar_url: string | null;
  };
}

// Header that carries a replacement token back to the client. Exposed via CORS in index.ts.
export const SESSION_TOKEN_HEADER = 'X-Session-Token';

// An app sends several requests at once on startup, all with the same old JWT. Swap
// each JWT for one session, not one per request. Cleared as it grows; a miss only
// costs an extra session row.
const swapped = new Map<string, string>();

function sessionForLegacyJwt(jwt: string, userId: string, userAgent?: string): string {
  const existing = swapped.get(jwt);
  if (existing && verifySession(existing) === userId) return existing;
  if (swapped.size > 5000) swapped.clear();
  const token = createSession(userId, userAgent);
  swapped.set(jwt, token);
  return token;
}

// Resolve the bearer token to a user. A legacy JWT is accepted and swapped for a
// session: the new token goes back in a response header and the client stores it.
async function authenticate(req: AuthRequest, res: Response): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);

  let userId: string | null;
  let sessionToken = token;
  if (looksLikeJwt(token)) {
    userId = await verifyLegacyJwt(token);
    if (userId && db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) {
      sessionToken = sessionForLegacyJwt(token, userId, req.headers['user-agent']);
      res.setHeader(SESSION_TOKEN_HEADER, sessionToken);
    }
  } else {
    userId = verifySession(token);
  }
  if (!userId) return false;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as AuthRequest['user'];
  if (!user) return false;
  req.userId = userId;
  req.user = user;
  req.sessionToken = sessionToken;

  // Auto-update timezone if provided and different
  const clientTimezone = req.headers['x-timezone'] as string;
  if (clientTimezone && clientTimezone !== user.timezone) {
    db.prepare('UPDATE users SET timezone = ? WHERE id = ?').run(clientTimezone, userId);
  }
  return true;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.headers.authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!(await authenticate(req, res))) return res.status(401).json({ error: 'Invalid token' });
  next();
}

export async function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  await authenticate(req, res);
  next();
}
