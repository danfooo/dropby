import { Response } from 'express';
import { randomBytes } from 'crypto';

// In-memory SSE connections: userId → list of responses
const connections = new Map<string, Response[]>();

export function registerSSE(userId: string, res: Response) {
  const existing = connections.get(userId) || [];
  connections.set(userId, [...existing, res]);
}

export function unregisterSSE(userId: string, res: Response) {
  const existing = connections.get(userId) || [];
  const updated = existing.filter(r => r !== res);
  if (updated.length === 0) {
    connections.delete(userId);
  } else {
    connections.set(userId, updated);
  }
}

export function connectionCount(userId: string): number {
  return connections.get(userId)?.length ?? 0;
}

export function sendSSE(userId: string, event: string, data: unknown) {
  const resps = connections.get(userId);
  if (!resps?.length) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const r of resps) {
    try {
      r.write(payload);
    } catch {
      // connection gone
    }
  }
}

export function broadcastSSE(userIds: string[], event: string, data: unknown) {
  for (const uid of userIds) {
    sendSSE(uid, event, data);
  }
}

// ── Connection tickets ────────────────────────────────────────
// EventSource can't send an Authorization header, so the session token would have to
// go in the URL, where it ends up in logs. Instead the client trades its token for a
// ticket (POST /api/events/ticket) and connects with that: single-use, valid for a
// minute, and worthless once the stream is open.

const TICKET_TTL_MS = 60_000;
const tickets = new Map<string, { userId: string; expires: number }>();

export function issueTicket(userId: string): string {
  const now = Date.now();
  for (const [t, v] of tickets) if (v.expires <= now) tickets.delete(t);
  const ticket = randomBytes(24).toString('base64url');
  tickets.set(ticket, { userId, expires: now + TICKET_TTL_MS });
  return ticket;
}

export function redeemTicket(ticket: string): string | null {
  const entry = tickets.get(ticket);
  if (!entry) return null;
  tickets.delete(ticket);
  return entry.expires > Date.now() ? entry.userId : null;
}
