import type { Database } from 'better-sqlite3';

// Schema changes, applied in order. Each runs once, inside a transaction, and the
// database's `PRAGMA user_version` records the last one applied. To change the schema,
// append a new entry — never edit one that has shipped.
export interface Migration {
  version: number;
  name: string;
  up: (db: Database) => void;
}

// Version 1 is the schema as it stood before versioning: every table plus the column
// checks that used to run on each boot. It is idempotent, so it brings both a fresh
// database and an existing production one to the same state.
function baseline(db: Database) {
  // Must run before CREATE TABLE block: rename friend_mutes → friend_hides.
  // If a previous failed run already created an empty friend_hides via CREATE TABLE,
  // drop it first so the rename can proceed.
  {
    const hasMutes = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='friend_mutes'").get();
    if (hasMutes) {
      db.exec('DROP TABLE IF EXISTS friend_hides');
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

    CREATE TABLE IF NOT EXISTS pending_invites (
      id TEXT PRIMARY KEY,
      from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_token TEXT REFERENCES invite_links(token) ON DELETE SET NULL,
      dismissed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(from_user_id, to_user_id)
    );

    -- Retained after the link expires or is revoked: candidacy is what powers suggestions.
    CREATE TABLE IF NOT EXISTS link_participants (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL REFERENCES invite_links(token) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(token, user_id)
    );

    CREATE TABLE IF NOT EXISTS suggestion_dismissals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      other_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(user_id, other_user_id)
    );

    CREATE TABLE IF NOT EXISTS queued_notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      subject_name TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS waitlist (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      locale TEXT,
      ip TEXT,
      user_agent TEXT,
      notified_admin_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
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

  // invite_views (token, opener) generalised into pending_invites (from, to): the implicit
  // sender was always the link's creator.
  const inviteViewsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='invite_views'").get();
  if (inviteViewsExists) {
    db.exec(`
      INSERT OR IGNORE INTO pending_invites (id, from_user_id, to_user_id, source_token, dismissed, created_at)
      SELECT v.id, l.created_by, v.user_id, v.token, v.dismissed, v.created_at
      FROM invite_views v JOIN invite_links l ON l.token = v.token
      WHERE l.created_by <> v.user_id
    `);
    db.exec('DROP TABLE invite_views');
  }

  if (!cols.find(c => c.name === 'notif_friend_suggestions')) {
    db.exec('ALTER TABLE users ADD COLUMN notif_friend_suggestions INTEGER NOT NULL DEFAULT 1');
  }

  const inviteCols = db.pragma('table_info(invite_links)') as { name: string }[];
  if (!inviteCols.find(c => c.name === 'invited_email')) {
    db.exec('ALTER TABLE invite_links ADD COLUMN invited_email TEXT');
  }
  if (!inviteCols.find(c => c.name === 'name')) {
    db.exec('ALTER TABLE invite_links ADD COLUMN name TEXT');
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

  const hideCols = db.pragma('table_info(friend_hides)') as { name: string }[];
  if (!hideCols.find(c => c.name === 'expires_at')) {
    db.exec('ALTER TABLE friend_hides ADD COLUMN expires_at INTEGER');
  }

  const notifPrefCols = db.pragma('table_info(friend_notif_prefs)') as { name: string }[];
  if (!notifPrefCols.find(c => c.name === 'notif_window_start')) {
    db.exec('ALTER TABLE friend_notif_prefs ADD COLUMN notif_window_start INTEGER NOT NULL DEFAULT 0');
    db.exec('ALTER TABLE friend_notif_prefs ADD COLUMN notif_count INTEGER NOT NULL DEFAULT 0');
  }

  if (!statusCols.find(c => c.name === 'location')) {
    db.exec('ALTER TABLE statuses ADD COLUMN location TEXT');
  }
}

// Timed notifications move from per-record "_sent" flags to a jobs table
// (server/src/services/jobs.ts). Anything the flags say was already sent for a live
// record is carried over as a finished job, so the switch doesn't send it again.
// The old flag columns stay in place, unused, so the previous build can still run
// against this database if a deploy has to be rolled back.
function jobs(db: Database) {
  db.exec(`
    CREATE TABLE jobs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      type       TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      dedupe_key TEXT NOT NULL DEFAULT '',
      run_at     INTEGER NOT NULL,
      done_at    INTEGER,
      error      TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(type, subject_id, dedupe_key)
    );
    CREATE INDEX idx_jobs_due ON jobs(run_at) WHERE done_at IS NULL;
    CREATE INDEX idx_jobs_subject ON jobs(subject_id);
  `);

  const live = `closed_at IS NULL AND (closes_at > unixepoch() - 86400 OR starts_at > unixepoch())`;
  const liveS = `s.closed_at IS NULL AND (s.closes_at > unixepoch() - 86400 OR s.starts_at > unixepoch())`;
  db.exec(`
    INSERT OR IGNORE INTO jobs (type, subject_id, dedupe_key, run_at, done_at)
      SELECT 'door.notify_open', id, '', COALESCE(notify_at, created_at), unixepoch()
      FROM statuses WHERE notifications_sent = 1 AND ${live};
    INSERT OR IGNORE INTO jobs (type, subject_id, dedupe_key, run_at, done_at)
      SELECT 'door.closing_soon', id, CAST(closes_at AS TEXT), closes_at - 720, unixepoch()
      FROM statuses WHERE closing_notification_sent = 1 AND ${live};
    INSERT OR IGNORE INTO jobs (type, subject_id, dedupe_key, run_at, done_at)
      SELECT 'door.auto_closed', id, CAST(closes_at AS TEXT), closes_at, unixepoch()
      FROM statuses WHERE auto_close_notification_sent = 1 AND ${live};
    INSERT OR IGNORE INTO jobs (type, subject_id, dedupe_key, run_at, done_at)
      SELECT 'door.host_reminder', id, '', starts_at - COALESCE(reminder_minutes, 0) * 60, unixepoch()
      FROM statuses WHERE reminder_sent = 1 AND starts_at IS NOT NULL AND ${live};
    INSERT OR IGNORE INTO jobs (type, subject_id, dedupe_key, run_at, done_at)
      SELECT 'going.reminder_1', gs.id, '', s.starts_at, unixepoch()
      FROM going_signals gs JOIN statuses s ON s.id = gs.status_id
      WHERE gs.reminder_1_sent = 1 AND s.starts_at IS NOT NULL AND ${liveS};
    INSERT OR IGNORE INTO jobs (type, subject_id, dedupe_key, run_at, done_at)
      SELECT 'going.reminder_2', gs.id, '', s.starts_at, unixepoch()
      FROM going_signals gs JOIN statuses s ON s.id = gs.status_id
      WHERE gs.reminder_sent = 1 AND s.starts_at IS NOT NULL AND ${liveS};
  `);
}

// Revocable sign-in sessions (server/src/services/sessions.ts) replace 30-day JWTs.
// `id` is the SHA-256 of the token; the token itself is never stored.
function sessions(db: Database) {
  db.exec(`
    CREATE TABLE sessions (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
      last_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
      expires_at   INTEGER NOT NULL,
      user_agent   TEXT
    );
    CREATE INDEX idx_sessions_user ON sessions(user_id);
  `);
}

// Push tokens of iOS Live Activities showing an open door (services/live-activity.ts).
// Each activity has its own token, unrelated to the device's push token.
function liveActivities(db: Database) {
  db.exec(`
    CREATE TABLE live_activity_tokens (
      status_id  TEXT NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
      token      TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (status_id, token)
    );
  `);
}

// Push-to-start tokens (iOS 17.2+): one per signed-in device, so the server can put an
// open door on the Lock Screen without the app. Tied to the session, so signing out of
// the device drops it.
function liveActivityStartTokens(db: Database) {
  db.exec(`
    CREATE TABLE live_activity_start_tokens (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX idx_live_activity_start_tokens_user ON live_activity_start_tokens(user_id);
  `);
}

// Android installs that draw the open-door notification themselves say so when they
// register (door_live = 1). Only they get its data messages, and they skip the
// "closes in 10 minutes" push, which the notification replaces.
function pushTokenDoorLive(db: Database) {
  db.exec('ALTER TABLE push_tokens ADD COLUMN door_live INTEGER NOT NULL DEFAULT 0');
}

export const migrations: Migration[] = [
  { version: 1, name: 'baseline', up: baseline },
  { version: 2, name: 'jobs', up: jobs },
  { version: 3, name: 'sessions', up: sessions },
  { version: 4, name: 'live_activities', up: liveActivities },
  { version: 5, name: 'live_activity_start_tokens', up: liveActivityStartTokens },
  { version: 6, name: 'push_token_door_live', up: pushTokenDoorLive },
];

export function runMigrations(db: Database, list: Migration[] = migrations) {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (const m of list) {
    if (m.version <= current) continue;
    db.transaction(() => {
      m.up(db);
      db.pragma(`user_version = ${m.version}`);
    })();
    console.log(`[db] migrated to v${m.version} (${m.name})`);
  }
}
