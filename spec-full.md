# dropby — Full Product Spec

## 1. Product Overview

dropby is a presence signal app. One tap tells your friends you're open to a spontaneous visit right now. No group chats, no planning — just a low-commitment "swing by if you're around" signal.

---

## 2. Platform

- Web app (React + Vite) wrapped in a native shell (Capacitor) for iOS and Android distribution
- Also installable as a PWA (Progressive Web App) from the browser — iOS requires Share → Add to Home Screen; Android shows an install prompt automatically
- Push notifications delivered via APNs (iOS) and FCM (Android)
- Authentication: email/password and Google OAuth. Apple OAuth is deferred.

---

## 3. Data Model

### Users
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| email | string unique | Lowercased on storage |
| display_name | string | Required on signup |
| password_hash | string nullable | Null for Google-only accounts |
| google_id | string unique nullable | Set when account is created or linked via Google OAuth |
| avatar_url | string nullable | Either a Google profile picture URL (set at Google signup) or a local path (`/avatars/<uuid>.jpg`) from a custom upload. Custom upload takes precedence — Google picture is only saved if no avatar_url exists yet |
| locale | string nullable | IETF language tag (e.g. `en-US`, `de`) sent by client at signup; used to localise transactional emails |
| timezone | string nullable | IANA timezone string e.g. `Europe/London`; sent by client on every authenticated request via `x-timezone` header; stored and updated automatically if the value changes |
| auto_nudge_enabled | boolean | Default true; controls the repeat-behaviour auto-nudge |
| avatar_seed | integer | Default 0; legacy field for seeded DiceBear avatar (superseded by avatar_url) |
| email_verified | boolean | Default false; must be true before password login is allowed |
| email_verification_token | string nullable | Cleared after successful verification |
| email_verification_expires_at | unix timestamp nullable | Cleared after successful verification |
| created_at | unix timestamp | |

### Friendships
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_a_id | uuid FK → users | Lower of the two UUIDs (canonical ordering) |
| user_b_id | uuid FK → users | Higher of the two UUIDs |
| created_at | unix timestamp | |

Stored as a single bidirectional row with a `UNIQUE(user_a_id, user_b_id)` constraint. Canonical order (lower UUID first) is enforced at insert time using `[a, b].sort()`. Queries must check both directions or use `OR`. When a friendship is deleted, the friend is immediately removed from all active status recipient lists for both users.

### Friend Mutes
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | The user doing the muting |
| muted_user_id | uuid FK → users | The friend being muted |
| created_at | unix timestamp | |

Muting is one-way. A muted friend still receives notifications when the muting user opens their door. Muted friends are excluded from the default recipient selection when opening the door. The muting user does not receive push notifications when the muted friend opens their door.

### Statuses
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | |
| note | string nullable | Max 60 chars |
| closes_at | unix timestamp | Creation time + 1800 seconds; updated on each prolong (+1800 seconds) |
| closed_at | unix timestamp nullable | Set when manually closed; null = still active |
| closing_notification_sent | boolean | Default false; set to true after the 10-min-before-close push is sent |
| created_at | unix timestamp | |

A user may have at most one active status at a time. A status is considered active when `closed_at IS NULL AND closes_at > now()`.

### Going Signals
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| status_id | uuid FK → statuses | |
| user_id | uuid FK → users nullable | Null for guest Going signals |
| guest_contact_id | uuid FK → guest_contacts nullable | Set for guest Going signals when contact info was provided |
| created_at | unix timestamp | |

Unique constraint on `(status_id, user_id)` for logged-in users — one signal per user per status. No cap for guest signals.

### Status Recipients
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| status_id | uuid FK → statuses | |
| user_id | uuid FK → users | |
| added_at | unix timestamp | |

Unique constraint on `(status_id, user_id)`.

### Recipient Sessions
| Field | Type | Notes |
|---|---|---|
| user_id | uuid PK FK → users | One row per user |
| selected_ids | JSON string | Array of friend user IDs selected in the most recent session |
| updated_at | unix timestamp | |

