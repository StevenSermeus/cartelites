import test from 'node:test';
import assert from 'node:assert/strict';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../functions/schema';
const modules={
 './functions/auth.ts':()=>import('../functions/auth'),
 './functions/readModels.ts':()=>import('../functions/readModels'),
 './functions/workspaceReads.ts':()=>import('../functions/workspaceReads'),
 './functions/transactions.ts':()=>import('../functions/transactions'),
 './functions/_generated/server.js':()=>import('../functions/_generated/server.js'),
};
const m=(name:string)=>makeFunctionReference<'mutation'>(name),q=(name:string)=>makeFunctionReference<'query'>(name);
async function setup(){const t=convexTest(schema,modules),accountId=await t.run(ctx=>ctx.db.insert('accounts',{email:'pagination@example.invalid',passwordHash:'test',sessionVersion:0,createdAt:1}));await t.mutation(m('auth:startSession'),{id:accountId,jti:'query-session',sessionVersion:0,expiresAt:Date.now()+60000,now:Date.now()});const user=t.withIdentity({subject:accountId,sv:0,sessionJti:'query-session'});const contactId=await user.mutation(m('transactions:saveContact'),{operationId:'contact',kind:'company',name:'QA supplier'});return {t,user,contactId};}
const receive=(contactId:string,key:string,itemId?:string)=>({operationId:key,contactId,type:'supplier',reference:key,occurredAt:1000,lines:[{...(itemId?{stockItemId:itemId}:{product:{type:'sealed',name:'Booster'}}),quantity:1,costCents:101,askingPriceCents:200,tax:{regime:'other',rateBps:2100}}]});
test('stock history preserves sold zero-quantity records and item filter while default selection excludes them',async()=>{
 const {user,contactId}=await setup();const receipt=await user.mutation(m('transactions:createPurchase'),receive(contactId,'initial'));
 await user.mutation(m('transactions:createSale'),{operationId:'sold',reference:'SALE',occurredAt:2000,lines:[{stockItemId:receipt.itemIds[0],quantity:1,lineTotalCents:200}],payment:{status:'received',cashCents:200,transferCents:0}});
 for(const status of ['sold','all']){const result=await user.query(q('readModels:browse'),{resource:'stock',status,itemId:receipt.itemIds[0],size:10});assert.equal(result.items.length,1);assert.equal(result.items[0].quantity,0);}
 assert.equal((await user.query(q('readModels:browse'),{resource:'stock',size:10})).items.length,0);
});
test('a later supplier purchase pages its shared item through its own lines and excludes removed lines',async()=>{
 const {t,user,contactId}=await setup(),first=await user.mutation(m('transactions:createPurchase'),receive(contactId,'first'));
 const later=await user.mutation(m('transactions:createPurchase'),receive(contactId,'second',first.itemIds[0]));
 const result=await user.query(q('readModels:browse'),{resource:'stock',purchaseId:later.purchaseId,size:1});assert.equal(result.items.length,1);assert.equal(result.items[0]._id,first.itemIds[0]);assert.equal(result.items[0].purchaseId,later.purchaseId);assert.equal(result.items[0].purchaseReference,'second');
 await t.run(async ctx=>{const line=await ctx.db.query('purchaseLines').withIndex('by_purchase',q=>q.eq('purchaseId',later.purchaseId)).first();await ctx.db.patch(line!._id,{removedAt:5000});});
 assert.equal((await user.query(q('readModels:browse'),{resource:'stock',purchaseId:later.purchaseId,size:1})).items.length,0);
});
test('filtered short/empty pages retain authoritative cursor, reject changed criteria and never duplicate records',async()=>{
 const {t,user}=await setup();await t.run(async ctx=>{for(let i=0;i<7;i++)await ctx.db.insert('contacts',{kind:'person',name:i%2?'Needle':'Other',createdAt:i});});
 let cursor:string|undefined,ids:string[]=[];let requests=0;do{const result=await user.query(q('readModels:browse'),{resource:'sellers',size:1,search:'Needle',...(cursor?{cursor}:{})});ids.push(...result.items.map((r:any)=>r._id));requests++;if(result.nextCursor)await assert.rejects(()=>user.query(q('readModels:browse'),{resource:'sellers',size:1,search:'Other',cursor:result.nextCursor}),/INVALID_CURSOR/);cursor=result.nextCursor??undefined;}while(cursor);
 assert.ok(requests>ids.length);assert.equal(ids.length,3);assert.equal(new Set(ids).size,3);
});
test('document kind/date/status filters run before pagination rather than hiding matches behind unrelated pages',async()=>{
 const {t,user}=await setup();await t.run(async ctx=>{for(let i=0;i<35;i++)await ctx.db.insert('documents',{kind:i===0?'purchase':'sale_ticket',version:1,status:'prepared',createdAt:i+1,inputSnapshot:{renderer:i===0?'purchaseReceipt':'saleTicket',legacyFormat:'v1',json:JSON.stringify({reference:`REF${i}`})},shopSnapshotJson:'null',rendererVersion:'legacy-preserved'});});
 const result=await user.query(q('workspaceReads:documents'),{kind:'receipt',from:1,to:35,status:'prepared'});assert.equal(result.items.length,1);assert.equal(result.items[0].reference,'REF0');assert.equal(result.isDone,true);assert.equal(result.nextCursor,null);
 for(const record of result.items)for(const key of ['inputSnapshot','shopSnapshotJson','objectKey'])assert.equal(record[key],undefined);
});
test('workspace pagination rejects unbounded sizes and sparse filtered scans continue',async()=>{
 const {t,user}=await setup();for(const name of ['products','openings'])for(const size of [0,51,100000])await assert.rejects(()=>user.query(q(`workspaceReads:${name}`),{paginationOpts:{numItems:size,cursor:null}}),/INVALID_PAGINATION/);
 await t.run(async ctx=>{const productId=await ctx.db.insert('products',{type:'sealed',name:'Fixture',description:'',createdAt:1});await ctx.db.insert('stockItems',{productId,origin:'supplier',tracking:'quantity',askingPriceCents:100,visible:false,status:'available',quantity:0,createdAt:1});for(let i=0;i<260;i++)await ctx.db.insert('stockItems',{productId,origin:'purchase',tracking:'individual',askingPriceCents:100,visible:false,status:'available',quantity:0,createdAt:2+i});});
 let cursor:string|null=null,count=0,requests=0;do{const result=await user.query(q('workspaceReads:products'),{paginationOpts:{numItems:1,cursor}});count+=result.page.length;requests++;cursor=result.isDone?null:result.continueCursor;}while(cursor);assert.equal(count,1);assert.ok(requests>=1);
});
test('dashboard preserves explicit gift costs and unknown incomplete history instead of reporting zero loss',async()=>{
 const {t,user}=await setup();await t.run(async ctx=>{await ctx.db.insert('stockOperations',{kind:'gift',occurredAt:1000,createdAt:1000,historyComplete:false});await ctx.db.insert('stockOperations',{kind:'gift',occurredAt:1000,createdAt:1000,historyComplete:false,costCents:321});});
 const {summary}=await user.query(q('readModels:dashboardSummary'),{});assert.equal(summary.giftCount,2);assert.equal(summary.giftLossCents,321);assert.equal(summary.unknownGiftCostCount,1);
});
