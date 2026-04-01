import cron from 'node-cron';
import { db } from './db/index.js';
import { notifyDoorClosingSoon, notifyDoorClosed, notifyNudge, notifyAutoNudge, notifyScheduledReminder, notifyFriendDoorOpen, notifyGoingReminder, notifyReengagement } from './services/notifications.js';
import { broadcastSSE } from './services/sse.js';
import { randomUUID } from 'crypto';
import { log } from './services/analytics.js';

const DAY_NAMES: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

const JS_DAY_TO_SHORT: Record<number, string> = {
  0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
};

// Every minute: check for statuses closing in 10 minutes
cron.schedule('* * * * *', () => {
  const now = Math.floor(Date.now() / 1000);
  const tenMinFromNow = now + 600;
  const twelveMinFromNow = now + 720;

  const closingSoon = db.prepare(`
    SELECT id, user_id FROM statuses
    WHERE closed_at IS NULL
      AND closes_at > ?
      AND closes_at <= ?
      AND closing_notification_sent = 0
  `).all(tenMinFromNow, twelveMinFromNow) as Array<{ id: string; user_id: string }>;

  for (const s of closingSoon) {
    notifyDoorClosingSoon(s.user_id, s.id);
    db.prepare('UPDATE statuses SET closing_notification_sent = 1 WHERE id = ?').run(s.id);
  }
});

// Every minute: fire scheduled session reminders to host
cron.schedule('* * * * *', () => {
  const now = Math.floor(Date.now() / 1000);

  const toRemind = db.prepare(`
    SELECT id, user_id, starts_at, reminder_minutes FROM statuses
    WHERE closed_at IS NULL
      AND starts_at IS NOT NULL AND starts_at > ?
      AND reminder_minutes IS NOT NULL
      AND reminder_sent = 0
      AND (starts_at - reminder_minutes * 60) <= ?
  `).all(now, now) as Array<{ id: string; user_id: string; starts_at: number; reminder_minutes: number }>;

  for (const s of toRemind) {
    notifyScheduledReminder(s.user_id, s.starts_at);
    db.prepare('UPDATE statuses SET reminder_sent = 1 WHERE id = ?').run(s.id);
  }
});

// Every minute: fire scheduled nudges
// Runs every minute (no hour-boundary guard) so a restart mid-hour still catches
// any schedule whose hour has already passed today. The alreadySentToday check below
// prevents double-sending.
cron.schedule('* * * * *', () => {
  const now = new Date();

  const users = db.prepare('SELECT id, timezone, auto_nudge_enabled FROM users').all() as Array<{
    id: string; timezone: string | null; auto_nudge_enabled: number;
  }>;

  for (const user of users) {
    const tz = user.timezone || 'UTC';
    let localHour: number;
    let localDayShort: string;

    try {
      const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', weekday: 'short', hour12: false });
      const parts = fmt.formatToParts(now);
      localHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
      const weekday = parts.find(p => p.type === 'weekday')?.value?.toLowerCase().slice(0, 3) || 'mon';
      localDayShort = weekday;
    } catch {
      localHour = now.getHours();
      localDayShort = JS_DAY_TO_SHORT[now.getDay()];
    }

    const schedules = db.prepare(`
      SELECT id, day_of_week, hour, last_sent_at FROM nudge_schedules
      WHERE user_id = ? AND day_of_week = ? AND hour <= ?
    `).all(user.id, localDayShort, localHour) as Array<{
      id: string; day_of_week: string; hour: number; last_sent_at: number | null;
    }>;

    if (!schedules.length) continue;

    // Check if door is already open
    const nowUnix = Math.floor(Date.now() / 1000);
    const activeStatus = db.prepare(`
      SELECT id FROM statuses WHERE user_id = ? AND closed_at IS NULL AND closes_at > ?
    `).get(user.id, nowUnix);

    if (activeStatus) continue;

    // Check if nudge was already sent today (any nudge)
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const alreadySentToday = db.prepare(`
      SELECT id FROM nudge_schedules
      WHERE user_id = ? AND last_sent_at >= ?
    `).get(user.id, Math.floor(startOfDay.getTime() / 1000));

    if (alreadySentToday) continue;

    for (const schedule of schedules) {
      notifyNudge(user.id, DAY_NAMES[schedule.day_of_week] || schedule.day_of_week);
      db.prepare('UPDATE nudge_schedules SET last_sent_at = ? WHERE id = ?').run(nowUnix, schedule.id);
      log('nudge.sent', user.id, { type: 'scheduled' });
    }
  }
});

