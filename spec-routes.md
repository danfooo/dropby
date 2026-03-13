# Drop By — Route Map

## Public routes

### `/`
Landing page. Tagline, 3-step "how it works", "Get started" → `/auth`. No nav bar.

### `/auth`
Login / Sign up tabs. Google OAuth. Email + password. If arriving via invite, shows inviter's name and pre-selects Sign up tab. Supports `?redirect=` for post-auth routing.

### `/verify-email?token=&redirect=`
POSTs token to server on mount. Success: auto-logs in, redirects to `redirect` or `/home`. Error: "Link expired or invalid" + back to sign in.

### `/invite/:token`
- **Not logged in, door open**: host avatar + note, "Going 🏃" → web Going modal, "Sign up / Log in" link
- **Not logged in, door closed**: redirect to `/auth?redirect=/invite/:token`
- **Logged in, new friend**: auto-accepts, shows success + open door if active
- **Logged in, already friends**: shows open door or "Go home"
- **Own link**: friendly message
- **Expired / invalid**: error + "Go home"

Web Going modal (within this route): first name (required), optional email/phone + opt-in checkbox, "I'm on my way 🏃".

---

## Authenticated routes (bottom tab bar: Home · Friends)

### `/home` — Door closed
Top-right: UserMenu (avatar + first name → `/profile`).
Suggestion chips (row 1) + saved note chips with × (row 2). Free-text note input. Recipient checkboxes (friends, muted section). "Open 30 min 🚪" button. Tips section below (nudge tip or invite tip, each dismissable with ×).

If any friend has their door open: friend cards at top (avatar, name, note, "I'm going ✅" button).

### `/home` — Door open
Top-right: UserMenu. "You're open" pill + note + "Closes in X min". "Keep it open +30 min" (when ≤ 20 min left). Recipient list with 3-second undo removal. Going signals section. "Anyone with link" copy-link row. "Add more / Edit" button → edit view. "Close now" link.

### `/home` — Edit view (no route change)
Sticky "Your door is open" banner (tap to go back). Note input. Recipient checkboxes. "Save changes".

### `/friends`
Header: "Invite" (copy link) + "Add" (open modal). Search. Friend list (avatar, name, mute, remove). Muted section. Pending email invites with cancel. Empty state with CTAs.

Add Friend modal: email input, "Send invite" → 30-day email invite via Resend. Success / error states.

### `/profile`
Back arrow → `/home`. Header: avatar (tap to crop/upload) + "Profile" title. Sections: display name (inline edit), email (read-only), language selector, reminders (list + add modal, one-tap suggested slot if empty), auto-nudge toggle. Bottom: "Log out", "Delete account" (confirmation dialog).
