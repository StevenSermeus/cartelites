import assert from 'node:assert/strict';
import test from 'node:test';
import type {SalePaymentHistoryPage,SalePaymentHistoryRow,SalePaymentSnapshot} from '../../../packages/domain/src/history';
import {mergePaymentHistory,paymentSnapshotTotal} from '../src/data/salePaymentHistory';
const snapshot:SalePaymentSnapshot={collectionStatus:'received',cashCents:0,transferCents:1200,receivedAt:10,reference:null};
const row=(id:string,state:SalePaymentHistoryRow['state']):SalePaymentHistoryRow=>({...snapshot,id,state,kind:'revision',changedAt:null,actorLabel:null,previous:{...snapshot,cashCents:1200,transferCents:0}});
const page=(items:SalePaymentHistoryRow[],nextCursor:string|null=null):SalePaymentHistoryPage=>({items,nextCursor,isDone:!nextCursor,saleStatus:'active',current:snapshot,currentEntryId:items.find(row=>row.state==='current'||row.state==='reversed')?.id??null,historyStatus:'complete'});

test('unknown payment components never become zero and legitimate zero remains known',()=>{
 assert.equal(paymentSnapshotTotal(snapshot),1200);
 assert.equal(paymentSnapshotTotal({...snapshot,cashCents:null}),null);
 assert.equal(paymentSnapshotTotal({...snapshot,transferCents:0}),0);
});
test('cancelled history preserves superseded revisions and only reverses previously current payment',()=>{
 const cancelled={...page([row('old','superseded'),row('last','reversed')]),saleStatus:'cancelled' as const};
 assert.deepEqual(mergePaymentHistory(null,cancelled).items.map(row=>row.state),['superseded','reversed']);
 const previous=page([row('cached-current','current')],'next');
 const merged=mergePaymentHistory(previous,cancelled);
 assert.deepEqual(merged.items.map(row=>row.state),['superseded','superseded','reversed']);
 assert.equal(merged.items[1].changedAt,null);assert.equal(merged.items[1].actorLabel,null);
});
test('payment history retries deduplicate and preserve incomplete provenance through empty pages',()=>{
 const first={...page([row('first','current')],'next'),historyStatus:'incomplete' as const};
 const empty=mergePaymentHistory(first,page([],'next2'));
 assert.equal(empty.nextCursor,'next2');assert.equal(empty.historyStatus,'incomplete');
 const retried=mergePaymentHistory(empty,page([row('first','current'),row('older','superseded')]));
 assert.equal(retried.items.length,2);assert.deepEqual(retried.items[0].previous,{...snapshot,cashCents:1200,transferCents:0});
});

test('a correction between cursor pages retires cached current state even if new current row is on a preceding page',()=>{
 const first=page([row('old-current','current')],'next');
 const next={...page([row('older','superseded')]),currentEntryId:'new-current',current:{...snapshot,cashCents:1200,transferCents:0}};
 const merged=mergePaymentHistory(first,next);
 assert.equal(merged.items.find(row=>row.id==='old-current')?.state,'superseded');
 assert.equal(merged.items.some(row=>row.state==='current'),false);
 assert.equal(merged.currentEntryId,'new-current');assert.equal(merged.current.cashCents,1200);
 const cancelled=mergePaymentHistory(first,{...next,saleStatus:'cancelled'});
 assert.deepEqual(cancelled.items.map(row=>row.state),['superseded','superseded']);
});