Persists the recipient selection across sessions. Read on door close, written on door open. Used to restore the previous selection as the default next time the user opens the door.

### Invite Links
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| token | string unique | 16-char hex string |
| created_by | uuid FK → users | |
| status_id | uuid FK → statuses nullable | Set if link was generated from an active status context |
| invited_email | string nullable | Set for email invites; the email address the invite was sent to |
| revoked | boolean | Default false |
| expires_at | unix timestamp | 24 hours for link-share invites; 30 days for email invites |
| created_at | unix timestamp | |

Invite links are the sole mechanism for forming friendships. They are multi-use — multiple people can accept the same link. Each tap on "Copy invite link" generates a fresh link. Revoked or expired links return appropriate errors.

### User Notes (Saved)
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | |
| text | string | Max 60 chars |
| hidden | boolean | Default false; user can hide without deleting |
| created_at | unix timestamp | |

Saved automatically when the user submits a custom (hand-typed) note. Synced via backend; visible as chips in the Home screen's saved-note row.

### Nudge Schedules
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | |
| day_of_week | enum: mon, tue, wed, thu, fri, sat, sun | |
| hour | integer | 0–23, in the user's local timezone |
| last_sent_at | unix timestamp nullable | Updated each time a nudge fires for this slot |
| created_at | unix timestamp | |

One row per nudge slot. No cap. Notifications fire server-side at the scheduled local time using the stored `timezone`.

### Auto Nudge Log
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | |
| sent_at | unix timestamp | |

Used to enforce the 1-per-week cap on the auto-nudge (repeat behaviour). A new auto-nudge is only sent if no row for this user exists within the past 7 days.

### Guest Contacts
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | string | First name from web Going form |
| contact | string nullable | Email or phone; null if not provided |
| marketing_consent | boolean | Default false |
| status_id | uuid FK → statuses | |
| created_at | unix timestamp | |

Created when a non-logged-in user submits the web Going form with contact info. If `marketing_consent` is true, a welcome message is sent with an app download link.

### Push Tokens
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | |
| token | string | APNs device token or FCM registration token |
| platform | enum: ios, android | |
| created_at | unix timestamp | |
| updated_at | unix timestamp | |

Unique constraint on `(user_id, token)`. Multiple devices per user are supported. Upserted on each app launch.

---

## 4. Views & Screens

### Landing Page (`/`)

Shown to unauthenticated users visiting the root.

- Tagline and sub-tagline communicating the core concept
- "How it works" 3-step walkthrough:
  1. Open your door — pick a vibe and tap open; door is open for 30 minutes
  2. Share the link — send it to whoever might want to swing by
  3. They drop by — no planning, no back and forth
- "Get started" button → `/auth`
- No navigation bar

---

### Auth Page (`/auth`)

- Login / Sign up tabs (defaults to Login; switches to Sign Up automatically when arriving via an invite link)
- If arriving via an invite link (i.e. `?redirect=/invite/:token`), the inviter's avatar and name are shown above the form with the prompt "Sign up to connect with [name]"
- Tabs: Login / Sign up
- Google OAuth button ("Continue with Google")
- Email + password form:
  - Sign up fields: display name (required), email, password
  - Login fields: email, password
  - Sign up: creates account, sends verification email, shows "Check your email to confirm your account before logging in" message, switches to Login tab
  - Login: blocked with "Please verify your email" error + resend link if email not verified
- Supports `?redirect=` query param for post-auth routing

**Email verification**
- After signup, the user receives an email with a link to `/verify-email?token=<token>`
- If the user signed up in the context of an invite link, the redirect is preserved: `/verify-email?token=<token>&redirect=/invite/:token`
- See Verify Email Page for the verification flow

---

### Verify Email Page (`/verify-email`)

Dedicated frontend page that handles email verification — never done via a direct API link, to avoid email scanner pre-fetching consuming the one-time token.

