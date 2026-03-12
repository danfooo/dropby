# Drop By — Full Product Spec

## 1. Product Overview

Drop By is a presence signal app. One tap tells your friends you're open to a spontaneous visit right now. No group chats, no planning — just a low-commitment "swing by if you're around" signal.

---

## 2. Platform

- Web app wrapped in a native shell (Capacitor) for iOS and Android
- Distributed via App Store and Google Play
- Push notifications delivered via APNs (iOS) and FCM (Android)

---

## 3. Data Model

### Users
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| email | string unique | |
| display_name | string | Required on signup |
| avatar_initial | string | Derived from display_name at render time, not stored |
| timezone | string nullable | IANA timezone string e.g. "Europe/London"; set on first authenticated request, updated automatically if the value sent by the client differs from the stored value |
| auto_nudge_enabled | boolean | Default true; controls the repeat-behaviour auto-nudge |
| created_at | timestamp | |

### Friendships
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_a_id | uuid FK → users | |
| user_b_id | uuid FK → users | |
| created_at | timestamp | |

Stored as a single bidirectional row. Queries check both directions. When a friendship is deleted, the friend is immediately removed from all active status recipient lists.

### Friend Mutes
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | The user doing the muting |
| muted_user_id | uuid FK → users | The friend being muted |
| created_at | timestamp | |

Muting is one-way. A muted friend still receives notifications when the muting user opens their door. Muted friends are excluded from the default recipient selection when opening the door.

### Statuses
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | |
| note | string nullable | Max 60 chars |
| closes_at | timestamp | Creation time + 30 min; updated on each prolong (+30 min) |
| closed_at | timestamp nullable | Set when manually closed; null = still active |
| created_at | timestamp | |

A user may have at most one active status at a time. A status is considered active when `closed_at IS NULL AND closes_at > now()`.

### Going Signals
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| status_id | uuid FK → statuses | |
| user_id | uuid FK → users nullable | Null for web (guest) Going signals |
| guest_contact_id | uuid FK → guest_contacts nullable | Set for web guest Going signals |
| created_at | timestamp | |

Unique constraint on `(status_id, user_id)` for logged-in users. One Going signal per user per status. The "Going ✅" button is hidden (or shown as already-tapped) after the user has sent a signal for that status.

### Status Recipients
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| status_id | uuid FK → statuses | |
| user_id | uuid FK → users | |
| added_at | timestamp | |

### Invite Links
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| token | string unique | |
| created_by | uuid FK → users | |
| status_id | uuid FK → statuses nullable | Set if the link was generated from an active status context |
| expires_at | timestamp | Created_at + 1 hour |
| created_at | timestamp | |

Invite links are a first-class friendship primitive — independent of any active status. They can be generated at any time: from the friends page, the Door Open view, or the Home screen. They are multi-use and expire after 1 hour. When accepted, they create a bidirectional friendship. If `status_id` is set and that status is still active, the new friend is automatically added as a recipient. Invite links can later be revoked independently of any status.

### User Notes (Saved)
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | |
| text | string | Max 60 chars |
| hidden | boolean | Default false; user can hide without deleting |
| created_at | timestamp | |

Saved automatically when the user uses a custom note. Synced across devices via backend.

### Nudge Schedules
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | |
| day_of_week | enum: mon–sun | |
| hour | integer | 0–23, user's local time |
| created_at | timestamp | |

One row per nudge slot. No cap. Notifications are sent server-side at the scheduled local time using the user's timezone (derived from locale/device at time of setting).

### Guest Contacts
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | string | First name provided in web Going flow |
| contact | string nullable | Email or phone; null if not provided |
| marketing_consent | boolean | Default false; only shown/relevant when contact is provided |
| status_id | uuid FK → statuses | The status they responded to |
| created_at | timestamp | |

Created when a non-logged-in user taps "Going ✅" on the web. If `contact` is null, the record is ephemeral (notification fires, no follow-up). If `contact` is provided and `marketing_consent` is true, a welcome message is sent with a link to download the app.

### Push Tokens
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | |
| token | string | APNs or FCM token |
| platform | enum: ios, android | |
| created_at | timestamp | |
| updated_at | timestamp | |

Multiple devices per user are supported.

