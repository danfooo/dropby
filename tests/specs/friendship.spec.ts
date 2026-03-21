import { test, expect, Browser, chromium } from '@playwright/test';
import { resetTestUsers } from '../helpers/server';
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

    // Alice goes to the Friends tab
    await alicePage.goto('/friends');
    await alicePage.waitForLoadState('networkidle');

    // Alice clicks the "Invite" button to generate an invite link
    // The handleInvite function calls invitesApi.generate() and then calls navigator.clipboard.writeText
    // Since clipboard API might not be available in headless, we intercept at the API level instead
    // by watching the network request for POST /api/invites
    let inviteUrl = '';
    alicePage.on('response', async (response) => {
      if (response.url().includes('/api/invites') && response.request().method() === 'POST') {
        try {
          const body = await response.json();
          if (body.url) inviteUrl = body.url;
        } catch {}
      }
    });

    await alicePage.getByRole('button', { name: /^Invite$/i }).click();

    // Wait for the invite API response
    await alicePage.waitForResponse(
      (res) => res.url().includes('/api/invites') && res.request().method() === 'POST',
      { timeout: 5_000 }
    );

    expect(inviteUrl).toBeTruthy();

    // Bob registers and is now logged in
    await setupUser(bobPage, BOB);

    // Bob visits Alice's invite link
    // inviteUrl is like http://localhost:5173/invite/TOKEN — use it directly
    await bobPage.goto(inviteUrl);

    // Bob should see the "You're now friends!" confirmation
    await expect(bobPage.getByText("You're now friends!")).toBeVisible({ timeout: 10_000 });

    // Both users see each other in their friends list
    await bobPage.goto('/friends');
    await bobPage.waitForLoadState('networkidle');
    await expect(bobPage.getByText('Alice')).toBeVisible();

    await alicePage.goto('/friends');
    await alicePage.waitForLoadState('networkidle');
    await expect(alicePage.getByText('Bob')).toBeVisible();
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
  }
});
