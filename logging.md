# Event logging

All events are written to the `event_log` SQLite table via `server/src/services/analytics.ts`:

```
id      INTEGER  autoincrement
ts      INTEGER  unix timestamp (seconds)
event   TEXT
user_id TEXT     nullable — null for unauthenticated actions
data    TEXT     JSON blob, nullable
```

Rows older than 12 months are purged nightly (03:00 UTC) except `user.signup` and `user.verify`, which are kept forever.

---

## Events

### `user.signup`
Emitted when a new account is created.

| field    | value              |
|----------|--------------------|
| `method` | `"email"` or `"google"` |

Source: `server/src/routes/auth.ts` (email signup and Google OAuth callback)

---

### `user.verify`
Emitted when a user clicks their email verification link and the token is accepted.

No data fields.

Source: `server/src/routes/auth.ts`

---

### `session.start`
Emitted when a user establishes an SSE connection (i.e. opens the app). Throttled to once per hour per user to avoid SSE-reconnect inflation.

No data fields.

Source: `server/src/routes/events.ts`

---

### `page.auth_viewed`
Emitted by the client via `POST /api/track` when the auth page is viewed with signup intent.

| field    | value      |
|----------|------------|
| `intent` | `"signup"` |

Source: `server/src/routes/track.ts` (client-side call)

---

### `chip.selected`
Emitted when a user selects a suggestion chip (not saved notes — those contain personal text).

| field   | value                                                  |
|---------|--------------------------------------------------------|
| `chip`  | `"im_home"` for the "I'm home" chip, `"suggestion"` for contextual ones |
| `index` | 0-based position in the displayed chip list            |

`user_id` is set if the user is authenticated (they always are when on the home screen).

Source: `client/src/pages/Home.tsx` via `POST /api/track`

---

### `door.open`
Emitted when a user opens their door (creates an active status).

| field        | value                              |
|--------------|------------------------------------|
| `recipients` | number of friends notified         |
| `has_note`   | `true` if a note was included      |

Source: `server/src/routes/status.ts`

---

### `going.sent`
Emitted when someone sends a going signal.

| field      | value                                               |
|------------|-----------------------------------------------------|
| `rsvp`     | the rsvp value (e.g. `"going"`)                    |
| `is_guest` | `true` for unauthenticated guests, `false` for users |

`user_id` is `null` for guest going signals.

Source: `server/src/routes/going.ts`

---

### `invite.viewed`
Emitted when an invite link is opened.

| field             | value                                      |
|-------------------|--------------------------------------------|
| `has_active_door` | `true` if the host's door is currently open |

`user_id` is the viewer's id if logged in, `null` if not.

Source: `server/src/routes/invites.ts`

---

### `invite.accepted`
Emitted when a viewer accepts a friend invite (creates a friendship).

No data fields.

Source: `server/src/routes/invites.ts`

---

### `nudge.sent`
Emitted when a nudge push notification is sent.

| field  | value                         |
|--------|-------------------------------|
| `type` | `"scheduled"` or `"auto"` |

- `"scheduled"` — matches a user-configured nudge schedule
- `"auto"` — auto-nudge based on prior door-open pattern

Source: `server/src/cron.ts`

---

### `push.sent`
Emitted when a door-open push notification is sent to a friend.

| field  | value         |
|--------|---------------|
| `type` | `"door_open"` |

Source: `server/src/services/notifications.ts`

---

### `push.fail`
Emitted when a push notification delivery fails.

| field      | value                             |
|------------|-----------------------------------|
| `type`     | notification type, or `"unknown"` |
| `platform` | `"apns"` or `"fcm"`               |
| `error`    | error message string              |

Source: `server/src/services/notifications.ts`

---

## Retention

- All events except `user.signup` and `user.verify` are deleted after 12 months (daily cron in `server/src/cron.ts`).
- `user.signup` and `user.verify` are kept indefinitely — they are one-time, low-volume, and useful for long-term cohort analysis.

---

## Dashboard

The admin dashboard at `/admin` queries `event_log` to produce:

- **Weekly pulse** — this week vs last week: signups, active users, door opens, doors-with-going, push failures
- **8-week trend** — same metrics per week for the last 8 weeks
- **Signup funnel** — 30-day cohort from auth-page-view through to receiving a going signal
- **Invite funnel** — 30-day views split by whether the host's door was live
- **Notification effectiveness** — nudge → door-open within 4h; door-open push → going within 2h
- **Push alarms** — push failures in the last 24h

---

## Testing

In `NODE_ENV=test` the server mounts test-only endpoints at `/api/test`:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/test/reset` | Delete all `*@dropby.test` users and their event_log rows |
| `GET /api/test/events/:userId?since=<ts>` | Return recent events for a user (newest first, max 100) |

The `getEvents(userId, since?)` helper in `tests/helpers/server.ts` wraps the events endpoint. Use it in specs to assert that the right events fired:

```ts
import { getEvents } from '../helpers/server';

const events = await getEvents(aliceId);
expect(events.some(e => e.event === 'door.open')).toBe(true);
expect(events.some(e => e.event === 'going.sent' && e.is_guest === false)).toBe(true);
```
