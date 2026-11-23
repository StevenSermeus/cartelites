import test from 'node:test';
import assert from 'node:assert/strict';
import {financialSummary} from '../src/data/financialSummary';
test('recovery sums sale line totals once while showing actual units',()=>{
  assert.deepEqual(financialSummary('/sales/bulk',{items:[{salePriceCents:4000,quantity:2},{salePriceCents:1000,quantity:1}]}),{total:5000,units:3,label:'Montant'});
});
test('consignment agreed prices and supplier quantity costs have explicit meanings',()=>{
  assert.deepEqual(financialSummary('/consignments',{items:[{askingPriceCents:1200},{askingPriceCents:500}]}),{total:1700,units:2,label:'Prix convenus'});
  assert.deepEqual(financialSummary('/supplier-receipts',{lines:[{unitCostCents:501,quantity:3}]}),{total:1503,units:3,label:'Coût total'});
});
test('unsupported or unknown amounts are omitted, genuine zero remains zero',()=>{
  assert.equal(financialSummary('/purchases',{items:[{purchasePriceCents:null}]}).total,undefined);
  assert.equal(financialSummary('/consignments',{items:[{}]}).total,undefined);
  assert.equal(financialSummary('/stock/donate',{quantity:3}).total,undefined);
  assert.equal(financialSummary('/purchases',{items:[{purchasePriceCents:0}]}).total,0);
});
test('correction summary uses the frozen mixed collection and return counts only prepared items',()=>{
  assert.equal(financialSummary('/sales/payment',{cashCents:500,transferCents:1000}).total,1500);
  assert.equal(financialSummary('/sales/payment',{cashCents:500}).total,undefined);
  assert.deepEqual(financialSummary('/consignments/returns/prepare',{itemIds:['one','two']}),{total:undefined,units:2,label:'Montant'});
});
