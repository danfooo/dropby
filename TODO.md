# dropby — TODOs

## Icon design double-accounting
`ios-icon.svg` and `favicon.svg` use the **cropped/offset** composition:
`translate(730, 614) scale(1.55) translate(-751, -639)` — house pushed right and enlarged so it bleeds off the icon edges.

All other logo assets (`logo-icon.svg`, `logo.svg`, `ic_launcher_foreground.svg`) still use the **centered** composition (scale 1.05). If the cropped style is confirmed as the final direction, those should be updated too and Android icons regenerated.

## Location field
- [ ] Optional Google Places Autocomplete on the location input for suggestion-as-you-type — deferred in favor of shipping a plain free-text field first (no new Google API/billing dependency). If added later: store `place_id`/`lat`/`lng` alongside the display text only when a suggestion is picked; free-typed text (e.g. "Nina's apartment") stays untouched.

## Apple Sign In
- [ ] Register domain in Apple Developer Console under **Sign in with Apple for Email Communication** (Certificates, Identifiers & Profiles → More) — required for "Hide My Email" to work on web. Without it, Apple shows "Sign-Up Not Completed" inside its popup.

## Legal
- [ ] Replace imprint address with a proxy/forwarding address (currently home address in `client/src/pages/About.tsx`)

## Email
- [ ] Set up `hi@dropby.cc` mailbox — email access for dropby.cc domain not yet configured (needed for imprint contact + support)
- [ ] Update Google OAuth consent screen support email to `hi@dropby.cc` — requires creating a Google account for `hi@dropby.cc` (via "use my current email address") so it appears in the dropdown

## Android

- [ ] **Google sign-in only registered for the release keystore SHA-1** — debug builds (Android Studio Run / `npx cap run android`, signed with `~/.android/debug.keystore`) will fail with `DEVELOPER_ERROR` until the debug SHA-1 (`00:92:11:37:D3:49:CE:A2:FD:A0:28:AE:91:6B:E6:5A:D3:66:8A:1F`) is added as a second Android OAuth client in the `drop-by-2f177` project (package `cc.dropby.app`). Also: if Play App Signing is enabled later, its Play-generated SHA-1 will need its own entry too.
- [ ] **`assetlinks.json` fingerprint not set** — `/.well-known/assetlinks.json` is implemented in `server/src/index.ts` but returns 404 until `ANDROID_CERT_SHA256` is set (`fly secrets set ANDROID_CERT_SHA256=...`). Until then Google Password Manager will not share credentials between dropby.cc and the Android app. Use the SHA-256 from Play Console → Test and release → App integrity (the *app signing* cert), not the local `~/dropby.keystore` upload cert, if Play App Signing is enabled.
- [ ] **Android App Links not configured** — unlike iOS, `AndroidManifest.xml` has no `intent-filter` for `dropby.cc`, so invite / verify-email / reset-password links open in the browser rather than the app. Independent of the credential sharing above, which does not need an intent filter.
- [ ] **Tab bar safe area flicker on first load** — `--safe-area-inset-bottom` is injected by Capacitor's `SystemBars` plugin via JS after page render. There may be a brief flash where the tab bar sits too low before the variable is set. If seen, fix by hardcoding a reasonable CSS fallback (e.g. `var(--safe-area-inset-bottom, 24px)`) or by deferring first paint until insets are ready. See `client/src/index.css` `.safe-bottom` and `android/app/src/main/java/cc/dropby/app/MainActivity.java`.

## Named group invite links — remaining
Built: link participation and candidacy, pre-checked multi-connect on the invite page, batch accept on the Friends page, mutual-pick auto-connection, link names with the slug in the URL, per-link share previews, provenance on waiting rows, coalesced connection pushes, the suggestions opt-out, and the signup/Privacy disclosure. See `spec-full.md`.

Still open:

- [ ] **Expiry for named links.** All links are still 7 days. The design proposed ~24h for a link meant to be dropped in a group chat, on the grounds that the candidate list is a disclosure and expiry is what closes it. Not changed unilaterally: it shortens the life of every link people are already sharing, and it is not obvious that naming a link should make it die sooner. Decide whether expiry keys off the name, off a separate "group link" affordance, or stays uniform.
- [ ] **Closing a link early** is creator-only via the existing revoke. Decide whether anyone who opened it can close it.
- [ ] **Second-degree suggestions** — people who opened a link someone from your link also opened. Ships only if the reason renders in one honest phrase ("you both know Anna from Sunday BBQ"), weighted inversely by link size. First degree is live.

Related but separate: with no group object there is nothing to select as door recipients in one tap. Saved recipient sets ("open my door to these 8") are a real ergonomic want, but a different feature — do not drag the group object back for it.

## Maybe
- [ ] New user with no friends: "Open Now" gives no hint that a share link is coming. Needs a solution that doesn't introduce the friends concept prematurely — the right fix probably lives earlier in the onboarding flow, not on the home screen.
- [ ] SMS delivery for Add Friend: currently logs to console, only email delivery is implemented



## Waitlist & Invite-Only
- [ ] Set up `TURNSTILE_SECRET_KEY` on Fly + `VITE_TURNSTILE_SITE_KEY` as build arg — get keys from Cloudflare dashboard → Turnstile → Add site
- [ ] Ensure `hi@dropby.cc` mailbox is configured before relying on daily waitlist digest (see Email TODO above)
- [ ] Admin UI to promote waitlist entries to invites (deferred — for now copy an invite link manually)

## Limits & Safety
- [x] Rate limiting — waitlist endpoint has per-IP limits (5/hour, 20/day); broader API rate limiting still TODO

## Not needed for launch
- [ ] Remove or update `rua` in DMARC record (currently no mailbox receiving aggregate reports)
- [ ] GitHub Actions deploy-on-push (manual `fly deploy` is fine for now)

## Deferred dependency bumps
- [ ] `typescript` 5→7 — the TS team skipped a stable 6 release and shipped 7 as a from-scratch Go-native compiler port (published ~5 weeks ago as of 2026-08-16). Revisit once it's had more time in the wild; needs dedicated testing, not a routine bump.
- [ ] `@dicebear/core` 9→10 — restructures the whole package (individual style packages like `@dicebear/adventurer` removed in favor of a single `@dicebear/styles` package with JSON style definitions; component options renamed, e.g. `eyes` → `eyesVariant`). Real migration work in `client/src/components/Avatar.tsx`, not a routine bump.
