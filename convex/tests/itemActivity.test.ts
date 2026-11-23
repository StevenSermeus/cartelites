import test from 'node:test';
import assert from 'node:assert/strict';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../functions/schema';
import {authenticated} from './helpers/session';
const modules={'./functions/operations.ts':()=>import('../functions/operations'),'./functions/inventory.ts':()=>import('../functions/inventory'),'./functions/itemActivity.ts':()=>import('../functions/itemActivity'),'./functions/_generated/server.js':()=>import('../functions/_generated/server.js')};
const m=(name:string)=>makeFunctionReference<'mutation'>(name),q=(name:string)=>makeFunctionReference<'query'>(name);
async function setup(){const t=convexTest(schema,modules),user=await authenticated(t);return {t,user};}
async function rebuild(t:any,restart=false){let result=await t.mutation(m('itemActivity:rebuild'),{restart});for(let i=0;!result.complete&&i<100;i++)result=await t.mutation(m('itemActivity:rebuild'),{});assert.equal(result.complete,true);return result;}
const product={name:'QA display',productType:'sealed',format:'display',askingPriceCents:1000,taxRateBps:2100};
test('legacy activity is atomic, paginated and replay safe across sale, gift and opening reversals',async()=>{
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
test('unknown historical cancellation date stays null, and source replacement/pruning removes stale effects',async()=>{
 const {t,user}=await setup();const receipt=await user.mutation(m('inventory:receive'),{operationId:'r',supplier:'QA',reference:'R',occurredAt:1000,lines:[{product,quantity:2,unitCostCents:100}]});const itemId=receipt.itemIds[0];
 const saleId=await user.mutation(m('operations:createSale'),{operationId:'s',itemId,occurredAt:2000,salePriceCents:100});
 await t.run(ctx=>ctx.db.patch(saleId,{status:'cancelled'}));await rebuild(t);
 let page=await user.query(q('inventory:activity'),{itemId,size:50,cursor:null});assert.equal(page.historyStatus,'incomplete');assert.equal(page.items.find((r:any)=>r.kind==='sale-cancellation').occurredAt,null);
 await user.mutation(m('operations:cancelSale'),{operationId:'late-noop',saleId});page=await user.query(q('inventory:activity'),{itemId,size:50,cursor:null});assert.equal(page.items.find((r:any)=>r.kind==='sale-cancellation').occurredAt,null);
 await t.run(ctx=>ctx.db.patch(saleId,{status:'active'}));await rebuild(t,true);page=await user.query(q('inventory:activity'),{itemId,size:50,cursor:null});assert.equal(page.items.some((r:any)=>r.kind==='sale-cancellation'),false);
 await t.run(ctx=>ctx.db.delete(saleId));await rebuild(t,true);page=await user.query(q('inventory:activity'),{itemId,size:50,cursor:null});assert.equal(page.items.some((r:any)=>r.kind==='sale'),false);
});
test('large historical purchase validation commits and uses bounded durable projection repair',async()=>{
 const {t,user}=await setup();await rebuild(t);
 const ids=await t.run(async ctx=>{const sellerId=await ctx.db.insert('sellers',{ownerId:user.accountId,operationId:'c',operationDigest:'{}',name:'QA',createdAt:1});const purchaseId=await ctx.db.insert('purchases',{ownerId:user.accountId,operationId:'p',operationDigest:'{}',sellerId,reference:'P',occurredAt:1000,status:'pending',createdAt:1});const itemIds=[];for(let i=0;i<101;i++)itemIds.push(await ctx.db.insert('items',{ownerId:user.accountId,operationId:String(i),purchaseId,purchaseOccurredAt:1000,name:'Card',vatRegime:'margin',status:'available',createdAt:1}));return {purchaseId,itemIds};});
 await user.mutation(m('operations:validatePurchase'),{purchaseId:ids.purchaseId});assert.equal((await t.run(ctx=>ctx.db.get(ids.purchaseId)))!.status,'active');
 assert.equal((await user.query(q('inventory:activity'),{itemId:ids.itemIds[0],size:25,cursor:null})).historyStatus,'indexing');
 const job=await t.run(ctx=>ctx.db.query('itemActivityJobs').first());for(let i=0;i<3;i++)await t.mutation(m('itemActivity:refreshPurchase'),{jobId:job!._id});
 const page=await user.query(q('inventory:activity'),{itemId:ids.itemIds[100],size:25,cursor:null});assert.equal(page.historyStatus,'complete');assert.equal(page.items[0].quantityDelta,1);
});
