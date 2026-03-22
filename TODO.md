# dropby — TODOs

## Auth
- [ ] Apple OAuth: specced, not implemented

## Apple / APNs
- [ ] Finish Apple Developer enrollment (pending approval)
- [ ] Create App ID `cc.dropby.app` in Apple Developer portal
- [ ] Generate APNs key (.p8) and implement `sendApns()` in `server/src/services/notifications.ts`

## Infrastructure
- [ ] Set up GitHub Actions deploy-on-push

## Legal
- [ ] Replace imprint address with a proxy/forwarding address (currently home address in `client/src/pages/About.tsx`)

## Email
- [ ] Set up `hi@dropby.cc` mailbox — email access for dropby.cc domain not yet configured (needed for imprint contact + support)
- [ ] Update `rua` in DMARC record once `hello@` or a dedicated address is receiving mail (or remove `rua` if reports aren't needed)
- [ ] Update Google OAuth consent screen support email to `hi@dropby.cc` — requires creating a Google account for `hi@dropby.cc` (via "use my current email address") so it appears in the dropdown
- [ ] SMS delivery for Add Friend: currently logs to console, only email delivery is implemented

## Android

- [ ] **Tab bar safe area flicker on first load** — `--safe-area-inset-bottom` is injected by Capacitor's `SystemBars` plugin via JS after page render. There may be a brief flash where the tab bar sits too low before the variable is set. If seen, fix by hardcoding a reasonable CSS fallback (e.g. `var(--safe-area-inset-bottom, 24px)`) or by deferring first paint until insets are ready. See `client/src/index.css` `.safe-bottom` and `android/app/src/main/java/cc/dropby/app/MainActivity.java`.

## Maybe
- [ ] Don't show the feedback card on Home if the user has submitted feedback within the last month

## Limits & Safety
- [ ] Rate limiting (none in v1)
- [ ] User-saved note cap (no limit in v1)