---

## 4. Views & Screens

### Landing Page (`/`)

- Hero with tagline
- "How it works" 3-step walkthrough:
  1. Open your door — pick a vibe and tap open
  2. Share the link — send it to whoever might want to swing by
  3. They drop by — no planning, no back and forth
- Bottom CTA → `/auth`
- No navigation bar

---

### Auth Page (`/auth`)

- Login / Sign up tabs
- Google OAuth
- Apple OAuth
- Email + password
  - Signup requires: email, password, display name (required)
  - Email verification is required before first login
  - Login is blocked until email is verified; a resend verification link is shown
- Supports a `?redirect=` query param so invite links can return the user after auth

---

### Home — Door Closed (`/home`, default state)

**First-time state**
- New users land here after signup with a welcoming, uncluttered view
- The note chips and open button are immediately visible and usable — no friends required
- No empty-state walls or setup steps; the UI itself teaches the flow by being ready to use

**Greeting**
- "Hey, [display_name]"

**Note selection**
- Two separate horizontally scrollable chip rows:
  - **Suggestion chips** (row 1): up to 7 contextual suggestions, no delete button
  - **Saved notes** (row 2): user's saved notes, each with an × to hide; only shown when at least one saved note exists
- AI suggestions are contextual: time of day, day of week, weekday vs. weekend, season, locale
- Free-text input always visible below chips (max 60 chars); no "(optional)" label — it's implied
- Tapping a chip populates the text field with that chip's text; the chip highlights as selected
- Tapping the selected chip again un-picks it (undo): restores the text field to what the user had manually typed before picking — but only if the previous state was hand-typed; if the user switched from another chip, the field clears instead (chip-set states are not worth restoring)
- Switching directly from one chip to another does not preserve any undo state — the field simply takes the new chip's text
- Editing the text field after picking a chip immediately deselects the chip (the text is now diverging from the preset)
- After picking a chip, the text field remains editable; the chip stays highlighted as the starting point
- A note is auto-saved to the user's library only when submitted with no chip selected (i.e. hand-typed or modified after picking); submitting an unmodified chip never triggers a save

**Recipient selection**
- Checkbox list of all friends
- Default selection logic:
  - First time ever: all non-muted friends checked
  - Subsequent sessions: restore the exact selection from the previous session, excluding anyone who has since been removed as a friend; muted friends are unchecked by default
- Muted friends appear in a separate "Muted" section within the list and are unchecked by default
- If the user has no friends, the recipient section is hidden entirely — the door can still be opened and the invite link shared from the Door Open view

**Open door button**
- "Open for 30 min"
- On first tap ever: trigger OS notification permission prompt before proceeding (if not already granted)
- Creates a status with the selected note and recipients
- Navigates to Door Open view

**Invite friends card** (below open door button, shown only if user has no friends yet)
- Explains that they can share a link so friends can add them on Drop By — a concept familiar from other apps
- Tap to generate and copy an invite link
- Dismissed permanently once the user has at least one friend

**Nudge schedule card** (below invite friends card if visible, otherwise below open door button)
- Shown only if the user has not yet set any nudge reminders
- Explains the feature: why setting a regular reminder helps, and what the nudge notification will do
- Single CTA: "Set your reminder" → navigates to Profile page
- Once the user sets at least one nudge, this card is permanently replaced by a quiet summary line: "Reminders: Sat 11am · Sun 7pm" with an "Edit" link → Profile page

---

### Home — Door Open (`/home`, active state)

**Header**
- "You're open!" with the active note displayed below

**Countdown**
- Line showing when the door auto-closes: "Closes in X min"
- Option to prolong appears when ≤ 20 minutes remain: "Keep it open" button adds 30 minutes (unlimited times)

**Recipient list**
- Each recipient shown with avatar initial and name
- X button to remove:
  - Recipient row shows strikethrough and "Undo" button for 3 seconds
  - After 3 seconds, removal is persisted to the database
  - Tapping "Undo" within 3 seconds cancels the removal
  - The 3-second countdown is client-side only; the API call fires after the timer

**Invite link row**
- "Anyone with link" row — tap to generate and copy a 1-hour invite link to clipboard
- Generating creates an `invite_links` record with `status_id` set to the current status
- Each tap generates a fresh link; there is no reuse across taps

