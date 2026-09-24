import { db } from '../db/index.js';
import {
  announceDoorOpen, notifyDoorClosingSoon, notifyDoorClosed, notifyScheduledReminder, notifyGoingReminder,
  notifyNudge, notifyAutoNudge, notifyReengagement,
} from './notifications.js';
import { log } from './analytics.js';
import { randomUUID } from 'crypto';

// Timed notifications are rows in `jobs`: what to do, about which record, and when.
// Whenever a status or RSVP changes, its pending jobs are recomputed from the record's
// current state (syncStatusJobs / syncGoingJobs), and a single worker runs whatever is
// due. Each handler re-checks the record before sending, so a job made stale by a
// later edit does nothing.
//
// `dedupe_key` decides what counts as "the same" notification. A done job is never
// replaced, so a key that includes closes_at means "once per closing time" (prolonging
// the door re-arms it), while an empty key means "once, ever" for that record.

const nowUnix = () => Math.floor(Date.now() / 1000);

// Sent when 10–12 minutes remain, matching the "closes in 10 minutes" copy.
const CLOSING_SOON_LEAD = 720;
const CLOSING_SOON_MIN_REMAINING = 600;
// A door that closed on its own is announced to the host only within this window, so a
// server that was down for a while doesn't send a stale "your door is closed".
const AUTO_CLOSED_GRACE = 120;

type JobType =
  | 'door.notify_open'
  | 'door.closing_soon'
  | 'door.auto_closed'
  | 'door.host_reminder'
  | 'going.reminder_1'
  | 'going.reminder_2';

interface DesiredJob { type: JobType; key: string; runAt: number }

const insertJob = db.prepare(
  'INSERT OR IGNORE INTO jobs (type, subject_id, dedupe_key, run_at) VALUES (?, ?, ?, ?)'
);

function replacePending(subjectId: string, typePrefix: string, desired: DesiredJob[]) {
  db.prepare("DELETE FROM jobs WHERE subject_id = ? AND done_at IS NULL AND type LIKE ? || '%'").run(subjectId, typePrefix);
  for (const j of desired) insertJob.run(j.type, subjectId, j.key, j.runAt);
}

// ── Going reminders ───────────────────────────────────────────

// The seconds-before-start window a reminder setting allows.
export function getReminderWindow(setting: string): { min: number; max: number } | null {
  if (!setting || setting === 'none') return null;
  if (setting === 'day') return { min: 20 * 3600, max: 28 * 3600 };
  const m = setting.match(/^(\d+)m$/);
  if (!m) return null;
  const secs = parseInt(m[1]) * 60;
  return { min: secs - 5 * 60, max: secs + 5 * 60 };
}

interface GoingRow {
  id: string; user_id: string | null; rsvp: string;
  starts_at: number | null; closed_at: number | null;
  host_name: string; going_reminder_1: string | null; going_reminder_2: string | null;
}

function loadGoing(signalId: string): GoingRow | undefined {
  return db.prepare(`
    SELECT gs.id, gs.user_id, gs.rsvp, s.starts_at, s.closed_at,
           host.display_name AS host_name, u.going_reminder_1, u.going_reminder_2
    FROM going_signals gs
    JOIN statuses s ON s.id = gs.status_id
    JOIN users host ON host.id = s.user_id
    LEFT JOIN users u ON u.id = gs.user_id
    WHERE gs.id = ?
  `).get(signalId) as GoingRow | undefined;
}

function reminderSetting(g: GoingRow, slot: 1 | 2): string {
  return slot === 1 ? (g.going_reminder_1 ?? 'day') : (g.going_reminder_2 ?? '30m');
}

function goingIsRemindable(g: GoingRow | undefined): g is GoingRow & { user_id: string; starts_at: number } {
  return !!g && g.rsvp === 'going' && !!g.user_id && !!g.starts_at && g.closed_at === null;
}

