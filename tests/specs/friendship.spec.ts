import { test, expect } from '@playwright/test';
import { resetTestUsers, areFriends } from '../helpers/server';
import { setupUser } from '../helpers/auth';
import { ALICE, BOB } from '../helpers/users';

test.beforeEach(async () => {
  await resetTestUsers();
});

test('Alice shares invite link; Bob visits it and they become friends', async ({ browser }) => {
  // Set up two separate browser contexts to simulate two different users
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  const bobPage = await bobCtx.newPage();

  try {
    // Register and log in Alice
    await setupUser(alicePage, ALICE);

    // Generate invite via API (friend-only, no status)
    const inviteData = await alicePage.evaluate(async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      return res.json();
    });
    const inviteUrl = inviteData.url;
    expect(inviteUrl).toBeTruthy();

    // Bob registers and is now logged in
    await setupUser(bobPage, BOB);

    // Bob visits Alice's invite link
    // inviteUrl is like http://localhost:5173/invite/TOKEN — use it directly
    await bobPage.goto(inviteUrl);

    // Nothing is created until Bob accepts — opening the link only offers the connection
    await expect(bobPage.getByTestId('invite-confirm')).toBeVisible({ timeout: 10_000 });
    expect(await areFriends(ALICE.email, BOB.email)).toBe(false);
    await bobPage.getByTestId('invite-accept').click();

    // Bob should see the "You're now friends!" confirmation
    await expect(bobPage.getByText("You're now friends!")).toBeVisible({ timeout: 10_000 });

    // Both users see each other in their friends list
    await bobPage.goto('/friends');
    await bobPage.waitForLoadState('domcontentloaded');
    await expect(bobPage.getByText('Alice')).toBeVisible();

    await alicePage.goto('/friends');
    await alicePage.waitForLoadState('domcontentloaded');
    await expect(alicePage.getByText('Bob')).toBeVisible();
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
  }
});

// ---------------------------------------------------------------------------
// Deferring an invite: closing it leaves the decision pending in Friends,
// and no connection exists in the meantime.
// ---------------------------------------------------------------------------

async function generateInvite(page: any): Promise<{ url: string; token: string }> {
  const data = await page.evaluate(async () => {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    return res.json();
  });
  return { url: data.url as string, token: (data.url as string).split('/').pop()! };
}

test('Bob closes the invite; it waits in his Friends tab until he accepts', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  const bobPage = await bobCtx.newPage();

  try {
    await setupUser(alicePage, ALICE);
    const { url } = await generateInvite(alicePage);
    await setupUser(bobPage, BOB);

    await bobPage.goto(url);
    await expect(bobPage.getByTestId('invite-confirm')).toBeVisible({ timeout: 10_000 });
    await bobPage.getByTestId('invite-close').click();

    // Closing creates nothing — Alice is not told the link was opened, and no edge exists
    expect(await areFriends(ALICE.email, BOB.email)).toBe(false);
    await alicePage.goto('/friends');
    await alicePage.waitForLoadState('domcontentloaded');
    await expect(alicePage.getByText('Bob')).not.toBeVisible();

    // It waits for Bob in his Friends tab, where he can still accept it
    await bobPage.goto('/friends');
    await bobPage.waitForLoadState('domcontentloaded');
    const waiting = bobPage.getByTestId('incoming-invites');
    await expect(waiting).toBeVisible({ timeout: 10_000 });
    await expect(waiting.getByText('Alice')).toBeVisible();
    await waiting.getByRole('button', { name: /accept/i }).click();

    await expect.poll(() => areFriends(ALICE.email, BOB.email), { timeout: 10_000 }).toBe(true);
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
  }
});

test('Revoking a link does not retract an invite that was already opened', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  const bobPage = await bobCtx.newPage();

  try {
    await setupUser(alicePage, ALICE);
    const { url, token } = await generateInvite(alicePage);
    await setupUser(bobPage, BOB);

    // Bob opens the link while it is live, but doesn't decide yet
    await bobPage.goto(url);
    await expect(bobPage.getByTestId('invite-confirm')).toBeVisible({ timeout: 10_000 });
    await bobPage.getByTestId('invite-close').click();

    // Alice revokes the link — "revoke" means "expire now", so it only stops people
    // who never opened it. Bob's pending invite is his to accept whenever.
    await alicePage.evaluate(async (t: string) => {
      const jwt = localStorage.getItem('token');
      await fetch(`/api/invites/${t}/revoke`, { method: 'POST', headers: { Authorization: `Bearer ${jwt}` } });
    }, token);

    await bobPage.goto('/friends');
    await bobPage.waitForLoadState('domcontentloaded');
    const waiting = bobPage.getByTestId('incoming-invites');
    await expect(waiting).toBeVisible({ timeout: 10_000 });
    await waiting.getByRole('button', { name: /accept/i }).click();

    await expect.poll(() => areFriends(ALICE.email, BOB.email), { timeout: 10_000 }).toBe(true);
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
  }
});

test('Dismissing clears the pending invite, and re-opening the link asks again', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  const bobPage = await bobCtx.newPage();

  try {
    await setupUser(alicePage, ALICE);
    const { url } = await generateInvite(alicePage);
    await setupUser(bobPage, BOB);

    await bobPage.goto(url);
    await expect(bobPage.getByTestId('invite-confirm')).toBeVisible({ timeout: 10_000 });
    await bobPage.getByTestId('invite-close').click();

    await bobPage.goto('/friends');
    await bobPage.waitForLoadState('domcontentloaded');
    const waiting = bobPage.getByTestId('incoming-invites');
    await expect(waiting).toBeVisible({ timeout: 10_000 });
    await waiting.getByTitle(/dismiss/i).click();
    await expect(bobPage.getByTestId('incoming-invites')).not.toBeVisible({ timeout: 10_000 });

    // The link itself is untouched: opening it again brings the decision back
    await bobPage.goto(url);
    await expect(bobPage.getByTestId('invite-confirm')).toBeVisible({ timeout: 10_000 });
    await bobPage.getByTestId('invite-accept').click();
    await expect(bobPage.getByTestId('invite-accepted')).toBeVisible({ timeout: 10_000 });
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
  }
});
