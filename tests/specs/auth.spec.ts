import { test, expect } from '@playwright/test';
import { resetTestUsers } from '../helpers/server';
import { registerUser, verifyEmail, loginUser } from '../helpers/auth';
import { ALICE } from '../helpers/users';

test.beforeEach(async () => {
  await resetTestUsers();
});

test('register, verify email, and log in successfully', async ({ page }) => {
  // Register
  await registerUser(page, ALICE);

  // The "check your email" banner should appear
  await expect(page.locator('.bg-emerald-50')).toBeVisible();

  // Verify email via test API link — auto-redirects to /home
  await verifyEmail(page, ALICE.email);

  // Should now be on /home
  await expect(page).toHaveURL(/\/home/);
});

test('login before email verification is blocked', async ({ page }) => {
  // Register but don't verify
  await registerUser(page, ALICE);

  // Attempt to log in — should fail with "email not verified" message
  await loginUser(page, ALICE).catch(() => {
    // loginUser throws if /home is not reached — that's expected here
  });

  await page.goto('/auth');
  await page.getByPlaceholder(/email/i).fill(ALICE.email);
  await page.getByPlaceholder(/password/i).fill(ALICE.password);
  await page.locator('form').getByRole('button', { name: /log in/i }).click();

  // Should show the "check your email" error (EMAIL_NOT_VERIFIED maps to verifyEmailSent)
  await expect(page.locator('.bg-red-50')).toBeVisible();
  await expect(page.locator('.bg-red-50')).toContainText('Check your email');

  // Should still be on /auth, not /home
  await expect(page).not.toHaveURL(/\/home/);
});
