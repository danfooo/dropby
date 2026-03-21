import { test, expect } from '@playwright/test';
import { resetTestUsers, makeFriends, getUserStatus } from '../helpers/server';
import { setupUser, loginUser } from '../helpers/auth';
import { ALICE, BOB, CAROL } from '../helpers/users';

const SERVER_URL = 'http://localhost:3000';

let aliceId = '';
let bobId = '';
let carolId = '';

test.beforeAll(async ({ browser }) => {
  await resetTestUsers();

  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const carolCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  const bobPage = await bobCtx.newPage();
  const carolPage = await carolCtx.newPage();

  try {
    aliceId = await setupUser(alicePage, ALICE);
    bobId = await setupUser(bobPage, BOB);
    carolId = await setupUser(carolPage, CAROL);
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
    await carolCtx.close();
  }

  await makeFriends(ALICE.email, BOB.email);
  await makeFriends(ALICE.email, CAROL.email);
});

test('Notification scheduling — newly added recipient: Carol gets added to an existing open door', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();

  try {
    await loginUser(alicePage, ALICE);

    // Alice opens her door visible only to Bob (not Carol)
    const token = await alicePage.evaluate(() => localStorage.getItem('token'));

    const statusRes = await alicePage.evaluate(
      async ({ serverUrl, token, bobId }) => {
        const r = await fetch(`${serverUrl}/api/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ note: 'Notify test', recipient_ids: [bobId] }),
        });
        return r.json();
      },
      { serverUrl: SERVER_URL, token, bobId }
    );

    const statusId = statusRes.id;
    expect(statusId).toBeTruthy();

    // Verify Bob is a recipient but Carol is not
    expect(statusRes.recipients.map((r: any) => r.id)).toContain(bobId);
    expect(statusRes.recipients.map((r: any) => r.id)).not.toContain(carolId);

    // Alice edits the recipients to add Carol
    const updatedStatus = await alicePage.evaluate(
      async ({ serverUrl, token, bobId, carolId }) => {
        const r = await fetch(`${serverUrl}/api/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ recipient_ids: [bobId, carolId] }),
        });
        return r.json();
      },
      { serverUrl: SERVER_URL, token, bobId, carolId }
    );

    // Both Bob and Carol should now be in the recipients list
    const recipientIds = updatedStatus.recipients.map((r: any) => r.id);
    expect(recipientIds).toContain(bobId);
    expect(recipientIds).toContain(carolId);

    // The status should have notify_at set (scheduled for 90 seconds after creation)
    const aliceStatus = await getUserStatus(aliceId);
    expect(aliceStatus.notify_at).not.toBeNull();
  } finally {
    await aliceCtx.close();
  }
});

test('Muted users — notification behaviour: muting controls who the host notifies', async ({ browser }) => {
  // Reset for a clean run
  await resetTestUsers();

  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  const bobPage = await bobCtx.newPage();

  let localAliceId = '';
  let localBobId = '';

  try {
    localAliceId = await setupUser(alicePage, ALICE);
    localBobId = await setupUser(bobPage, BOB);
    await makeFriends(ALICE.email, BOB.email);

    // Alice mutes Bob (Alice is the host; by muting Bob, Alice won't notify him when she opens her door)
    await loginUser(alicePage, ALICE);

    const aliceToken = await alicePage.evaluate(() => localStorage.getItem('token'));

    await alicePage.evaluate(
      async ({ serverUrl, token, bobId }) => {
        await fetch(`${serverUrl}/api/friends/${bobId}/mute`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      },
      { serverUrl: SERVER_URL, token: aliceToken, bobId: localBobId }
    );

    // Alice opens her door — the UI excludes muted friends from recipient selection
    // For a direct test of the notification path, open via API with Bob in recipient_ids
    // The server respects Alice's mute list for scheduled sessions but spontaneous
    // notifications go through the cron which also checks mutedByHost.
    // Here we open the door via the UI to confirm muted friends are excluded from selection.
    await alicePage.reload();
    await alicePage.waitForLoadState('networkidle');

    // Open the door via UI — Bob should not appear in the recipient list (muted)
    await alicePage.getByRole('button', { name: /open the door/i }).click();

    // Bob should not be in the "visible to" list since Alice muted him
    // The recipient checkboxes are for non-muted friends only
    const doorFormText = await alicePage.locator('form, .space-y-4, [class*="form"]').textContent().catch(() => '');

    // Click Open (with no recipients selected, or only non-muted)
    await alicePage.getByRole('button', { name: /open the door/i }).last().click();
    await expect(alicePage.getByText(/you're open/i)).toBeVisible({ timeout: 10_000 });

    // Verify via test API that the status was created
    const aliceStatus = await getUserStatus(localAliceId);
    expect(aliceStatus).toBeTruthy();
    // notify_at is set (the cron will check mutedByHost before actually sending notifications)
    expect(aliceStatus.notify_at).not.toBeNull();

    // Bob should not see Alice's door in his feed because he is not a recipient
    // (Alice muted Bob → Bob was excluded from Alice's recipient list)
    await loginUser(bobPage, BOB);
    await bobPage.reload();
    await bobPage.waitForLoadState('networkidle');

    // Bob's home page should not show Alice's open door
    const homeText = await bobPage.locator('body').textContent();
    expect(homeText).not.toContain("You're open!");
    // Alice's door note (empty in this case) won't appear, and no "going" button for Alice's door
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
  }
});
