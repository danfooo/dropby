import { test, expect } from '@playwright/test';
import { resetTestUsers } from '../helpers/server';
import { setupUser } from '../helpers/auth';
import { ALICE } from '../helpers/users';

test.beforeEach(async () => {
  await resetTestUsers();
});

test('User changes their display name — it updates on the profile page', async ({ page }) => {
  await setupUser(page, ALICE);
  await page.goto('/profile');
  await page.waitForLoadState('domcontentloaded');

  // Click the Edit button next to Display Name
  await page.getByRole('button', { name: /^edit$/i }).click();

  // Clear and type a new name
  const nameInput = page.getByRole('textbox').first();
  await nameInput.clear();
  await nameInput.fill('Alice Renamed');

  await page.getByRole('button', { name: /^save$/i }).click();

  // The new name should now appear on the profile page (appears in header + display name field)
  await expect(page.getByText('Alice Renamed').first()).toBeVisible({ timeout: 5_000 });
});

test('User changes language preference — language selector updates', async ({ page }) => {
  await setupUser(page, ALICE);
  await page.goto('/profile');
  await page.waitForLoadState('domcontentloaded');

  // Find the language select and change to Deutsch
  const languageSelect = page.locator('select');
  await languageSelect.selectOption('de');

  // The select should now show the German option as selected
  await expect(languageSelect).toHaveValue('de');
});

test('User adds a reminder — it appears in the reminders list', async ({ page }) => {
  await setupUser(page, ALICE);
  await page.goto('/profile');
  await page.waitForLoadState('domcontentloaded');

  // Click the "+ Add" button in the Reminders section header
  await page.getByRole('button', { name: /^\+ add$/i }).first().click();

  // The AddNudgeModal should open — select Saturday and hour 11 (the default suggestion)
  // Click the "Saturday" day button in the modal
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

  // Click the "Sat" day button
  await page.getByRole('dialog').getByRole('button', { name: /sat/i }).click();

  // Select hour 11
  await page.getByRole('dialog').getByRole('button', { name: /11/i }).first().click();

  // Click the "Add reminder" confirm button inside the modal
  await page.getByRole('dialog').getByRole('button', { name: /add reminder/i }).click();

  // Modal should close and the reminder should appear in the list
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });

  // Saturday should appear in the reminders section
  await expect(page.getByText(/saturday/i)).toBeVisible({ timeout: 5_000 });
});

test('User removes a reminder — it disappears from the reminders list', async ({ page }) => {
  await setupUser(page, ALICE);

  // Add a reminder directly via the API (via page.evaluate) to set up state faster
  await page.evaluate(async () => {
    const token = localStorage.getItem('token');
    await fetch('http://localhost:3000/api/nudges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ day_of_week: 'sat', hour: 11 }),
    });
  });

  await page.goto('/profile');
  await page.waitForLoadState('domcontentloaded');

  // Saturday reminder should be visible
  await expect(page.getByText(/saturday/i)).toBeVisible({ timeout: 5_000 });

  // Click the remove (×) button next to the Saturday reminder
  await page.getByTestId('nudge-remove').click();

  // The remove button should disappear (nudge removed; empty state shown instead)
  await expect(page.getByTestId('nudge-remove')).not.toBeVisible({ timeout: 5_000 });
});
