import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

// A throwaway database for this file. Must be set before the server modules load.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'dropby-jobs-'));

type Db = import('better-sqlite3').Database;
let db: Db;
let jobs: typeof import('../../server/src/services/jobs.js');
let migrations: typeof import('../../server/src/db/migrations.js');

before(async () => {
  db = (await import('../../server/src/db/index.js')).db;
  jobs = await import('../../server/src/services/jobs.js');
  migrations = await import('../../server/src/db/migrations.js');
});

const now = () => Math.floor(Date.now() / 1000);

// A fixed-offset zone where it is currently midday, so quiet hours never interfere.
function middayZone(): string {
  const o = 12 - new Date().getUTCHours();
  return o === 0 ? 'Etc/GMT' : o > 0 ? `Etc/GMT-${o}` : `Etc/GMT+${-o}`;
}

function user(opts: { tz?: string; name?: string } = {}): string {
  const id = randomUUID();
  db.prepare('INSERT INTO users (id, email, display_name, email_verified, timezone) VALUES (?, ?, ?, 1, ?)')
    .run(id, `${id}@dropby.test`, opts.name ?? 'Someone', opts.tz ?? middayZone());
  db.prepare("INSERT INTO push_tokens (id, user_id, token, platform) VALUES (?, ?, ?, 'ios')").run(randomUUID(), id, `tok-${id}`);
  return id;
}

function befriend(a: string, b: string) {
  const [x, y] = [a, b].sort();
  db.prepare('INSERT INTO friendships (id, user_a_id, user_b_id) VALUES (?, ?, ?)').run(randomUUID(), x, y);
}

function openDoor(host: string, recipients: string[], opts: { closesIn?: number; notifyIn?: number } = {}): string {
  const id = randomUUID();
  const t = now();
  db.prepare('INSERT INTO statuses (id, user_id, closes_at, notify_at) VALUES (?, ?, ?, ?)')
    .run(id, host, t + (opts.closesIn ?? 3600), t + (opts.notifyIn ?? 120));
  for (const r of recipients) {
    db.prepare('INSERT INTO status_recipients (id, status_id, user_id) VALUES (?, ?, ?)').run(randomUUID(), id, r);
  }
  jobs.syncStatusJobs(id);
  return id;
}

function scheduleDoor(host: string, startsIn: number, reminderMinutes = 30): string {
  const id = randomUUID();
  const t = now();
  db.prepare('INSERT INTO statuses (id, user_id, starts_at, closes_at, reminder_minutes) VALUES (?, ?, ?, ?, ?)')
    .run(id, host, t + startsIn, t + startsIn + 3600, reminderMinutes);
  jobs.syncStatusJobs(id);
  return id;
}

// Pushes are sent asynchronously; each successful send is logged as push.sent.
async function pushesTo(userId: string, type: string): Promise<number> {
  await new Promise(r => setTimeout(r, 20));
  return (db.prepare(`SELECT COUNT(*) AS n FROM event_log WHERE event = 'push.sent' AND user_id = ? AND json_extract(data, '$.type') = ?`)
    .get(userId, type) as { n: number }).n;
}

function pendingJobs(subject: string) {
  return db.prepare('SELECT type, dedupe_key, run_at FROM jobs WHERE subject_id = ? AND done_at IS NULL ORDER BY type')
    .all(subject) as Array<{ type: string; dedupe_key: string; run_at: number }>;
}

// ── Door opened ───────────────────────────────────────────────

test('door open — friends are told at notify_at, once', async () => {
  const host = user({ name: 'Host' });
  const friend = user();
  befriend(host, friend);
  const status = openDoor(host, [friend], { notifyIn: 120 });

  assert.deepEqual(pendingJobs(status).map(j => j.type), ['door.auto_closed', 'door.closing_soon', 'door.notify_open']);

  jobs.runDueJobs(now() + 60);
  assert.equal(await pushesTo(friend, 'door_open'), 0, 'not before notify_at');

  jobs.runDueJobs(now() + 121);
  assert.equal(await pushesTo(friend, 'door_open'), 1);
  assert.equal((db.prepare('SELECT notifications_sent FROM statuses WHERE id = ?').get(status) as any).notifications_sent, 1);

  jobs.syncStatusJobs(status);
  jobs.runDueJobs(now() + 200);
  assert.equal(await pushesTo(friend, 'door_open'), 1, 'no second push after a resync');
});

