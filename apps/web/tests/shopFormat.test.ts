import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shopDateTimestamp } from '../src/shopFormat';
test('shop dates use selected timezone independently of workstation timezone', () => {
  assert.equal(
    new Date(shopDateTimestamp('2026-07-01', 'Europe/Brussels')).toISOString(),
    '2026-07-01T10:00:00.000Z',
  );
  assert.equal(
    new Date(shopDateTimestamp('2026-01-01', 'Europe/Brussels')).toISOString(),
    '2026-01-01T11:00:00.000Z',
  );
  assert.equal(
    new Date(shopDateTimestamp('2026-07-01', 'America/New_York')).toISOString(),
    '2026-07-01T16:00:00.000Z',
  );
});
test('calendar validation rejects normalized invalid dates', () => {
  assert.throws(() => shopDateTimestamp('2026-02-30'), /invalide/);
  assert.throws(() => shopDateTimestamp('not-a-date'), /invalide/);
});
test('shop midnight boundary accounts for DST day length', () => {
  const from = shopDateTimestamp('2026-03-29', 'Europe/Brussels', 0),
    to = shopDateTimestamp('2026-03-29', 'Europe/Brussels', 23, 59, 59) + 1000;
  assert.equal(to - from, 23 * 60 * 60 * 1000);
});
