import { test, expect } from '@playwright/test';
import { resetTestUsers, areFriends } from '../helpers/server';
import { setupUser, registerUser, verifyEmail } from '../helpers/auth';
import { ALICE, BOB, CAROL } from '../helpers/users';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function openDoor(page: any) {
  await page.goto('/home');
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('button', { name: /open now/i }).click();
  await expect(page.getByText(/you're open/i)).toBeVisible({ timeout: 10_000 });
}

// Generate an invite via the API (no UI needed — invite UI is tested elsewhere).
// `forDoor: true` mirrors the link copied from an open door: it carries the status id,
// which is what grants the acceptor access to that door. Without it the link is
// friend-only and never adds anyone to a door.
async function generateInvite(page: any, opts: { forDoor?: boolean } = {}): Promise<string> {
  const data = await page.evaluate(async (forDoor: boolean) => {
    const token = localStorage.getItem('token');
    const body: Record<string, string> = {};
    if (forDoor) {
      const statusRes = await fetch('/api/status', { headers: { 'Authorization': `Bearer ${token}` } });
      const status = await statusRes.json();
      body.status_id = status.id;
    }
    const res = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return res.json();
  }, Boolean(opts.forDoor));
  return data.url as string;
}

// Accept an invite via the API directly and return whether it was a new friendship
async function acceptInvite(page: any, inviteUrl: string): Promise<void> {
  const token = inviteUrl.split('/').pop()!;
  await page.evaluate(async (t: string) => {
    const jwt = localStorage.getItem('token');
    await fetch(`/api/invites/${t}/accept`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${jwt}` },
    });
  }, token);
}

// ---------------------------------------------------------------------------
// Friendship is created at signup time (before email verification)
// ---------------------------------------------------------------------------

test.describe('Friendship at signup', () => {
  test.beforeEach(async () => { await resetTestUsers(); });

  test('friendship exists before email verification', async ({ browser }) => {
    const aliceCtx = await browser.newContext();
    const carolCtx = await browser.newContext();
    const alicePage = await aliceCtx.newPage();
    const carolPage = await carolCtx.newPage();

    try {
      await setupUser(alicePage, ALICE);
      const inviteUrl = await generateInvite(alicePage);
      const token = inviteUrl.split('/').pop()!;

      // Carol signs up using Alice's invite token — friendship should be created immediately at signup
      await carolPage.goto('/auth');
      await carolPage.evaluate((t: string) => localStorage.setItem('dropby_invite_token', t), token);
      await carolPage.reload();
      await carolPage.getByRole('button', { name: /sign up/i }).click();
      await carolPage.getByPlaceholder(/display name/i).fill(CAROL.displayName);
      await carolPage.getByPlaceholder(/email/i).fill(CAROL.email);
      await carolPage.getByPlaceholder(/password/i).fill(CAROL.password);
      await carolPage.getByRole('button', { name: /create account/i }).click();
      await carolPage.waitForSelector('.bg-emerald-50', { timeout: 15_000 });

      // Friendship must exist already — Carol has not verified her email yet
      expect(await areFriends(ALICE.email, CAROL.email)).toBe(true);

      // Alice sees Carol in friends list without any further action from Carol
      await alicePage.goto('/friends');
      await alicePage.waitForLoadState('domcontentloaded');
      await expect(alicePage.getByText('Carol')).toBeVisible();
    } finally {
      await aliceCtx.close();
      await carolCtx.close();
    }
  });

  test('new user sees inviter open door after signup', async ({ browser }) => {
    const aliceCtx = await browser.newContext();
    const carolCtx = await browser.newContext();
    const alicePage = await aliceCtx.newPage();
    const carolPage = await carolCtx.newPage();

    try {
      await setupUser(alicePage, ALICE);
      await openDoor(alicePage);
      const inviteUrl = await generateInvite(alicePage, { forDoor: true });
      const token = inviteUrl.split('/').pop()!;

      // Carol signs up with Alice's door link — acceptInviteToken adds Carol to that status's recipients
      await carolPage.goto('/auth');
      await carolPage.evaluate((t: string) => localStorage.setItem('dropby_invite_token', t), token);
      await carolPage.reload();
      await carolPage.getByRole('button', { name: /sign up/i }).click();
      await carolPage.getByPlaceholder(/display name/i).fill(CAROL.displayName);
      await carolPage.getByPlaceholder(/email/i).fill(CAROL.email);
      await carolPage.getByPlaceholder(/password/i).fill(CAROL.password);
      await carolPage.getByRole('button', { name: /create account/i }).click();
      await carolPage.waitForSelector('.bg-emerald-50', { timeout: 15_000 });

      // Carol verifies and lands on home
      await verifyEmail(carolPage, CAROL.email);

      // Carol should immediately see Alice's open door
      await expect(carolPage.getByTestId('friends-available')).toBeVisible({ timeout: 10_000 });
    } finally {
      await aliceCtx.close();
      await carolCtx.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Mutual door visibility when friendship forms between existing users
// ---------------------------------------------------------------------------

test.describe('Mutual door visibility on friend accept', () => {
  test.beforeEach(async () => { await resetTestUsers(); });

  test('Alice has open door; Bob accepts invite — Bob sees door on home', async ({ browser }) => {
    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    const alicePage = await aliceCtx.newPage();
    const bobPage = await bobCtx.newPage();

    try {
      await setupUser(alicePage, ALICE);
      await setupUser(bobPage, BOB);

      await openDoor(alicePage);
      const inviteUrl = await generateInvite(alicePage, { forDoor: true });

      // Bob accepts Alice's door link — acceptInviteToken adds Bob to that status's recipients
      await acceptInvite(bobPage, inviteUrl);

      // Bob navigates to home and should see Alice's open door
      await bobPage.goto('/home');
      await bobPage.waitForLoadState('domcontentloaded');
      await expect(bobPage.getByTestId('friends-available')).toBeVisible({ timeout: 10_000 });
    } finally {
      await aliceCtx.close();
      await bobCtx.close();
    }
  });

  test('Bob has open door; Alice accepts invite — Alice sees door on home', async ({ browser }) => {
    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    const alicePage = await aliceCtx.newPage();
    const bobPage = await bobCtx.newPage();

    try {
      await setupUser(alicePage, ALICE);
      await setupUser(bobPage, BOB);

      await openDoor(bobPage);
      const inviteUrl = await generateInvite(bobPage, { forDoor: true });

      // Alice accepts Bob's invite
      await acceptInvite(alicePage, inviteUrl);

      await alicePage.goto('/home');
      await alicePage.waitForLoadState('domcontentloaded');
      await expect(alicePage.getByTestId('friends-available')).toBeVisible({ timeout: 10_000 });
    } finally {
      await aliceCtx.close();
      await bobCtx.close();
    }
  });

  test('both have open doors — the door link is one-way, the acceptor\'s own door stays private', async ({ browser }) => {
    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    const alicePage = await aliceCtx.newPage();
    const bobPage = await bobCtx.newPage();

    try {
      await setupUser(alicePage, ALICE);
      await setupUser(bobPage, BOB);

      await openDoor(alicePage);
      await openDoor(bobPage);

      const inviteUrl = await generateInvite(alicePage, { forDoor: true });
      await acceptInvite(bobPage, inviteUrl);

      // Bob sees Alice's door — that's what the door link is for
      await bobPage.goto('/home');
      await bobPage.waitForLoadState('domcontentloaded');
      await expect(bobPage.getByTestId('friends-available')).toBeVisible({ timeout: 10_000 });

      // Alice does NOT see Bob's door: Bob opened it before they were friends and
      // never chose her as a recipient
      await alicePage.goto('/home');
      await alicePage.waitForLoadState('domcontentloaded');
      await expect(alicePage.getByTestId('friends-available')).not.toBeVisible();
    } finally {
      await aliceCtx.close();
      await bobCtx.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Friend-only invite (from Friends tab) never exposes the open session
// ---------------------------------------------------------------------------

test.describe('Friend-only invite does not attach session', () => {
  test.beforeEach(async () => { await resetTestUsers(); });

  test('invite generated while door is open has no session — Bob sees no door note on invite page', async ({ browser }) => {
    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    const alicePage = await aliceCtx.newPage();
    const bobPage = await bobCtx.newPage();

    try {
      await setupUser(alicePage, ALICE);
      await setupUser(bobPage, BOB);

      // Alice opens her door with a distinctive note
      await alicePage.goto('/home');
      await alicePage.waitForLoadState('domcontentloaded');
      await alicePage.getByPlaceholder(/or write your own note/i).fill('Secret note');
      await alicePage.getByRole('button', { name: /open now/i }).click();
      await expect(alicePage.getByText(/you're open/i)).toBeVisible({ timeout: 10_000 });

      // Generate invite from the API (friend-only, no status_id)
      const inviteUrl = await generateInvite(alicePage);

      // Bob visits the invite page — should see acceptance, but NOT the door note
      await bobPage.goto(inviteUrl);
      await expect(bobPage.getByTestId('invite-accepted')).toBeVisible({ timeout: 10_000 });
      await expect(bobPage.getByTestId('invite-door-note')).not.toBeVisible();

      // And Bob does NOT see Alice's door on home — a friend-only link creates the
      // friendship and nothing more
      await bobPage.goto('/home');
      await bobPage.waitForLoadState('domcontentloaded');
      await expect(bobPage.getByTestId('friends-available')).not.toBeVisible();
    } finally {
      await aliceCtx.close();
      await bobCtx.close();
    }
  });
});
