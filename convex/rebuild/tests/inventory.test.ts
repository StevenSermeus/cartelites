import test from 'node:test';
import assert from 'node:assert/strict';
import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import schema from '../functions/schema';
import {normalize} from '../../../apps/api/scripts/migration/normalize';
import {planConvexImport} from '../../../apps/api/scripts/migration/import-convex';
const modules={
 './functions/migration.ts':()=>import('../functions/migration'),
 './functions/inventory.ts':()=>import('../functions/inventory'),
 './functions/workspaceReads.ts':()=>import('../functions/workspaceReads'),
 './functions/transactions.ts':()=>import('../functions/transactions'),
 './functions/auth.ts':()=>import('../functions/auth'),
 './functions/_generated/server.js':()=>import('../functions/_generated/server.js'),
};
const m=(name:string)=>makeFunctionReference<'mutation'>(name),q=(name:string)=>makeFunctionReference<'query'>(name);
async function setup(){
 const t=convexTest(schema,modules),account=await t.run(ctx=>ctx.db.insert('accounts',{email:'qa@example.invalid',passwordHash:'test',sessionVersion:0,createdAt:1}));
 await t.mutation(m('auth:startSession'),{id:account,jti:'qa',sessionVersion:0,expiresAt:Date.now()+60000,now:Date.now()});
 return {t,user:t.withIdentity({subject:account,sv:0,sessionJti:'qa'}),account};
}
const display={name:'QA Display',productType:'sealed',format:'display',tcg:'pokemon',askingPriceCents:2000,taxRateBps:2100};
const booster={...display,name:'QA Booster',format:'booster',askingPriceCents:200};
const receipt={operationId:'receive',supplier:'QA Supplier',reference:'R1',occurredAt:1000,lines:[{product:display,quantity:2,unitCostCents:1001}]};
test('supplier reception is atomic/replayable and opening+reversal preserve every cent and item quantity',async()=>{
 const {t,user}=await setup();const result=await user.mutation(m('inventory:receive'),receipt);assert.deepEqual(await user.mutation(m('inventory:receive'),receipt),result);
 assert.equal((await t.run(ctx=>ctx.db.query('purchases').collect())).length,1);
 await assert.rejects(()=>user.mutation(m('inventory:receive'),{...receipt,reference:'changed'}),/IDEMPOTENCY_KEY_REUSED/);
 const itemId=result.itemIds[0],preview=await user.query(q('workspaceReads:openPreview'),{itemId,quantity:1,packSize:36,occurredAt:2000});
 assert.deepEqual(preview.costParts,[{quantity:7,unitCostCents:27},{quantity:29,unitCostCents:28}]);
 const opening={operationId:'open',itemId,product:booster,quantity:1,packSize:36,occurredAt:2000};
 const openingId=await user.mutation(m('inventory:openDisplay'),opening);assert.equal(await user.mutation(m('inventory:openDisplay'),opening),openingId);
 const detail=await user.query(q('inventory:detail'),{itemId});assert.equal(detail.item.quantity,1);assert.equal(detail.openings.length,1);
 const outputs=await t.run(async ctx=>(await ctx.db.query('stockLots').collect()).filter(l=>l.source.kind==='opening'));
 assert.equal(outputs.length,1);assert.equal(outputs[0].remainingQuantity,36);assert.equal(outputs[0].remainingCostCents,1001);
 const giftId=await user.mutation(m('inventory:donate'),{operationId:'gift',itemId:outputs[0].stockItemId,quantity:1,occurredAt:3000,reason:'QA'});
 await assert.rejects(()=>user.mutation(m('inventory:reverse'),{operationId:'premature',openingId}),/OPENING_ALREADY_USED/);
 await user.mutation(m('inventory:reverse'),{operationId:'undo-gift',giftId});
 await user.mutation(m('inventory:reverse'),{operationId:'undo-opening',openingId});
 await user.mutation(m('inventory:reverse'),{operationId:'undo-opening-again',openingId});
 const restored=await user.query(q('inventory:detail'),{itemId});assert.equal(restored.item.quantity,2);assert.equal(restored.lots[0].remainingCostCents,2002);assert.ok(restored.openings[0].cancelledAt);
 assert.equal((await t.run(ctx=>ctx.db.get(outputs[0].stockItemId)))!.quantity,0);
 const movements=await t.run(ctx=>ctx.db.query('stockMovements').collect());assert.equal(movements.reduce((sum,x)=>sum+x.costDeltaCents!,0),2002);
});
test('gifts reject future lots, consignment ownership, overselling and revoked/read-only sessions',async()=>{
 const {t,user,account}=await setup(),result=await user.mutation(m('inventory:receive'),receipt),itemId=result.itemIds[0];
 const gift={operationId:'gift',itemId,quantity:1,occurredAt:-86400000,reason:'QA'};
 await assert.rejects(()=>user.mutation(m('inventory:donate'),gift),/ITEM_UNAVAILABLE_AT_DATE/);
 await assert.rejects(()=>user.mutation(m('inventory:donate'),{...gift,occurredAt:2000,quantity:3}),/ITEM_UNAVAILABLE/);
 await assert.rejects(()=>t.withIdentity({subject:account,sv:0,sessionJti:'qa',scope:'realtime:read'}).mutation(m('inventory:donate'),gift),/READ_ONLY_TOKEN/);
 await t.run(ctx=>ctx.db.patch(itemId,{origin:'consignment'}));
 await assert.rejects(()=>user.mutation(m('inventory:donate'),{...gift,occurredAt:2000}),/ITEM_UNAVAILABLE/);
 assert.equal((await t.run(ctx=>ctx.db.query('stockOperations').collect())).filter(o=>o.kind==='gift').length,0);
});
test('unknown acquisition costs stay unknown through gifts and reversal',async()=>{
 const {t,user}=await setup(),result=await user.mutation(m('inventory:receive'),receipt),itemId=result.itemIds[0];
 await t.run(async ctx=>{for(const lot of await ctx.db.query('stockLots').collect())await ctx.db.patch(lot._id,{originalCostCents:null,remainingCostCents:null});});
 const giftId=await user.mutation(m('inventory:donate'),{operationId:'unknown',itemId,quantity:1,occurredAt:2000,reason:'QA'});
 const gifts=await user.query(q('inventory:gifts'),{from:0,to:3000,paginationOpts:{numItems:25,cursor:null}});assert.equal(gifts.page[0].costCents,null);
 await user.mutation(m('inventory:reverse'),{operationId:'restore-unknown',giftId});
 const [lot]=await t.run(ctx=>ctx.db.query('stockLots').collect());assert.equal(lot.remainingCostCents,null);assert.equal(lot.remainingQuantity,2);
});
test('photo unlink preserves shared historical file and documents DTO never leaks evidence/snapshot/keys',async()=>{
 const {t,user}=await setup(),result=await user.mutation(m('inventory:receive'),receipt),itemId=result.itemIds[0];
 const ids=await t.run(async ctx=>{
  const file=await ctx.db.insert('files',{objectKey:'secret/original.pdf',filename:'original.pdf',contentType:'image/png',size:10,uploadState:'complete',createdAt:1});
  await ctx.db.insert('fileLinks',{fileId:file,target:{table:'stockItems',id:itemId},purpose:'photo',displayOrder:0,createdAt:1});
  const document=await ctx.db.insert('documents',{kind:'purchase',version:2,status:'archived',inputSnapshot:{renderer:'purchaseReceipt',legacyFormat:'v1',json:JSON.stringify({reference:'QA receipt',identity:'PRIVATE',signature:[[1,2]]})},shopSnapshotJson:'{}',rendererVersion:'legacy-preserved',pdfFileId:file,createdAt:1});
  await ctx.db.insert('documentLinks',{documentId:document,target:{table:'purchases',id:result.id},createdAt:1});return {file,document};
 });
 assert.equal((await user.mutation(m('inventory:photo'),{itemId,attachmentId:ids.file,action:'remove'})).deleteObject,false);
 assert.ok(await t.run(ctx=>ctx.db.get(ids.file)));assert.equal((await user.query(q('inventory:detail'),{itemId})).photos.length,0);
 const docs=await user.query(q('workspaceReads:documents'),{kind:'receipt',search:'QA'});assert.equal(docs.items[0].version,2);assert.equal(docs.items[0].reference,'QA receipt');assert.equal(docs.items[0].downloadPath,`/receipts/${ids.document}/pdf`);
 const json=JSON.stringify(docs);assert.ok(!json.includes('PRIVATE'));assert.ok(!json.includes('secret/original'));assert.ok(!json.includes('signature'));
 await assert.rejects(()=>t.query(q('workspaceReads:documents'),{kind:'all'}),/UNAUTHENTICATED/);
});