export function syncGoingJobs(signalId: string) {
  const g = loadGoing(signalId);
  const desired: DesiredJob[] = [];
  if (goingIsRemindable(g)) {
    for (const slot of [1, 2] as const) {
      const w = getReminderWindow(reminderSetting(g, slot));
      if (w) desired.push({ type: `going.reminder_${slot}`, key: '', runAt: g.starts_at - w.max });
    }
  }
  replacePending(signalId, 'going.', desired);
}

// A user's reminder settings changed: re-time every reminder they still have coming.
export function syncUserGoingJobs(userId: string) {
  const signals = db.prepare(`
    SELECT gs.id FROM going_signals gs JOIN statuses s ON s.id = gs.status_id
    WHERE gs.user_id = ? AND s.closed_at IS NULL AND s.starts_at > ?
  `).all(userId, nowUnix()) as Array<{ id: string }>;
  for (const s of signals) syncGoingJobs(s.id);
}

export function cancelGoingJobs(signalId: string) {
  replacePending(signalId, 'going.', []);
}

// ── Status jobs ───────────────────────────────────────────────

interface StatusRow {
  id: string; user_id: string; closes_at: number; closed_at: number | null;
  starts_at: number | null; reminder_minutes: number | null;
  notify_at: number | null; notifications_sent: number;
}

// Call after any change to a status (open, edit, prolong, close, activate, cancel).
export function syncStatusJobs(statusId: string) {
  const s = db.prepare('SELECT * FROM statuses WHERE id = ?').get(statusId) as StatusRow | undefined;
  const desired: DesiredJob[] = [];
  if (s && s.closed_at === null) {
    if (s.notify_at && !s.starts_at && !s.notifications_sent) {
      desired.push({ type: 'door.notify_open', key: '', runAt: s.notify_at });
    }
    desired.push({ type: 'door.closing_soon', key: String(s.closes_at), runAt: s.closes_at - CLOSING_SOON_LEAD });
    desired.push({ type: 'door.auto_closed', key: String(s.closes_at), runAt: s.closes_at });
    if (s.starts_at && s.reminder_minutes !== null) {
      desired.push({ type: 'door.host_reminder', key: '', runAt: s.starts_at - s.reminder_minutes * 60 });
    }
  }
  replacePending(statusId, 'door.', desired);

  const signals = db.prepare('SELECT id FROM going_signals WHERE status_id = ? AND user_id IS NOT NULL')
    .all(statusId) as Array<{ id: string }>;
  for (const g of signals) syncGoingJobs(g.id);
}

// On boot: make sure every live record has its jobs, e.g. after a deploy that added a
// job type. Idempotent — done jobs are kept, pending ones recomputed.
export function syncAllLiveJobs() {
  const live = db.prepare(`
    SELECT id FROM statuses
    WHERE closed_at IS NULL AND (closes_at > ? OR starts_at > ?)
  `).all(nowUnix() - AUTO_CLOSED_GRACE, nowUnix()) as Array<{ id: string }>;
  db.transaction(() => { for (const s of live) syncStatusJobs(s.id); })();
}

// ── Handlers ──────────────────────────────────────────────────
// Each re-reads the record and returns without sending if it no longer applies.

function loadStatus(id: string): StatusRow | undefined {
  return db.prepare('SELECT * FROM statuses WHERE id = ?').get(id) as StatusRow | undefined;
}

