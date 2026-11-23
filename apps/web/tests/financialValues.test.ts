import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocatedSaleCost,
  completeCostTotal,
  moneyCell,
  moneyDifference,
  stockValuation,
} from '../src/lib/financialValues.ts';
test('unknown costs remain blank and never become a full-revenue profit', () => {
  for (const missing of [null, undefined, NaN, Infinity]) {
    assert.equal(moneyCell(missing), '');
    assert.equal(moneyDifference(10000, missing), null);
    assert.equal(moneyCell(moneyDifference(10000, missing)), '');
  }
  assert.equal(moneyCell(0), 0);
  assert.equal(moneyDifference(10000, 0), 10000);
  assert.equal(moneyDifference(900, 1000), -100);
});
test('an explicit unknown canonical allocation never falls back to historical item cost', () => {
  assert.equal(allocatedSaleCost({ costCents: null, purchasePriceCents: 500 }), null);
  assert.equal(allocatedSaleCost({ costCents: 0, purchasePriceCents: 500 }), 0);
  assert.equal(allocatedSaleCost({ costCents: 750, purchasePriceCents: 500 }), 750);
  assert.equal(allocatedSaleCost({ purchasePriceCents: 500 }), 500);
});
test('complete acquisition totals propagate missing evidence while preserving true zeros', () => {
  assert.equal(completeCostTotal([100, null, 200]), null);
  assert.equal(completeCostTotal([undefined]), null);
  assert.equal(completeCostTotal([100, 0, 200]), 300);
  assert.equal(completeCostTotal([]), 0);
  assert.equal(completeCostTotal([Number.MAX_SAFE_INTEGER, 1]), null);
});
test('stock export values actual remaining heterogeneous lots, not one historical unit', () => {
  const result = stockValuation({ quantity: 3, askingPriceCents: 500 }, [
    { remainingQuantity: 1, remainingCostCents: 101 },
    { remainingQuantity: 2, remainingCostCents: 199 },
    { remainingQuantity: 0, remainingCostCents: null },
  ]);
  assert.deepEqual(result, {
    quantity: 3,
    remainingCostCents: 300,
    unitAskingPriceCents: 500,
    totalAskingPriceCents: 1500,
  });
});
test('unknown remaining lot costs or quantity mismatch make stock valuation unknown', () => {
  assert.equal(
    stockValuation({ quantity: 3 }, [
      { remainingQuantity: 1, remainingCostCents: 100 },
      { remainingQuantity: 2, remainingCostCents: null },
    ]).remainingCostCents,
    null,
  );
  assert.equal(
    stockValuation({ quantity: 3 }, [{ remainingQuantity: 2, remainingCostCents: 100 }])
      .remainingCostCents,
    null,
  );
  assert.deepEqual(stockValuation({}, []), {
    quantity: null,
    remainingCostCents: null,
    unitAskingPriceCents: null,
    totalAskingPriceCents: null,
  });
  const empty = stockValuation({ quantity: 0, askingPriceCents: 500 }, [
    { remainingQuantity: 0, remainingCostCents: null },
  ]);
  assert.equal(empty.remainingCostCents, 0);
  assert.equal(empty.totalAskingPriceCents, 0);
});
test('invalid or unsafe money cannot become a misleading export value', () => {
  assert.equal(moneyCell(1.5), '');
  assert.equal(moneyDifference(Number.MAX_SAFE_INTEGER, -1), null);
  assert.equal(
    stockValuation({ quantity: 2, askingPriceCents: Number.MAX_SAFE_INTEGER }, [
      { remainingQuantity: 2, remainingCostCents: 100 },
    ]).totalAskingPriceCents,
    null,
  );
});

test('legacy API lot aliases produce exact stock valuation without substituting unit costs',()=>{
 const result=stockValuation({quantity:3,askingPriceCents:500},[{remaining:1,remainingCostCents:334},{remaining:2,remainingCostCents:667}]);
 assert.equal(result.remainingCostCents,1001);assert.equal(result.quantity,3);assert.equal(result.totalAskingPriceCents,1500);
 assert.equal(stockValuation({},[{remaining:Number.MAX_SAFE_INTEGER,remainingCostCents:0},{remaining:1,remainingCostCents:0}]).quantity,null);
});
