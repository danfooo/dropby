import { test, expect } from '@playwright/test';
import { resetTestUsers, makeFriends, getUserStatus } from '../helpers/server';
import { setupUser, loginUser } from '../helpers/auth';
import { ALICE, BOB } from '../helpers/users';

let aliceId = '';
let bobId = '';

test.beforeAll(async ({ browser }) => {
  await resetTestUsers();

  // Set up both users in separate contexts
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

  // Make them friends via the test API (faster than UI invite flow)
  await makeFriends(ALICE.email, BOB.email);
});

test('Alice opens her door; Bob sees it and taps Going; Alice sees Bob is on the way', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  const bobPage = await bobCtx.newPage();

  try {
    // Log both users in
    await loginUser(alicePage, ALICE);
    await loginUser(bobPage, BOB);

    // Alice opens her door with a note (fill note first, then click)
    const doorNote = 'Come say hi!';
    await alicePage.getByPlaceholder(/or write your own note/i).fill(doorNote);
    await alicePage.getByRole('button', { name: /open now/i }).click();
    await expect(alicePage.getByText("You're open!")).toBeVisible({ timeout: 10_000 });

    // Assert the server has notify_at set on Alice's status
    const aliceStatus = await getUserStatus(aliceId);
    expect(aliceStatus.notify_at).not.toBeNull();
    expect(aliceStatus.note).toBe(doorNote);

    // Bob refreshes his home screen — Alice's door should appear
    await bobPage.reload();
    await bobPage.waitForLoadState('domcontentloaded');

    // Bob sees Alice's door with the note
    await expect(bobPage.getByText(doorNote)).toBeVisible({ timeout: 10_000 });

    // Bob taps "Going ✅"
    await bobPage.getByRole('button', { name: /Going/i }).first().click();

    // Alice's view: go back to home, should show "On their way" with Bob's name
    await alicePage.reload();
    await alicePage.waitForLoadState('domcontentloaded');

    // Alice should see the going signals section with Bob listed
    await expect(alicePage.getByTestId('going-signals')).toBeVisible({ timeout: 10_000 });
    await expect(alicePage.getByTestId('going-signals').getByText('Bob')).toBeVisible();
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
  }
});
