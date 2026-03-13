# Auth & Invite Flow — Test Scenarios

These should eventually become automated integration tests against a real in-memory SQLite DB with email transport mocked to capture outgoing links.

---

## Signup

- [ ] Valid signup → 201, verification email sent
- [ ] Valid signup with `redirect_url` (from invite link) → verification email link includes redirect
- [ ] Duplicate email, already verified → 409
- [ ] Duplicate email, unverified → 409 `EMAIL_EXISTS_UNVERIFIED` so client can show resend button
- [ ] Missing display name → 400
- [ ] Missing email or password → 400

## Email Verification

- [ ] Valid token → user marked verified, JWT returned
- [ ] Expired token → 400
- [ ] Token for already-verified user → 400
- [ ] Token with `redirect` param → preserved in response for client to navigate to

## Login

- [ ] Correct credentials, verified email → JWT returned
- [ ] Wrong password → 401
- [ ] Unknown email → 401
- [ ] Correct credentials, unverified email → 403 `EMAIL_NOT_VERIFIED`
- [ ] Google login, new user → account created, `email_verified = 1`, JWT returned
- [ ] Google login, existing email → accounts merged, JWT returned

## Resend Verification

- [ ] Resend for unverified email → new token issued, old token no longer works
- [ ] Resend with `redirect_url` → verification email link includes redirect
- [ ] Resend for already-verified email → silent 200 (no leak)
- [ ] Resend for unknown email → silent 200 (no leak)

## Forgot / Reset Password

- [ ] Valid email → reset email sent with token
- [ ] Unknown email → silent 200 (no enumeration)
- [ ] Valid reset token + new password → password updated, `email_verified = 1`, JWT returned
- [ ] Expired reset token → 400
- [ ] Invalid reset token → 400
- [ ] Password too short → 400
- [ ] Token cannot be reused after successful reset

## Invite Flow (cross-cutting)

- [ ] Sign up via invite link → verification email includes invite redirect
- [ ] Resend verification via invite link → resent email still includes invite redirect
- [ ] Verify email with invite redirect → JWT + redirect URL returned so client can complete the invite
- [ ] Accept invite → friendship created
- [ ] Accept own invite link → detected, no friendship created
- [ ] Accept invite when already friends → correct state returned
- [ ] Accept invite for expired invite → correct error returned
- [ ] Accept invite for invalid token → 404
