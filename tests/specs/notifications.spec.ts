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

test('Muted friend is excluded from recipient list when host opens door', async ({ browser }) => {
  // Uses aliceId, bobId, carolId from beforeAll.
  // Alice & Bob are friends; Alice & Carol are friends; no mutes yet.
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const carolCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  const bobPage = await bobCtx.newPage();
  const carolPage = await carolCtx.newPage();

  let aliceToken = '';

  try {
    await loginUser(alicePage, ALICE);
    await loginUser(bobPage, BOB);
    await loginUser(carolPage, CAROL);

    aliceToken = await alicePage.evaluate(() => localStorage.getItem('token') ?? '');

    // Close any door Alice left open from a previous test, then mute Bob
    await alicePage.evaluate(
      async ({ serverUrl, token, bobId }) => {
        await fetch(`${serverUrl}/api/status`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        await fetch(`${serverUrl}/api/friends/${bobId}/mute`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      },
      { serverUrl: SERVER_URL, token: aliceToken, bobId },
    );

    // Reload so the UI picks up Bob's muted state
    await alicePage.reload();
    await alicePage.waitForLoadState('domcontentloaded');

    // Wait until the door-closed view is ready (friends data loaded, button interactive)
    await expect(alicePage.getByRole('button', { name: /open the door/i })).toBeVisible({ timeout: 10_000 });

    // Alice opens her door (no explicit recipient selection — relies on UI defaults)
    await alicePage.getByRole('button', { name: /open the door/i }).click();
    await expect(alicePage.getByText(/you're open/i)).toBeVisible({ timeout: 10_000 });

    // Verify via the status API that Bob is NOT a recipient but Carol IS
    const aliceStatus: any = await alicePage.evaluate(
      async ({ serverUrl, token }) => {
        const r = await fetch(`${serverUrl}/api/status`, { headers: { Authorization: `Bearer ${token}` } });
        return r.json();
      },
      { serverUrl: SERVER_URL, token: aliceToken },
    );
    const recipientIds = aliceStatus.recipients.map((r: any) => r.id);
    expect(recipientIds).not.toContain(bobId);
    expect(recipientIds).toContain(carolId);

    // Bob's home: Alice's door is NOT visible (he's not a recipient)
    await bobPage.goto('/home');
    await bobPage.waitForLoadState('domcontentloaded');
    await expect(bobPage.getByTestId('friends-available')).not.toBeVisible({ timeout: 5_000 });

    // Carol's home: Alice's door IS visible (she is a recipient)
    await carolPage.goto('/home');
    await carolPage.waitForLoadState('domcontentloaded');
    await expect(carolPage.getByTestId('friends-available')).toBeVisible({ timeout: 10_000 });
  } finally {
    // Unmute Bob and close Alice's door
    await alicePage.evaluate(
      async ({ serverUrl, token, bobId }) => {
        await fetch(`${serverUrl}/api/friends/${bobId}/mute`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        await fetch(`${serverUrl}/api/status`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      },
      { serverUrl: SERVER_URL, token: aliceToken, bobId },
    );
    await aliceCtx.close();
    await bobCtx.close();
    await carolCtx.close();
  }
});
