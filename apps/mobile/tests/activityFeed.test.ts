import assert from 'node:assert/strict';
import test from 'node:test';
import {emptyActivity,mergeActivity,HistoryRequestGeneration,type ActivityRecord,type ActivityPage} from '../src/data/activityFeed';
import {dateOnly,parseDateOnly} from '../src/data/dateOnly';
const row=(source:ActivityRecord['source'],id:string,recordedAt:number,occurredAt:number|null=recordedAt):ActivityRecord=>({_id:id,source,title:id,recordedAt,occurredAt,amountCents:null,amountStatus:'unknown',status:'recorded',origins:[],detailsIncomplete:false});
const page=(items:ActivityRecord[],nextCursor:string|null=null):ActivityPage=>({items,nextCursor,isDone:nextCursor===null,order:'recorded-desc'});

test('activity retains independent source cursors and deduplicates replayed pages',()=>{
 let state=mergeActivity(emptyActivity(),'sales',page([row('sales','same',300)],'s1'));
 state=mergeActivity(state,'purchases',page([row('purchases','same',200)],'p1'));
 state=mergeActivity(state,'sales',page([row('sales','late',250),{...row('sales','same',300),status:'cancelled'}]));
 assert.deepEqual(state.entries.map(entry=>entry.key),['sales:same','sales:late','purchases:same']);
 assert.equal(state.entries[0].record.status,'cancelled');
 assert.deepEqual(state.cursors,{sales:null,purchases:'p1'});
 assert.deepEqual(state.done,['sales']);
});
test('activity sorts recording times without converting unknown business dates to creation times or epoch',()=>{
 const state=mergeActivity(emptyActivity(),'sales',page([row('sales','unknown',500,null),row('sales','antidated',400,100),row('sales','known',300,800)]));
 assert.deepEqual(state.entries.map(entry=>entry.key),['sales:unknown','sales:antidated','sales:known']);
 assert.deepEqual(state.entries.map(entry=>entry.date),[null,100,800]);
});
test('empty intermediate activity pages retain continuation instead of dropping a source',()=>{
 const state=mergeActivity(emptyActivity(),'events',page([],'next'));
 assert.equal(state.cursors.events,'next');assert.deepEqual(state.done,[]);
});
test('cross-source or broken-order pages cannot corrupt a source cursor',()=>{
 assert.throws(()=>mergeActivity(emptyActivity(),'sales',page([row('purchases','purchase',1)])),/invalide/);
 assert.throws(()=>mergeActivity(emptyActivity(),'sales',{...page([]),isDone:false}),/page suivante/);
});
test('a filter or source change rejects late pages even when navigating back to the previous filter',()=>{
 const scope=new HistoryRequestGeneration();const original=scope.current();
 scope.invalidate();const newSource=scope.current();scope.invalidate();
 assert.equal(scope.accepts(original),false);assert.equal(scope.accepts(newSource),false);assert.equal(scope.accepts(scope.current()),true);
});
test('native calendar days preserve existing API semantics including leap years without UTC conversion',()=>{
 assert.equal(dateOnly(parseDateOnly('2024-02-29')!),'2024-02-29');
 assert.equal(parseDateOnly('2023-02-29'),undefined);
 assert.equal(parseDateOnly('2026-13-01'),undefined);
 assert.equal(parseDateOnly(''),undefined);
 assert.equal(dateOnly(new Date(2026,10,23,0,1)),'2026-11-23');
});
