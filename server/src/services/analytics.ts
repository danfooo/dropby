import { db } from '../db/index.js';

export function log(event: string, userId: string | null, data?: Record<string, unknown>) {
  try {
    db.prepare('INSERT INTO event_log (event, user_id, data) VALUES (?, ?, ?)').run(
      event,
      userId ?? null,
      data ? JSON.stringify(data) : null,
    );
  } catch (err) {
    // Never let analytics break the app
    console.error('[analytics]', event, err);
  }
}
