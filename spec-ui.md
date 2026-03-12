# Drop By — UI Spec

One level below the product spec. Covers interaction models, states, edge cases, and persistence behaviour for each screen and significant component.

---

## Avatar

**Purpose** — Consistent visual identity for every user, requiring no photo upload.

**Visual structure**
- Circular image generated deterministically from the user's display name
- Three sizes: sm (32px), md (40px), lg (56px)

**Behaviour**
- Generated client-side via DiceBear Shapes, seeded by `display_name` (or explicit `seed` prop)
- Same name always produces the same avatar across devices and sessions
- Falls back gracefully — no network request, no broken image state possible

**Persistence**
- Seed is derived from display name; no separate storage needed
- `avatar_seed` field exists on the user record for future "re-roll" feature (not yet exposed in UI)

---

## Home — Door Closed

**Purpose** — Primary entry point. Let the user open their door with a note and recipient selection, with minimal friction.

**Visual structure** (top to bottom)
1. Friends available section — only shown if ≥1 friend has their door open
2. Greeting header + avatar/profile link
3. Suggestion chips row (horizontal scroll)
4. Saved notes row (horizontal scroll) — only shown if ≥1 saved note exists
5. Note text field
6. Recipient selection — only shown if user has ≥1 friend
7. Open Door button
8. Invite friends card — only shown if user has no friends
9. Nudge card — only shown if user has no nudge schedules (or summary if they do)

**States**
- `Empty` — no chip selected, field blank
- `ChipSelected` — a chip is highlighted, field shows chip text
- `ManualEntry` — no chip selected, user has typed something
- `ChipModified` — user picked a chip then edited the text (chip deselected)

**Note picker interaction model**
- Tap suggestion chip (from `Empty` or `ManualEntry`) → `ChipSelected`; field fills with chip text; `previousNote` saved only if was `ManualEntry`
- Tap suggestion chip (from `ChipSelected`, different chip) → `ChipSelected`; field updates to new chip; `previousNote` cleared (nothing to restore on un-pick)
- Tap active chip (from `ChipSelected`) → `Empty` or `ManualEntry`; field restores `previousNote` if it was hand-typed, otherwise clears
- Type in field (from `ChipSelected`, text diverges from chip text) → `ChipModified`; chip deselects immediately; `previousNote` cleared
- Tap × on saved note chip → note hidden server-side; chip disappears from row; no effect on current text field

**Note save logic**
- On door open: note is saved to user's library only if `selectedChip === ''` at submit time (i.e. hand-typed or modified after picking)
- Submitting an unmodified preset chip never triggers a save — it's either a built-in suggestion or already in the library
- Built-in suggestions are never saved regardless

**Character counter**
- Hidden by default — no layout space reserved
- Appears overlaid bottom-right of the input when `length >= 45`
- Turns red at `length >= 55`
- Shows remaining characters (`60 - length`), not total

**Recipient selection**
- Active (non-muted) friends shown first with checkboxes
- Muted friends shown in a separate "Muted" subsection, unchecked by default but still selectable
- Section hidden entirely if user has no friends

**Default recipient selection logic**
- First time ever: all non-muted friends pre-checked
- Subsequent opens: restore exact selection from last session, excluding anyone since removed; muted friends always start unchecked

**Persistence**
- Note field + chip state: in-memory only, reset when door opens
- Recipient selection: restored from server (`lastSelection`) on mount
- Saved notes: fetched from server, updated optimistically on hide

---

## Home — Door Open

**Purpose** — Show the user their active status and let them monitor who's coming.

**Visual structure** (top to bottom)
1. Greeting header + avatar/profile link (same as closed view)
2. Friends available section — shown if any friends also have door open
3. "You're open!" pill (pulsing dot) + note chip (if note set) + countdown
4. "Keep it open +30 min" button — only shown when ≤20 min remaining
5. Notified recipients list — only shown if ≥1 recipient
6. Going signals — only shown if ≥1 person is on their way
7. Invite link row (copy to clipboard)
8. "Add more people / Edit" button
9. "Close now" button

**Note display**
- Rendered as a pill with a pencil icon — visually ties back to the note chip picker used when opening
- No quotes

**Recipient removal**
- Tap × to start a 3-second countdown with strikethrough on the name
- "Undo (Xs)" button cancels the removal
- After countdown completes, recipient is removed via API

**Countdown timer**
- Live countdown in seconds, updated every second
- Displays as minutes remaining (`closesIn` minutes)
- "Closing soon" shown when ≤0 minutes

**Persistence**
- View state (`open`) driven by server — if status exists on load, view = open
- Going signals and recipients: polled every 30 seconds

---

