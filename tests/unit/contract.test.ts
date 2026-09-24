import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as s from '@dropby/shared';

// Every body the apps send today must still be accepted. Each fixture mirrors a real
// call site (noted alongside), so tightening a schema can't silently break a screen.

const accepts = (schema: { safeParse: (v: unknown) => { success: boolean } }, body: unknown, where: string) =>
  assert.ok(schema.safeParse(body).success, `${where} should be accepted: ${JSON.stringify(body)}`);
const rejects = (schema: { safeParse: (v: unknown) => { success: boolean } }, body: unknown, why: string) =>
  assert.equal(schema.safeParse(body).success, false, `should be rejected (${why}): ${JSON.stringify(body)}`);

test('contract — door bodies sent by Home and Later', () => {
  accepts(s.createStatusBody, { note: 'Come over', location: undefined, recipient_ids: ['a', 'b'] }, 'Home open');
  accepts(s.createStatusBody, { recipient_ids: [] }, 'Home open, no note');
  accepts(s.createStatusBody, { note: 'BBQ', recipient_ids: ['a'], starts_at: 1790000000, ends_at: 1790003600, reminder_minutes: 30 }, 'Later schedule');
  accepts(s.createStatusBody, { recipient_ids: ['a'], starts_at: null, reminder_minutes: 30 }, 'Later schedule with an invalid date (NaN → null)');
  accepts(s.updateStatusBody, { note: undefined, location: undefined, recipient_ids: ['a'], ends_at: 1790003600 }, 'Home edit');
  accepts(s.updateStatusByIdBody, { note: 'x', starts_at: 1790000000, ends_at: 1790003600 }, 'Later edit');
  accepts(s.setDurationBody, { minutes: 90 }, 'Home duration');
  accepts(s.createStatusBody, {}, 'quick POST with empty body');
});

test('contract — auth bodies', () => {
  accepts(s.signupBody, { email: 'a@b.c', password: 'pw', display_name: 'A', locale: 'de', redirect_url: undefined, invite_token: null }, 'Auth signup');
  accepts(s.loginBody, { email: 'a@b.c', password: 'pw' }, 'Auth login');
  accepts(s.googleSignInBody, { credential: 'jwt', invite_token: null }, 'Google');
  accepts(s.appleSignInBody, { identityToken: 'jwt', fullName: { givenName: 'A', familyName: undefined }, invite_token: null }, 'Apple');
  accepts(s.appleSignInBody, { identityToken: 'jwt' }, 'Apple, no name');
  accepts(s.updateMeBody, { display_name: 'New' }, 'Profile rename');
  accepts(s.updateMeBody, { auto_nudge_enabled: false }, 'Notifications toggle');
  accepts(s.updateMeBody, { going_reminder_2: '60m' }, 'Notifications reminder');
  accepts(s.pushTokenBody, { token: 'abc', platform: 'ios' }, 'push registration');
  accepts(s.removePushTokenBody, {}, 'push deregistration without a token');
});

test('contract — going, friends, invites and the rest', () => {
  accepts(s.goingBody, {}, 'goingApi.send without a note (undefined dropped by JSON)');
  accepts(s.goingBody, { note: 'on my way' }, 'goingApi.updateNote');
  accepts(s.guestGoingBody, { name: 'Guest', contact: undefined, marketing_consent: false, note: undefined }, 'Invite guest RSVP');
  accepts(s.claimGuestBody, { signal_id: 'x' }, 'claim after sign-in');
  accepts(s.hideFriendBody, {}, 'iOS native "Mute permanently"');
  accepts(s.hideFriendBody, { duration_days: 3 }, 'iOS native "Mute for 3 days"');
  accepts(s.notifPrefBody, { pref: 'all' }, 'Friends notif pref');
  accepts(s.userIdsBody, { user_ids: ['a'] }, 'suggestions');
  accepts(s.fromUserIdsBody, { from_user_ids: ['a', 'b'] }, 'batch accept');
  accepts(s.createInviteBody, {}, 'generic invite link');
  accepts(s.createInviteBody, { status_id: 'x', name: 'Sunday BBQ' }, 'door invite link');
  accepts(s.acceptInviteBody, { also: ['a'] }, 'accept with candidates');
  accepts(s.renameInviteBody, { name: '' }, 'clear link name');
  accepts(s.saveNoteBody, { text: 'Home' }, 'save note');
  accepts(s.hideNoteBody, { hidden: true }, 'hide note');
  accepts(s.addNudgeBody, { day_of_week: 'fri', hour: 18 }, 'add nudge');
  accepts(s.feedbackBody, { type: 'bug', message: 'x', reply_email: undefined }, 'feedback');
  accepts(s.trackBody, { event: 'chip.selected', data: { chip: 'im_home', index: 0 } }, 'track');
  accepts(s.trackBody, { event: 'page.auth_viewed' }, 'track without data');
});

test('contract — malformed bodies are refused', () => {
  rejects(s.loginBody, { email: 42, password: 'pw' }, 'email not a string');
  rejects(s.createStatusBody, { recipient_ids: 'a' }, 'recipients not a list');
  rejects(s.createStatusBody, { recipient_ids: [1, 2] }, 'recipient ids not strings');
  rejects(s.createStatusBody, { starts_at: 'tomorrow' }, 'time not numeric');
  rejects(s.goingBody, { note: { $gt: '' } }, 'note not a string');
  rejects(s.hideNoteBody, { hidden: 'yes' }, 'hidden not a boolean');
});

test('contract — numeric strings become numbers, extra keys pass through', () => {
  const parsed = s.createStatusBody.parse({ starts_at: '1790000000', client_version: 7 }) as any;
  assert.equal(parsed.starts_at, 1790000000);
  assert.equal(parsed.client_version, 7);
});

test('validate middleware — 400 INVALID_REQUEST with the problem, parsed body otherwise', async () => {
  const { validateBody } = await import('../../server/src/middleware/validate.js');
  const run = (body: unknown) => new Promise<{ status: number; body?: any; parsed?: any }>(resolve => {
    const req: any = { body };
    const res: any = { status: (code: number) => ({ json: (b: any) => resolve({ status: code, body: b }) }) };
    validateBody(s.setDurationBody)(req, res, () => resolve({ status: 200, parsed: req.body }));
  });
  const bad = await run({ minutes: 'lots' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'INVALID_REQUEST');
  assert.equal(bad.body.issues[0].path, 'minutes');
  const good = await run({ minutes: '45' });
  assert.equal(good.status, 200);
  assert.equal(good.parsed.minutes, 45);
  assert.equal((await run(undefined)).status, 400, 'missing required field');
});
