import { test, expect } from '@playwright/test';
import { resetTestUsers, makeFriends } from '../helpers/server';
import { setupUser, loginUser } from '../helpers/auth';
import { ALICE, BOB } from '../helpers/users';

const SERVER_URL = 'http://localhost:3001';

// Returns a unix timestamp a given number of days in the future at a given hour
function futureUnix(daysFromNow: number, hour: number): number {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

// Format as HH:MM for <input type="time">
function toTimeStr(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

// Format as YYYY-MM-DD for <input type="date">
function toDateStr(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

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

  await makeFriends(ALICE.email, BOB.email);
});

test('Alice creates three scheduled sessions, edits one note, changes end time on another, and cancels the first', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();

  try {
    await loginUser(alicePage, ALICE);

    // Helper: create a scheduled session via the API directly (faster than UI for setup)
    const token = await alicePage.evaluate(async () => localStorage.getItem('token'));

    // Create 3 sessions on different days using the API
    const sessions: Array<{ id: string; note: string }> = [];
    for (let i = 1; i <= 3; i++) {
      const starts_at = futureUnix(i, 14);
      const ends_at = futureUnix(i, 15);
      const note = `Session ${i}`;
      const res = await alicePage.evaluate(
        async ({ serverUrl, token, body }) => {
          const r = await fetch(`${serverUrl}/api/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
          });
          return r.json();
        },
        { serverUrl: SERVER_URL, token, body: { starts_at, ends_at, note, recipient_ids: [bobId] } }
      );
      sessions.push({ id: res.id, note });
    }

    // Navigate to Later tab and verify all three appear in the upcoming sessions list
    await alicePage.goto('/upcoming');
    await alicePage.waitForLoadState('domcontentloaded');

    await expect(alicePage.getByText('Session 1')).toBeVisible({ timeout: 5_000 });
    await expect(alicePage.getByText('Session 2')).toBeVisible({ timeout: 5_000 });
    await expect(alicePage.getByText('Session 3')).toBeVisible({ timeout: 5_000 });

    // Edit the note on Session 2 via the API
    await alicePage.evaluate(
      async ({ serverUrl, token, sessionId }) => {
        await fetch(`${serverUrl}/api/status/${sessionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ note: 'Session 2 updated' }),
        });
      },
      { serverUrl: SERVER_URL, token, sessionId: sessions[1].id }
    );

    await alicePage.reload();
    await alicePage.waitForLoadState('domcontentloaded');

    // Only Session 2 has the updated note; Sessions 1 and 3 are unchanged
    await expect(alicePage.getByText('Session 2 updated')).toBeVisible({ timeout: 5_000 });
    await expect(alicePage.getByText('Session 1')).toBeVisible();
    await expect(alicePage.getByText('Session 3')).toBeVisible();
    await expect(alicePage.getByText('Session 2', { exact: true })).not.toBeVisible();

    // Change the end time on Session 3 via the API
    const newEndsAt = futureUnix(3, 16); // 1 hour later than before
    const updatedSession3 = await alicePage.evaluate(
      async ({ serverUrl, token, sessionId, ends_at }) => {
        const r = await fetch(`${serverUrl}/api/status/${sessionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ends_at }),
        });
        return r.json();
      },
      { serverUrl: SERVER_URL, token, sessionId: sessions[2].id, ends_at: newEndsAt }
    );

    // Verify the server returned the updated ends_at
    expect(updatedSession3.ends_at).toBe(newEndsAt);

    // Cancel Session 1 via the API
    await alicePage.evaluate(
      async ({ serverUrl, token, sessionId }) => {
        await fetch(`${serverUrl}/api/status/scheduled/${sessionId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      },
      { serverUrl: SERVER_URL, token, sessionId: sessions[0].id }
    );

    await alicePage.reload();
    await alicePage.waitForLoadState('domcontentloaded');

    // Session 1 should be gone; Sessions 2 and 3 should still be there
    await expect(alicePage.getByText('Session 1')).not.toBeVisible({ timeout: 5_000 });
    await expect(alicePage.getByText('Session 2 updated')).toBeVisible();
    await expect(alicePage.getByText('Session 3')).toBeVisible();
  } finally {
    await aliceCtx.close();
  }
});
