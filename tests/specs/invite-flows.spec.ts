import { test, expect } from '@playwright/test';
import { resetTestUsers, makeFriends, getVerificationLink } from '../helpers/server';
import { setupUser, loginUser } from '../helpers/auth';
import { ALICE, BOB, CAROL } from '../helpers/users';

test.beforeEach(async () => {
  await resetTestUsers();
});

test('Friend invite — generic: new user (Carol) and existing user (Bob) both become friends with Alice via her generic invite link', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const carolCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  const bobPage = await bobCtx.newPage();
  const carolPage = await carolCtx.newPage();

  try {
    // Set up Alice and Bob; Carol is a new user who hasn't registered yet
    await setupUser(alicePage, ALICE);
    await setupUser(bobPage, BOB);

    // Alice goes to the Friends tab and generates her generic friendship invite link
    await alicePage.goto('/friends');
    await alicePage.waitForLoadState('domcontentloaded');

    const [inviteResponse] = await Promise.all([
      alicePage.waitForResponse(
        (res) => res.url().includes('/api/invites') && res.request().method() === 'POST',
        { timeout: 5_000 }
      ),
      alicePage.getByRole('button', { name: /^Invite$/i }).click(),
    ]);

    const inviteBody = await inviteResponse.json();
    const inviteUrl = inviteBody.url;
    expect(inviteUrl).toBeTruthy();

    // Bob (already registered) visits Alice's invite link
    await bobPage.goto(inviteUrl);
    await expect(bobPage.getByText("You're now friends!")).toBeVisible({ timeout: 10_000 });

    // Carol (brand new user) registers and visits the invite link
    // First register Carol
    await carolPage.goto('/auth');
    await carolPage.getByRole('button', { name: /sign up/i }).click();
    await carolPage.getByPlaceholder(/display name/i).fill(CAROL.displayName);
    await carolPage.getByPlaceholder(/email/i).fill(CAROL.email);
    await carolPage.getByPlaceholder(/password/i).fill(CAROL.password);
    await carolPage.getByRole('button', { name: /create account/i }).click();
    await carolPage.waitForSelector('.bg-emerald-50', { timeout: 10_000 });

    // Verify Carol's email
    const verifyUrl = await getVerificationLink(CAROL.email);
    await carolPage.goto(verifyUrl);
    await carolPage.waitForURL('**/home', { timeout: 10_000 });

    // Carol visits Alice's invite link
    await carolPage.goto(inviteUrl);
    await expect(carolPage.getByText("You're now friends!")).toBeVisible({ timeout: 10_000 });

    // Alice checks her friends list — should see both Bob and Carol
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

test.skip('Open door with session-specific invite: Carol (new user) and Bob (existing) join via a door-open invite link', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const carolCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  const bobPage = await bobCtx.newPage();
  const carolPage = await carolCtx.newPage();

  try {
    // Set up Alice and Bob; make them friends already
    await setupUser(alicePage, ALICE);
    await setupUser(bobPage, BOB);
    await makeFriends(ALICE.email, BOB.email);

    // Log Alice back in and open her door
    await loginUser(alicePage, ALICE);

    const doorNote = 'Door is open — come by!';
    await alicePage.getByPlaceholder(/or write your own note/i).fill(doorNote);
    await alicePage.getByRole('button', { name: /open the door/i }).click();
    await expect(alicePage.getByText(/you're open/i)).toBeVisible({ timeout: 10_000 });

    // Alice copies the door-open invite link (the "anyone with link" button)
    const [doorInviteResponse] = await Promise.all([
      alicePage.waitForResponse(
        (res) => res.url().includes('/api/invites') && res.request().method() === 'POST',
        { timeout: 5_000 }
      ),
      alicePage.locator('button').filter({ hasText: /anyone with.*link|tap to copy/i }).click(),
    ]);

    const doorInviteBody = await doorInviteResponse.json();
    const doorInviteUrl = doorInviteBody.url;
    expect(doorInviteUrl).toBeTruthy();

    // Log Bob in and visit the door invite link
    await loginUser(bobPage, BOB);
    await bobPage.goto(doorInviteUrl);

    // Bob sees Alice's door is open (already friends, so shows door info)
    await expect(bobPage.getByText(doorNote)).toBeVisible({ timeout: 10_000 });

    // Bob taps Going
    await bobPage.getByRole('button', { name: /going/i }).click();

    // Alice sees Bob is on the way
    await alicePage.reload();
    await alicePage.waitForLoadState('domcontentloaded');
    await expect(alicePage.getByText(/on their way/i)).toBeVisible({ timeout: 10_000 });
    await expect(alicePage.getByText('Bob')).toBeVisible();

    // Carol (new user) visits the door invite link, registers, and becomes friends with Alice
    await carolPage.goto(doorInviteUrl);

    // The invite page shows Alice's open door to an unauthenticated visitor
    await expect(carolPage.getByText(doorNote)).toBeVisible({ timeout: 10_000 });

    // Carol registers via the invite page (or visits /auth and then the link)
    // Register Carol
    await carolPage.goto('/auth');
    await carolPage.getByRole('button', { name: /sign up/i }).click();
    await carolPage.getByPlaceholder(/display name/i).fill(CAROL.displayName);
    await carolPage.getByPlaceholder(/email/i).fill(CAROL.email);
    await carolPage.getByPlaceholder(/password/i).fill(CAROL.password);
    await carolPage.getByRole('button', { name: /create account/i }).click();
    await carolPage.waitForSelector('.bg-emerald-50', { timeout: 10_000 });

    const verifyUrl = await getVerificationLink(CAROL.email);
    await carolPage.goto(verifyUrl);
    await carolPage.waitForURL('**/home', { timeout: 10_000 });

    // Carol visits the door invite link now that she's registered
    await carolPage.goto(doorInviteUrl);
    await expect(carolPage.getByText("You're now friends!")).toBeVisible({ timeout: 10_000 });

    // Alice's friends list now includes Carol
    await alicePage.goto('/friends');
    await alicePage.waitForLoadState('domcontentloaded');
    await expect(alicePage.getByText('Carol')).toBeVisible();
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
    await carolCtx.close();
  }
});
