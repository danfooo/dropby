import cron from 'node-cron';
import { db } from './db/index.js';
import { notifyDoorClosingSoon, notifyNudge, notifyAutoNudge, notifyScheduledReminder } from './services/notifications.js';
import { randomUUID } from 'crypto';

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
cron.schedule('* * * * *', () => {
  const now = new Date();
  const currentMinute = now.getMinutes();
  if (currentMinute !== 0) return; // only fire on the hour

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
      WHERE user_id = ? AND day_of_week = ? AND hour = ?
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
    }
  }
});

// Every hour: auto-nudge check
cron.schedule('0 * * * *', () => {
  if (!process.env.AUTO_NUDGE_ENABLED && process.env.NODE_ENV === 'test') return;

  const nowUnix = Math.floor(Date.now() / 1000);
  const oneWeekAgo = nowUnix - 7 * 24 * 3600;
  const twoHours = 2 * 3600;

  const users = db.prepare('SELECT id, auto_nudge_enabled FROM users WHERE auto_nudge_enabled = 1').all() as Array<{ id: string; auto_nudge_enabled: number }>;

  for (const user of users) {
    // Door already open?
    const active = db.prepare('SELECT id FROM statuses WHERE user_id = ? AND closed_at IS NULL AND closes_at > ?').get(user.id, nowUnix);
    if (active) continue;

    // Did a scheduled nudge fire today?
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const scheduledNudgeToday = db.prepare(`
      SELECT id FROM nudge_schedules WHERE user_id = ? AND last_sent_at >= ?
    `).get(user.id, Math.floor(startOfDay.getTime() / 1000));
    if (scheduledNudgeToday) continue;

    // Auto-nudge already sent this week?
    const weekStart = nowUnix - 7 * 24 * 3600;
    const alreadySentThisWeek = db.prepare(`
      SELECT id FROM auto_nudge_log WHERE user_id = ? AND sent_at >= ?
    `).get(user.id, weekStart);
    if (alreadySentThisWeek) continue;

    // Did they open in ±2hr window one week ago?
    const openedLastWeek = db.prepare(`
      SELECT id FROM statuses
      WHERE user_id = ? AND created_at >= ? AND created_at <= ?
    `).get(user.id, oneWeekAgo - twoHours, oneWeekAgo + twoHours);

    if (!openedLastWeek) continue;

    // Has opened this week in that window?
    const openedThisWeek = db.prepare(`
      SELECT id FROM statuses
      WHERE user_id = ? AND created_at >= ? AND created_at <= ?
    `).get(user.id, nowUnix - twoHours, nowUnix + twoHours);

    if (openedThisWeek) continue;

    notifyAutoNudge(user.id);
    db.prepare('INSERT INTO auto_nudge_log (id, user_id) VALUES (?, ?)').run(randomUUID(), user.id);
  }
});
