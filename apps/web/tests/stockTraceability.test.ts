import test from 'node:test';
import assert from 'node:assert/strict';
import {lotView} from '../src/lib/stockTraceability';
test('canonical lot retains explicit unknown cost instead of falling back to legacy cost',()=>{
 const row=lotView({_id:'lot',source:{kind:'consignment',consignmentId:'deposit'},originalQuantity:1,remainingQuantity:1,originalCostCents:null,totalCostCents:100,remainingCostCents:null,acquiredAt:0});
 assert.equal(row.originalCost,null);assert.equal(row.remainingCost,null);assert.equal(row.sourceId,'deposit');assert.equal(row.occurredAt,0);
});
test('legacy supplier and opening lots keep exact remaining quantities and indivisible cents',()=>{
 const supplier=lotView({_id:'supplier-lot',receiptId:'receipt',received:3,remaining:2,totalCostCents:1001,remainingCostCents:668,occurredAt:123,receipt:{reference:'INV-1',supplier:'Original supplier'}});
 assert.equal(supplier.received,3);assert.equal(supplier.remaining,2);assert.equal(supplier.originalCost,1001);assert.equal(supplier.remainingCost,668);assert.equal(supplier.reference,'INV-1');
 const opened=lotView({_id:'opened-lot',openingId:'opening',receiptId:'original-supplier-receipt',received:10,remaining:0,totalCostCents:1001,remainingCostCents:0});
 assert.equal(opened.label,'Lot issu d’une ouverture');assert.equal(opened.remainingCost,0);assert.equal(opened.occurredAt,null);assert.equal(opened.sourceId,'opening');
});
