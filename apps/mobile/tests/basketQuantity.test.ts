import test from 'node:test';
import assert from 'node:assert/strict';
import {basketMaximum,basketQuantity,nextBasketQuantity} from '../src/data/basketQuantity';
test('quantity selection reaches maximum then removes units without removing controls',()=>{
 assert.equal(nextBasketQuantity(false,undefined,3,1),1);
 assert.equal(nextBasketQuantity(true,'1',3,1),2);
 assert.equal(nextBasketQuantity(true,'2',3,1),3);
 assert.equal(basketQuantity(true,'3',3).canAdd,false);
 assert.equal(basketQuantity(true,'3',3).canRemove,true);
 assert.equal(nextBasketQuantity(true,'3',3,-1),2);
 assert.equal(nextBasketQuantity(true,'1',3,-1),0);
 assert.equal(basketQuantity(false,'1',3).canRemove,false);
});
test('quantity controls reject zero stock and keep individual-item quantities at one',()=>{
 assert.equal(basketMaximum('purchase',99),1);assert.equal(basketMaximum('consignment',0),0);
 assert.equal(basketMaximum('supplier',undefined),0);assert.equal(basketMaximum('supplier',NaN),0);
 assert.equal(basketQuantity(false,undefined,0).canAdd,false);
 assert.equal(nextBasketQuantity(false,undefined,0,1),0);
});
test('invalid quantity edits and concurrent stock reductions have an explicit correction path',()=>{
 assert.equal(basketQuantity(true,'1,5',5).label,'?');
 assert.equal(nextBasketQuantity(true,'1,5',5,1),1);
 assert.equal(nextBasketQuantity(true,'1,5',5,-1),0);
 assert.equal(basketQuantity(true,'8',3).label,'?');
 assert.equal(basketQuantity(true,'8',3).canAdd,false);
 assert.equal(nextBasketQuantity(true,'8',3,-1),3);
});
