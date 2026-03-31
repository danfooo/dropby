import { test, expect } from '@playwright/test';
import { resetTestUsers, makeFriends } from '../helpers/server';
import { setupUser, loginUser } from '../helpers/auth';
import { ALICE, BOB, CAROL } from '../helpers/users';

const SERVER_URL = 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Generic friendship invite
// ---------------------------------------------------------------------------
// Alice, Bob are pre-registered; Carol is NOT — she registers mid-test.
// No friendships exist at the start.
// ---------------------------------------------------------------------------
test.describe('Generic friendship invite', () => {
  let aliceId = '';
  let bobId = '';

  test.beforeAll(async ({ browser }) => {
    await resetTestUsers();

    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    const alicePage = await aliceCtx.newPage();
    const bobPage = await bobCtx.newPage();

    try {
      aliceId = await setupUser(alicePage, ALICE);
      bobId = await setupUser(bobPage, BOB);
    } finally {
      await aliceCtx.close();
      await bobCtx.close();
    }
  });

  test('Bob (existing user) and Carol (new user) both become friends with Alice', async ({ browser }) => {
    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    const carolCtx = await browser.newContext();
    const alicePage = await aliceCtx.newPage();
    const bobPage = await bobCtx.newPage();
    const carolPage = await carolCtx.newPage();

    try {
      await loginUser(alicePage, ALICE);
      await loginUser(bobPage, BOB);

      // Alice opens Friends and generates a generic invite link
      await alicePage.goto('/friends');
      await alicePage.waitForLoadState('domcontentloaded');

      const [inviteResponse] = await Promise.all([
        alicePage.waitForResponse(
          (res) => res.url().includes('/api/invites') && res.request().method() === 'POST',
          { timeout: 5_000 },
        ),
        alicePage.getByRole('button', { name: /copy invite link/i }).first().click(),
      ]);

      const { url: inviteUrl } = await inviteResponse.json();
      expect(inviteUrl).toBeTruthy();

      // Bob (registered, not yet friends with Alice) visits the invite link
      await bobPage.goto(inviteUrl);
      await expect(bobPage.getByTestId('invite-accepted')).toBeVisible({ timeout: 10_000 });

      // Carol registers as a brand new user, then visits the invite link
      await carolPage.goto('/auth');
      await carolPage.getByRole('button', { name: /sign up/i }).click();
      await carolPage.getByPlaceholder(/display name/i).fill(CAROL.displayName);
      await carolPage.getByPlaceholder(/email/i).fill(CAROL.email);
      await carolPage.getByPlaceholder(/password/i).fill(CAROL.password);
      await carolPage.getByRole('button', { name: /create account/i }).click();
      await carolPage.waitForSelector('.bg-emerald-50', { timeout: 10_000 });

      // Verify Carol's email via the test API
      const verifyRes = await fetch(`${SERVER_URL}/api/test/verification-link/${encodeURIComponent(CAROL.email)}`);
      const { url: verifyUrl } = await verifyRes.json();
      await carolPage.goto(verifyUrl);
      await carolPage.waitForURL('**/home', { timeout: 10_000 });

      await carolPage.goto(inviteUrl);
      await expect(carolPage.getByTestId('invite-accepted')).toBeVisible({ timeout: 10_000 });

      // Alice's friends list now shows both Bob and Carol
      await alicePage.goto('/friends');
      await alicePage.waitForLoadState('domcontentloaded');
      await expect(alicePage.getByText('Bob')).toBeVisible();
      await expect(alicePage.getByText('Carol')).toBeVisible();
    } finally {
      await aliceCtx.close();
      await bobCtx.close();
      await carolCtx.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Door-open invite
// ---------------------------------------------------------------------------
// Alice & Bob are friends. Carol is registered but NOT Alice's friend.
// ---------------------------------------------------------------------------
test.describe('Door-open invite', () => {
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
    // Alice & Bob are friends; Carol is not Alice's friend
  });

  test('Bob (friend) sees the open door; Carol (non-friend) gets auto-friended and sees the door', async ({ browser }) => {
    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    const carolCtx = await browser.newContext();
    const alicePage = await aliceCtx.newPage();
    const bobPage = await bobCtx.newPage();
    const carolPage = await carolCtx.newPage();

    try {
      await loginUser(alicePage, ALICE);
      await loginUser(bobPage, BOB);
      await loginUser(carolPage, CAROL);

      // Alice opens her door with a note
      const doorNote = 'Drop by anytime!';
      await alicePage.getByPlaceholder(/or write your own note/i).fill(doorNote);
      await alicePage.getByRole('button', { name: /open now/i }).click();
      await expect(alicePage.getByText(/you're open/i)).toBeVisible({ timeout: 10_000 });

      // Alice taps "Anyone with link" to create a door-specific invite link
      const [inviteResponse] = await Promise.all([
        alicePage.waitForResponse(
          (res) => res.url().includes('/api/invites') && res.request().method() === 'POST',
          { timeout: 5_000 },
        ),
        alicePage.locator('button').filter({ hasText: 'Anyone with link' }).click(),
      ]);

      const { url: doorInviteUrl } = await inviteResponse.json();
      expect(doorInviteUrl).toBeTruthy();

      // Bob (already a friend) visits the invite link — sees "Already friends!" with the door note
      await bobPage.goto(doorInviteUrl);
      await expect(bobPage.getByTestId('invite-already-friends')).toBeVisible({ timeout: 10_000 });
      // The door note is shown inside the "already friends" screen
      await expect(bobPage.getByText(doorNote, { exact: false })).toBeVisible();

      // Carol (non-friend) visits the invite link — gets auto-friended and sees the door note
      await carolPage.goto(doorInviteUrl);
      await expect(carolPage.getByTestId('invite-accepted')).toBeVisible({ timeout: 10_000 });
      await expect(carolPage.getByTestId('invite-door-note')).toBeVisible();

      // Carol is auto-added as a recipient — she sees Alice's door on her home feed
      await carolPage.goto('/home');
      await carolPage.waitForLoadState('domcontentloaded');
      await expect(carolPage.getByTestId('friends-available')).toBeVisible({ timeout: 10_000 });
    } finally {
      await aliceCtx.close();
      await bobCtx.close();
      await carolCtx.close();
    }
  });
});
