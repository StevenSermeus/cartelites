import test from 'node:test';
import assert from 'node:assert/strict';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../functions/schema';
const modules={'./functions/auth.ts':()=>import('../functions/auth'),'./functions/transactions.ts':()=>import('../functions/transactions'),'./functions/migration.ts':()=>import('../functions/migration'),'./functions/operations.ts':()=>import('../functions/operations'),'./functions/inventory.ts':()=>import('../functions/inventory'),'./functions/itemActivity.ts':()=>import('../functions/itemActivity'),'./functions/_generated/server.js':()=>import('../functions/_generated/server.js')};
const m=(name:string)=>makeFunctionReference<'mutation'>(name),q=(name:string)=>makeFunctionReference<'query'>(name);
async function setup(){const t=convexTest(schema,modules),id=await t.run(ctx=>ctx.db.insert('accounts',{email:'activity@example.invalid',passwordHash:'test',sessionVersion:0,createdAt:1}));await t.mutation(m('auth:startSession'),{id,jti:'qa',sessionVersion:0,expiresAt:Date.now()+60000,now:Date.now()});return {t,user:t.withIdentity({subject:id,sv:0,sessionJti:'qa'})};}
async function rebuild(t:any,restart=false){let result=await t.mutation(m('itemActivity:rebuild'),{restart});for(let i=0;!result.complete&&i<100;i++)result=await t.mutation(m('itemActivity:rebuild'),{});assert.equal(result.complete,true);return result;}
const product={name:'QA display',productType:'sealed',format:'display',askingPriceCents:1000,taxRateBps:2100};
test('canonical activity is atomic, paginated and replay safe across sale, gift and opening reversals',async()=>{
 const {t,user}=await setup();await rebuild(t);
 const receive={operationId:'receive',supplier:'Supplier',reference:'R1',occurredAt:1000,lines:[{product,quantity:5,unitCostCents:100}]};
 const receipt=await user.mutation(m('inventory:receive'),receive),itemId=receipt.itemIds[0];await user.mutation(m('inventory:receive'),receive);
 const saleId=await user.mutation(m('operations:createSale'),{operationId:'sale',itemId,occurredAt:2000,quantity:2,salePriceCents:200});
 await user.mutation(m('operations:cancelSale'),{operationId:'cancel',saleId});await user.mutation(m('operations:cancelSale'),{operationId:'repeat-cancel',saleId});
 const giftId=await user.mutation(m('inventory:donate'),{operationId:'gift',itemId,quantity:1,occurredAt:3000,reason:'QA'});
 await user.mutation(m('inventory:reverse'),{operationId:'undo-gift',giftId});
 const openingId=await user.mutation(m('inventory:openDisplay'),{operationId:'open',itemId,product:{...product,name:'Booster',format:'booster'},quantity:1,packSize:36,occurredAt:4000});
 await user.mutation(m('inventory:reverse'),{operationId:'undo-open',openingId});
 let cursor=null,rows:any[]=[];do{const page=await user.query(q('inventory:activity'),{itemId,size:2,cursor});assert.equal(page.historyStatus,'complete');assert.ok(page.items.length<=2);rows.push(...page.items);cursor=page.nextCursor;}while(cursor);
 assert.equal(new Set(rows.map(r=>r.id)).size,7);assert.equal(rows.reduce((n,r)=>n+r.quantityDelta,0),5);
 assert.deepEqual(rows.filter(r=>r.kind==='sale-cancellation').map(r=>r.quantityDelta),[2]);assert.ok(rows.find(r=>r.kind==='sale-cancellation').occurredAt>0);
 const before=rows.map(r=>r.id).sort();await rebuild(t,true);const after=await user.query(q('inventory:activity'),{itemId,size:50,cursor:null});assert.deepEqual(after.items.map((r:any)=>r.id).sort(),before);
 await assert.rejects(()=>t.query(q('inventory:activity'),{itemId,size:25,cursor:null}),/UNAUTHENTICATED/);
 await assert.rejects(()=>user.query(q('inventory:activity'),{itemId,size:51,cursor:null}),/INVALID_ACTIVITY_QUERY/);
});
test('imported cancellation never presents normalization fallback time as real cancellation date',async()=>{
 const {t,user}=await setup();
 const receipt=await user.mutation(m('inventory:receive'),{operationId:'r',supplier:'QA',reference:'R',occurredAt:1000,lines:[{product,quantity:2,unitCostCents:100}]});const itemId=receipt.itemIds[0];
 const saleId=await user.mutation(m('operations:createSale'),{operationId:'s',itemId,occurredAt:2000,salePriceCents:100});await user.mutation(m('operations:cancelSale'),{operationId:'cancel',saleId});
 await t.run(async ctx=>{
  const reversal=(await ctx.db.query('stockOperations').collect()).find(r=>r.kind==='reversal')!;
  const auditId=await ctx.db.insert('auditEvents',{createdAt:1,occurredAt:2000,action:'legacy.import',legacyTable:'sales',legacyId:'old-sale',changeJson:JSON.stringify({_id:'old-sale',status:'cancelled',createdAt:2000,occurredAt:2000})});
  // Importer also stores its own normalized binding FIRST: it must not mask raw-source provenance.
  await ctx.db.insert('legacyMappings',{createdAt:1,oldTable:'normalized:stockOperations',oldId:'normalized-op',newTable:'stockOperations',newId:reversal._id,batch:'test'});
  await ctx.db.insert('legacyMappings',{createdAt:1,oldTable:'sales',oldId:'old-sale',newTable:'stockOperations',newId:reversal._id,batch:'test'});
  await ctx.db.insert('legacyMappings',{createdAt:1,oldTable:'sales',oldId:'old-sale',newTable:'auditEvents',newId:auditId,batch:'test'});
 });
 await rebuild(t);const page=await user.query(q('inventory:activity'),{itemId,size:50,cursor:null});assert.equal(page.historyStatus,'incomplete');assert.equal(page.items.find((r:any)=>r.kind==='sale-cancellation').occurredAt,null);
 await t.run(async ctx=>{const reversal=(await ctx.db.query('stockOperations').collect()).find(r=>r.kind==='reversal')!;await ctx.db.patch(reversal._id,{occurredAtKnown:true,occurredAt:9999});});await rebuild(t,true);const known=await user.query(q('inventory:activity'),{itemId,size:50,cursor:null});assert.equal(known.items.find((r:any)=>r.kind==='sale-cancellation').occurredAt,9999);assert.equal(known.historyStatus,'complete');
});
test('historical incomplete operation and opening balances are explicit, and rebuilding does not duplicate financial source rows',async()=>{
 const {t,user}=await setup();const receipt=await user.mutation(m('inventory:receive'),{operationId:'r',supplier:'QA',reference:'R',occurredAt:1000,lines:[{product,quantity:2,unitCostCents:100}]});const itemId=receipt.itemIds[0];
 await t.run(async ctx=>{await ctx.db.insert('stockOperations',{kind:'gift',historyComplete:false,occurredAt:2000,createdAt:2000,source:{table:'stockItems',id:itemId},quantity:1});});
 const before=await t.run(async ctx=>({movements:await ctx.db.query('stockMovements').collect(),lots:await ctx.db.query('stockLots').collect()}));await rebuild(t);await rebuild(t,true);
 const page=await user.query(q('inventory:activity'),{itemId,size:50,cursor:null});assert.equal(page.historyStatus,'incomplete');assert.equal(page.items.find((r:any)=>r.kind==='gift').quantityDelta,null);assert.equal(page.items.length,2);
 assert.deepEqual(await t.run(async ctx=>({movements:await ctx.db.query('stockMovements').collect(),lots:await ctx.db.query('stockLots').collect()})),before);
});