## Home — Door Open Edit

**Purpose** — Allow updating the note and recipient list while the door is open.

**Visual structure**
1. Sticky green banner ("Your door is open — tap to return") — tapping returns to open view without saving
2. Note text field (pre-filled with current note)
3. Recipients checklist (all friends, pre-checked per current status)
4. Save changes button

**Behaviour**
- Note field uses `defaultValue` (uncontrolled) pre-filled from current status
- Recipients checkboxes use `defaultChecked` from current status recipients
- `editRecipients` state initialised from current recipients when Edit is entered
- Saving sends both note and full recipient list to server; returns to open view

**Edge cases**
- Entering edit via the button initialises both `editNote` and `editRecipients` from `myStatus` synchronously before view changes
- If user saves without touching any checkbox, the current recipients are preserved correctly

---

## Home — Friend Status Card

**Purpose** — Show a friend's open door and allow the user to signal they're going.

**Visual structure**
- Avatar + display name + note (truncated, in quotes) + time remaining
- "Going ✅" button on the right

**Going interaction**
- One tap, no confirmation
- Button becomes disabled + changes to muted green immediately (optimistic)
- No undo

---

## Home — Nudge Card

**Purpose** — Prompt the user to set up a reminder notification to open their door.

**States**
- `NoNudges` — card shown with a suggested Saturday 11am slot and two actions
- `HasNudges` — card replaced by a compact summary line + "Edit" link to Profile

**Actions**
- "Remind me then" — immediately creates Saturday 11am nudge, card transitions to `HasNudges`
- "Pick another time" — navigates to Profile with `?addReminder=1` to open the modal

**Persistence**
- Nudge data fetched from server; card hides permanently once ≥1 nudge exists

---

## Profile

**Purpose** — Identity, preferences, and notification settings.

**Visual structure** (top to bottom)
1. Header: back arrow + avatar + "Profile" title
2. Display name card (editable inline)
3. Email card (read-only)
4. Language selector (compact single-row dropdown)
5. Reminders card
6. Auto-nudge toggle
7. Delete account button

**Language picker**
- Native `<select>` element — OS-native picker, two taps to change
- Available: English (US), English (UK), Deutsch, Español, Français

**Reminders**
- Lists active nudge slots (day + time), each with a × to remove
- "+ Add" button opens AddNudgeModal
- Description: "We'll send you a notification to open your door." — no mention of friends

**AddNudgeModal**
- Day grid (Mon–Sun, 4-column), time grid (7am–10pm, 4-column)
- Suggestion box shows a contextually complementary slot; "Remind me then" saves it immediately and closes the modal (does not just pre-fill the picker)
- "Add reminder" button saves the currently selected day + time

**Auto-nudge toggle**
- On by default
- Sends a nudge when the user opened their door at the same time the previous week

**Persistence**
- Display name: saved to server on submit, reflected in JWT-backed user store
- Language: persisted to localStorage via i18next
- Nudges: server-persisted; list re-fetched after add/remove

---

## Invite Page

**Purpose** — Handle incoming invite links; create friendships and/or show the host's open door.

**States / outcomes** (evaluated in order)

| Condition | Outcome |
|---|---|
| Token invalid | Error screen |
| Token expired | Error screen with how long ago |
| Logged-in, own link | "That's your own link" screen |
| Logged-in, already friends, door open | Door open card + "See status" |
| Logged-in, already friends, door closed | "Already friends" screen |
| Logged-in, new friend | Auto-accept → "You're now friends!" screen |
| Not logged in, door open | Door card + Going button + "Sign up to join" link |
| Not logged in, door closed | Redirect to `/auth?redirect=/invite/:token` |

**Auto-accept**
- Logged-in users are accepted silently on load — no confirmation tap required
- Friendship is created server-side; UI jumps straight to the success state

**Guest Going flow** (not logged in, door open)
- Tap "Going ✅" → modal opens
- First name required; email/phone optional
- If contact entered: opt-in checkbox appears for app download link
- Submit → host sees guest name in going signals; modal closes; confirmation shown

**Note display**
- Host's note shown with quotes on the invite page (visitor context, not the host's own view)

---

## General Patterns

**Optimistic UI**
- Going signals: local state updated immediately, no undo
- Recipient removal: 3-second countdown with undo before API call
- Note hide: query invalidated after mutation, list updates on re-fetch

**Loading states**
- Full-page spinner only on the Invite page (waiting for token validation)
- All other data loads silently; UI renders with empty defaults then fills in

**Error handling**
- Mutations that fail silently (email send, going signal) — no user-facing error
- Auth errors redirect to `/auth`
- Invite errors show dedicated error screens
