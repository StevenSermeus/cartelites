import test from 'node:test';
import assert from 'node:assert/strict';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../functions/schema';
import {authenticated} from './helpers/session';
const modules={'./functions/operations.ts':()=>import('../functions/operations'),'./functions/inventory.ts':()=>import('../functions/inventory'),'./functions/activity.ts':()=>import('../functions/activity'),'./functions/paymentHistory.ts':()=>import('../functions/paymentHistory'),'./functions/_generated/server.js':()=>import('../functions/_generated/server.js')};
const m=(name:string)=>makeFunctionReference<'mutation'>(name),q=(name:string)=>makeFunctionReference<'query'>(name);
async function setup(){const t=convexTest(schema,modules),user=await authenticated(t);
const receipt=await user.mutation(m('inventory:receive'),{operationId:'receipt',supplier:'Fournisseur Étoile',reference:'QA-REF',occurredAt:1000,lines:[{product:{name:'Booster bleu',productType:'sealed',format:'booster',askingPriceCents:200,taxRateBps:2100},quantity:5,unitCostCents:100}]});return {t,user,itemId:receipt.itemIds[0]};}
test('activity applies source capabilities, text/date/status filters and binds continuation without leaking nested history',async()=>{
 const {t,user,itemId}=await setup();
 const page=await user.query(q('activity:browse'),{source:'receipts',search:'etoile',from:1000,to:1000,size:1});assert.equal(page.items.length,1);assert.equal(page.items[0].amountCents,500);assert.equal(page.order,'recorded-desc');assert.equal('items' in page.items[0],false);
 assert.equal((await user.query(q('activity:browse'),{source:'receipts',search:'absent',size:1})).items.length,0);
 assert.equal((await user.query(q('activity:browse'),{source:'receipts',from:1001,size:1})).items.length,0);
 await assert.rejects(()=>user.query(q('activity:browse'),{source:'receipts',paymentStatus:'pending'}),/INVALID_HISTORY_FILTER/);
 await assert.rejects(()=>user.query(q('activity:browse'),{source:'receipts',origin:'consignment'}),/INVALID_HISTORY_FILTER/);
 await assert.rejects(()=>t.query(q('activity:browse'),{source:'receipts'}),/UNAUTHENTICATED/);
 if(page.nextCursor)await assert.rejects(()=>user.query(q('activity:browse'),{source:'receipts',search:'changed',from:1000,to:1000,size:1,cursor:page.nextCursor}),/INVALID_CURSOR/);
 const giftId=await user.mutation(m('inventory:donate'),{operationId:'gift',itemId,quantity:1,occurredAt:2000,reason:'Cadeau convention'});await user.mutation(m('inventory:reverse'),{operationId:'reverse',giftId});
 const gifts=await user.query(q('activity:browse'),{source:'gifts',search:'convention',status:'cancelled',origin:'supplier'});assert.equal(gifts.items.length,1);assert.equal(gifts.items[0].quantity,1);
});
test('payment revisions paginate exact before/after values, survive cancellation, reject cursor cross-sale reuse and require live authentication',async()=>{
 const {t,user,itemId}=await setup();const saleId=await user.mutation(m('operations:createSale'),{operationId:'sale',itemId,occurredAt:2000,salePriceCents:200,paymentStatus:'received',payment:{cashCents:200,transferCents:0,receivedAt:2000,reference:'initial'}});
 for(const [operationId,cashCents,reference]of [['correction1',150,'mix'],['correction2',0,'transfer']] as const)await user.mutation(m('operations:recordSalePayment'),{operationId,saleId,cashCents,transferCents:200-cashCents,receivedAt:3000,reference});
 let cursor:undefined|string=undefined,rows:any[]=[];do{const page=await user.query(q('operations:salePaymentHistory'),{saleId,size:1,cursor});assert.equal(page.current.transferCents,200);assert.ok(page.currentEntryId);rows.push(...page.items);cursor=page.nextCursor??undefined;}while(cursor);
 assert.equal(new Set(rows.map(r=>r.id)).size,3);assert.deepEqual(rows.map(r=>r.cashCents),[0,150,200]);assert.deepEqual(rows.map(r=>r.state),['current','superseded','superseded']);assert.equal(rows[0].previous.cashCents,150);assert.equal(rows[1].previous.cashCents,200);
 const first=await user.query(q('operations:salePaymentHistory'),{saleId,size:1});await assert.rejects(()=>user.query(q('operations:salePaymentHistory'),{saleId,size:2,cursor:first.nextCursor}),/INVALID_CURSOR/);
 await user.mutation(m('operations:cancelSale'),{operationId:'cancel',saleId});const cancelled=await user.query(q('operations:salePaymentHistory'),{saleId,size:50});assert.equal(cancelled.saleStatus,'cancelled');assert.equal(cancelled.items[0].state,'reversed');assert.equal(cancelled.currentEntryId,cancelled.items[0].id);assert.equal(cancelled.items[0].transferCents,200);
 await assert.rejects(()=>t.query(q('operations:salePaymentHistory'),{saleId}),/UNAUTHENTICATED/);
});

test('currentEntryId remains authoritative when a correction arrives between history pages',async()=>{
 const {user,itemId}=await setup();const saleId=await user.mutation(m('operations:createSale'),{operationId:'interleaved-sale',itemId,occurredAt:2000,salePriceCents:200,paymentStatus:'received',payment:{cashCents:200,transferCents:0,receivedAt:2000}});
 await user.mutation(m('operations:recordSalePayment'),{operationId:'before-page',saleId,cashCents:150,transferCents:50,receivedAt:3000});
 const first=await user.query(q('operations:salePaymentHistory'),{saleId,size:1});assert.ok(first.nextCursor);
 await user.mutation(m('operations:recordSalePayment'),{operationId:'between-pages',saleId,cashCents:80,transferCents:120,receivedAt:4000});
 const next=await user.query(q('operations:salePaymentHistory'),{saleId,size:1,cursor:first.nextCursor});assert.notEqual(next.currentEntryId,first.currentEntryId);assert.equal(next.current.cashCents,80);assert.ok(next.items.every((row:any)=>row.id!==next.currentEntryId));
});