**Actions**
- "Add more people / Edit" button → transitions to an edit view (see below)
- "Close now" link → closes the status immediately, navigates back to Door Closed view

---

### Home — Door Open Edit View

Accessible via "Add more people / Edit" on the Door Open view.

- Sticky banner at top: pulsing dot + "Your door is open" — tappable to return to Door Open view without saving
- User can edit both the note and the recipient list
- "Save changes" button persists updates and returns to Door Open view

---

### Home — Friend Has Door Open

Visible on the Home screen when any friend has an active status that includes the current user as a recipient. This section updates in real time — when a friend opens or closes their door, the Home screen reflects it immediately without any user action.

- Sits at the top of the Home screen, visually prominent and distinct from the door-open/closed UI below
- When a friend has their door open AND the user's own door is also open (or closed), both sections are visible simultaneously — the friend cards stack at the top, the user's own door UI stacks underneath
- Shows a card per open friend: avatar initial, display name, note (if any)
- **"Going ✅" button** on each card
  - One tap, no confirmation, no text input
  - Sends a push notification to the host: "{name} said, they are going!"
  - On first tap ever (across the whole app): triggers OS notification permission prompt before sending

---

### Friends Page (`/friends`)

**Header actions**
- "Invite" button: generates and copies a 1-hour invite link
- "Add" button: opens Add Friend modal

**Search**
- Client-side filter on loaded friend list

**Friend list**

Active friends section:
- Each row: avatar initial, display name, X button
- Pressing X moves the friend to the Muted section (no confirmation)

Muted friends section (shown below active, only if non-empty):
- Each row: avatar initial, display name, "Unmute" button, X (remove) button
- Unmute: moves back to active friends section
- X (remove): shows confirmation dialog before deleting the friendship

**Remove confirmation dialog**
- "Remove [name] as a friend? This cannot be undone."
- Confirm / Cancel

**Empty state** (no friends at all)
- Invite link CTA + Add friend CTA

**Add Friend modal**
- Email or phone input
- "Send invite" button
- Sends an invite link via email or SMS (implementation may log to console in early versions)

**Notification permission**
- No per-friend notification toggle
- All users with OS permission granted receive all notifications
- Permission is prompted at the moments described in the Home section

---

### Invite Page (`/invite/:token`)

**Deep link behavior**
- The invite URL is configured as a Universal Link (iOS) and App Link (Android)
- If the app is installed, the OS intercepts the URL and opens the app directly to the invite screen
- If the app is not installed, the URL loads normally in the browser and the web experience is shown
- No "open in app" button is needed; the handoff is automatic


**Token valid, user not logged in, host door is open**
- Show the host's open door: avatar initial, display name, note (if any)
- **"Going ✅" button** — tapping opens the web Going form (see below)
- Secondary action: "Sign up / Log in" to fully join Drop By
- No forced redirect to auth

**Token valid, user not logged in, host door is closed**
- Redirect to `/auth?redirect=/invite/:token`

**Token valid, user logged in, not yet friends**
- Show loading → auto-accept via backend → show success state
- Success state: "You and [name] are now friends!" with a button to go home
- If the inviter has an active status at the time of acceptance, the new friend is automatically added as a recipient (silently, no notification to inviter)

**Token valid, user logged in, already friends**
- Skip friendship creation
- Show the inviter's current status if their door is open, or a "Go home" button if not

**Token expired**
- Show: "This invite expired [relative time] ago" — relative time always rounds down (e.g. 1h 45min → "1 hour ago")
- "Go home" button

**Token not found / invalid**
- Show generic error: "This invite link is invalid"
- "Go home" button

---

### Web Going Form (modal, within `/invite/:token`)

Shown to non-logged-in users who tap "Going ✅" on the invite page.

- **First name** (required)
- **Email or phone** (optional)
- If email or phone is entered: checkbox appears — "Send me a link to the app" (default unchecked, user must opt in)
- Submit button: "I'm on my way!"
- On submit:
  - Push notification sent to host: "{name} said, they are going!"
  - If contact provided and consent given: welcome message sent with app download link and a guest record is created
  - If name only (no contact): notification fires, no record created
  - Success state shown: "They know you're coming!" with no further action required