// Every minute: auto-nudge check (fires on the hour)
// Note: not restart-resilient — auto-nudges are heuristic/optional so missing
// one on a rare server restart is acceptable. Scheduled nudges (above) are resilient.
cron.schedule('* * * * *', () => {
  const now = new Date();
  if (now.getMinutes() !== 0) return;

  const nowUnix = Math.floor(now.getTime() / 1000);

  const users = db.prepare('SELECT id, timezone, auto_nudge_enabled FROM users WHERE auto_nudge_enabled = 1').all() as Array<{
    id: string; timezone: string | null; auto_nudge_enabled: number;
  }>;

  for (const user of users) {
    const tz = user.timezone || 'UTC';

    // Get current local hour and date string for this user
    let localHour: number;
    let localDateStr: string;
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour: 'numeric', year: 'numeric', month: '2-digit', day: '2-digit', hour12: false,
      });
      const parts = fmt.formatToParts(now);
      localHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
      localDateStr = `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
    } catch {
      localHour = now.getHours();
      localDateStr = now.toISOString().slice(0, 10);
    }

    // Door already open?
    const active = db.prepare('SELECT id FROM statuses WHERE user_id = ? AND closed_at IS NULL AND closes_at > ?').get(user.id, nowUnix);
    if (active) continue;

    // Scheduled nudge already fired today?
    const startOfDayUnix = Math.floor(new Date(now).setHours(0, 0, 0, 0) / 1000);
    const scheduledNudgeToday = db.prepare('SELECT id FROM nudge_schedules WHERE user_id = ? AND last_sent_at >= ?').get(user.id, startOfDayUnix);
    if (scheduledNudgeToday) continue;

    // Auto-nudge already sent in last 20 hours?
    const alreadySent = db.prepare('SELECT id FROM auto_nudge_log WHERE user_id = ? AND sent_at >= ?').get(user.id, nowUnix - 20 * 3600);
    if (alreadySent) continue;

    // Find a previous open at this local hour (within last 7 days, not today)
    const recentStatuses = db.prepare(
      'SELECT created_at FROM statuses WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC'
    ).all(user.id, nowUnix - 7 * 24 * 3600) as Array<{ created_at: number }>;

    const matchesPreviousOpen = recentStatuses.some(s => {
      try {
        const openDate = new Date(s.created_at * 1000);
        const fmt = new Intl.DateTimeFormat('en-US', {
          timeZone: tz, hour: 'numeric', year: 'numeric', month: '2-digit', day: '2-digit', hour12: false,
        });
        const parts = fmt.formatToParts(openDate);
        const openHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
        const openDateStr = `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
        return openHour === localHour && openDateStr !== localDateStr;
      } catch {
        return false;
      }
    });

    if (!matchesPreviousOpen) continue;

    notifyAutoNudge(user.id);
    db.prepare('INSERT INTO auto_nudge_log (id, user_id) VALUES (?, ?)').run(randomUUID(), user.id);
    log('nudge.sent', user.id, { type: 'auto' });
  }
});

