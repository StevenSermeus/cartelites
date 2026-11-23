import test from 'node:test';
import assert from 'node:assert/strict';
import { setShopFormatting, formatShopMoney, formatShopDate } from '../src/theme/shopFormatting';
test('switching shops changes currency and date timezone and clearing discards the previous shop', () => {
  setShopFormatting({currency: 'USD', timezone: 'America/New_York'});
  assert.match(formatShopMoney(12.5), /\$|USD/);
  assert.equal(formatShopDate(Date.UTC(2026, 0, 2, 1)), '01/01/2026');
  setShopFormatting({currency: 'CHF', timezone: 'Europe/Zurich'});
  assert.match(formatShopMoney(12.5), /CHF/);
  assert.equal(formatShopDate(Date.UTC(2026, 0, 2, 1)), '02/01/2026');
  setShopFormatting(null);
  assert.doesNotMatch(formatShopMoney(12.5), /CHF|USD/);
});