const handlers: Record<JobType, (subjectId: string, key: string, now: number) => void> = {
  'door.notify_open': (id, _key, now) => {
    const s = loadStatus(id);
    if (!s || s.closed_at !== null || s.notifications_sent || s.starts_at !== null) return;
    if (!s.notify_at || s.notify_at > now || s.closes_at <= now) return;
    announceDoorOpen(s.id);
  },

  'door.closing_soon': (id, key, now) => {
    const s = loadStatus(id);
    if (!s || s.closed_at !== null || String(s.closes_at) !== key) return;
    const remaining = s.closes_at - now;
    if (remaining <= CLOSING_SOON_MIN_REMAINING || remaining > CLOSING_SOON_LEAD) return;
    notifyDoorClosingSoon(s.user_id, s.id);
  },

  'door.auto_closed': (id, key, now) => {
    const s = loadStatus(id);
    if (!s || s.closed_at !== null || String(s.closes_at) !== key) return;
    if (s.closes_at > now || now - s.closes_at > AUTO_CLOSED_GRACE) return;
    const host = db.prepare('SELECT notif_door_closed FROM users WHERE id = ?').get(s.user_id) as { notif_door_closed: number } | undefined;
    if (host?.notif_door_closed) notifyDoorClosed(s.user_id);
  },

  'door.host_reminder': (id, _key, now) => {
    const s = loadStatus(id);
    if (!s || s.closed_at !== null || !s.starts_at || s.reminder_minutes === null) return;
    if (s.starts_at <= now || s.starts_at - s.reminder_minutes * 60 > now) return;
    notifyScheduledReminder(s.user_id, s.starts_at);
  },

  'going.reminder_1': (id, _key, now) => sendGoingReminder(id, 1, now),
  'going.reminder_2': (id, _key, now) => sendGoingReminder(id, 2, now),
};

function sendGoingReminder(signalId: string, slot: 1 | 2, now: number) {
  const g = loadGoing(signalId);
  if (!goingIsRemindable(g)) return;
  const setting = reminderSetting(g, slot);
  const w = getReminderWindow(setting);
  const secondsUntil = g.starts_at - now;
  if (!w || secondsUntil < w.min || secondsUntil > w.max) return;
  const type = slot === 1 && setting === 'day' ? 'day' : 'soon';
  notifyGoingReminder(g.user_id, g.host_name, g.starts_at, type);
  log('nudge.sent', g.user_id, { type: `going_reminder_${slot}` });
}

// Run every due job once. A job is marked done whether it sent, skipped or failed —
// a failure is recorded on the row rather than retried, as a late push is worse than none.
export function runDueJobs(now = nowUnix()) {
  const due = db.prepare(`
    SELECT id, type, subject_id, dedupe_key FROM jobs
    WHERE done_at IS NULL AND run_at <= ?
    ORDER BY run_at LIMIT 500
  `).all(now) as Array<{ id: number; type: JobType; subject_id: string; dedupe_key: string }>;

  const finish = db.prepare('UPDATE jobs SET done_at = ?, error = ? WHERE id = ?');
  for (const job of due) {
    let error: string | null = null;
    try {
      const handler = handlers[job.type];
      if (!handler) throw new Error(`unknown job type ${job.type}`);
      handler(job.subject_id, job.dedupe_key, now);
    } catch (err: any) {
      error = String(err?.message ?? err).slice(0, 500);
      console.error(`[jobs] ${job.type} ${job.subject_id} failed:`, error);
    }
    finish.run(now, error, job.id);
  }
  return due.length;
}

export function purgeOldJobs(now = nowUnix()) {
  return db.prepare('DELETE FROM jobs WHERE done_at IS NOT NULL AND done_at < ?').run(now - 30 * 86400).changes;
}

// ── Recurring nudges ──────────────────────────────────────────
// These follow a weekly pattern per user rather than a single record, so they stay as
// sweeps. Both only look at users who could receive one.

const DAY_NAMES: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

interface LocalTime { hour: number; weekday: string; date: string; dayStart: number }

// The wall-clock time in `tz` at unix time `now`, plus the unix time its day began.
export function localTime(now: number, tz: string | null): LocalTime {
  const fmt = (zone: string) => new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour12: false, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(now * 1000));
  let parts: Intl.DateTimeFormatPart[];
  try { parts = fmt(tz || 'UTC'); } catch { parts = fmt('UTC'); }
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '0';
  const hour = parseInt(get('hour')) % 24;
  const secondsIntoDay = hour * 3600 + parseInt(get('minute')) * 60 + parseInt(get('second'));
  return {
    hour,
    weekday: get('weekday').toLowerCase().slice(0, 3),
    date: `${get('year')}-${get('month')}-${get('day')}`,
    dayStart: now - secondsIntoDay,
  };
}

function hasOpenDoor(userId: string, now: number): boolean {
  return !!db.prepare('SELECT id FROM statuses WHERE user_id = ? AND closed_at IS NULL AND closes_at > ?').get(userId, now);
}

