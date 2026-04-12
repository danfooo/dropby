# dropby — TODOs

## Icon design double-accounting
`ios-icon.svg` and `favicon.svg` use the **cropped/offset** composition:
`translate(730, 614) scale(1.55) translate(-751, -639)` — house pushed right and enlarged so it bleeds off the icon edges.

All other logo assets (`logo-icon.svg`, `logo.svg`, `ic_launcher_foreground.svg`) still use the **centered** composition (scale 1.05). If the cropped style is confirmed as the final direction, those should be updated too and Android icons regenerated.

## Apple Sign In
- [ ] Register domain in Apple Developer Console under **Sign in with Apple for Email Communication** (Certificates, Identifiers & Profiles → More) — required for "Hide My Email" to work on web. Without it, Apple shows "Sign-Up Not Completed" inside its popup.

## Legal
- [ ] Replace imprint address with a proxy/forwarding address (currently home address in `client/src/pages/About.tsx`)

## Email
- [ ] Set up `hi@dropby.cc` mailbox — email access for dropby.cc domain not yet configured (needed for imprint contact + support)
- [ ] Update Google OAuth consent screen support email to `hi@dropby.cc` — requires creating a Google account for `hi@dropby.cc` (via "use my current email address") so it appears in the dropdown

## Android

- [ ] **Tab bar safe area flicker on first load** — `--safe-area-inset-bottom` is injected by Capacitor's `SystemBars` plugin via JS after page render. There may be a brief flash where the tab bar sits too low before the variable is set. If seen, fix by hardcoding a reasonable CSS fallback (e.g. `var(--safe-area-inset-bottom, 24px)`) or by deferring first paint until insets are ready. See `client/src/index.css` `.safe-bottom` and `android/app/src/main/java/cc/dropby/app/MainActivity.java`.

## Maybe
- [ ] New user with no friends: "Open Now" gives no hint that a share link is coming. Needs a solution that doesn't introduce the friends concept prematurely — the right fix probably lives earlier in the onboarding flow, not on the home screen.
- [ ] SMS delivery for Add Friend: currently logs to console, only email delivery is implemented


- [ ] Don't show the feedback card on Home if the user has submitted feedback within the last month

## Waitlist & Invite-Only
- [ ] Set up `TURNSTILE_SECRET_KEY` on Fly + `VITE_TURNSTILE_SITE_KEY` as build arg — get keys from Cloudflare dashboard → Turnstile → Add site
- [ ] Ensure `hi@dropby.cc` mailbox is configured before relying on daily waitlist digest (see Email TODO above)
- [ ] Admin UI to promote waitlist entries to invites (deferred — for now copy an invite link manually)

## Limits & Safety
- [x] Rate limiting — waitlist endpoint has per-IP limits (5/hour, 20/day); broader API rate limiting still TODO

## Not needed for launch
- [ ] Remove or update `rua` in DMARC record (currently no mailbox receiving aggregate reports)
- [ ] GitHub Actions deploy-on-push (manual `fly deploy` is fine for now)
