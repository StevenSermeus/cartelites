import test from 'node:test';
import assert from 'node:assert/strict';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../functions/schema';
const modules={'./functions/readModels.ts':()=>import('../functions/readModels'),'./functions/operations.ts':()=>import('../functions/operations'),'./functions/inventory.ts':()=>import('../functions/inventory'),'./functions/activity.ts':()=>import('../functions/activity'),'./functions/paymentHistory.ts':()=>import('../functions/paymentHistory'),'./functions/auth.ts':()=>import('../functions/auth'),'./functions/transactions.ts':()=>import('../functions/transactions'),'./functions/_generated/server.js':()=>import('../functions/_generated/server.js')};
const m=(name:string)=>makeFunctionReference<'mutation'>(name),q=(name:string)=>makeFunctionReference<'query'>(name);
async function setup(){const t=convexTest(schema,modules),id=await t.run(ctx=>ctx.db.insert('accounts',{email:'history@example.invalid',passwordHash:'test',sessionVersion:0,createdAt:1}));await t.mutation(m('auth:startSession'),{id,jti:'history',sessionVersion:0,expiresAt:Date.now()+60000,now:Date.now()});const user=t.withIdentity({subject:id,sv:0,sessionJti:'history'});
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

test('canonical Activity excludes supplier purchases from buybacks and matches origin on any sale line',async()=>{
 const {t,user,itemId}=await setup();assert.equal((await user.query(q('activity:browse'),{source:'purchases'})).items.length,0);
 const contact=await user.mutation(m('transactions:saveContact'),{operationId:'contact',kind:'person',name:'Vendeur'});
 const purchase=await user.mutation(m('transactions:createPurchase'),{operationId:'buyback',contactId:contact,type:'buyback',reference:'R1',occurredAt:1000,lines:[{product:{type:'card',name:'Carte rouge'},quantity:1,costCents:100,askingPriceCents:200,tax:{regime:'margin',rateBps:0}}]});await user.mutation(m('transactions:validatePurchase'),{purchaseId:purchase.purchaseId});
 const saleId=await user.mutation(m('transactions:createSale'),{operationId:'mixed',reference:'MIX',occurredAt:2000,lines:[{stockItemId:itemId,quantity:1,lineTotalCents:200},{stockItemId:purchase.itemIds[0],quantity:1,lineTotalCents:200}],payment:{status:'pending',cashCents:0,transferCents:0}});
 const page=await user.query(q('activity:browse'),{source:'sales',origin:'purchase',search:'rouge',paymentStatus:'pending'});assert.equal(page.items[0]._id,saleId);assert.equal(page.items[0].amountCents,400);assert.deepEqual(page.items[0].origins.sort(),['purchase','supplier']);
 const oldRoute=await user.query(q('readModels:browse'),{resource:'sales',origin:'purchase',search:'rouge',size:25});assert.equal(oldRoute.items[0]._id,saleId);assert.deepEqual(oldRoute.items[0].origins.sort(),['purchase','supplier']);
});
test('zero-total pending and received payment revisions remain distinct and old ambiguous zero records are not labelled received',async()=>{
 const {t,user,itemId}=await setup();const saleId=await user.mutation(m('operations:createSale'),{operationId:'sale-zero',itemId,occurredAt:2000,salePriceCents:0,paymentStatus:'received',payment:{cashCents:0,transferCents:0,receivedAt:2000}});
 await user.mutation(m('transactions:correctPayment'),{operationId:'pending',saleId,occurredAt:2000,payment:{status:'pending',cashCents:0,transferCents:0}});
 let page=await user.query(q('operations:salePaymentHistory'),{saleId});assert.equal(page.items[0].collectionStatus,'pending');assert.equal(page.items[1].collectionStatus,'received');
 await t.run(async ctx=>{const rows=await ctx.db.query('salePayments').collect();for(const row of rows)if(row.status==='superseded')await ctx.db.patch(row._id,{collectionStatus:undefined});});page=await user.query(q('operations:salePaymentHistory'),{saleId});assert.equal(page.items[1].collectionStatus,'unknown');assert.equal(page.historyStatus,'incomplete');
});

test('first collection of a pending sale records the truthful previous status and header identifies latest revision',async()=>{
 const {user,itemId}=await setup();const saleId=await user.mutation(m('operations:createSale'),{operationId:'pending-sale',itemId,occurredAt:2000,salePriceCents:200,paymentStatus:'pending'});
 let page=await user.query(q('operations:salePaymentHistory'),{saleId});assert.equal(page.current.collectionStatus,'pending');assert.equal(page.currentEntryId,null);assert.equal(page.items.length,0);
 await user.mutation(m('operations:recordSalePayment'),{operationId:'collect',saleId,cashCents:200,transferCents:0,receivedAt:3000});page=await user.query(q('operations:salePaymentHistory'),{saleId});assert.equal(page.items[0].previous.collectionStatus,'pending');assert.equal(page.items[0].previous.cashCents,null);assert.equal(page.currentEntryId,page.items[0].id);assert.equal(page.historyStatus,'complete');
});

test('shallow activity caps maximum-size sale baskets below the Convex index-range budget',async()=>{
 const {t,itemId}=await setup();
 await t.run(async ctx=>{
  const original=(await ctx.db.get(itemId))!,{_id,_creationTime,...item}=original;const ids=[];for(let i=0;i<200;i++)ids.push(await ctx.db.insert('stockItems',item));
  for(let s=0;s<11;s++){const saleId=await ctx.db.insert('sales',{reference:`large-${s}`,occurredAt:2000,status:'confirmed',createdAt:1});for(const stockItemId of ids)await ctx.db.insert('saleLines',{saleId,stockItemId,quantity:1,lineTotalCents:1,costCents:1,description:'Large basket item',taxRateBps:0,taxRegime:'other',commissionCents:null,depositorAmountCents:null,paymentStatus:'received',createdAt:1});}
 });
 const {browse}=await import('../functions/activity');
 const result=await t.run(async ctx=>{const account=(await ctx.db.query('accounts').first())!;let reads=0;const db=new Proxy(ctx.db,{get(target,key){if(key==='get')return(...args:any[])=>{reads++;return (target.get as any)(...args);};if(key==='query')return(...args:any[])=>{reads++;return (target.query as any)(...args);};const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;}});const page=await (browse as any)._handler({...ctx,db,auth:{getUserIdentity:async()=>({subject:account._id,sv:0,sessionJti:'history'})}},{source:'sales',size:50});return {page,reads};});
 assert.equal(result.page.items.length,10);assert.equal(result.page.isDone,false);assert.ok(result.reads<=2050,`unexpected read fanout: ${result.reads}`);assert.equal(result.page.items[0].amountCents,200);
});

test('currentEntryId remains authoritative when a correction arrives between history pages',async()=>{
 const {user,itemId}=await setup();const saleId=await user.mutation(m('operations:createSale'),{operationId:'interleaved-sale',itemId,occurredAt:2000,salePriceCents:200,paymentStatus:'received',payment:{cashCents:200,transferCents:0,receivedAt:2000}});
 await user.mutation(m('operations:recordSalePayment'),{operationId:'before-page',saleId,cashCents:150,transferCents:50,receivedAt:3000});
 const first=await user.query(q('operations:salePaymentHistory'),{saleId,size:1});assert.ok(first.nextCursor);
 await user.mutation(m('operations:recordSalePayment'),{operationId:'between-pages',saleId,cashCents:80,transferCents:120,receivedAt:4000});
 const next=await user.query(q('operations:salePaymentHistory'),{saleId,size:1,cursor:first.nextCursor});assert.notEqual(next.currentEntryId,first.currentEntryId);assert.equal(next.current.cashCents,80);assert.ok(next.items.every((row:any)=>row.id!==next.currentEntryId));
});