- Reads `?token=` and optionally `?redirect=` from the URL
- On mount, POSTs the token to `POST /api/auth/verify-email`
- **Loading state**: spinner + "Verifying your email…"
- **Success**: checkmark icon + "You're in!" + "Taking you to dropby…" → auto-logged in (server returns JWT) → navigated to `redirect` param or `/home` after 1.5s
- **Error** (token not found, expired, or already used): "Link expired or invalid" + "Back to sign in" button → `/auth`

Old-style links (`GET /api/auth/verify-email/:token`) are redirected server-side to `/verify-email?token=:token` for backward compatibility.

---

### Home — Door Closed (`/home`, default state)

**Header**
- Top-right: `UserMenu` — avatar + first name, tappable, navigates to `/profile`
- No text greeting; the UserMenu serves as the identity anchor

**Note selection**
- Two separate horizontally scrollable chip rows:
  - **Suggestion chips** (row 1): up to 7 contextual suggestions, no delete button
  - **Saved notes** (row 2): user's saved notes, each with an × to hide; only shown when at least one saved note exists
- Suggestions are curated presets selected contextually by: time of day, day of week (weekday vs weekend), season, and locale. No server round-trip — selected client-side from a locale-specific pool.
- Free-text input below chips (max 60 chars); placeholder "Or write your own note…"
- Tapping a chip populates the text field with that chip's text; the chip highlights as selected
- Tapping the selected chip again deselects it and clears the field (restoring any hand-typed text that existed before the chip was selected)
- Switching directly from one chip to another replaces the field text with the new chip's text; no undo state is preserved
- Editing the text field after picking a chip immediately deselects the chip
- A note is auto-saved to the user's library only when submitted with no chip selected (i.e. hand-typed or modified after picking); submitting an unmodified chip never triggers a save

**Recipient selection**
- Checkbox list of all friends
- Default selection logic:
  - First time ever: all non-muted friends checked
  - Subsequent opens: restore the exact selection from `recipient_sessions`, excluding anyone since removed as a friend; muted friends are unchecked by default
- Muted friends shown in a separate "Muted" section, unchecked by default
- If the user has no friends, the recipient section is hidden entirely

**Open door button**
- "Open 30 min 🚪"
- On first tap ever: trigger OS notification permission prompt before proceeding (if not already granted)
- Creates a status with the selected note and recipients
- Navigates to Door Open view

**Tips section** (below open door button)

Two tips are shown, one at a time, in priority order. Each can be permanently dismissed with an × button. Dismissal is stored in `localStorage`. Setting a reminder from the nudge tip, or copying an invite link from the invite tip, shows a toast confirmation and hides that tip.

1. **Nudge tip** — shown only if the user has no nudge reminders set AND has not permanently dismissed this tip
   - Text explains the nudge reminder feature
   - Suggests a specific day/time (e.g. "Saturday at 11am")
   - "Yes, remind me" button: adds the suggested reminder immediately, hides the tip, shows toast: "Reminder saved! You can change it in your [Profile →]"
   - "Choose another time" link → navigates to `/profile?addReminder=1`
   - × button: permanently dismisses

2. **Invite tip** — shown only if the nudge tip is not shown (or has been dismissed) AND has not been permanently dismissed
   - Text: "Want to see your friends more? Add them to your Dropby."
   - Link: "Copy invite link →" — generates and copies a fresh link, shows toast: "Invite link copied!"
   - × button: permanently dismisses

---

### Home — Door Open (`/home`, active state)

**Header**
- Top-right: `UserMenu` — same as Door Closed view
- "You're open!" status indicator with the active note below (if any)
- Countdown: "Closes in X min"
- "Keep it open +30 min" button — appears when ≤ 20 minutes remain; extends `closes_at` by 30 minutes; unlimited prolongs

**Recipient list**
- Each recipient: avatar, display name
- "Notified" label if they were sent a push notification when the door opened
- "On their way ✅" label if they've sent a Going signal
- × button to remove with 3-second undo pattern (see Core Behaviors)

