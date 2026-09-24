import { test, expect, Page } from '@playwright/test';
import { resetTestUsers, makeFriends } from '../helpers/server';
import { setupUser, loginUser } from '../helpers/auth';
import { ALICE, BOB } from '../helpers/users';

const SERVER_URL = 'http://localhost:3001';

let aliceId = '';
let bobId = '';

test.beforeAll(async ({ browser }) => {
  await resetTestUsers();
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  try {
    aliceId = await setupUser(await aliceCtx.newPage(), ALICE);
    bobId = await setupUser(await bobCtx.newPage(), BOB);
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
  }
  await makeFriends(ALICE.email, BOB.email);
});

const storedToken = (page: Page) => page.evaluate(() => localStorage.getItem('token'));

async function me(token: string): Promise<number> {
  return (await fetch(`${SERVER_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).status;
}

async function sseConnections(userId: string): Promise<number> {
  return (await (await fetch(`${SERVER_URL}/api/test/sse-connections/${userId}`)).json()).count;
}

test('an old sign-in token keeps the user signed in and is replaced by a session', async ({ page }) => {
  const { token: jwt } = await (await fetch(`${SERVER_URL}/api/test/legacy-jwt/${aliceId}`)).json();

  await page.goto('/auth');
  await page.evaluate(t => localStorage.setItem('token', t), jwt);
  await page.goto('/home');

  await expect(page).toHaveURL(/\/home/);
  await expect.poll(() => storedToken(page)).not.toBe(jwt);
  const replacement = (await storedToken(page))!;
  expect(replacement.split('.').length).toBe(1);
  expect(await me(replacement)).toBe(200);

  // The event stream reconnects with the new token.
  await expect.poll(() => sseConnections(aliceId), { timeout: 15_000 }).toBeGreaterThan(0);
});

test('logging out ends the session on the server', async ({ page }) => {
  await loginUser(page, ALICE);
  const token = (await storedToken(page))!;
  expect(await me(token)).toBe(200);

  await page.goto('/profile');
  await page.getByRole('button', { name: /log out/i }).click();
  await expect(page).not.toHaveURL(/\/profile/);

  expect(await me(token)).toBe(401);
});

test('a friend\'s RSVP reaches the host live over the event stream', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  try {
    await loginUser(alicePage, ALICE);
    const aliceToken = (await storedToken(alicePage))!;

    const status = await (await fetch(`${SERVER_URL}/api/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({ note: 'Live test', recipient_ids: [bobId] }),
    })).json();

    await alicePage.reload();
    await expect.poll(() => sseConnections(aliceId), { timeout: 15_000 }).toBeGreaterThan(0);
    // Let the page's own initial fetches settle before watching for the live refetch.
    await alicePage.waitForTimeout(1500);

    const bobToken = await (async () => {
      const r = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: BOB.email, password: BOB.password }),
      });
      return (await r.json()).token as string;
    })();

    // Home polls every 30 s; a refetch within 5 s of the RSVP can only come from the stream.
    const refetch = alicePage.waitForRequest(
      r => r.method() === 'GET' && new URL(r.url()).pathname === '/api/status',
      { timeout: 5_000 },
    );
    const rsvp = await fetch(`${SERVER_URL}/api/going/${status.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bobToken}` },
      body: JSON.stringify({}),
    });
    expect(rsvp.status).toBe(201);
    await refetch;
  } finally {
    await aliceCtx.close();
  }
});
