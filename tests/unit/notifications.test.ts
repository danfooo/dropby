import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatScheduledDayTime, formatScheduledTime } from '../../server/src/utils/time-format.js';

// 2026-06-18T13:00:00Z — real timestamp from the bug (Lingyu's "Come over" session).
// Recipients in Berlin (UTC+2) saw "Thu 1:00 PM" instead of "Thu 3:00 PM".
const STARTS_AT = 1781787600;

test('formatScheduledDayTime — UTC', () => {
  const result = formatScheduledDayTime(STARTS_AT, 'UTC');
  assert.ok(result.includes('1:00 PM'), `expected "1:00 PM" in "${result}"`);
  assert.ok(result.toLowerCase().includes('thu'), `expected "Thu" in "${result}"`);
});

test('formatScheduledDayTime — Europe/Berlin (CEST = UTC+2) shows local time', () => {
  // 13:00 UTC = 15:00 CEST — this is what the notification should have shown
  const result = formatScheduledDayTime(STARTS_AT, 'Europe/Berlin');
  assert.ok(result.includes('3:00 PM'), `expected "3:00 PM" in "${result}"`);
});

test('formatScheduledDayTime — America/New_York (EDT = UTC-4)', () => {
  const result = formatScheduledDayTime(STARTS_AT, 'America/New_York');
  assert.ok(result.includes('9:00 AM'), `expected "9:00 AM" in "${result}"`);
});

test('formatScheduledTime — UTC', () => {
  assert.equal(formatScheduledTime(STARTS_AT, 'UTC'), '1:00 PM');
});

test('formatScheduledTime — Europe/Berlin shows local time', () => {
  assert.equal(formatScheduledTime(STARTS_AT, 'Europe/Berlin'), '3:00 PM');
});