---

### Profile Page (`/profile`)

Accessible from the Home screen (e.g. avatar/name in header).

- Display name: editable inline or via a form, saved on submit
- Email: shown read-only

**Nudge reminders**
- Section explaining that nudges are a personal reminder to open the door — not sent to friends
- Lists currently active nudge slots (day + time), each removable
- "Add reminder" button adds a new slot:
  - First suggestion: Saturday 11am
  - Subsequent suggestions are contextually complementary (e.g. after Saturday morning → suggest Saturday afternoon; after a weekend slot → suggest a weekday evening at 7pm)
  - User can accept the suggestion or pick any day + time manually
  - No hard cap on number of slots
- Nudge notification copy: "Hey, got a free [day]? Open your door"
- Nudge is suppressed if the user already has an active status at the scheduled time

**Auto-nudge (repeat behaviour)**
- On by default; can be disabled in Profile
- Fires if the user opened their door within a ±2 hour window of the current time exactly one week ago, and has not yet opened it this week in that window
- Copy: "You opened your door this time last week — open it again?"
- Suppressed if door is already open
- Suppressed if a configured nudge already fired earlier that same day
- Capped at 1 auto-nudge per week (configured nudges have no cap beyond the door-already-open rule)

**Auto-nudge toggle**
- "Remind me when I opened my door this time last week" — on by default
- When disabled, the repeat behaviour auto-nudge is never sent

- **Delete account** button
  - Confirmation dialog: "This will permanently delete your account, friends, and all data. This cannot be undone."
  - On confirm: deletes all user data, closes any active status, signs the user out, redirects to landing page

---

## 5. Navigation

- **Unauthenticated**: Landing (`/`) and Auth (`/auth`) are standalone with no nav bar
- **Authenticated**: Bottom tab bar with two tabs: **Home** and **Friends**
- Profile is accessible from the Home tab (not a separate tab)

---

## 6. Core Behaviors

### Opening the Door

1. User selects a note (optional) and recipients
2. Taps "Open for 30 min"
3. If first time: OS notification permission prompt
4. Status created with `closes_at = now() + 30 min`
5. Push notifications sent to all recipients who have granted OS permission

### Prolonging

- "Keep it open" button appears when `closes_at - now() ≤ 20 min`
- Tapping it sets `closes_at = closes_at + 30 min`
- Unlimited prolongs allowed
- User also receives a push notification 10 minutes before close:
  - Copy: "Your door closes in 10 minutes"
  - Actions: "Keep open" (prolongs +30 min without opening app), "Close now", default tap opens app to Door Open view

### Closing the Door

- Manual: "Close now" sets `closed_at = now()`
- Automatic: status expires when `closes_at` passes (checked server-side)
- Either way: invite token is invalidated for that session

### Recipient Removal (Undo Pattern)

- Client starts a 3-second timer, shows strikethrough + Undo on the row
- If not undone: API call fires to remove recipient from `status_recipients`
- If undone: timer cancelled, no API call, row returns to normal

### Friend Removal

- Deletes the `friendships` row
- Immediately removes the removed friend from all active `status_recipients` rows for both users

### Muting a Friend

- Creates a `friend_mutes` row
- Muted friend receives no push notifications from the muting user's door opens
- Muted friend is unchecked by default in the recipient selection UI
- Muting does not affect the muted friend's ability to open their door to the muting user

### Connection Patterns

Friendships are formed exclusively via invite links. There is no search, no directory, no follow request. Every connection starts with one person sharing a link with another.

#### Generating an invite link

- Any logged-in user can generate a link at any time from the Friends page or the Door Open view
- Links are valid for 1 hour and multi-use (multiple people can accept the same link)
- If generated from the Door Open view, `status_id` is recorded on the link — this unlocks session-aware behaviour when the link is accepted
- The link is copied to clipboard; sharing mechanism is up to the user (message, chat, wherever)

#### Accepting a link — all cases

The outcome depends on the recipient's auth state and whether the host's door is open at the time of acceptance.

