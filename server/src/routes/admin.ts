import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

// GET /api/admin/metrics
router.get('/metrics', requireAuth, (req: AuthRequest, res) => {
  const adminEmails = getAdminEmails();
  const userEmail = (req.user as any)?.email?.toLowerCase();

  if (!adminEmails.length || !adminEmails.includes(userEmail)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;
  const WEEK = 7 * DAY;

  // ── Weekly pulse ──────────────────────────────────────────────
  function weeklyPulse(start: number, end: number) {
    const count = (event: string) =>
      (db.prepare('SELECT COUNT(*) as n FROM event_log WHERE event = ? AND ts >= ? AND ts < ?')
        .get(event, start, end) as any).n as number;

    const activeUsers = (db.prepare(`
      SELECT COUNT(DISTINCT user_id) as n FROM event_log
      WHERE event IN ('door.open', 'going.sent') AND user_id IS NOT NULL AND ts >= ? AND ts < ?
    `).get(start, end) as any).n as number;

    // A door "converted" if the same user received a going signal within 4h of opening
    const doorsWithGoing = (db.prepare(`
      SELECT COUNT(DISTINCT d.user_id) as n FROM event_log d
      WHERE d.event = 'door.open' AND d.ts >= ? AND d.ts < ?
        AND EXISTS (
          SELECT 1 FROM going_signals gs
          JOIN statuses s ON s.id = gs.status_id
          WHERE s.user_id = d.user_id AND gs.created_at BETWEEN d.ts AND d.ts + 14400
        )
    `).get(start, end) as any).n as number;

    return {
      signups: count('user.signup'),
      active_users: activeUsers,
      door_opens: count('door.open'),
      doors_with_going: doorsWithGoing,
      push_fails: count('push.fail'),
    };
  }

  const thisWeekStart = now - WEEK;
  const lastWeekStart = now - 2 * WEEK;
  const weekly = {
    this_week: weeklyPulse(thisWeekStart, now),
    last_week: weeklyPulse(lastWeekStart, thisWeekStart),
  };

  // ── 8-week trend ───────────────────────────────────────────────
  // Newest week first so the UI can render top-to-bottom = recent-to-old.
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = now - i * WEEK;
    const start = end - WEEK;
    const label = i === 0 ? 'This week' : i === 1 ? 'Last week' : `${i + 1} weeks ago`;
    return { label, ...weeklyPulse(start, end) };
  });

  // ── Signup funnel (last 30 days cohort) ───────────────────────
  // Each step is traced forward from the same cohort of signups,
  // so drop-offs are meaningful (not comparing different populations).
  const thirtyDaysAgo = now - 30 * DAY;

  const authPageViews = (db.prepare(`
    SELECT COUNT(*) as n FROM event_log
    WHERE event = 'page.auth_viewed'
      AND json_extract(data, '$.intent') = 'signup'
      AND ts >= ?
  `).get(thirtyDaysAgo) as any).n as number;

  const signups = (db.prepare(`
    SELECT COUNT(*) as n FROM event_log WHERE event = 'user.signup' AND ts >= ?
  `).get(thirtyDaysAgo) as any).n as number;

  const verifies = (db.prepare(`
    SELECT COUNT(*) as n FROM event_log WHERE event = 'user.verify' AND ts >= ?
  `).get(thirtyDaysAgo) as any).n as number;

  // Signup cohort members who opened a door (at any point — activation can lag signup)
  const firstDoor = (db.prepare(`
    SELECT COUNT(DISTINCT d.user_id) as n FROM event_log d
    WHERE d.event = 'door.open'
      AND d.user_id IN (SELECT user_id FROM event_log WHERE event = 'user.signup' AND ts >= ?)
  `).get(thirtyDaysAgo) as any).n as number;

  // Signup cohort members who had at least one person go to them
  const gotGoing = (db.prepare(`
    SELECT COUNT(DISTINCT s.user_id) as n FROM statuses s
    JOIN going_signals gs ON gs.status_id = s.id
    WHERE s.user_id IN (SELECT user_id FROM event_log WHERE event = 'user.signup' AND ts >= ?)
  `).get(thirtyDaysAgo) as any).n as number;

  const funnel = {
    window_days: 30,
    auth_page_views: authPageViews,
    signups,
    verifies,
    first_door: firstDoor,
    got_going: gotGoing,
  };

  // ── Invite funnel (last 30 days) ──────────────────────────────
  // Split by whether the door was live — views with an open door convert far better,
  // so conflating them hides the real conversion story.
  const inviteViews = (db.prepare(`
    SELECT COUNT(*) as n FROM event_log WHERE event = 'invite.viewed' AND ts >= ?
  `).get(thirtyDaysAgo) as any).n as number;

  const inviteViewsWithDoor = (db.prepare(`
    SELECT COUNT(*) as n FROM event_log
    WHERE event = 'invite.viewed' AND json_extract(data, '$.has_active_door') = 1 AND ts >= ?
  `).get(thirtyDaysAgo) as any).n as number;

  const guestGoings = (db.prepare(`
    SELECT COUNT(*) as n FROM event_log
    WHERE event = 'going.sent' AND json_extract(data, '$.is_guest') = 1 AND ts >= ?
  `).get(thirtyDaysAgo) as any).n as number;

  const inviteAccepted = (db.prepare(`
    SELECT COUNT(*) as n FROM event_log WHERE event = 'invite.accepted' AND ts >= ?
  `).get(thirtyDaysAgo) as any).n as number;

  const invite_funnel = {
    window_days: 30,
    views: inviteViews,
    views_with_live_door: inviteViewsWithDoor,
    guest_goings: guestGoings,
    accepted: inviteAccepted,
  };

  // ── Notification effectiveness (last 30 days) ─────────────────
  // These are the only push types where a downstream action proves the push did something.
  // Nudge → door open within 4h (gives time for user to get to a moment)
  function nudgeConversion(type: string) {
    return db.prepare(`
      SELECT COUNT(*) as sent,
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM event_log d
          WHERE d.user_id = n.user_id AND d.event = 'door.open'
            AND d.ts BETWEEN n.ts AND n.ts + 14400
        ) THEN 1 ELSE 0 END) as opened_door
      FROM event_log n
      WHERE n.event = 'nudge.sent' AND json_extract(n.data, '$.type') = ? AND n.ts >= ?
    `).get(type, thirtyDaysAgo) as { sent: number; opened_door: number };
  }

  // door_open push → going within 2h (tight window — they either act on it soon or not at all)
  const doorPush = db.prepare(`
    SELECT COUNT(*) as sent,
      SUM(CASE WHEN EXISTS (
        SELECT 1 FROM event_log g
        WHERE g.user_id = p.user_id AND g.event = 'going.sent'
          AND g.ts BETWEEN p.ts AND p.ts + 7200
      ) THEN 1 ELSE 0 END) as going_sent
    FROM event_log p
    WHERE p.event = 'push.sent' AND json_extract(p.data, '$.type') = 'door_open' AND p.ts >= ?
  `).get(thirtyDaysAgo) as { sent: number; going_sent: number };

  const push_effectiveness = {
    nudge: nudgeConversion('scheduled'),
    auto_nudge: nudgeConversion('auto'),
    door_open_push: doorPush,
  };

  // ── Push alarms (last 24h) ────────────────────────────────────
  const failCount = (db.prepare(`
    SELECT COUNT(*) as n FROM event_log WHERE event = 'push.fail' AND ts >= ?
  `).get(now - DAY) as any).n as number;

  const recentFails = db.prepare(`
    SELECT ts, user_id, data FROM event_log
    WHERE event = 'push.fail' AND ts >= ?
    ORDER BY ts DESC LIMIT 20
  `).all(now - DAY) as Array<{ ts: number; user_id: string; data: string }>;

  const push_alarms = {
    fails_24h: failCount,
    recent: recentFails.map(r => ({ ts: r.ts, ...JSON.parse(r.data ?? '{}') })),
  };

  res.json({ weekly, weeks, funnel, invite_funnel, push_effectiveness, push_alarms });
});

export default router;