test('purchase date correction updates displayed acquisition date, records zero delta and leaves movement timestamps immutable',async()=>{
 const {t,user}=await setup();await rebuild(t);const receipt=await user.mutation(m('inventory:receive'),{operationId:'r',supplier:'QA',reference:'R',occurredAt:1000,lines:[{product,quantity:2,unitCostCents:100}]});const itemId=receipt.itemIds[0];
 const before=await t.run(async ctx=>({operations:await ctx.db.query('stockOperations').collect(),movements:await ctx.db.query('stockMovements').collect()}));
 await user.mutation(m('operations:updatePurchaseDate'),{purchaseId:receipt.id,occurredAt:2000});
 let page=await user.query(q('inventory:activity'),{itemId,size:50,cursor:null});const detail=await user.query(q('inventory:detail'),{itemId});assert.equal(detail.lots[0].occurredAt,2000);assert.equal(page.items.find((e:any)=>e.kind==='acquisition').occurredAt,2000);assert.equal(page.items.find((e:any)=>e.kind==='purchase-correction').quantityDelta,0);assert.equal(page.items.length,2);
 assert.deepEqual(await t.run(async ctx=>({operations:await ctx.db.query('stockOperations').collect(),movements:await ctx.db.query('stockMovements').collect()})),before);
 await rebuild(t,true);page=await user.query(q('inventory:activity'),{itemId,size:50,cursor:null});assert.equal(page.items.length,2);assert.equal(page.items.reduce((sum:number,e:any)=>sum+e.quantityDelta,0),2);assert.equal(page.historyStatus,'complete');
 // An older parent-only audit proves that a change happened but has no immutable item list.
 await t.run(async ctx=>{for(const audit of await ctx.db.query('auditEvents').collect())if(audit.action==='purchase.date-updated'){if(audit.record?.table==='stockItems')await ctx.db.delete(audit._id);else await ctx.db.patch(audit._id,{changeJson:JSON.stringify({before:1000,after:2000})});}});
 await rebuild(t,true);page=await user.query(q('inventory:activity'),{itemId,size:50,cursor:null});assert.equal(page.items.length,1);assert.equal(page.historyStatus,'incomplete');assert.equal(page.items[0].occurredAt,2000);assert.equal(page.items[0].quantityDelta,2);
});
