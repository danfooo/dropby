import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync } from 'fs';

const DATA_DIR = join(process.cwd(), 'data');
mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(join(DATA_DIR, 'drop-by.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT,
    google_id TEXT UNIQUE,
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

  CREATE TABLE IF NOT EXISTS friend_mutes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    muted_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_id, muted_user_id)
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
`);

// Migrations for existing databases
const cols = db.pragma('table_info(users)') as { name: string }[];
if (!cols.find(c => c.name === 'avatar_seed')) {
  db.exec('ALTER TABLE users ADD COLUMN avatar_seed INTEGER NOT NULL DEFAULT 0');
}
if (!cols.find(c => c.name === 'locale')) {
  db.exec('ALTER TABLE users ADD COLUMN locale TEXT');
}

export default db;
