import cron from 'node-cron';
import { db } from './db/index.js';
import { flushQueuedNotifications } from './services/notifications.js';
import { sendWaitlistDigest } from './services/email.js';
import {
  runDueJobs, syncAllLiveJobs, purgeOldJobs, runScheduledNudges, runAutoNudges, runReengagement,
} from './services/jobs.js';

// Timed notifications about a specific door or RSVP are rows in `jobs` (see
// services/jobs.ts). Recompute them for every live record on boot, then run whatever
// is due every 10 seconds.
syncAllLiveJobs();
setInterval(() => runDueJobs(), 10_000);

// Every minute: send the coalesced connection pushes queued since the last run, so a
// burst of accepts or link opens arrives as one notification rather than several.
cron.schedule('* * * * *', () => {
  flushQueuedNotifications();
});

// Every minute: fire scheduled nudges (catches up after a restart; see runScheduledNudges)
cron.schedule('* * * * *', () => {
  runScheduledNudges();
});

// On the hour: auto-nudge users who opened their door at this hour on a recent day
cron.schedule('0 * * * *', () => {
  runAutoNudges();
});

// Daily at 12:00 UTC: re-engagement nudge for users who haven't opened in 7+ days
cron.schedule('0 12 * * *', () => {
  runReengagement();
});

// Daily at 03:00 UTC: drop finished jobs older than 30 days
cron.schedule('0 3 * * *', () => {
  const purged = purgeOldJobs();
  if (purged > 0) console.log(`[cron] purged ${purged} finished jobs`);
});

// Daily at 03:00 UTC: purge expired temporary mutes
cron.schedule('0 3 * * *', () => {
  const now = Math.floor(Date.now() / 1000);
  const result = db.prepare('DELETE FROM friend_hides WHERE expires_at IS NOT NULL AND expires_at <= ?').run(now);
  if (result.changes > 0) {
    console.log(`[cron] purged ${result.changes} expired friend mutes`);
  }
});

// Daily at 09:00 UTC: email a digest of new waitlist entries to the admin address.
// Skipped entirely when there's nothing new — satisfies "up to once a day".
cron.schedule('0 9 * * *', async () => {
  const entries = db.prepare(`
    SELECT email, locale, created_at
    FROM waitlist
    WHERE notified_admin_at IS NULL
    ORDER BY created_at ASC
  `).all() as Array<{ email: string; locale: string | null; created_at: number }>;

  if (!entries.length) return;

  const to = process.env.WAITLIST_DIGEST_TO || 'hi@dropby.cc';
  try {
    await sendWaitlistDigest(to, entries);
    const now = Math.floor(Date.now() / 1000);
    db.prepare('UPDATE waitlist SET notified_admin_at = ? WHERE notified_admin_at IS NULL').run(now);
    console.log(`[cron] waitlist digest sent to ${to} (${entries.length} entries)`);
  } catch (err) {
    console.error('[cron] waitlist digest failed:', err);
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
