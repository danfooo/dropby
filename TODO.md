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

## iOS Live Activity
- [ ] **Localize the Live Activity.** Its copy ("Your door is open", "on their way", "closes in") is English-only, like every push. Needs a strings catalog in the `DoorActivity` extension once native copy is localized at all.
- [ ] **Scheduled starts on iOS 16.2–17.1.** Push-to-start needs 17.2, so on older iOS a scheduled session that starts while the app is closed only gets its Live Activity when the app is next opened.
- [ ] **Buttons on the activity** ("Keep open +30", "Close now") via App Intents (iOS 17+). Today tapping it just opens the app.

## Maybe
- [ ] New user with no friends: "Open Now" gives no hint that a share link is coming. Needs a solution that doesn't introduce the friends concept prematurely — the right fix probably lives earlier in the onboarding flow, not on the home screen.
- [ ] SMS delivery for Add Friend: currently logs to console, only email delivery is implemented



## Waitlist & Invite-Only
- [ ] Set up `TURNSTILE_SECRET_KEY` on Fly + `VITE_TURNSTILE_SITE_KEY` as build arg — get keys from Cloudflare dashboard → Turnstile → Add site
- [ ] Ensure `hi@dropby.cc` mailbox is configured before relying on daily waitlist digest (see Email TODO above)
- [ ] Admin UI to promote waitlist entries to invites (deferred — for now copy an invite link manually)

## Limits & Safety
- [x] Rate limiting — waitlist (per IP), and every sign-in and email-sending endpoint (per IP and per email/user; see spec §7). Other signed-in endpoints are unlimited
- [ ] **Remove legacy JWT sign-in** — 30 days after the sessions deploy, every pre-sessions JWT has expired. Then delete `looksLikeJwt`/`verifyLegacyJwt` and the `JWT_SECRET` check in `server/src/services/sessions.ts`, the swap in `server/src/middleware/auth.ts`, the `/api/test/legacy-jwt` route and its e2e test, and the `JWT_SECRET` Fly secret (`fly secrets unset JWT_SECRET`)
- [ ] Optional: "Sign out everywhere" in Profile — the server side exists (`revokeAllSessions`); needs a button, an endpoint and copy in all locales
- [ ] Optional: keep the native session token in the Keychain/Keystore instead of Capacitor Preferences (UserDefaults on iOS). Needs a secure-storage plugin and a matching change in `AppDelegate.swift`'s mute action

## Database backups (Litestream)
The image now includes Litestream (`deploy/start.sh`, `deploy/litestream.yml`), which streams every database change to object storage and restores from it when the volume is empty. It stays **off** until `LITESTREAM_REPLICA_URL` is set, so deploying changes nothing by itself. Verified locally: replicate, then restore into a fresh container. Turning it on (Cloudflare R2, since dropby.cc is already on Cloudflare; ~free at this size):

- [ ] 1. Cloudflare dashboard → **R2 Object Storage** → **Create bucket**, name it `dropby-db`, location automatic. Keep it private (the default).
- [ ] 2. R2 → **Manage API tokens** → **Create API token** → permission **Object Read & Write**, limited to the `dropby-db` bucket. Copy the **Access Key ID**, the **Secret Access Key**, and your account's S3 endpoint (`https://<account-id>.r2.cloudflarestorage.com`). The secret is shown once.
- [ ] 3. Set the Fly secrets (this restarts the app once):
  `fly secrets set LITESTREAM_ACCESS_KEY_ID=… LITESTREAM_SECRET_ACCESS_KEY=… LITESTREAM_REPLICA_URL="s3://dropby-db/drop-by.db?endpoint=https://<account-id>.r2.cloudflarestorage.com&region=auto"`
- [ ] 4. Check: `fly logs` should show `snapshot complete`, and the bucket should fill with files under `drop-by.db/`.
- Careful: if the volume is ever empty on boot, the server restores from the bucket, so never point two apps at the same `LITESTREAM_REPLICA_URL`.
- On a normal boot (database present) the restore step is skipped without touching the network, so an R2 outage can't stop the app. Only an empty volume needs the bucket, and then the app refuses to start rather than starting empty.

## Native device test pass
The Playwright suite runs in a desktop browser where the app and API share an origin, so it cannot catch native-only breakage. Check these by hand on a real iPhone and Android device after the next `fly deploy` + app build.

**Why this is needed.** No recent change caused these bugs. They have been there since the native apps were added, and nothing caught them:

- The web app was built first (2026-03-11) and calls the server with relative paths like `/api/...`. That works in a browser because the server serves the page too.
- The native apps load the page from the phone itself, so a relative path points at the phone. The switch to native (c404cdb, 2026-03-19) fixed this only in the main API client (`api/index.ts`). The live-updates hook (`useSSE.ts`) kept its relative path, and the calendar links added after it (2026-03-16, 2026-03-29) copied the same pattern.
- The server rejects requests from origins it doesn't know (CORS). iOS's origin was added on 2026-04-01 (f8c676a), presumably when iOS hit this problem. Android's origin (`https://localhost`, set by `androidScheme: 'https'`) was never added, so Android has probably never been able to reach production.

Since c246962, the server address lives in one exported value (`serverOrigin` in `client/src/api/index.ts`), so new code can reuse it instead of repeating the relative-path mistake.

- [ ] **Android can reach the API at all** — CORS allowlist gained `https://localhost` (commit c246962, needs `fly deploy`). Before it, production sent no allow-origin header to Android, so sign-in and every API call failed. Check: sign in on Android.
- [ ] **Live updates on native** — SSE now uses the absolute server URL (commit c246962, needs a new app build). Check: with the app open on the phone, open a door from another account; it should appear without refreshing.
- [ ] **Calendar (.ics) links on native** — now built from `baseURL` in `client/src/api/index.ts` (Invite page and the Later tab's calendar toasts) instead of relative `/api/...` hrefs. Check: download a session's calendar file on both platforms.
- [ ] **Staying signed in across the update** — the app's saved 30-day token is swapped for a session on its first request (see spec §7). Check: install the new build over the old one while signed in; you should stay signed in, and live updates should connect.
- [ ] **Native apps now talk to `dropby.cc`** (through Cloudflare) instead of `drop-by.fly.dev`. Check on both platforms: sign in, open a door, receive a live update, and use "Mute for 3 days" from a door-open push on iOS (that one is sent by `AppDelegate.swift`, not the web code).

## Not needed for launch
- [ ] Remove or update `rua` in DMARC record (currently no mailbox receiving aggregate reports)
- [ ] GitHub Actions deploy-on-push (manual `fly deploy` is fine for now)

## Deferred dependency bumps
- [ ] Node 24 → 26 in the `Dockerfile` (`node:26-alpine`) once Node 26 becomes LTS (October 2026); Node 24 security support runs to April 2028 so there is no rush. Bump `@types/node` to 26 at the same time. `better-sqlite3` rebuilds in the image, nothing else to do.
- [ ] `typescript` 5→7 — the TS team skipped a stable 6 release and shipped 7 as a from-scratch Go-native compiler port (published ~5 weeks ago as of 2026-08-16). Revisit once it's had more time in the wild; needs dedicated testing, not a routine bump.
- [ ] `@dicebear/core` 9→10 — restructures the whole package (individual style packages like `@dicebear/adventurer` removed in favor of a single `@dicebear/styles` package with JSON style definitions; component options renamed, e.g. `eyes` → `eyesVariant`). Real migration work in `client/src/components/Avatar.tsx`, not a routine bump.