// Every minute: fire auto-close confirmation to host
cron.schedule('* * * * *', () => {
  const now = Math.floor(Date.now() / 1000);
  // A small grace window (up to 2 min past closes_at) avoids race with explicit close
  const gracePeriod = now - 120;

  const closed = db.prepare(`
    SELECT s.id, s.user_id, u.notif_door_closed
    FROM statuses s
    JOIN users u ON u.id = s.user_id
    WHERE s.closed_at IS NULL
      AND s.closes_at <= ?
      AND s.closes_at >= ?
      AND s.auto_close_notification_sent = 0
  `).all(now, gracePeriod) as Array<{ id: string; user_id: string; notif_door_closed: number }>;

  for (const s of closed) {
    db.prepare('UPDATE statuses SET auto_close_notification_sent = 1 WHERE id = ?').run(s.id);
    if (s.notif_door_closed) notifyDoorClosed(s.user_id);
  }
});

// Every 10 seconds: fire delayed open notifications
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  const pending = db.prepare(`
    SELECT s.*, u.display_name
    FROM statuses s
    JOIN users u ON u.id = s.user_id
    WHERE s.notify_at IS NOT NULL
      AND s.notify_at <= ?
      AND s.notifications_sent = 0
      AND s.closed_at IS NULL
      AND s.closes_at > ?
      AND s.starts_at IS NULL
  `).all(now, now) as Array<any>;

  for (const status of pending) {
    const recipients = db.prepare('SELECT user_id FROM status_recipients WHERE status_id = ?')
      .all(status.id).map((r: any) => r.user_id);
    const mutedByHost = db.prepare('SELECT muted_user_id FROM friend_mutes WHERE user_id = ?')
      .all(status.user_id).map((r: any) => r.muted_user_id);

    for (const rid of recipients) {
      if (mutedByHost.includes(rid)) continue;

      // Check per-friend notification preference and throttle
      const prefRow = db.prepare(
        'SELECT pref, last_notified_at, notif_window_start, notif_count FROM friend_notif_prefs WHERE user_id = ? AND friend_user_id = ?'
      ).get(rid, status.user_id) as {
        pref: string; last_notified_at: number | null;
        notif_window_start: number; notif_count: number;
      } | undefined;

      const pref = prefRow?.pref ?? 'default';
      if (pref === 'none') continue;
      if (pref === 'default') {
        // Rolling 72-hour window: max 2 notifications per window.
        // Window resets once 72h have elapsed since notif_window_start.
        const windowStart = prefRow?.notif_window_start ?? 0;
        const count = prefRow?.notif_count ?? 0;
        const inWindow = now - windowStart <= 72 * 3600;
        if (inWindow && count >= 2) continue;
      }
      // pref === 'all': always send

      notifyFriendDoorOpen(rid, status.display_name, status.note || null);

      // Update throttle state
      const windowStart = prefRow?.notif_window_start ?? 0;
      const count = prefRow?.notif_count ?? 0;
      const windowExpired = now - windowStart > 72 * 3600;
      const newWindowStart = windowExpired ? now : windowStart;
      const newCount = windowExpired ? 1 : count + 1;

      db.prepare(`
        INSERT INTO friend_notif_prefs (user_id, friend_user_id, pref, last_notified_at, notif_window_start, notif_count)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, friend_user_id) DO UPDATE SET
          last_notified_at = excluded.last_notified_at,
          notif_window_start = excluded.notif_window_start,
          notif_count = excluded.notif_count
      `).run(rid, status.user_id, pref, now, newWindowStart, newCount);
    }

    broadcastSSE(recipients, 'status:open', {
      status_id: status.id,
      owner_id: status.user_id,
      owner_name: status.display_name,
      note: status.note || null,
      closes_at: status.closes_at,
    });

    db.prepare('UPDATE statuses SET notifications_sent = 1 WHERE id = ?').run(status.id);
  }
}, 10_000);

// Helper: compute the seconds-before-start window for a reminder setting
function getReminderWindow(setting: string): { min: number; max: number } | null {
  if (!setting || setting === 'none') return null;
  if (setting === 'day') return { min: 20 * 3600, max: 28 * 3600 };
  const m = setting.match(/^(\d+)m$/);
  if (!m) return null;
  const secs = parseInt(m[1]) * 60;
  return { min: secs - 5 * 60, max: secs + 5 * 60 };
}

