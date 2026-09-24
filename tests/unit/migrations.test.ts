import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations, migrations } from '../../server/src/db/migrations.js';

const latest = migrations[migrations.length - 1].version;

test('migrations — a fresh database ends at the latest version', () => {
  const db = new Database(':memory:');
  runMigrations(db);
  assert.equal(db.pragma('user_version', { simple: true }), latest);
});

test('migrations — running again is a no-op', () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const schema = db.prepare('SELECT sql FROM sqlite_master ORDER BY name').all();
  runMigrations(db);
  assert.deepEqual(db.prepare('SELECT sql FROM sqlite_master ORDER BY name').all(), schema);
  assert.equal(db.pragma('user_version', { simple: true }), latest);
});

test('migrations — versions are strictly increasing', () => {
  migrations.forEach((m, i) => {
    if (i > 0) assert.ok(m.version > migrations[i - 1].version, `v${m.version} after v${migrations[i - 1].version}`);
  });
});

test('migrations — a failing migration leaves no trace and keeps the version', () => {
  const db = new Database(':memory:');
  const list = [
    { version: 1, name: 'one', up: (d: Database.Database) => d.exec('CREATE TABLE a (id INTEGER)') },
    { version: 2, name: 'two', up: (d: Database.Database) => { d.exec('CREATE TABLE b (id INTEGER)'); throw new Error('boom'); } },
  ];
  assert.throws(() => runMigrations(db, list), /boom/);
  assert.equal(db.pragma('user_version', { simple: true }), 1);
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'a'").get());
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'b'").get(), undefined);
});
