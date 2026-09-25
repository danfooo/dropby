import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

// A throwaway database for this file. Must be set before the server modules load.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'dropby-live-activity-'));

type Db = import('better-sqlite3').Database;
let db: Db;
let la: typeof import('../../server/src/services/live-activity.js');

before(async () => {
  db = (await import('../../server/src/db/index.js')).db;
  la = await import('../../server/src/services/live-activity.js');
});

const now = () => Math.floor(Date.now() / 1000);

function user(name: string): string {
  const id = randomUUID();
  db.prepare('INSERT INTO users (id, email, display_name, email_verified) VALUES (?, ?, ?, 1)')
    .run(id, `${id}@dropby.test`, name);
  return id;
}

function openDoor(host: string, closesIn = 3600): string {
  const id = randomUUID();
  db.prepare("INSERT INTO statuses (id, user_id, note, closes_at) VALUES (?, ?, 'Pizza', ?)").run(id, host, now() + closesIn);
  return id;
}

function going(statusId: string, userId: string) {
  db.prepare("INSERT INTO going_signals (id, status_id, user_id, rsvp) VALUES (?, ?, ?, 'going')").run(randomUUID(), statusId, userId);
}

test('live activity — state names the first few on their way and counts all of them', () => {
  const door = openDoor(user('Host'));
  for (const n of ['Ana', 'Ben', 'Cleo', 'Dev']) going(door, user(n));
  const s = la.doorActivityState(door)!;
  assert.equal(s.ended, false);
  assert.equal(s.state.note, 'Pizza');
  assert.deepEqual(s.state.going, ['Ana', 'Ben', 'Cleo']);
  assert.equal(s.state.goingCount, 4);
});

test('live activity — a closed or run-out door has ended', () => {
  const closed = openDoor(user('Host'));
  db.prepare('UPDATE statuses SET closed_at = ? WHERE id = ?').run(now(), closed);
  assert.equal(la.doorActivityState(closed)!.ended, true);
  assert.equal(la.doorActivityState(openDoor(user('Host'), -10))!.ended, true);
});

test('live activity — a device\'s start token goes when it signs out', async () => {
  const sessions = await import('../../server/src/services/sessions.js');
  const host = user('Host');
  const session = sessions.createSession(host);
  la.saveLiveActivityStartToken(host, sessions.sessionIdOf(session), 'start-tok');
  la.saveLiveActivityStartToken(host, sessions.sessionIdOf(session), 'start-tok');
  const count = () => (db.prepare('SELECT COUNT(*) AS n FROM live_activity_start_tokens WHERE user_id = ?').get(host) as any).n;
  assert.equal(count(), 1);
  sessions.revokeSession(session);
  assert.equal(count(), 0);
});

test('live activity — a scheduled session gets a start job at its start time', async () => {
  const jobs = await import('../../server/src/services/jobs.js');
  const id = randomUUID();
  const startsAt = now() + 3600;
  db.prepare('INSERT INTO statuses (id, user_id, starts_at, closes_at) VALUES (?, ?, ?, ?)').run(id, user('Host'), startsAt, startsAt + 3600);
  jobs.syncStatusJobs(id);
  const job = db.prepare("SELECT run_at FROM jobs WHERE subject_id = ? AND type = 'door.live_activity_start' AND done_at IS NULL").get(id) as any;
  assert.equal(job?.run_at, startsAt);
  db.prepare('UPDATE statuses SET starts_at = NULL WHERE id = ?').run(id);
  jobs.syncStatusJobs(id);
  assert.equal(db.prepare("SELECT 1 FROM jobs WHERE subject_id = ? AND type = 'door.live_activity_start' AND done_at IS NULL").get(id), undefined);
});

test('live activity — the Android message carries the door as strings, or just the end', () => {
  const door = openDoor(user('Host'));
  going(door, user('Ana'));
  const open = la.androidDoorMessage(door, la.doorActivityState(door)!);
  assert.equal(open.type, 'door_live');
  assert.equal(open.event, 'update');
  assert.equal(open.note, 'Pizza');
  assert.equal(open.location, '');
  assert.deepEqual(JSON.parse(open.going), ['Ana']);
  assert.equal(open.goingCount, '1');
  for (const v of Object.values(open)) assert.equal(typeof v, 'string');

  db.prepare('UPDATE statuses SET closed_at = ? WHERE id = ?').run(now(), door);
  const ended = la.androidDoorMessage(door, la.doorActivityState(door)!);
  assert.equal(ended.event, 'end');
  assert.equal(ended.closesAt, undefined);
});

test('live activity — a cancelled scheduled session never started', () => {
  const id = randomUUID();
  db.prepare('INSERT INTO statuses (id, user_id, starts_at, closes_at, closed_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, user('Host'), now() + 3600, now() + 7200, now());
  assert.equal(la.doorActivityState(id)!.started, false);
});

test('live activity — ending forgets the door\'s tokens', () => {
  const door = openDoor(user('Host'));
  la.saveLiveActivityToken(door, 'tok');
  la.saveLiveActivityToken(door, 'tok');
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM live_activity_tokens WHERE status_id = ?').get(door) as any).n, 1);
  db.prepare('UPDATE statuses SET closed_at = ? WHERE id = ?').run(now(), door);
  la.syncLiveActivity(door);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM live_activity_tokens WHERE status_id = ?').get(door) as any).n, 0);
});
