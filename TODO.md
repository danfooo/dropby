# Drop By — TODOs

## Apple / APNs
- [ ] Finish Apple Developer enrollment (pending approval)
- [ ] Create App ID `cc.dropby.app` in Apple Developer portal
- [ ] Generate APNs key (.p8) and implement `sendApns()` in `server/src/services/notifications.ts`

## Infrastructure
- [ ] Set up GitHub Actions deploy-on-push

## Email
- [ ] Set up `hello@dropby.cc` mailbox (contact/support address)
- [ ] Update `rua` in DMARC record once `hello@` or a dedicated address is receiving mail (or remove `rua` if reports aren't needed)
- [ ] Update Google OAuth consent screen support email to `hello@dropby.cc`