test('opening preview retains each FIFO lot cost rather than averaging unlike acquisitions',async()=>{
 const {user}=await setup();const first=await user.mutation(m('inventory:receive'),{...receipt,lines:[{product:display,quantity:1,unitCostCents:100}]});
 await user.mutation(m('inventory:receive'),{...receipt,operationId:'restock',lines:[{itemId:first.itemIds[0],product:display,quantity:1,unitCostCents:1000}]});
 const preview=await user.query(q('workspaceReads:openPreview'),{itemId:first.itemIds[0],quantity:2,packSize:10,occurredAt:2000});
 assert.deepEqual(preview.costParts,[{quantity:10,unitCostCents:10},{quantity:10,unitCostCents:100}]);assert.equal(preview.totalCostCents,1100);
});

test('imported historical display and gift can reverse through actual canonical IDs without balance inflation',async()=>{
 const row=(_id:string,value:Record<string,unknown>)=>({_id,createdAt:1,...value});
 const n=normalize({accounts:[row('account',{email:'import@example.invalid',passwordHash:'test'})],supplierReceipts:[row('receipt',{supplier:'QA',reference:'R',occurredAt:1,totalCostCents:2002})],items:[row('display',{origin:'supplier',quantity:1,purchaseOccurredAt:1,name:'Display',productType:'sealed',format:'display',status:'available',taxRateBps:2100}),row('booster',{origin:'supplier',quantity:35,purchaseOccurredAt:2,name:'Booster',productType:'sealed',format:'booster',status:'available',taxRateBps:2100})],stockLots:[row('source',{itemId:'display',receiptId:'receipt',received:2,remaining:1,totalCostCents:2002,remainingCostCents:1001,occurredAt:1,taxRateBps:2100}),row('opened',{itemId:'booster',receiptId:'receipt',openingId:'open',received:36,remaining:35,totalCostCents:1001,remainingCostCents:974,occurredAt:2,taxRateBps:2100})],stockOpenings:[row('open',{sourceId:'display',targetId:'booster',quantity:1,packSize:36,occurredAt:2,allocations:[{lotId:'source',quantity:1,costCents:1001}]})],stockGifts:[row('gift',{itemId:'booster',quantity:1,costCents:27,occurredAt:3,reason:'QA',allocations:[{lotId:'opened',quantity:1,costCents:27}]})]});
 assert.deepEqual(n.errors,[]);const t=convexTest(schema,modules),run={batch:'history',sourceDigest:n.sourceDigest,planDigest:'history-plan'},entries=planConvexImport(n);
 await t.mutation(m('migration:begin'),{...run,countsJson:JSON.stringify(Object.fromEntries(Object.entries(n.tables).map(([key,rows])=>[key,rows.length]))),totalsJson:JSON.stringify(n.reconciliation)});
 for(let i=0;i<entries.length;i+=50)await t.mutation(m('migration:importBatch'),{...run,entries:entries.slice(i,i+50)});
 assert.deepEqual((await t.query(q('migration:reconcile'),{batch:run.batch})).errors,[]);await t.mutation(m('migration:complete'),run);
 const account=(await t.run(ctx=>ctx.db.query('accounts').collect()))[0];await t.mutation(m('auth:startSession'),{id:account._id,jti:'qa-import',sessionVersion:0,expiresAt:Date.now()+60000,now:Date.now()});
 const user=t.withIdentity({subject:account._id,sv:0,sessionJti:'qa-import'}),operations=await t.run(ctx=>ctx.db.query('stockOperations').collect()),opening=operations.find(o=>o.kind==='display-opening')!,gift=operations.find(o=>o.kind==='gift')!;
 assert.equal((await user.query(q('workspaceReads:openings'),{paginationOpts:{numItems:25,cursor:null}})).page[0].quantity,1);
 await user.mutation(m('inventory:reverse'),{operationId:'undo-gift',giftId:gift._id});await user.mutation(m('inventory:reverse'),{operationId:'undo-open',openingId:opening._id});
 const lots=await t.run(ctx=>ctx.db.query('stockLots').collect());assert.equal(lots.reduce((sum,l)=>sum+l.remainingQuantity,0),2);assert.equal(lots.reduce((sum,l)=>sum+l.remainingCostCents!,0),2002);
});
