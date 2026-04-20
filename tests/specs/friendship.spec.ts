import { test, expect } from '@playwright/test';
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