test('door open — a door closed within the 2 minutes tells nobody', async () => {
  const host = user();
  const friend = user();
  befriend(host, friend);
  const status = openDoor(host, [friend]);
  db.prepare('UPDATE statuses SET closed_at = ? WHERE id = ?').run(now(), status);
  jobs.syncStatusJobs(status);

  assert.deepEqual(pendingJobs(status), []);
  jobs.runDueJobs(now() + 121);
  assert.equal(await pushesTo(friend, 'door_open'), 0);
});

test('door open — a friend who muted the host gets no push', async () => {
  const host = user();
  const friend = user();
  befriend(host, friend);
  db.prepare('INSERT INTO friend_hides (id, user_id, hidden_user_id) VALUES (?, ?, ?)').run(randomUUID(), friend, host);
  openDoor(host, [friend], { notifyIn: 0 });
  jobs.runDueJobs(now() + 1);
  assert.equal(await pushesTo(friend, 'door_open'), 0);
});

test('door open — a friend the host muted gets no push', async () => {
  const host = user();
  const friend = user();
  befriend(host, friend);
  db.prepare('INSERT INTO friend_hides (id, user_id, hidden_user_id) VALUES (?, ?, ?)').run(randomUUID(), host, friend);
  openDoor(host, [friend], { notifyIn: 0 });
  jobs.runDueJobs(now() + 1);
  assert.equal(await pushesTo(friend, 'door_open'), 0);
});

test('door open — an expired mute no longer counts', async () => {
  const host = user();
  const friend = user();
  befriend(host, friend);
  db.prepare('INSERT INTO friend_hides (id, user_id, hidden_user_id, expires_at) VALUES (?, ?, ?, ?)').run(randomUUID(), friend, host, now() - 10);
  openDoor(host, [friend], { notifyIn: 0 });
  jobs.runDueJobs(now() + 1);
  assert.equal(await pushesTo(friend, 'door_open'), 1);
});

test('door open — pref none gets nothing; default is capped at once a day; all is not', async () => {
  const hostA = user();
  const hostB = user();
  const quiet = user();
  const capped = user();
  const everything = user();
  for (const f of [quiet, capped, everything]) { befriend(hostA, f); }
  db.prepare("INSERT INTO friend_notif_prefs (user_id, friend_user_id, pref) VALUES (?, ?, 'none')").run(quiet, hostA);
  db.prepare("INSERT INTO friend_notif_prefs (user_id, friend_user_id, pref) VALUES (?, ?, 'all')").run(everything, hostA);

  openDoor(hostA, [quiet, capped, everything], { notifyIn: 0 });
  jobs.runDueJobs(now() + 1);
  // Host reopens the same day.
  openDoor(hostA, [quiet, capped, everything], { notifyIn: 0 });
  jobs.runDueJobs(now() + 1);

  assert.equal(await pushesTo(quiet, 'door_open'), 0);
  assert.equal(await pushesTo(capped, 'door_open'), 1);
  assert.equal(await pushesTo(everything, 'door_open'), 2);
  void hostB;
});

// ── Closing soon / auto-closed ────────────────────────────────

test('closing soon — sent with 10–12 minutes left, and again after a prolong', async () => {
  const host = user();
  const status = openDoor(host, [], { closesIn: 3600 });
  const closesAt = (db.prepare('SELECT closes_at FROM statuses WHERE id = ?').get(status) as any).closes_at;

  jobs.runDueJobs(closesAt - 720);
  assert.equal(await pushesTo(host, 'closing_soon'), 1);

  // A note-only edit keeps the same closing time — no repeat.
  jobs.syncStatusJobs(status);
  jobs.runDueJobs(closesAt - 700);
  assert.equal(await pushesTo(host, 'closing_soon'), 1);

  // Prolong by 30 minutes re-arms it for the new time.
  db.prepare('UPDATE statuses SET closes_at = ? WHERE id = ?').run(closesAt + 1800, status);
  jobs.syncStatusJobs(status);
  jobs.runDueJobs(closesAt + 1800 - 720);
  assert.equal(await pushesTo(host, 'closing_soon'), 2);
});

test('closing soon — not sent when less than 10 minutes were left to begin with', async () => {
  const host = user();
  openDoor(host, [], { closesIn: 300 });
  jobs.runDueJobs(now() + 1);
  assert.equal(await pushesTo(host, 'closing_soon'), 0);
});