// Every minute: fire going reminders (primary + secondary) for upcoming scheduled sessions
cron.schedule('* * * * *', () => {
  const now = Math.floor(Date.now() / 1000);

  type GoingRow = { id: string; user_id: string; starts_at: number; host_name: string; going_reminder_1: string; going_reminder_2: string; reminder_1_sent: number; reminder_sent: number };

  const signals = db.prepare(`
    SELECT gs.id, gs.user_id, s.starts_at,
           u2.display_name as host_name,
           u1.going_reminder_1, u1.going_reminder_2,
           gs.reminder_1_sent, gs.reminder_sent
    FROM going_signals gs
    JOIN statuses s ON s.id = gs.status_id
    JOIN users u1 ON u1.id = gs.user_id
    JOIN users u2 ON u2.id = s.user_id
    WHERE gs.rsvp = 'going'
      AND gs.user_id IS NOT NULL
      AND s.starts_at IS NOT NULL
      AND s.closed_at IS NULL
      AND (gs.reminder_1_sent = 0 OR gs.reminder_sent = 0)
  `).all() as GoingRow[];

  for (const signal of signals) {
    const secondsUntil = signal.starts_at - now;

    // Primary reminder (reminder_1)
    if (!signal.reminder_1_sent) {
      const w1 = getReminderWindow(signal.going_reminder_1 ?? 'day');
      if (w1 && secondsUntil >= w1.min && secondsUntil <= w1.max) {
        const type = signal.going_reminder_1 === 'day' ? 'day' : 'soon';
        notifyGoingReminder(signal.user_id, signal.host_name, signal.starts_at, type);
        db.prepare('UPDATE going_signals SET reminder_1_sent = 1 WHERE id = ?').run(signal.id);
        log('nudge.sent', signal.user_id, { type: 'going_reminder_1' });
      }
    }

    // Secondary reminder (reminder_sent)
    if (!signal.reminder_sent) {
      const w2 = getReminderWindow(signal.going_reminder_2 ?? '30m');
      if (w2 && secondsUntil >= w2.min && secondsUntil <= w2.max) {
        notifyGoingReminder(signal.user_id, signal.host_name, signal.starts_at, 'soon');
        db.prepare('UPDATE going_signals SET reminder_sent = 1 WHERE id = ?').run(signal.id);
        log('nudge.sent', signal.user_id, { type: 'going_reminder_2' });
      }
    }
  }
});

// Daily at 12:00 UTC: re-engagement nudge for users who haven't opened in 7+ days
cron.schedule('0 12 * * *', () => {
  const now = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = now - 7 * 86400;
  const fourteenDaysAgo = now - 14 * 86400;

  const candidates = db.prepare(`
    SELECT u.id
    FROM users u
    WHERE EXISTS (SELECT 1 FROM friendships WHERE user_a_id = u.id OR user_b_id = u.id)
      AND (u.last_reengagement_at IS NULL OR u.last_reengagement_at < ?)
      AND NOT EXISTS (
        SELECT 1 FROM statuses WHERE user_id = u.id AND created_at >= ?
      )
  `).all(fourteenDaysAgo, sevenDaysAgo) as Array<{ id: string }>;

  for (const u of candidates) {
    notifyReengagement(u.id);
    db.prepare('UPDATE users SET last_reengagement_at = ? WHERE id = ?').run(now, u.id);
    log('nudge.sent', u.id, { type: 'reengagement' });
  }
});

// Daily at 03:00 UTC: purge event_log rows older than 12 months
// Preserve user.signup and user.verify forever — one-time, low-volume, historically valuable.
cron.schedule('0 3 * * *', () => {
  const cutoff = Math.floor(Date.now() / 1000) - 365 * 86400;
  const result = db.prepare(`
    DELETE FROM event_log WHERE ts < ? AND event NOT IN ('user.signup', 'user.verify')
  `).run(cutoff);
  if (result.changes > 0) {
    console.log(`[cron] purged ${result.changes} event_log rows older than 12 months`);
  }
});
