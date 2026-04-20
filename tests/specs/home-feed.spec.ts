import { test, expect } from '@playwright/test';
import { resetTestUsers, makeFriends } from '../helpers/server';
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

// Helper: close active door via API
async function closeDoor(page: any, token: string) {
  await page.evaluate(async (tok: string) => {
    await fetch('http://localhost:3001/api/status', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tok}` },
    });
  }, token);
}

test('Open now: friend door appears in "Doors opened to you" section', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  const bobPage = await bobCtx.newPage();

  try {
    await loginUser(alicePage, ALICE);
    await loginUser(bobPage, BOB);

    const bobToken = await bobPage.evaluate(() => localStorage.getItem('token'));

    // Bob opens his door with Alice as recipient
    await bobPage.evaluate(
      async ({ serverUrl, token, aliceId }) => {
        await fetch(`${serverUrl}/api/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ note: 'Come over!', recipient_ids: [aliceId] }),
        });
      },
      { serverUrl: SERVER_URL, token: bobToken, aliceId },
    );

    // Alice reloads — should see the "Doors opened to you" section with Bob's door
    await alicePage.reload();
    await alicePage.waitForLoadState('domcontentloaded');

    await expect(alicePage.getByTestId('friends-available')).toBeVisible({ timeout: 10_000 });
    await expect(alicePage.getByText('Come over!')).toBeVisible();
  } finally {
    const bobToken = await bobPage.evaluate(() => localStorage.getItem('token'));
    await closeDoor(bobPage, bobToken);
    await aliceCtx.close();
    await bobCtx.close();
  }
});

test('Scheduled: friend scheduled session appears under its time group heading', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  const bobPage = await bobCtx.newPage();

  try {
    await loginUser(alicePage, ALICE);
    await loginUser(bobPage, BOB);

    const bobToken = await bobPage.evaluate(() => localStorage.getItem('token'));
    const nowUnix = Math.floor(Date.now() / 1000);
    const startsAt = nowUnix + 86400;   // exactly 24 hours → "Tomorrow" group
    const endsAt = startsAt + 7200;     // 2-hour window

    // Bob creates a scheduled session with Alice as recipient
    await bobPage.evaluate(
      async ({ serverUrl, token, aliceId, startsAt, endsAt }) => {
        await fetch(`${serverUrl}/api/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            note: 'Joining tomorrow?',
            recipient_ids: [aliceId],
            starts_at: startsAt,
            ends_at: endsAt,
          }),
        });
      },
      { serverUrl: SERVER_URL, token: bobToken, aliceId, startsAt, endsAt },
    );

    // Alice navigates to the Later tab — should see the "Tomorrow" section with Bob's card
    await alicePage.goto('/upcoming');
    await alicePage.waitForLoadState('domcontentloaded');

    await expect(alicePage.getByRole('heading', { name: 'Tomorrow' })).toBeVisible({ timeout: 10_000 });
    await expect(alicePage.getByText('Joining tomorrow?')).toBeVisible();
  } finally {
    // Cancel Bob's scheduled session
    const bobToken = await bobPage.evaluate(() => localStorage.getItem('token'));
    await bobPage.evaluate(async (tok: string) => {
      await fetch('http://localhost:3001/api/status/scheduled', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tok}` },
      });
    }, bobToken);
    await aliceCtx.close();
    await bobCtx.close();
  }
});

test('Muted friend: open door from muted friend does not appear in feed', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  const bobPage = await bobCtx.newPage();

  try {
    await loginUser(alicePage, ALICE);
    await loginUser(bobPage, BOB);

    const aliceToken = await alicePage.evaluate(() => localStorage.getItem('token'));
    const bobToken = await bobPage.evaluate(() => localStorage.getItem('token'));

    // Alice hides Bob
    await alicePage.evaluate(
      async ({ serverUrl, token, bobId }) => {
        await fetch(`${serverUrl}/api/friends/${bobId}/hide`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      },
      { serverUrl: SERVER_URL, token: aliceToken, bobId },
    );

    // Bob opens his door with Alice as recipient
    await bobPage.evaluate(
      async ({ serverUrl, token, aliceId }) => {
        await fetch(`${serverUrl}/api/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ note: 'Muted door note', recipient_ids: [aliceId] }),
        });
      },
      { serverUrl: SERVER_URL, token: bobToken, aliceId },
    );

    // Alice reloads home — Bob's door should NOT appear
    await alicePage.reload();
    await alicePage.waitForLoadState('domcontentloaded');

    await expect(alicePage.getByTestId('friends-available')).not.toBeVisible({ timeout: 5_000 });
    await expect(alicePage.getByText('Muted door note')).not.toBeVisible();

    // Alice goes to Friends and unmutes Bob
    await alicePage.goto('/friends');
    await alicePage.waitForLoadState('domcontentloaded');
    await alicePage.getByRole('button', { name: /unhide/i }).click();

    // Alice navigates back to home — Bob's door should now appear without a reload
    await alicePage.goto('/');
    await alicePage.waitForLoadState('domcontentloaded');

    await expect(alicePage.getByTestId('friends-available')).toBeVisible({ timeout: 10_000 });
    await expect(alicePage.getByText('Muted door note')).toBeVisible();
  } finally {
    // Ensure Bob is unmuted and his door is closed
    const aliceToken = await alicePage.evaluate(() => localStorage.getItem('token'));
    await alicePage.evaluate(
      async ({ serverUrl, token, bobId }) => {
        await fetch(`${serverUrl}/api/friends/${bobId}/hide`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      },
      { serverUrl: SERVER_URL, token: aliceToken, bobId },
    );
    const bobToken = await bobPage.evaluate(() => localStorage.getItem('token'));
    await closeDoor(bobPage, bobToken);
    await aliceCtx.close();
    await bobCtx.close();
  }
});
