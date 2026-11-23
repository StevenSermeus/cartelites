import test from 'node:test';
import assert from 'node:assert/strict';
import {saleConflictIssue,conflictItemId,stockConflictReason,canCorrectSaleAttempt} from '../src/data/saleConflict';
const lines=[{itemId:'item-a',name:'Carte A',quantity:2}];
test('stock rejection feedback freezes requested quantities and accepts actual persisted conflict IDs',()=>{
 const issue=saleConflictIssue({status:409,code:'SALE_CONFLICT',conflictId:'conflict-1'},lines)!;
 assert.equal(issue.conflictId,'conflict-1');assert.equal(conflictItemId({itemId:'item-a'}),'item-a');assert.equal(conflictItemId({stockItemId:'item-a'}),'item-a');
 const original=lines[0].quantity;lines[0].quantity=99;assert.equal(issue.lines[0].quantity,original);lines[0].quantity=original;
 assert.equal(saleConflictIssue(new Error('Connexion perdue'),lines),null);
 assert.equal(saleConflictIssue({status:500,code:'ITEM_UNAVAILABLE'},lines),null);
 assert.equal(saleConflictIssue({status:409,code:'IDEMPOTENCY_KEY_REUSED'},lines),null);
});
test('current stock checks distinguish disappeared, sold, unsigned, inactive and insufficient stock',()=>{
 const line=lines[0],current={_id:'item-a',name:'Carte A',status:'available',origin:'supplier',quantity:2,sourceStatus:'active'};
 assert.equal(stockConflictReason(line,current),null);
 for(const row of [null,{...current,status:'sold'},{...current,quantity:1},{...current,sourceStatus:'cancelled'},{...current,contractPending:true},{...current,quantity:undefined}])assert.equal(typeof stockConflictReason(line,row),'string');
 assert.match(stockConflictReason(line,{...current,quantity:1})!,/2 unité.*1 actuellement/);
});
test('later rejection after lost response never authorizes a new operation key',()=>{
 assert.equal(canCorrectSaleAttempt({state:'rejected',executing:false,unresolved:false}),true);
 for(const attempt of [undefined,{state:'unknown',executing:false,unresolved:true},{state:'rejected',executing:false,unresolved:true},{state:'confirmed',executing:false,unresolved:false},{state:'rejected',executing:true,unresolved:false}])assert.equal(canCorrectSaleAttempt(attempt),false);
});
