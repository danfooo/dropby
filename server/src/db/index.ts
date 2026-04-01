import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync } from 'fs';

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data');
mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(join(DATA_DIR, 'drop-by.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Must run before CREATE TABLE block: if friend_mutes exists, rename it before
// CREATE TABLE IF NOT EXISTS friend_hides would create an empty table with that name.
{
  const oldTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='friend_mutes'").get();
  if (oldTable) {
    db.exec('ALTER TABLE friend_mutes RENAME TO friend_hides');
    db.exec('ALTER TABLE friend_hides RENAME COLUMN muted_user_id TO hidden_user_id');
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT,
    google_id TEXT UNIQUE,
    apple_id TEXT UNIQUE,
    timezone TEXT,
    auto_nudge_enabled INTEGER NOT NULL DEFAULT 1,
    avatar_seed INTEGER NOT NULL DEFAULT 0,
    email_verified INTEGER NOT NULL DEFAULT 0,
    email_verification_token TEXT,
    email_verification_expires_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY,
    user_a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_a_id, user_b_id)
  );

  CREATE TABLE IF NOT EXISTS friend_hides (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hidden_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_id, hidden_user_id)
  );

  CREATE TABLE IF NOT EXISTS statuses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note TEXT,
    closes_at INTEGER NOT NULL,
    closed_at INTEGER,
    closing_notification_sent INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS going_signals (
    id TEXT PRIMARY KEY,
    status_id TEXT NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    guest_contact_id TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(status_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS status_recipients (
    id TEXT PRIMARY KEY,
    status_id TEXT NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(status_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS invite_links (
    id TEXT PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status_id TEXT REFERENCES statuses(id) ON DELETE SET NULL,
    revoked INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS user_notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS nudge_schedules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week TEXT NOT NULL,
    hour INTEGER NOT NULL,
    last_sent_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS guest_contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact TEXT,
    marketing_consent INTEGER NOT NULL DEFAULT 0,
    status_id TEXT NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS push_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT NOT NULL CHECK(platform IN ('ios', 'android')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_id, token)
  );

  CREATE TABLE IF NOT EXISTS recipient_sessions (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    selected_ids TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS auto_nudge_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sent_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK(type IN ('thought', 'bug')),
    message TEXT NOT NULL,
    reply_email TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS status_ics_downloads (
    status_id     TEXT NOT NULL,
    user_id       TEXT,
    token         TEXT NOT NULL,
    downloaded_at INTEGER NOT NULL,
    PRIMARY KEY (status_id, token)
  );

  CREATE TABLE IF NOT EXISTS friend_notif_prefs (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pref TEXT NOT NULL DEFAULT 'default',
    last_notified_at INTEGER,
    PRIMARY KEY (user_id, friend_user_id)
  );

  CREATE TABLE IF NOT EXISTS event_log (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ts      INTEGER NOT NULL DEFAULT (unixepoch()),
    event   TEXT NOT NULL,
    user_id TEXT,
    data    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_event_log_event ON event_log(event);
  CREATE INDEX IF NOT EXISTS idx_event_log_user  ON event_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_event_log_ts    ON event_log(ts);
`);

// Migrations for existing databases
const cols = db.pragma('table_info(users)') as { name: string }[];
if (!cols.find(c => c.name === 'apple_id')) {
  db.exec('ALTER TABLE users ADD COLUMN apple_id TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_id ON users(apple_id) WHERE apple_id IS NOT NULL');
}
if (!cols.find(c => c.name === 'avatar_seed')) {
  db.exec('ALTER TABLE users ADD COLUMN avatar_seed INTEGER NOT NULL DEFAULT 0');
}
if (!cols.find(c => c.name === 'locale')) {
  db.exec('ALTER TABLE users ADD COLUMN locale TEXT');
}

if (!cols.find(c => c.name === 'avatar_url')) {
  db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT');
}

if (!cols.find(c => c.name === 'default_door_minutes')) {
  db.exec('ALTER TABLE users ADD COLUMN default_door_minutes INTEGER NOT NULL DEFAULT 60');
}

const inviteCols = db.pragma('table_info(invite_links)') as { name: string }[];
if (!inviteCols.find(c => c.name === 'invited_email')) {
  db.exec('ALTER TABLE invite_links ADD COLUMN invited_email TEXT');
}

if (!cols.find(c => c.name === 'password_reset_token')) {
  db.exec('ALTER TABLE users ADD COLUMN password_reset_token TEXT');
  db.exec('ALTER TABLE users ADD COLUMN password_reset_expires_at INTEGER');
}

const sessionCols = db.pragma('table_info(recipient_sessions)') as { name: string }[];
if (!sessionCols.find(c => c.name === 'unselected_ids')) {
  db.exec("ALTER TABLE recipient_sessions ADD COLUMN unselected_ids TEXT NOT NULL DEFAULT '[]'");
}

const statusCols = db.pragma('table_info(statuses)') as { name: string }[];
if (!statusCols.find(c => c.name === 'starts_at')) {
  db.exec('ALTER TABLE statuses ADD COLUMN starts_at INTEGER');
}
if (!statusCols.find(c => c.name === 'ends_at')) {
  db.exec('ALTER TABLE statuses ADD COLUMN ends_at INTEGER');
}
if (!statusCols.find(c => c.name === 'reminder_minutes')) {
  db.exec('ALTER TABLE statuses ADD COLUMN reminder_minutes INTEGER');
}
if (!statusCols.find(c => c.name === 'reminder_sent')) {
  db.exec('ALTER TABLE statuses ADD COLUMN reminder_sent INTEGER NOT NULL DEFAULT 0');
}

const goingCols = db.pragma('table_info(going_signals)') as { name: string }[];
if (!goingCols.find(c => c.name === 'rsvp')) {
  db.exec("ALTER TABLE going_signals ADD COLUMN rsvp TEXT NOT NULL DEFAULT 'going'");
}
if (!goingCols.find(c => c.name === 'note')) {
  db.exec('ALTER TABLE going_signals ADD COLUMN note TEXT');
}
if (!goingCols.find(c => c.name === 'reminder_sent')) {
  db.exec('ALTER TABLE going_signals ADD COLUMN reminder_sent INTEGER NOT NULL DEFAULT 0');
}

if (!statusCols.find(c => c.name === 'ics_sequence')) {
  db.exec('ALTER TABLE statuses ADD COLUMN ics_sequence INTEGER NOT NULL DEFAULT 0');
}
if (!statusCols.find(c => c.name === 'notify_at')) {
  db.exec('ALTER TABLE statuses ADD COLUMN notify_at INTEGER');
}
if (!statusCols.find(c => c.name === 'notifications_sent')) {
  db.exec('ALTER TABLE statuses ADD COLUMN notifications_sent INTEGER NOT NULL DEFAULT 0');
}
if (!statusCols.find(c => c.name === 'auto_close_notification_sent')) {
  db.exec('ALTER TABLE statuses ADD COLUMN auto_close_notification_sent INTEGER NOT NULL DEFAULT 0');
}

if (!cols.find(c => c.name === 'notif_door_closed')) {
  db.exec('ALTER TABLE users ADD COLUMN notif_door_closed INTEGER NOT NULL DEFAULT 1');
}
if (!cols.find(c => c.name === 'going_reminder_1')) {
  db.exec("ALTER TABLE users ADD COLUMN going_reminder_1 TEXT NOT NULL DEFAULT 'day'");
}
if (!cols.find(c => c.name === 'going_reminder_2')) {
  db.exec("ALTER TABLE users ADD COLUMN going_reminder_2 TEXT NOT NULL DEFAULT '30m'");
}
if (!cols.find(c => c.name === 'last_reengagement_at')) {
  db.exec('ALTER TABLE users ADD COLUMN last_reengagement_at INTEGER');
}

if (!goingCols.find(c => c.name === 'reminder_1_sent')) {
  db.exec('ALTER TABLE going_signals ADD COLUMN reminder_1_sent INTEGER NOT NULL DEFAULT 0');
}

const notifPrefCols = db.pragma('table_info(friend_notif_prefs)') as { name: string }[];
if (!notifPrefCols.find(c => c.name === 'notif_window_start')) {
  db.exec('ALTER TABLE friend_notif_prefs ADD COLUMN notif_window_start INTEGER NOT NULL DEFAULT 0');
  db.exec('ALTER TABLE friend_notif_prefs ADD COLUMN notif_count INTEGER NOT NULL DEFAULT 0');
}

export default db;