test('auto-closed — sent when the door closes on its own, not if it was closed by hand', async () => {
  const host = user();
  const status = openDoor(host, [], { closesIn: 3600 });
  const closesAt = (db.prepare('SELECT closes_at FROM statuses WHERE id = ?').get(status) as any).closes_at;
  jobs.runDueJobs(closesAt + 5);
  assert.equal(await pushesTo(host, 'door_closed'), 1);

  const other = user();
  const closedByHand = openDoor(other, [], { closesIn: 3600 });
  db.prepare('UPDATE statuses SET closed_at = ? WHERE id = ?').run(now(), closedByHand);
  jobs.syncStatusJobs(closedByHand);
  jobs.runDueJobs(now() + 3605);
  assert.equal(await pushesTo(other, 'door_closed'), 0);
});

test('auto-closed — skipped when the worker only gets to it more than 2 minutes late', async () => {
  const host = user();
  const status = openDoor(host, [], { closesIn: 3600 });
  const closesAt = (db.prepare('SELECT closes_at FROM statuses WHERE id = ?').get(status) as any).closes_at;
  jobs.runDueJobs(closesAt + 300);
  assert.equal(await pushesTo(host, 'door_closed'), 0);
});

test('auto-closed — respects the host turning it off', async () => {
  const host = user();
  db.prepare('UPDATE users SET notif_door_closed = 0 WHERE id = ?').run(host);
  const status = openDoor(host, [], { closesIn: 3600 });
  const closesAt = (db.prepare('SELECT closes_at FROM statuses WHERE id = ?').get(status) as any).closes_at;
  jobs.runDueJobs(closesAt + 5);
  assert.equal(await pushesTo(host, 'door_closed'), 0);
});

// ── Scheduled sessions ────────────────────────────────────────

test('host reminder — sent reminder_minutes before start, once even if the time moves', async () => {
  const host = user();
  const status = scheduleDoor(host, 7200, 30);
  const startsAt = (db.prepare('SELECT starts_at FROM statuses WHERE id = ?').get(status) as any).starts_at;

  jobs.runDueJobs(startsAt - 1900);
  assert.equal(await pushesTo(host, 'scheduled_reminder'), 0);
  jobs.runDueJobs(startsAt - 1800);
  assert.equal(await pushesTo(host, 'scheduled_reminder'), 1);

  db.prepare('UPDATE statuses SET starts_at = ? WHERE id = ?').run(startsAt + 600, status);
  jobs.syncStatusJobs(status);
  jobs.runDueJobs(startsAt + 600 - 1800);
  assert.equal(await pushesTo(host, 'scheduled_reminder'), 1);
});

test('going reminders — both windows fire, follow setting changes, and stop on un-RSVP', async () => {
  const host = user({ name: 'Nina' });
  const guest = user();
  const leaver = user();
  const status = scheduleDoor(host, 2 * 86400);
  const startsAt = (db.prepare('SELECT starts_at FROM statuses WHERE id = ?').get(status) as any).starts_at;

  const rsvp = (u: string) => {
    const id = randomUUID();
    db.prepare("INSERT INTO going_signals (id, status_id, user_id, rsvp) VALUES (?, ?, ?, 'going')").run(id, status, u);
    jobs.syncGoingJobs(id);
    return id;
  };
  rsvp(guest);
  const leaverSignal = rsvp(leaver);

  // Guest moves the second reminder from 30 to 60 minutes before.
  db.prepare("UPDATE users SET going_reminder_2 = '60m' WHERE id = ?").run(guest);
  jobs.syncUserGoingJobs(guest);

  // Leaver un-RSVPs.
  jobs.cancelGoingJobs(leaverSignal);
  db.prepare('DELETE FROM going_signals WHERE id = ?').run(leaverSignal);

  jobs.runDueJobs(startsAt - 28 * 3600);
  assert.equal(await pushesTo(guest, 'going_reminder'), 1, 'day-before reminder');

  jobs.runDueJobs(startsAt - 65 * 60);
  assert.equal(await pushesTo(guest, 'going_reminder'), 2, '60-minute reminder');

  jobs.runDueJobs(startsAt - 10 * 60);
  assert.equal(await pushesTo(guest, 'going_reminder'), 2, 'nothing more');
  assert.equal(await pushesTo(leaver, 'going_reminder'), 0);
});

test('going reminders — an RSVP made inside no window gets nothing', async () => {
  const host = user();
  const guest = user();
  const status = scheduleDoor(host, 10 * 3600); // 10h away: past the day-before window
  const id = randomUUID();
  db.prepare("INSERT INTO going_signals (id, status_id, user_id, rsvp) VALUES (?, ?, ?, 'going')").run(id, status, guest);
  jobs.syncGoingJobs(id);
  jobs.runDueJobs(now() + 1);
  assert.equal(await pushesTo(guest, 'going_reminder'), 0);
});

