# dropby — TODOs

## Auth
- [ ] Apple OAuth: specced, not implemented

## Apple / APNs
- [ ] Finish Apple Developer enrollment (pending approval)
- [ ] Create App ID `cc.dropby.app` in Apple Developer portal
- [ ] Generate APNs key (.p8) and implement `sendApns()` in `server/src/services/notifications.ts`

## Infrastructure
- [ ] Set up GitHub Actions deploy-on-push

## Google OAuth
- [ ] Change support email on OAuth consent screen to a proper address (currently set to personal email)

## Email
- [ ] Set up `hello@dropby.cc` mailbox (contact/support address)
- [ ] Update `rua` in DMARC record once `hello@` or a dedicated address is receiving mail (or remove `rua` if reports aren't needed)
- [ ] Update Google OAuth consent screen support email to `hello@dropby.cc`
- [ ] SMS delivery for Add Friend: currently logs to console, only email delivery is implemented

## Maybe
- [ ] Don't show the feedback card on Home if the user has submitted feedback within the last month

## Limits & Safety
- [ ] Rate limiting (none in v1)
- [ ] User-saved note cap (no limit in v1)
