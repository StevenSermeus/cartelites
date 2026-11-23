import assert from 'node:assert/strict';
import test from 'node:test';
import {costCsv,summarizeGiftCosts,formatCost,totalKnownCost,purchaseEditValuation,recordAmount} from '../src/data/inventoryCosts';
test('unknown canonical and legacy costs remain unknown while real zero stays zero',()=>{
 assert.equal(costCsv(null),'Non renseigné');assert.equal(costCsv(undefined),'Non renseigné');
 assert.equal(costCsv(0),'0.00');assert.equal(costCsv(1001),'10.01');
 assert.deepEqual(summarizeGiftCosts([{costCents:null},{},{costCents:0},{costCents:1001},{costCents:null,cancelledAt:1},{costCents:500,cancelledAt:1}]),{knownCents:1001,unknownCount:2});
});
test('display and totals never treat missing costs as a known zero',()=>{
 assert.equal(formatCost(null),'Coût non renseigné');assert.equal(formatCost(undefined),'Coût non renseigné');
 assert.match(formatCost(0),/0,00/);
 assert.equal(totalKnownCost([100,0,200]),300);
 assert.equal(totalKnownCost([100,null]),null);assert.equal(totalKnownCost([100,undefined]),null);
 assert.equal(recordAmount({totalCostCents:null,amountCents:999},['totalCostCents','amountCents']),null);
 assert.equal(recordAmount({costCents:0},['costCents']),0);
 assert.equal(recordAmount({},['costCents']),undefined);
});
test('correction drafts require an explicit cost reconciliation before computing acquisition values',()=>{
 assert.deepEqual(purchaseEditValuation({purchasePriceCents:null}),{marketValue:'',discountPercent:''});
 assert.deepEqual(purchaseEditValuation({purchasePriceCents:null,marketValueCents:1000,discountPercent:70}),{marketValue:'10.00',discountPercent:''});
 assert.deepEqual(purchaseEditValuation({purchasePriceCents:0}),{marketValue:'0.00',discountPercent:'100'});
 assert.deepEqual(purchaseEditValuation({purchasePriceCents:700,marketValueCents:1000}),{marketValue:'10.00',discountPercent:'70'});
});