test('activating a scheduled session drops its reminders', () => {
  const host = user();
  const status = scheduleDoor(host, 7200);
  assert.ok(pendingJobs(status).some(j => j.type === 'door.host_reminder'));
  db.prepare('UPDATE statuses SET starts_at = NULL WHERE id = ?').run(status);
  jobs.syncStatusJobs(status);
  assert.ok(!pendingJobs(status).some(j => j.type === 'door.host_reminder'));
});

test('a failing job is recorded and does not stop the others', async () => {
  db.prepare("INSERT INTO jobs (type, subject_id, run_at) VALUES ('no.such_type', 'x', 0)").run();
  const host = user();
  openDoor(host, [], { closesIn: 300 });
  jobs.runDueJobs(now() + 1);
  const failed = db.prepare("SELECT done_at, error FROM jobs WHERE type = 'no.such_type'").get() as any;
  assert.ok(failed.done_at);
  assert.match(failed.error, /unknown job type/);
});

// ── Nudges ────────────────────────────────────────────────────

test('localTime — day start is local midnight', () => {
  // 2026-09-24T12:00:00Z is 14:00 in Berlin (CEST) and 02:00 the next day in Kiritimati (UTC+14).
  const t = Date.UTC(2026, 8, 24, 12) / 1000;
  const berlin = jobs.localTime(t, 'Europe/Berlin');
  assert.equal(berlin.hour, 14);
  assert.equal(berlin.dayStart, Date.UTC(2026, 8, 23, 22) / 1000);
  const kiri = jobs.localTime(t, 'Pacific/Kiritimati');
  assert.equal(kiri.weekday, 'fri');
  assert.equal(kiri.date, '2026-09-25');
  assert.equal(kiri.dayStart, Date.UTC(2026, 8, 24, 10) / 1000);
  assert.equal(jobs.localTime(t, 'Not/AZone').hour, 12, 'bad zone falls back to UTC');
});

test('scheduled nudge — "already sent today" means the user\'s today, not the server\'s', async () => {
  // Local Friday 02:00 in Kiritimati; the last nudge went out on local Thursday evening,
  // which is the same UTC day. It must still send.
  const t = Date.UTC(2026, 8, 24, 12) / 1000;
  const u = user({ tz: 'Pacific/Kiritimati' });
  db.prepare("INSERT INTO nudge_schedules (id, user_id, day_of_week, hour, last_sent_at) VALUES (?, ?, 'fri', 1, ?)")
    .run(randomUUID(), u, Date.UTC(2026, 8, 24, 5) / 1000);
  jobs.runScheduledNudges(t);
  assert.equal(await pushesTo(u, 'nudge'), 1);
  jobs.runScheduledNudges(t + 60);
  assert.equal(await pushesTo(u, 'nudge'), 1, 'only once that day');
});

// ── Migration carry-over ──────────────────────────────────────

test('migration 2 — notifications already sent under the old flags are not sent again', () => {
  const mem = new Database(':memory:');
  migrations.runMigrations(mem, migrations.migrations.filter(m => m.version === 1));
  const t = now();
  mem.prepare("INSERT INTO users (id, email, display_name) VALUES ('h', 'h@x', 'H'), ('g', 'g@x', 'G')").run();
  mem.prepare(`INSERT INTO statuses (id, user_id, closes_at, starts_at, reminder_minutes, notify_at,
    notifications_sent, closing_notification_sent, reminder_sent, auto_close_notification_sent)
    VALUES ('live', 'h', ?, ?, 30, ?, 1, 1, 1, 0), ('old', 'h', ?, NULL, NULL, NULL, 1, 1, 0, 1)`)
    .run(t + 3600, t + 600, t - 60, t - 10 * 86400);
  mem.prepare("INSERT INTO going_signals (id, status_id, user_id, reminder_1_sent, reminder_sent) VALUES ('gs', 'live', 'g', 1, 0)").run();

  migrations.runMigrations(mem);

  const rows = mem.prepare('SELECT type, subject_id, dedupe_key, done_at IS NOT NULL AS done FROM jobs ORDER BY type').all() as any[];
  assert.deepEqual(rows.map(r => `${r.type}:${r.subject_id}:${r.dedupe_key}:${r.done}`), [
    `door.closing_soon:live:${t + 3600}:1`,
    'door.host_reminder:live::1',
    'door.notify_open:live::1',
    'going.reminder_1:gs::1',
  ]);
});
