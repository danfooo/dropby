import cron from 'node-cron';
import { db } from './db/index.js';
import { notifyDoorClosingSoon, notifyNudge, notifyAutoNudge, notifyScheduledReminder, notifyFriendDoorOpen } from './services/notifications.js';
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

// Every minute: auto-nudge check
// Fires within the first 10 minutes of each hour so a restart within that window
// still catches the nudge. The auto_nudge_log "sent in last 20 hours" check prevents duplicates.
cron.schedule('* * * * *', () => {
  const now = new Date();
  if (now.getMinutes() > 10) return;

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
      notifyFriendDoorOpen(rid, status.display_name, status.note || null);
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