**Invite link row**
- "Anyone with link" row — tap to copy a fresh 24-hour invite link with `status_id` attached

**Going signals from non-friends** (guests)
- Guest names shown in the going signals section when they submit the web Going form

**Actions**
- "Add more / Edit" button → Door Open Edit view
- "Close now" link → immediately closes the status, returns to Door Closed view

---

### Home — Door Open Edit View

Accessible via "Add more / Edit".

- Sticky banner: pulsing dot + "Your door is open — tap to go back" (tappable)
- Editable note field (same chip UX as Door Closed view, pre-populated with current note)
- Editable recipient list with same checkbox/muted logic
- "Save changes" button → updates status, returns to Door Open view

---

### Home — Friend Has Door Open

Shown at the top of the Home screen when one or more friends have an active status that includes the current user as a recipient. Updates in real time via SSE.

- One card per open friend: avatar, display name, note (if any), time remaining
- "I'm going ✅" button per card
  - One tap, no confirmation
  - Sends push notification to host: "[name] said, they are going!"
  - On first tap ever (across the whole app): triggers OS notification permission prompt
  - After tapping: button replaced with a non-interactive "On my way" confirmation state

Both the friend's open door section and the user's own door UI are visible simultaneously when both are active.

---

### Friends Page (`/friends`)

**Header actions**
- "Invite" button: generates and copies a fresh 24-hour invite link; shows toast "Invite link copied!"
- "Add" button: opens Add Friend modal

**Search**
- Client-side filter on the loaded friend list

**Friend list**

Active friends:
- Each row: avatar, display name, mute button (🔇), remove button (×)
- Mute: moves friend to Muted section
- Remove: shows confirmation dialog

Muted friends (below active, only if non-empty):
- Each row: avatar, display name, "Unmute" button, remove button (×)
- Unmute: moves back to active section
- Remove: shows confirmation dialog

Remove confirmation: "Remove [name] as a friend? This cannot be undone." — Confirm / Cancel

Empty state (no friends): invite link CTA + Add Friend CTA

**Pending invites section** (below friend list, only if non-empty)
- Shows email addresses of pending email invites that haven't been accepted yet
- Each row: email address, × to cancel (revokes the invite link)
- Title: "Pending"

**Add Friend modal**
- Email input (type="email")
- "Send invite" button
- Sends a 30-day invite link to the email address via Resend transactional email
- The email mentions who is inviting them ("[Name] wants to connect with you on dropby")
- Success state: "Invite sent!" with an "Invite someone else" link to reset the form
- Error state: "Couldn't send invite" with ability to retry
- Sending state: button shows "Sending…"

---

### Invite Page (`/invite/:token`)

**Token valid, user not logged in, host door is open**
- Host avatar, display name, and note shown
- "I'm going 🏃" button → opens web Going modal
- "Sign up / Log in to join dropby" link → `/auth?redirect=/invite/:token`

**Token valid, user not logged in, host door is closed**
- Redirect to `/auth?redirect=/invite/:token`

**Token valid, user logged in, not yet friends**
- Auto-accepts: creates friendship
- If inviter's door is still open: new friend is silently added as a recipient; success screen shows "You're now friends!" + host's open door card with "Going ✅" button
- If inviter's door is closed: success screen shows "You and [name] are now friends on dropby" + "Go home" button

**Token valid, user logged in, already friends**
- No new friendship
- If host's door is open: show the open door card
- If host's door is closed: show "You're already friends" + "Go home"

**Token valid, own link**
- "That's your own link! Share it with friends to join dropby."

**Token expired**
- "This invite expired [relative time] ago" — relative time rounds down (e.g. 1h 45min → "1 hour ago")
- "Go home" button

**Token not found / revoked**
- "This invite link is invalid."
- "Go home" button

---

### Web Going Modal (within `/invite/:token`)

Shown when a non-logged-in user taps "Going ✅" on an open door.

