import { test, expect } from '@playwright/test';
import { resetTestUsers, areFriends } from '../helpers/server';
import { setupUser } from '../helpers/auth';
import { ALICE, BOB, CAROL } from '../helpers/users';

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
    await bobPage.getByTestId('incoming-connect').click();

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
    await bobPage.getByTestId('incoming-connect').click();

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

// ---------------------------------------------------------------------------
// One link, everyone connected: people who opened the same link are candidates
// for each other, not just for the host.
// ---------------------------------------------------------------------------

test('Two people who opened the same link can connect with each other, not just the host', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const carolCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  const bobPage = await bobCtx.newPage();
  const carolPage = await carolCtx.newPage();

  try {
    await setupUser(alicePage, ALICE);
    const { url } = await generateInvite(alicePage);

    // Bob is first: nobody else has opened the link yet, so there is no one to offer
    await setupUser(bobPage, BOB);
    await bobPage.goto(url);
    await expect(bobPage.getByTestId('invite-confirm')).toBeVisible({ timeout: 10_000 });
    await expect(bobPage.getByTestId('invite-candidates')).not.toBeVisible();
    await bobPage.getByTestId('invite-accept').click();
    await expect(bobPage.getByTestId('invite-accepted')).toBeVisible({ timeout: 10_000 });

    // Carol opens the same link and is offered Bob, pre-checked, in the same action
    await setupUser(carolPage, CAROL);
    await carolPage.goto(url);
    await expect(carolPage.getByTestId('invite-confirm')).toBeVisible({ timeout: 10_000 });
    const candidates = carolPage.getByTestId('invite-candidates');
    await expect(candidates).toBeVisible();
    await expect(candidates.getByText('Bob')).toBeVisible();
    await expect(candidates.getByRole('checkbox')).toBeChecked();
    await carolPage.getByTestId('invite-accept').click();
    await expect(carolPage.getByTestId('invite-accepted')).toBeVisible({ timeout: 10_000 });

    // The host connection is immediate; Bob has only been asked
    await expect.poll(() => areFriends(ALICE.email, CAROL.email), { timeout: 10_000 }).toBe(true);
    expect(await areFriends(BOB.email, CAROL.email)).toBe(false);

    // Bob accepts from his Friends tab and the pair is connected
    await bobPage.goto('/friends');
    await bobPage.waitForLoadState('domcontentloaded');
    const waiting = bobPage.getByTestId('incoming-invites');
    await expect(waiting).toBeVisible({ timeout: 10_000 });
    await expect(waiting.getByText('Carol')).toBeVisible();
    await bobPage.getByTestId('incoming-connect').click();
    await expect.poll(() => areFriends(BOB.email, CAROL.email), { timeout: 10_000 }).toBe(true);
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
    await carolCtx.close();
  }
});

test('Both sides picking each other connects them with no accept step', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const carolCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  const bobPage = await bobCtx.newPage();
  const carolPage = await carolCtx.newPage();

  try {
    await setupUser(alicePage, ALICE);
    const { url } = await generateInvite(alicePage);

    await setupUser(bobPage, BOB);
    await bobPage.goto(url);
    await bobPage.getByTestId('invite-accept').click();
    await expect(bobPage.getByTestId('invite-accepted')).toBeVisible({ timeout: 10_000 });

    // Carol picks Bob — Bob has not picked her, so it only waits
    await setupUser(carolPage, CAROL);
    await carolPage.goto(url);
    await expect(carolPage.getByTestId('invite-candidates')).toBeVisible({ timeout: 10_000 });
    await carolPage.getByTestId('invite-accept').click();
    await expect(carolPage.getByTestId('invite-accepted')).toBeVisible({ timeout: 10_000 });
    expect(await areFriends(BOB.email, CAROL.email)).toBe(false);

    // Bob re-opens the link. He is already friends with Alice, but the link is still how
    // he catches whoever joined after him — and since Carol already picked him, picking
    // her back connects them straight away rather than sending her a second invitation.
    await bobPage.goto(url);
    await expect(bobPage.getByTestId('invite-already-friends')).toBeVisible({ timeout: 10_000 });
    const catchUp = bobPage.getByTestId('invite-candidates');
    await expect(catchUp).toBeVisible();
    await expect(catchUp.getByText('Carol')).toBeVisible();
    await bobPage.getByTestId('invite-also-connect').click();
    await expect(bobPage.getByTestId('invite-also-done')).toBeVisible({ timeout: 10_000 });

    await expect.poll(() => areFriends(BOB.email, CAROL.email), { timeout: 10_000 }).toBe(true);

    // Nothing was left waiting for either of them
    await bobPage.goto('/friends');
    await bobPage.waitForLoadState('domcontentloaded');
    await expect(bobPage.getByTestId('incoming-invites')).not.toBeVisible();
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
    await carolCtx.close();
  }
});

