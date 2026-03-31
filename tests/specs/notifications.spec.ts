import { test, expect } from '@playwright/test';
import { resetTestUsers, makeFriends, getUserStatus } from '../helpers/server';
import { setupUser, loginUser } from '../helpers/auth';
import { ALICE, BOB, CAROL } from '../helpers/users';

const SERVER_URL = 'http://localhost:3001';

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

test('Spontaneous door open sets notify_at in the near future with notifications_sent = 0', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();

  try {
    await loginUser(alicePage, ALICE);
    const token = await alicePage.evaluate(() => localStorage.getItem('token'));
    const before = Math.floor(Date.now() / 1000);

    await alicePage.evaluate(
      async ({ serverUrl, token, bobId }) => {
        await fetch(`${serverUrl}/api/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ note: 'Spontaneous', recipient_ids: [bobId] }),
        });
      },
      { serverUrl: SERVER_URL, token, bobId }
    );

    const status = await getUserStatus(aliceId);
    expect(status.notify_at).not.toBeNull();
    expect(status.notify_at!).toBeGreaterThan(before);
    expect(status.notify_at!).toBeLessThanOrEqual(before + 120);
    expect(status.notifications_sent).toBe(false);
  } finally {
    const token = await alicePage.evaluate(() => localStorage.getItem('token'));
    await alicePage.evaluate(
      async ({ serverUrl, token }) => {
        await fetch(`${serverUrl}/api/status`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      },
      { serverUrl: SERVER_URL, token }
    );
    await aliceCtx.close();
  }
});

test('Scheduled session creation sets notify_at = null (notification sent immediately)', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();

  try {
    await loginUser(alicePage, ALICE);
    const token = await alicePage.evaluate(() => localStorage.getItem('token'));

    const startsAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const endsAt = startsAt + 3600;

    // Check notify_at directly from the creation response — the test status
    // endpoint only returns currently-active statuses, not future ones.
    const created = await alicePage.evaluate(
      async ({ serverUrl, token, bobId, startsAt, endsAt }) => {
        const r = await fetch(`${serverUrl}/api/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ note: 'Scheduled', recipient_ids: [bobId], starts_at: startsAt, ends_at: endsAt }),
        });
        return r.json();
      },
      { serverUrl: SERVER_URL, token, bobId, startsAt, endsAt }
    );

    expect(created.notify_at).toBeNull();
  } finally {
    const token = await alicePage.evaluate(() => localStorage.getItem('token'));
    await alicePage.evaluate(
      async ({ serverUrl, token }) => {
        await fetch(`${serverUrl}/api/status`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      },
      { serverUrl: SERVER_URL, token }
    );
    await aliceCtx.close();
  }
});

test('Push token registration is accepted by the server', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();

  try {
    await loginUser(alicePage, ALICE);
    const token = await alicePage.evaluate(() => localStorage.getItem('token'));

    const status = await alicePage.evaluate(
      async ({ serverUrl, token }) => {
        const r = await fetch(`${serverUrl}/api/auth/push-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ token: 'fake-device-token-abc123', platform: 'ios' }),
        });
        return r.status;
      },
      { serverUrl: SERVER_URL, token }
    );

    expect(status).toBe(200);
  } finally {
    await aliceCtx.close();
  }
});

test('Push token registration rejects unknown platform', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();

  try {
    await loginUser(alicePage, ALICE);
    const token = await alicePage.evaluate(() => localStorage.getItem('token'));

    const status = await alicePage.evaluate(
      async ({ serverUrl, token }) => {
        const r = await fetch(`${serverUrl}/api/auth/push-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ token: 'fake-device-token-abc123', platform: 'web' }),
        });
        return r.status;
      },
      { serverUrl: SERVER_URL, token }
    );

    expect(status).toBe(400);
  } finally {
    await aliceCtx.close();
  }
});

test('RSVP going on an open door succeeds and is recorded', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  const bobPage = await bobCtx.newPage();

  try {
    await loginUser(alicePage, ALICE);
    await loginUser(bobPage, BOB);

    const aliceToken = await alicePage.evaluate(() => localStorage.getItem('token'));
    const bobToken = await bobPage.evaluate(() => localStorage.getItem('token'));

    // Alice opens her door for Bob
    const statusRes = await alicePage.evaluate(
      async ({ serverUrl, token, bobId, carolId }) => {
        const r = await fetch(`${serverUrl}/api/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ note: 'Come over', recipient_ids: [bobId, carolId] }),
        });
        return r.json();
      },
      { serverUrl: SERVER_URL, token: aliceToken, bobId, carolId }
    );

    // Bob RSVPs going
    const rsvpStatus = await bobPage.evaluate(
      async ({ serverUrl, token, statusId }) => {
        const r = await fetch(`${serverUrl}/api/going/${statusId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ rsvp: 'going' }),
        });
        return r.status;
      },
      { serverUrl: SERVER_URL, token: bobToken, statusId: statusRes.id }
    );

    expect(rsvpStatus).toBe(201);
  } finally {
    const aliceToken = await alicePage.evaluate(() => localStorage.getItem('token'));
    await alicePage.evaluate(
      async ({ serverUrl, token }) => {
        await fetch(`${serverUrl}/api/status`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      },
      { serverUrl: SERVER_URL, token: aliceToken }
    );
    await aliceCtx.close();
    await bobCtx.close();
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

    // Wait until Carol's name appears in the recipient list — confirms friends query has resolved
    // and the muted state is reflected. Waiting for the button alone is not enough because the
    // button renders before the async friends data arrives.
    await expect(alicePage.getByText('Carol')).toBeVisible({ timeout: 10_000 });

    // Alice opens her door (no explicit recipient selection — relies on UI defaults)
    await alicePage.getByRole('button', { name: /open now/i }).click();
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