| Recipient state | Host door | Outcome |
|---|---|---|
| Logged in, not yet friends | Open | Friendship created; recipient auto-added as status recipient; success screen shows open door + note |
| Logged in, not yet friends | Closed | Friendship created; success screen confirms connection |
| Logged in, already friends | Open | No new friendship; success screen shows open door |
| Logged in, already friends | Closed | No new friendship; goes to home |
| Logged in, own link | Either | No-op; shown a friendly message |
| Not logged in | Open | Door card shown immediately (avatar, name, note); can signal Going as guest without an account; "Sign up to join" link below |
| Not logged in | Closed | Redirected to auth with `?redirect=/invite/:token` preserved |

#### New user signup via invite link

When a not-logged-in user arrives via an invite link and chooses to sign up, the redirect destination must survive the full signup + email verification flow:

1. User arrives at `/invite/:token` — if door is closed, redirected to `/auth?redirect=/invite/:token`
2. User fills in signup form; client sends `redirect_url` to server alongside email/password
3. Server embeds `redirect_url` as a query param on the verification link: `/api/auth/verify-email/:token?redirect=/invite/:token`
4. User clicks the verification email; server verifies, then redirects to `/auth?verified=true&redirect=/invite/:token`
5. User logs in; client reads `redirect` param and navigates to `/invite/:token`
6. Invite page auto-accepts the invite and shows the appropriate success state (with open door if still active)

This ensures a user who signed up specifically because of an invite immediately lands in the context they came from — seeing the connection established and, if the door is still open, the host's current status.

#### What the host sees

- When a new friend accepts via a session link (door open): they are silently added to `status_recipients` — host does not need to do anything
- If the new friend signals Going: host sees their name appear in the going signals section on the Door Open view
- If the door has already closed by the time the link is accepted: friendship is still created, but the new friend is not added as a recipient (the session is over)

#### Guest Going (no account required)

A visitor who arrives at a session-linked invite while not logged in can signal they're going without creating an account:

- Tap "Going ✅" on the door card → modal opens
- Required: first name
- Optional: email or phone number; if provided, an opt-in checkbox appears to receive an app download link
- On submit: host sees the guest's name in going signals immediately
- The guest receives no further UI — just a confirmation that the host knows they're coming

### AI Note Suggestions

- Fetched on page load (Door Closed view)
- Contextual inputs: time of day, day of week, weekday/weekend, season, locale
- Suggestion chips (row 1) and saved note chips (row 2) are shown in separate scrollable rows
- Saved notes show an × button; tapping it hides the note (soft-delete, not permanently deleted)
- A note that is not one of the built-in suggestions is auto-saved to the user's note library on use

### "Going ✅"

- Available on each open friend's status card on the Home screen
- One tap, no text, no confirmation
- Limited to one signal per user per status — after tapping, the button is replaced with a confirmed state (e.g. "Going ✅") and cannot be tapped again
- Sends push notification to host: "{name} said, they are going!"
- Triggers OS notification permission prompt on first use (if not yet granted)

### Push Notifications

- **Friend opens door**: sent to all recipients with OS permission granted (muted friends are excluded if the opener has muted them — but muting is one-directional, so the recipient's mute of the opener has no effect on whether they receive the opener's notification... clarify: the opener's mute of a recipient means that recipient is not notified. The recipient's mute of the opener has no product effect on notifications in v1 — muting only affects default selection and the muter's own notification receipt.)

> **Muting user A means:**
> - A is unchecked by default when you open your door (so A won't be notified by default)
> - You do not receive push notifications when A opens their door

- **Host receives "Going ✅"**: "{name} said, they are going!"
- **10 min before close**: sent to the door opener only

---

## 7. Authentication

- Email/password with mandatory email verification (login blocked until verified)
- Google OAuth
- Apple OAuth
- Display name required at signup, always editable thereafter
- Profile auto-created on signup
- `?redirect=` param supported on `/auth` for post-login routing

---

## 8. Known Gaps / Deferred

- **Email/SMS delivery**: Add Friend sends invite via email/SMS — implementation logs to console until a delivery provider is integrated
- **Push notification delivery**: Backend logic is specced; requires APNs/FCM credentials to activate
- **Rate limiting**: No rate limits specced for v1
- **User-saved note limit**: No cap specced for v1
