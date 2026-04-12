import { Page } from '@playwright/test';
import { getVerificationLink } from './server';

const SERVER_URL = 'http://localhost:3001';

async function seedInviteToken(): Promise<string> {
  const res = await fetch(`${SERVER_URL}/api/test/seed-invite`, { method: 'POST' });
  if (!res.ok) throw new Error(`seed-invite failed: ${res.status}`);
  const data = await res.json();
  return data.token;
}

export interface UserData {
  email: string;
  password: string;
  displayName: string;
}

/**
 * Navigate to /auth, fill in the signup form, submit, and wait for the
 * "check your email" confirmation message.
 */
export async function registerUser(page: Page, { email, password, displayName }: UserData): Promise<void> {
  // Signup is gated on an invite token. Seed one and inject it into localStorage,
  // which the auth page picks up as the invite context. Cleaned up after signup so
  // verification flow doesn't auto-accept a test-seed friendship.
  const inviteToken = await seedInviteToken();
  await page.goto('/auth');
  await page.evaluate(t => localStorage.setItem('dropby_invite_token', t), inviteToken);
  await page.reload();

  // Switch to the signup tab
  await page.getByRole('button', { name: /sign up/i }).click();

  await page.getByPlaceholder(/display name/i).fill(displayName);
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/password/i).fill(password);
  await page.getByRole('button', { name: /create account/i }).click();

  // Wait for the green "check your email" success message
  await page.waitForSelector('.bg-emerald-50', { timeout: 15_000 });

  // Clear the seeded token so the post-verify flow doesn't auto-friend test-seed
  await page.evaluate(() => localStorage.removeItem('dropby_invite_token'));
}

/**
 * Retrieve the verification link via the test API and navigate to it.
 * Waits for the success confirmation on the verify-email page.
 */
export async function verifyEmail(page: Page, email: string): Promise<void> {
  const url = await getVerificationLink(email);
  await page.goto(url);

  // The verify page auto-logs in and redirects to /home after ~1.5s
  await page.waitForURL('**/home', { timeout: 15_000 });
}

/**
 * Navigate to /auth, fill in the login form, and wait for the home screen.
 */
export async function loginUser(page: Page, { email, password }: Pick<UserData, 'email' | 'password'>): Promise<void> {
  await page.goto('/auth');

  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/password/i).fill(password);
  await page.locator('form').getByRole('button', { name: /log in/i }).click();

  // Wait for redirect to /home
  await page.waitForURL('**/home', { timeout: 10_000 });
}

/**
 * Full setup: register, verify email, then log in (the verify page auto-navigates to /home).
 * Returns the logged-in user's id by calling /api/auth/me with the stored token.
 */
export async function setupUser(page: Page, userData: UserData): Promise<string> {
  await registerUser(page, userData);
  await verifyEmail(page, userData.email);

  // verifyEmail navigates to /home automatically after success; wait for it
  await page.waitForURL('**/home', { timeout: 10_000 });

  // Retrieve user id via /api/auth/me using the JWT stored in localStorage
  const userId = await page.evaluate(async (serverUrl) => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const res = await fetch(`${serverUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.id ?? null;
  }, SERVER_URL);

  if (!userId) {
    throw new Error(`setupUser: could not retrieve user id for ${userData.email}`);
  }

  return userId as string;
}
