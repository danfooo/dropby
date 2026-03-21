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

    // Alice opens her door with a note
    const doorNote = 'Come say hi!';

    // Click "Open the door" button
    await alicePage.getByRole('button', { name: /open the door/i }).click();

    // Fill in the note
    await alicePage.getByPlaceholder(/note/i).fill(doorNote);

    // Click the confirm/open button (also labelled "Open the door")
    await alicePage.getByRole('button', { name: /open the door/i }).last().click();

    // Wait for Alice's door-open view
    await expect(alicePage.getByText("You're open!")).toBeVisible({ timeout: 10_000 });

    // Assert the server has notify_at set on Alice's status
    const aliceStatus = await getUserStatus(aliceId);
    expect(aliceStatus.notify_at).not.toBeNull();
    expect(aliceStatus.note).toBe(doorNote);

    // Bob refreshes his home screen — Alice's door should appear
    await bobPage.reload();
    await bobPage.waitForLoadState('networkidle');

    // Bob sees Alice's door with the note
    await expect(bobPage.getByText(doorNote)).toBeVisible({ timeout: 10_000 });

    // Bob taps "Going ✅"
    await bobPage.getByRole('button', { name: /Going/i }).first().click();

    // Alice's view: go back to home, should show "On their way" with Bob's name
    await alicePage.reload();
    await alicePage.waitForLoadState('networkidle');

    // Alice should see the going signals section with Bob listed
    await expect(alicePage.getByText(/on their way/i)).toBeVisible({ timeout: 10_000 });
    await expect(alicePage.getByText('Bob')).toBeVisible();
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
  }
});