// Every minute. Catches up on a slot whose hour already passed today (e.g. after a
// restart); the once-a-day check stops it sending twice.
export function runScheduledNudges(now = nowUnix()) {
  const users = db.prepare(`
    SELECT DISTINCT u.id, u.timezone FROM users u JOIN nudge_schedules n ON n.user_id = u.id
  `).all() as Array<{ id: string; timezone: string | null }>;

  for (const user of users) {
    const local = localTime(now, user.timezone);
    const schedules = db.prepare(`
      SELECT id, day_of_week FROM nudge_schedules WHERE user_id = ? AND day_of_week = ? AND hour <= ?
    `).all(user.id, local.weekday, local.hour) as Array<{ id: string; day_of_week: string }>;
    if (!schedules.length) continue;
    if (hasOpenDoor(user.id, now)) continue;

    // Any nudge already sent since the start of the user's local day?
    const sentToday = db.prepare('SELECT id FROM nudge_schedules WHERE user_id = ? AND last_sent_at >= ?')
      .get(user.id, local.dayStart);
    if (sentToday) continue;

    for (const schedule of schedules) {
      notifyNudge(user.id, DAY_NAMES[schedule.day_of_week] || schedule.day_of_week);
      db.prepare('UPDATE nudge_schedules SET last_sent_at = ? WHERE id = ?').run(now, schedule.id);
      log('nudge.sent', user.id, { type: 'scheduled' });
    }
  }
}

// On the hour. Not restart-resilient — auto-nudges are heuristic, so missing one on a
// rare restart is acceptable. Scheduled nudges (above) are resilient.
export function runAutoNudges(now = nowUnix()) {
  const users = db.prepare('SELECT id, timezone FROM users WHERE auto_nudge_enabled = 1')
    .all() as Array<{ id: string; timezone: string | null }>;

  for (const user of users) {
    const local = localTime(now, user.timezone);
    if (hasOpenDoor(user.id, now)) continue;

    const scheduledNudgeToday = db.prepare('SELECT id FROM nudge_schedules WHERE user_id = ? AND last_sent_at >= ?')
      .get(user.id, local.dayStart);
    if (scheduledNudgeToday) continue;

    const alreadySent = db.prepare('SELECT id FROM auto_nudge_log WHERE user_id = ? AND sent_at >= ?').get(user.id, now - 20 * 3600);
    if (alreadySent) continue;

    // A previous open at this local hour, within the last 7 days but not today.
    const recent = db.prepare('SELECT created_at FROM statuses WHERE user_id = ? AND created_at >= ?')
      .all(user.id, now - 7 * 86400) as Array<{ created_at: number }>;
    const matches = recent.some(s => {
      const opened = localTime(s.created_at, user.timezone);
      return opened.hour === local.hour && opened.date !== local.date;
    });
    if (!matches) continue;

    notifyAutoNudge(user.id);
    db.prepare('INSERT INTO auto_nudge_log (id, user_id) VALUES (?, ?)').run(randomUUID(), user.id);
    log('nudge.sent', user.id, { type: 'auto' });
  }
}

// Daily: users with friends who haven't opened their door in 7+ days, at most every 14.
export function runReengagement(now = nowUnix()) {
  const candidates = db.prepare(`
    SELECT u.id FROM users u
    WHERE EXISTS (SELECT 1 FROM friendships WHERE user_a_id = u.id OR user_b_id = u.id)
      AND (u.last_reengagement_at IS NULL OR u.last_reengagement_at < ?)
      AND NOT EXISTS (SELECT 1 FROM statuses WHERE user_id = u.id AND created_at >= ?)
  `).all(now - 14 * 86400, now - 7 * 86400) as Array<{ id: string }>;

  for (const u of candidates) {
    notifyReengagement(u.id);
    db.prepare('UPDATE users SET last_reengagement_at = ? WHERE id = ?').run(now, u.id);
    log('nudge.sent', u.id, { type: 'reengagement' });
  }
}
