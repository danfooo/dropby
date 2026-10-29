# dropby — TODOs

## Release plan — native builds (written 2026-10-03)
The server side of the September work is live (production database is at migration v6, including the Live Activity tables). What's left is getting the new iOS and Android builds out, then testing on real phones. One step at a time, in this order.

**1. Make sure production runs current `main`.**
- [ ] The last deploy (v152) was on 2026-09-25; a few server commits from that evening (door-closed push copy, Android "closes soon") may have landed after it. Run `fly deploy` **from the repo root**. In `android/` it fails with "missing an app name". If nothing changed, the deploy is a harmless restart.

**2. iOS — get the Xcode Cloud build through.**
- Where it stands: the app and the new `DoorActivity` Live Activity extension compile (local unsigned Release build succeeded 2026-09-26). Xcode Cloud archived fine but failed at the **ad-hoc export** step (`xcodebuild -exportArchive`, exit code 70) — a signing failure, most likely because the extension's identifier `cc.dropby.app.DoorActivity` didn't exist in the Apple Developer account yet.
- Already done: in local Xcode, the DoorActivity target now signs automatically with team PD486B4Z2Q without errors, which registers the identifier.
- No new capability is needed: Live Activity pushes use the app's existing Push Notifications capability; the app and extension share no data (no App Group); `NSSupportsLiveActivities` is already in `Info.plist`.
- [ ] Check developer.apple.com → Certificates, Identifiers & Profiles → **Identifiers** lists `cc.dropby.app.DoorActivity`. If not: **+** → App IDs → App → Bundle ID (Explicit) `cc.dropby.app.DoorActivity`, no capabilities.
- [ ] App Store Connect → the app → **Xcode Cloud** → failed build → **Rebuild**.
- [ ] If it fails again: the build's **Artifacts** → download `ad-hoc-export-archive-logs` → open `IDEDistribution.standard.log` and look for the `error` lines. They name the part that couldn't be signed.

**3. Android — build and upload.**
- [ ] Rebuild the web code into the Android project first, because Android changes landed after the version bump (ongoing door notification, one "closes soon" prompt): `npm run build && npx cap sync android`. Version is already 1.1 / `versionCode 2` (08bf829); bump `versionCode` again only if 2 was already uploaded to Play.
- [ ] Java: Gradle 8.14.3 runs on Java 8–24, but Android Studio bundles Java 25. One-time fix: open the project (`npx cap open android`) → Settings → Build, Execution, Deployment → Build Tools → Gradle → **Gradle JDK** → **Download JDK…** → version **21** (JetBrains Runtime or Eclipse Temurin) → OK. Not an outdated setup: it's exactly the Capacitor 8 template; Gradle 9 waits for Capacitor 9 (see Deferred dependency bumps).
- [ ] **Build → Generate Signed App Bundle or APK… → Android App Bundle.** Key store `/Users/danielherzog/dropby.keystore`, alias `dropby`, the existing passwords, **release** variant. Never let Android Studio create a new key: Play only accepts updates signed with the original one. Output: `android/app/release/app-release.aab`.
- [ ] Play Console → dropby → **Test and release → Testing → Internal testing → Create new release** → upload the `.aab` → add release notes → **Next** → **Save and publish**.

**4. Test on real phones.** Work through *Native device test pass* below, plus the Live Activity on iOS and the ongoing door notification on Android (*Open door outside the app*).

**5. Later.**
- [ ] Turn on database backups whenever convenient: *Database backups (Litestream)* below.
- [ ] On or after **2026-10-26**: remove legacy JWT sign-in (*Limits & Safety*).
- [ ] Around end of November: Capacitor 9, with Gradle 9 / AGP 9, and the Java 25 issue goes away (*Deferred dependency bumps*).

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

## Open door outside the app (iOS Live Activity, Android notification)
- [ ] **Localize both.** Their copy ("Your door is open", "on their way", "closes in", "Close now", "Keep open +30") is English-only, like every push. Needs a strings catalog in the iOS `DoorActivity` extension and Android string resources once native copy is localized at all.
- [ ] **Scheduled starts on iOS 16.2–17.1.** Push-to-start needs 17.2, so on older iOS a scheduled session that starts while the app is closed only gets its Live Activity when the app is next opened.
- [ ] **The one button on iOS** — Android has "Close now", swapping to "Keep open +30" in the last 5 minutes. iOS needs App Intents (iOS 17+) for this; today tapping the activity just opens the app.
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
- [ ] Capacitor 8 → 9 (expected around end of November 2026), together with Android Gradle Plugin 9 and Gradle 9. Until then `android/` stays on the Capacitor 8 template (AGP 8.13.0, Gradle 8.14.3), which needs Java 21 rather than the Java 25 bundled with current Android Studio. Gradle 9 removes that mismatch.
- [ ] `typescript` 5→7 — the TS team skipped a stable 6 release and shipped 7 as a from-scratch Go-native compiler port (published ~5 weeks ago as of 2026-08-16). Revisit once it's had more time in the wild; needs dedicated testing, not a routine bump.
- [ ] `@dicebear/core` 9→10 — restructures the whole package (individual style packages like `@dicebear/adventurer` removed in favor of a single `@dicebear/styles` package with JSON style definitions; component options renamed, e.g. `eyes` → `eyesVariant`). Real migration work in `client/src/components/Avatar.tsx`, not a routine bump.
