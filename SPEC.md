# Drop By — Product Spec

## 1. Product Overview

Drop By is a presence signal app. One tap tells your friends you're available for a spontaneous visit. No group chats, no planning — just a simple "my door is open" signal.

---

## 2. Views & Screens

### Landing Page (`/`)

- Hero with tagline
- "How it works" 3-step walkthrough
- Bottom CTA → auth

### Auth Page (`/auth`)

- Login / Sign up tabs
- Google and Apple OAuth
- Email + password with display name on signup
- Email verification required before first login
- Redirect support (e.g. from invite links)

### Home — Door Closed (`/home`, default state)

- Greeting with display name
- Note selection:
  - AI-suggested chips (contextual by time of day, day of week, season)
  - Saved user notes (removable)
  - Custom free-text input
- Friend selection: checkboxes for each friend, pre-populated from last session's recipients (first-time: all selected)
- "Open for 30 min" button

### Home — Door Open (`/home`, active status)

- "You're open!" header with active note
- Recipient list showing each friend with remove (X) button
  - Remove has 3-second undo window before persisting
- "Anyone with link" row — tap to generate and copy a 1-hour invite link
- "Add more people" button → returns to setup view to modify note/recipients, with "Save changes" to update
- Sticky banner at top when editing: "Your door is open" with pulsing dot, tappable to return to status view
- Countdown line confirming when the door auto-closes (starts at 30 minutes)
- "Close now" link to end early

### Home — Friend Has Door Open

- The Home view shows when any friend has their door open to the user, including the optional note if one was added.

### Friends Page (`/friends`)

- Header with "Invite link" (copy) and "Add" buttons
- Search bar to filter friends
- Friend cards: avatar initial, name, notification bell toggle, remove button
- Remove confirmation dialog
- Empty state with invite link + add friend CTAs
- Add friend modal: email/phone input, notify checkbox, send invite
- Notification explainer modal (first time enabling notifications): explains what notifications do, triggers OS permission request

### Invite Page (`/invite/:token`)

- If not logged in → redirects to auth with return URL
- If logged in → auto-accepts invite via backend
- Shows loading → success (with redirect to home) or error state with "Go home" button

---

## 3. Core Concepts

### Invites ("Opening your door")

- Duration: fixed 30 minutes from creation
- Includes: optional note (max 60 chars), selected recipients
- Auto-expires; can be closed manually
- Recipients and note can be edited while active
- Push notifications sent to recipients on creation

### Friend Selection Persistence

- When opening the door, the recipient list defaults to whoever was selected in the user's most recent session
- First-time users get all friends selected
- If a previous friend was removed, they're excluded from restoration

### Note Suggestions

- AI suggestions: filtered by time of day, day of week, weekday/weekend, season, and locale
- User notes: saved automatically when used, shown alongside AI suggestions, can be hidden by user
- Custom free-text input always available

### Invite System

- Generates a unique token-based link, valid for 1 hour
- Accepting creates a bidirectional friendship
- If the inviter has an active status, the new friend is automatically added as a recipient
- Available from: status screen ("Anyone with link"), friends page header, add friend modal

### Recipient Removal (Undo Pattern)

- Tapping X on a recipient in the status view starts a 3-second countdown
- Shown as strikethrough with "Undo" button
- After 3 seconds, removal is persisted to the database
- Undo cancels the removal

### Prolonging an Invite

- The user can prolong the time the door is open; the option appears 20 minutes before the door closes
- A notification is sent to the user 10 minutes before the door closes, offering direct actions to prolong or close now
- The default notification action opens the invite in the app

### Notifications

- Per-friend toggle stored locally
- First toggle-on triggers an explainer modal, then OS permission prompt
- Push notifications sent when a friend opens their door (via native push on iOS/Android)

---

## 4. Authentication

- Email/password with email verification
- Google OAuth
- Apple OAuth
- Display name set during signup (defaults to email prefix)
- Profile auto-created on signup

---

## 5. Navigation

- Bottom tab bar on authenticated screens: Home, Friends
- Landing page and auth are standalone (no nav bar)

---

## 6. Specifics about the /auth page

When arriving via an invite link, the flow always ends with the connection being made:

- **Already logged in** → invite accepted immediately, redirected to home with a success message
- **Not logged in** → auth page shows the inviter's name and avatar with a prompt to connect; once authenticated (whether via login or signup), the connection is made and home shows a success message