- First name (required)
- Email or phone (optional); if provided, checkbox appears: "Send me a link to the app" (default unchecked)
- Submit: "I'm on my way! 🏃" / loading: "Sending…"
- On submit:
  - Push notification sent to host: "[name] said, they are going!"
  - If contact + consent: welcome message sent, guest_contacts row created
  - Success state: "They know you're coming! 🎉" — no further action needed
- Validation: first name required, shown inline

---

### Profile Page (`/profile`)

Accessible via the back-arrow header of Home.

**Header**
- Avatar (tappable) — opens avatar crop modal
- Page title "Profile"
- Back arrow → `/home`

**Avatar**
- Default: DiceBear geometric shape (deterministic from user ID seed)
- If `avatar_url` is set: shows the stored image (Google profile picture or custom upload)
- Tapping opens the avatar crop modal:
  - Step 1: "Choose photo" file picker (accepts image/*)
  - Step 2: circular crop with pinch/slider zoom; "Change photo" to re-pick
  - "Save" button: crops client-side on a 400×400 canvas, uploads as JPEG to `PUT /api/auth/avatar`, updates avatar immediately

**Display name**
- Shown with an "Edit" button
- Inline edit: text input + Save / Cancel
- Saved via `PUT /api/auth/me`

**Email**
- Read-only

**Language selector**
- Dropdown: English (US), English (UK), Deutsch, Español, Français
- Changes app language immediately (stored in i18next's localStorage persistence)

**Reminders section**
- Description: "We'll send you a notification to open your door."
- "Add +" button top-right → opens Add Reminder modal
- If no reminders set: shows the suggested time (Saturday 11am) with an inline "+ Add" button for one-tap add
- If reminders exist: lists each (day + formatted time), each with an × to remove

**Add Reminder modal**
- Day picker (Mon–Sun grid)
- Time picker (7am–10pm grid, shown in 12h or 24h format based on locale)
- Suggested slot highlighted: first suggestion is Saturday 11am; subsequent suggestions are contextually derived (after Saturday morning → Saturday 3pm; after Saturday → Sunday 7pm; after a weekend slot → next weekday 7pm)
- "Yes, this time" shortcut to accept suggestion
- "Add reminder" button

**Auto-nudge toggle**
- "Remind me when I opened my door this time last week"
- On by default; toggle persisted via `PUT /api/auth/me { auto_nudge_enabled }`

**Log out**
- Button at the bottom: "Log out"
- Clears auth state (JWT removed from localStorage, store cleared)
- Redirects to `/`
- No confirmation dialog

**Delete account**
- Below logout
- Confirmation dialog: "This will permanently delete your account, friends, and all your data. This cannot be undone."
- On confirm: deletes all user data server-side, clears auth, redirects to `/`

---

## 5. Navigation

- **Unauthenticated**: Landing (`/`) and Auth (`/auth`) are standalone with no nav bar. `/verify-email` and `/invite/:token` are also accessible without auth.
- **Authenticated**: Bottom tab bar with two tabs — **Home** and **Friends**. Profile is reachable from Home's header, not a tab.
- The `*` catch-all redirects to `/`.

---

## 6. Core Behaviors

### Opening the Door

1. User selects a note (optional) and recipients
2. Taps "Open 30 min 🚪"
3. If first time: OS notification permission prompt fires
4. `POST /api/statuses` creates a status with `closes_at = now() + 1800`
5. Push notifications sent to all selected recipients who have granted OS permission (muted friends excluded)
6. Recipient selection is saved to `recipient_sessions` for next time

### Prolonging

- "Keep it open +30 min" appears when `closes_at - now() ≤ 20 min`
- Tapping sets `closes_at = closes_at + 30 min`
- Unlimited prolongs
- 10-minute-before-close push notification sent once per status (`closing_notification_sent` flag):
  - Copy: "Your door closes in 10 minutes"
  - Actions: "Keep open" (prolongs without opening app), "Close now", default tap → app Door Open view

### Closing the Door

- Manual: "Close now" sets `closed_at = now()`
- Automatic: server-side job expires statuses where `closed_at IS NULL AND closes_at < now()`

### Recipient Removal (Undo Pattern)

- Tap × on a recipient → row shows strikethrough + "Undo (Xs)" countdown
- After 3 seconds with no undo: API call removes recipient from `status_recipients`
- Tapping "Undo" within 3 seconds cancels the timer and no API call is made

### Friend Removal

- Deletes the `friendships` row
- Immediately removes the ex-friend from all active `status_recipients` rows for both users

### Muting a Friend

- Creates a `friend_mutes` row
- Muted friend is unchecked by default in recipient selection
- The muting user does not receive push notifications when the muted friend opens their door
- Muted friend still receives notifications when the muting user opens their door (unless that friend also muted the opener)

### Connection Patterns — Invite Links

Friendships are formed exclusively via invite links. There is no search, no directory, no follow request.

**Generating a link**
- Any logged-in user can generate a link at any time from the Friends page, the Door Open view, or the Home tips section
- Links are 24 hours, multi-use
- If generated from the Door Open view or inline in Home, `status_id` is set — enables session-aware acceptance behaviour
- Each tap generates a fresh link (no reuse)

**Sending by email**
- From the Add Friend modal on the Friends page
- Generates a 30-day link with `invited_email` set
- Sends a Resend transactional email: "[Name] wants to connect with you on dropby. [Accept invite link]"
- The invite appears in the Pending section until accepted or cancelled

**Accepting a link — all cases**

| Recipient state | Host door | Outcome |
|---|---|---|
| Logged in, not yet friends | Open | Friendship created; recipient silently added as status recipient; success screen shows open door |
| Logged in, not yet friends | Closed | Friendship created; success screen confirms connection |
| Logged in, already friends | Open | No new friendship; shows open door card |
| Logged in, already friends | Closed | No new friendship; "Go home" |
| Logged in, own link | Either | No-op; friendly message |
| Not logged in | Open | Door card shown; can signal Going as guest; "Sign up / Log in" link below |
| Not logged in | Closed | Redirected to `/auth?redirect=/invite/:token` |

**New user signup via invite link**

The redirect destination must survive signup → email verification → login:

1. Arrive at `/invite/:token` (door closed) → redirected to `/auth?redirect=/invite/:token`
2. Sign up; client sends `redirect_url=/invite/:token` alongside credentials
3. Server embeds redirect in verification email link: `/verify-email?token=<token>&redirect=/invite/:token`
4. User clicks link → `/verify-email` verifies and auto-logs in → navigates to `/invite/:token`
5. Invite page auto-accepts and shows success state

### Contextual Note Suggestions

- Curated locale-specific presets, selected client-side from a pool per locale (en-US, en-GB, de, es, fr)
- No server round-trip; no AI
- Selection factors: hour of day (morning / afternoon / evening), season (spring / summer / autumn / winter), day type (weekday / weekend)
- Up to 7 suggestions shown in the first chip row
- Alcohol-free across all locales

### "Going ✅"

- Available on each open friend's card on the Home screen
- One tap, no confirmation, one signal per user per status
- After tapping: button replaced with non-interactive confirmed state
- Sends push notification to host: "[name] said, they are going!"
- Triggers OS notification permission prompt on first use (if not yet granted)

### Push Notifications

Sent via FCM (Android) and APNs (iOS).

| Event | Recipient | Copy |
|---|---|---|
| Friend opens door | All selected recipients with OS permission | "[Name]'s door is open" |
| Going signal received | Door opener | "[Name] said, they are going!" |
| 10 min before close | Door opener | "Your door closes in 10 minutes" |
| Nudge reminder | User themselves | "Hey, got a free [day]? Open your door" |
| Auto-nudge | User themselves | "You opened your door this time last week — open it again?" |

Muting user A suppresses:
- A being notified when the muting user opens their door (A is unchecked by default)
- The muting user receiving notifications when A opens their door

### Nudge Reminders

- Set per user on the Profile page (day + hour, stored in `nudge_schedules`)
- Server checks every minute for due nudges based on each user's stored timezone
- Suppressed if user already has an active status at the scheduled time
- No cap on number of slots

### Auto-Nudge (Repeat Behaviour)

- Controlled by `auto_nudge_enabled` (default true)
- Fires if: the user opened their door within ±2 hours of the current local time exactly 7 days ago, and has not yet opened their door this week in that window, and no auto-nudge has been sent in the last 7 days
- Suppressed if door is already open
- Suppressed if a scheduled nudge already fired earlier the same day
- Capped at 1 per 7 days (tracked via `auto_nudge_log`)

### Avatar

- At signup via Google OAuth: the Google profile picture URL is saved as `avatar_url`
- Custom upload (Profile page): image is cropped client-side to 400×400 JPEG, uploaded to server, stored at `data/avatars/<uuid>.jpg`, served as a static file at `/avatars/<uuid>.jpg`
- Custom upload always takes precedence; Google picture is only saved if no `avatar_url` exists yet
- Fallback: DiceBear geometric shape generated deterministically from the user's ID seed

### Real-Time Updates (SSE)

The app maintains a persistent SSE connection (`GET /api/sse`) for real-time Home screen updates. Events:
- Friend opens or closes their door
- Going signal received

No polling; the Home screen reflects friend state changes immediately.

### Email Verification

- Token is a 32-char hex UUID (no dashes)
- Expires 24 hours after generation
- Sent via Resend transactional email, localised based on `locale`
- Verification link points to `/verify-email?token=<token>` (frontend page), not the API directly
- The server's `POST /api/auth/verify-email` verifies the token, sets `email_verified = 1`, clears the token fields, and returns a JWT for immediate auto-login
- Tokens are single-use: once verified, the token fields are cleared and the link cannot be used again

---

## 7. Authentication & Session

- JWT-based; token stored in localStorage
- Sent on every request via `Authorization: Bearer <token>` header
- No server-side session; logout is purely client-side (clear token + auth store, redirect to `/`)
- Google OAuth: credential verified server-side via `google-auth-library`; account created on first use or linked to existing account by email
- Email not verified for Google accounts (Google guarantees ownership)

---

## 8. Internationalisation

- 5 locales: `en-US`, `en-GB`, `de`, `es`, `fr`
- Language stored in i18next's localStorage persistence
- Language selector on the Profile page
- Transactional emails (verification, invite) sent in the user's stored locale
- Time display: 12h for en-US/en-GB, 24h for de/es/fr
- Note suggestions are locale-specific pools (see Contextual Note Suggestions)

---

## 9. Feedback Tool

### Purpose
Lets users share thoughts on whether dropby is helping make real moments happen, and report bugs or oddities. Designed to feel inviting, not clinical.

### Entry Points
1. **Home tip card** — dismissible card in TipsSection (localStorage key `tip_feedback_dismissed`), shown after nudge and invite tip cards are resolved. Copy: "Enjoying dropby? Your feedback shapes what gets built next." with a "Share thoughts →" button.
2. **Profile page** — "Share feedback" button above Logout, always visible.

### FeedbackModal
- **Type selector**: two pill buttons — "How it's going" / "Report a bug"
- **Textarea**: inviting placeholder (changes per type), max 1000 chars
- **Opt-in checkbox**: "You can reach me for follow-up" — unchecked by default
- **Email field**: shown only when opt-in is checked; pre-filled with logged-in user's email, editable
- **Submit** → success screen with thank-you message

### Data Model — `feedback` table
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK nullable | References `users(id) ON DELETE SET NULL` — feedback preserved if user deletes account |
| type | text | `'thought'` or `'bug'` |
| message | text | 1–1000 chars |
| reply_email | text nullable | Only stored when user opts in |
| created_at | integer | Unix epoch |

### API
`POST /api/feedback` — requires auth. Body: `{ type, message, reply_email? }`. Returns `201 { id }`.

