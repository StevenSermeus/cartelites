import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePriceInput, priceForMargin, productProfit } from '../src/data/productProfit';

test('supplier profit excludes VAT and uses the purchase cost HT', () => {
  assert.deepEqual(productProfit(8000, 12100, 2100, 3), {
    netCents: 10000,
    profitCents: 2000,
    marginPercent: 20,
    totalProfitCents: 6000,
  });
  assert.equal(productProfit(8000, 7000, 0, 1)?.profitCents, -1000);
  assert.equal(productProfit(0, 0, 0, 1)?.marginPercent, null);
});
test('VAT rounds on the complete sale line, including half-cent boundaries', () => {
  assert.equal(productProfit(0, 3, 2000, 2)?.netCents, 2);
  assert.equal(productProfit(0, 3, 2000, 2)?.totalProfitCents, 5);
});
test('suggested TTC price reaches the margin on HT revenue, rounded upwards', () => {
  assert.equal(priceForMargin(8000, 2100, 20), 12100);
  assert.equal(priceForMargin(8000, 2100, 0), 9680);
  for (const cost of [1, 99, 333, 8000]) {
    for (const rate of [0, 600, 2100]) {
      for (const margin of [20, 30, 40]) {
        const price = priceForMargin(cost, rate, margin)!;
        assert.ok(productProfit(cost, price, rate, 1)!.marginPercent! >= margin - 1e-9);
      }
    }
  }
});
test('incomplete and invalid entries never produce a misleading estimate', () => {
  for(const cost of [null,undefined]) {assert.equal(productProfit(cost,1000,2100,1),null);assert.equal(priceForMargin(cost,2100,30),null);}
  assert.equal(parsePriceInput(' 12,34 '), 1234);
  for (const value of ['', '12,', '-1', '12.345', 'abc'])
    assert.equal(parsePriceInput(value), null);
  assert.equal(productProfit(100, 200, 2100, 0), null);
  assert.equal(productProfit(100, 200, 2100, 1.5), null);
  assert.equal(productProfit(100, 200, 10001, 1), null);
  assert.equal(priceForMargin(100, 2100, 100), null);
});
