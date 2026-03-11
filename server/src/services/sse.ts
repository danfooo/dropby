import { Response } from 'express';

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