test('People you are already connected to are left out of the list', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const carolCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  const bobPage = await bobCtx.newPage();
  const carolPage = await carolCtx.newPage();

  try {
    await setupUser(alicePage, ALICE);
    const { url } = await generateInvite(alicePage);

    await setupUser(bobPage, BOB);
    await bobPage.goto(url);
    await bobPage.getByTestId('invite-accept').click();
    await expect(bobPage.getByTestId('invite-accepted')).toBeVisible({ timeout: 10_000 });

    // Carol connects with Alice and asks Bob; Bob accepts, so the pair is settled
    await setupUser(carolPage, CAROL);
    await carolPage.goto(url);
    await expect(carolPage.getByTestId('invite-candidates')).toBeVisible({ timeout: 10_000 });
    await carolPage.getByTestId('invite-accept').click();
    await expect(carolPage.getByTestId('invite-accepted')).toBeVisible({ timeout: 10_000 });

    await bobPage.goto('/friends');
    await bobPage.waitForLoadState('domcontentloaded');
    await expect(bobPage.getByTestId('incoming-invites')).toBeVisible({ timeout: 10_000 });
    await bobPage.getByTestId('incoming-connect').click();
    await expect.poll(() => areFriends(BOB.email, CAROL.email), { timeout: 10_000 }).toBe(true);

    // Re-opening the link offers nobody: Carol is the only other person on it and Bob
    // is now connected to her, so there is nothing left to pick.
    await bobPage.goto(url);
    await expect(bobPage.getByTestId('invite-already-friends')).toBeVisible({ timeout: 10_000 });
    await expect(bobPage.getByTestId('invite-candidates')).not.toBeVisible();
    await expect(bobPage.getByTestId('invite-also-connect')).not.toBeVisible();

    // And Carol, opening it again, is likewise offered nobody
    await carolPage.goto(url);
    await expect(carolPage.getByTestId('invite-already-friends')).toBeVisible({ timeout: 10_000 });
    await expect(carolPage.getByTestId('invite-candidates')).not.toBeVisible();
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
    await carolCtx.close();
  }
});

// ---------------------------------------------------------------------------
// Named links: the name is in the URL, on the invite screen, and on the other
// person's waiting row — so an unfamiliar name arrives with a reason attached.
// ---------------------------------------------------------------------------

async function generateNamedInvite(page: any, name: string): Promise<{ url: string; path: string }> {
  const data = await page.evaluate(async (linkName: string) => {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: linkName }),
    });
    return res.json();
  }, name);
  const url = data.url as string;
  return { url, path: `/invite/${url.split('/invite/')[1]}` };
}

test('A named link carries its name in the URL, on the invite screen and on the waiting row', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const carolCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  const bobPage = await bobCtx.newPage();
  const carolPage = await carolCtx.newPage();

  try {
    await setupUser(alicePage, ALICE);
    const { path } = await generateNamedInvite(alicePage, 'Sunday BBQ');

    // The name is readable in the link itself, ahead of the token
    expect(path).toContain('sunday-bbq-');

    // ...and the slugged URL resolves exactly like a bare token would
    await setupUser(bobPage, BOB);
    await bobPage.goto(path);
    await expect(bobPage.getByTestId('invite-confirm')).toBeVisible({ timeout: 10_000 });
    await expect(bobPage.getByTestId('invite-link-name')).toHaveText('Sunday BBQ');
    await bobPage.getByTestId('invite-accept').click();
    await expect(bobPage.getByTestId('invite-accepted')).toBeVisible({ timeout: 10_000 });

    // Carol picks Bob off the link; Bob is told where the request came from
    await setupUser(carolPage, CAROL);
    await carolPage.goto(path);
    await expect(carolPage.getByTestId('invite-candidates')).toBeVisible({ timeout: 10_000 });
    await carolPage.getByTestId('invite-accept').click();
    await expect(carolPage.getByTestId('invite-accepted')).toBeVisible({ timeout: 10_000 });

    await bobPage.goto('/friends');
    await bobPage.waitForLoadState('domcontentloaded');
    const waiting = bobPage.getByTestId('incoming-invites');
    await expect(waiting).toBeVisible({ timeout: 10_000 });
    await expect(waiting.getByText('Carol')).toBeVisible();
    await expect(waiting.getByText(/from Sunday BBQ/i)).toBeVisible();
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
    await carolCtx.close();
  }
});

test('Creating a link asks for a name first', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await setupUser(page, ALICE);
    await page.goto('/friends');
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('button', { name: /new invite link/i }).first().click();
    await expect(page.getByPlaceholder(/sunday bbq/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('copy-named-link')).toBeVisible();
  } finally {
    await ctx.close();
  }
});
