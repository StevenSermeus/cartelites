import test from 'node:test';
import assert from 'node:assert/strict';
import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import schema from '../functions/schema';
import { normalize } from '../../../apps/api/scripts/migration/normalize';
import { planConvexImport, assertIsolatedTarget } from '../../../apps/api/scripts/migration/import-convex';
const modules={
 './functions/inventory.ts':()=>import('../functions/inventory'),
 './functions/purchaseEditing.ts':()=>import('../functions/purchaseEditing'),
 './functions/consignmentOperations.ts':()=>import('../functions/consignmentOperations'),
 './functions/consignmentDocuments.ts':()=>import('../functions/consignmentDocuments'),
 './functions/signedReceipts.ts':()=>import('../functions/signedReceipts'),
 './functions/operations.ts':()=>import('../functions/operations'),
 './functions/readModels.ts':()=>import('../functions/readModels'),
 './functions/auth.ts':()=>import('../functions/auth'),
 './functions/reads.ts':()=>import('../functions/reads'),
 './functions/transactions.ts':()=>import('../functions/transactions'),
 './functions/migration.ts':()=>import('../functions/migration'),
 './functions/_generated/server.js':()=>import('../functions/_generated/server.js'),
};
const mutation=(name:string)=>makeFunctionReference<'mutation'>(name);
const query=(name:string)=>makeFunctionReference<'query'>(name);
const fixture={accounts:[{_id:'old-account',email:'qa@example.invalid',passwordHash:'test-only',createdAt:1}],sellers:[{_id:'old-contact',name:'QA',createdAt:1}],purchases:[{_id:'old-purchase',sellerId:'old-contact',reference:'P1',occurredAt:1000,createdAt:1000,status:'active'}],items:[{_id:'old-item',purchaseId:'old-purchase',name:'Carte',purchaseOccurredAt:1000,purchasePriceCents:101,askingPriceCents:200,vatRegime:'margin',status:'available',createdAt:1000}],consignments:[{_id:'old-consignment',sellerId:'old-contact',reference:'C1',occurredAt:1000,createdAt:1000,contractRevision:1,contractTerms:{version:'v1',text:'Terms'},contractStatus:'signed'}]};
test('real-ID import is resumable, binds cyclic revisions and reconciles without duplicating records',async()=>{
 const t=convexTest(schema,modules),migration=normalize(fixture);assert.deepEqual(migration.errors,[]);
 const entries=planConvexImport(migration),args={batch:'fixture',sourceDigest:migration.sourceDigest,planDigest:'plan'};
 await t.mutation(mutation('migration:begin'),{...args,countsJson:JSON.stringify(Object.fromEntries(Object.entries(migration.tables).map(([k,v])=>[k,v.length]))),totalsJson:JSON.stringify(migration.reconciliation)});
 await t.mutation(mutation('migration:importBatch'),{...args,entries:entries.slice(0,5)});
 await assert.rejects(()=>t.mutation(mutation('migration:importBatch'),{...args,entries:[{...entries[0],hash:'changed'}]}),/MIGRATION_RECORD_CHANGED/);
 for(let start=0;start<entries.length;start+=50)await t.mutation(mutation('migration:importBatch'),{...args,entries:entries.slice(start,start+50)});
 await t.mutation(mutation('migration:linkConsignments'),{...args,links:migration.tables.consignments.map(c=>({id:c.id,revisionId:c.currentRevisionId}))});
 const report=await t.query(query('migration:reconcile'),{batch:args.batch});assert.deepEqual(report.errors,[]);assert.equal(report.totals.stockQuantity,1);assert.equal(report.totals.knownPurchaseCostCents,101);
 const [dossier]=await t.run(ctx=>ctx.db.query('consignments').collect());const revision=await t.run(ctx=>ctx.db.get(dossier.currentRevisionId!));assert.equal(revision!.consignmentId,dossier._id);
 assert.notEqual(dossier._id,migration.tables.consignments[0].id);
 await t.mutation(mutation('migration:complete'),args);
 for(let start=0;start<entries.length;start+=50){const replay=await t.mutation(mutation('migration:importBatch'),{...args,entries:entries.slice(start,start+50)});assert.equal(replay.inserted,0);}
 await assert.rejects(()=>t.mutation(mutation('migration:begin'),{...args,sourceDigest:'different',countsJson:'{}',totalsJson:'{}'}),/MIGRATION_SOURCE_CHANGED/);
});
test('import target guard refuses production and active local deployment',()=>{
 for(const value of ['https://example.convex.cloud','http://127.0.0.1:3210','http://localhost:3001','http://localhost:3220/path','http://user:pass@localhost:3220'])assert.throws(()=>assertIsolatedTarget(value));
 assert.equal(assertIsolatedTarget('http://127.0.0.1:3220'),'http://127.0.0.1:3220');
});
async function setup(){
 const t=convexTest(schema,modules);const accountId=await t.run(ctx=>ctx.db.insert('accounts',{email:'qa@example.invalid',passwordHash:'test',sessionVersion:0,createdAt:1}));
 await t.mutation(mutation('auth:startSession'),{id:accountId,jti:'qa-session',sessionVersion:0,expiresAt:Date.now()+3600000,now:Date.now()});
 const user=t.withIdentity({subject:accountId,sv:0,sessionJti:'qa-session'});
 const contactId=await user.mutation(mutation('transactions:saveContact'),{operationId:'contact',kind:'company',name:'QA supplier'});
 return {t,user,accountId,contactId};
}
const receive=(contactId:string,operationId:string,quantity:number,costCents:number,stockItemId?:string)=>({operationId,contactId,type:'supplier',reference:operationId,occurredAt:1000,lines:[{...(stockItemId?{stockItemId}:{product:{type:'sealed',name:'Booster'}}),quantity,costCents,askingPriceCents:200,tax:{regime:'other',rateBps:2100}}]});
test('FIFO sale preserves indivisible cents, payments, replay safety and exact cancellation restoration',async()=>{
 const {t,user,contactId}=await setup();const receipt=await user.mutation(mutation('transactions:createPurchase'),receive(contactId,'r1',3,101));
 await user.mutation(mutation('transactions:createPurchase'),receive(contactId,'r2',2,99,receipt.itemIds[0]));
 const saleArgs={operationId:'sale1',reference:'S1',occurredAt:2000,lines:[{stockItemId:receipt.itemIds[0],quantity:4,lineTotalCents:800}],payment:{status:'received',cashCents:300,transferCents:500}};
 const saleId=await user.mutation(mutation('transactions:createSale'),saleArgs);assert.equal(await user.mutation(mutation('transactions:createSale'),saleArgs),saleId);
 const allocations=await t.run(ctx=>ctx.db.query('saleAllocations').collect());assert.equal(allocations.reduce((n,a)=>n+a.costCents!,0),150);
 const remaining=await t.run(ctx=>ctx.db.query('stockLots').collect());assert.equal(remaining.reduce((n,l)=>n+l.remainingCostCents!,0),50);
 await assert.rejects(()=>user.mutation(mutation('transactions:createSale'),{...saleArgs,payment:{status:'received',cashCents:400,transferCents:400}}),/IDEMPOTENCY_KEY_REUSED/);
 await assert.rejects(()=>user.mutation(mutation('transactions:createSale'),{...saleArgs,operationId:'oversell'}),/ITEM_UNAVAILABLE/);
 assert.equal((await t.run(ctx=>ctx.db.query('sales').collect())).length,1);
 await user.mutation(mutation('transactions:correctPayment'),{operationId:'pay',saleId,occurredAt:2100,payment:{status:'received',cashCents:800,transferCents:0}});
 const paymentRecords=await t.run(ctx=>ctx.db.query('salePayments').collect());assert.equal(paymentRecords.filter(p=>p.status==='superseded').length,1);assert.equal(paymentRecords.filter(p=>p.status==='active').length,1);
 await user.mutation(mutation('transactions:cancelSale'),{operationId:'cancel',saleId});await user.mutation(mutation('transactions:cancelSale'),{operationId:'cancel2',saleId});
 const restored=await t.run(ctx=>ctx.db.query('stockLots').collect());assert.equal(restored.reduce((n,l)=>n+l.remainingQuantity,0),5);assert.equal(restored.reduce((n,l)=>n+l.remainingCostCents!,0),200);
 assert.equal((await t.run(ctx=>ctx.db.query('salePayments').collect())).filter(p=>p.status==='active').length,0);
});
test('authorization, optimistic revision and mixed-payment validation are enforced on server',async()=>{
 const {t,user,accountId,contactId}=await setup();
 await assert.rejects(()=>t.mutation(mutation('transactions:saveContact'),{operationId:'x',kind:'person',name:'X'}),/UNAUTHENTICATED/);
 await assert.rejects(()=>t.withIdentity({subject:accountId,sv:0,scope:'realtime:read',sessionJti:'qa-session'}).mutation(mutation('transactions:saveContact'),{operationId:'x',kind:'person',name:'X'}),/READ_ONLY_TOKEN/);
 await assert.rejects(()=>user.mutation(mutation('transactions:saveContact'),{operationId:'edit',contactId,expectedRevision:9,kind:'company',name:'X'}),/REVISION_CONFLICT/);
 const receipt=await user.mutation(mutation('transactions:createPurchase'),receive(contactId,'r',1,10));
 await assert.rejects(()=>user.mutation(mutation('transactions:createSale'),{operationId:'bad',reference:'BAD',occurredAt:2000,lines:[{stockItemId:receipt.itemIds[0],quantity:1,lineTotalCents:100}],payment:{status:'received',cashCents:40,transferCents:50}}),/PAYMENT_TOTAL_MISMATCH/);
 assert.equal((await t.run(ctx=>ctx.db.query('sales').collect())).length,0);
});
test('canonical sessions reject absent/revoked credentials and invalidate realtime subscriptions after logout/reset',async()=>{
 const {t,user,accountId}=await setup();const stock={paginationOpts:{numItems:10,cursor:null}};
 await assert.rejects(()=>t.withIdentity({subject:accountId,sv:0,sessionJti:'unknown'}).query(query('reads:stock'),stock),/INVALID_SESSION/);
 const live=t.withIdentity({subject:accountId,sv:0,scope:'realtime:read',sessionJti:'qa-session'});
 await live.query(query('reads:stock'),stock);
 await t.mutation(mutation('auth:revokeSession'),{jti:'qa-session',expiresAt:Date.now()+3600000});
 await assert.rejects(()=>live.query(query('reads:stock'),stock),/INVALID_SESSION/);
 await assert.rejects(()=>user.query(query('reads:stock'),stock),/INVALID_SESSION/);
 await t.mutation(mutation('auth:startSession'),{id:accountId,jti:'new-session',sessionVersion:0,expiresAt:Date.now()+3600000,now:Date.now()});
 await t.mutation(mutation('auth:createPasswordReset'),{email:'qa@example.invalid',tokenHash:'reset',expiresAt:Date.now()+60000});
 await t.mutation(mutation('auth:consumePasswordReset'),{tokenHash:'reset',passwordHash:'replacement',now:Date.now()});
 await assert.rejects(()=>t.withIdentity({subject:accountId,sv:0,sessionJti:'new-session'}).query(query('reads:stock'),stock),/INVALID_SESSION/);
 await assert.rejects(()=>t.mutation(mutation('auth:consumePasswordReset'),{tokenHash:'reset',passwordHash:'second',now:Date.now()}),/RESET_TOKEN_INVALID/);
});
test('legacy adapters freeze grading, preserve collection dates and record conflicts without partial sales',async()=>{
 const {t,user,contactId}=await setup();const occurredAt=Date.UTC(2026,0,1,12),receivedAt=Date.UTC(2026,0,2,0);
 const receipt=await user.mutation(mutation('operations:createPurchase'),{operationId:'legacy-purchase',sellerId:contactId,reference:'P',occurredAt,items:[{operationId:'i1',name:'Graded card',gradingCompany:'QA grade',gradingGrade:'9.5',marketValueCents:200,discountPercent:50,purchasePriceCents:100,askingPriceCents:200,vatRegime:'margin'}]});
 assert.equal((await t.run(ctx=>ctx.db.query('stockItems').collect()))[0].quantity,0);
 await user.mutation(mutation('operations:validatePurchase'),{purchaseId:receipt.purchaseId});
 const args={operationId:'legacy-sale',itemId:receipt.itemIds[0],occurredAt,salePriceCents:200,paymentStatus:'received',payment:{cashCents:100,transferCents:100,receivedAt}};
 const saleId=await user.mutation(mutation('operations:createSale'),args);assert.equal(await user.mutation(mutation('operations:createSale'),args),saleId);
 const payment=(await t.run(ctx=>ctx.db.query('salePayments').collect()))[0];assert.equal(payment.occurredAt,receivedAt);
 await t.run(async ctx=>{const [grading]=await ctx.db.query('itemGradings').collect();await ctx.db.patch(grading._id,{grade:'Authentic'});const company=await ctx.db.get(grading.companyId);await ctx.db.patch(company!._id,{name:'Renamed'});});
 const [sale]=await user.query(query('operations:salesHistory'),{});assert.equal(sale.gradingGrade,'9.5');assert.equal(sale.gradingCompany,'QA grade');
 const conflict=await user.mutation(mutation('operations:createSale'),{...args,operationId:'conflict'});assert.equal(conflict.conflict,true);
 assert.deepEqual(await user.mutation(mutation('operations:createSale'),{...args,operationId:'conflict'}),conflict);
 assert.equal((await t.run(ctx=>ctx.db.query('sales').collect())).length,1);assert.equal((await t.run(ctx=>ctx.db.query('saleConflicts').collect())).length,1);
 const another=await user.mutation(mutation('transactions:createPurchase'),receive(contactId,'other',1,10));
 await assert.rejects(()=>user.mutation(mutation('operations:createSales'),{operationId:'bulk-fail',occurredAt:receivedAt,items:[{itemId:another.itemIds[0],salePriceCents:100},{itemId:receipt.itemIds[0],salePriceCents:100}],paymentStatus:'received',payment:{cashCents:200,transferCents:0,receivedAt}}),/ITEM_UNAVAILABLE/);
 assert.equal((await t.run(ctx=>ctx.db.get(another.itemIds[0])))!.quantity,1);assert.equal((await t.run(ctx=>ctx.db.query('sales').collect())).length,1);
});
test('consignment signature gating, collected balances and partial payout remain transactional',async()=>{
 const {t,user,contactId,accountId}=await setup();
 const ids=await t.run(async ctx=>{
  const productId=await ctx.db.insert('products',{type:'card',name:'Deposit',description:'',createdAt:1});
  const itemId=await ctx.db.insert('stockItems',{productId,tracking:'individual',askingPriceCents:1000,visible:true,status:'available',quantity:1,origin:'consignment',createdAt:1});
  const dossierId=await ctx.db.insert('consignments',{depositorId:contactId,reference:'D',occurredAt:1,status:'open',createdAt:1});
  const revisionId=await ctx.db.insert('consignmentRevisions',{consignmentId:dossierId,number:1,contractText:'Terms',contractVersion:'v1',signatureState:'awaiting_signature',createdAt:1});
  await ctx.db.patch(dossierId,{currentRevisionId:revisionId});await ctx.db.insert('consignmentTerms',{revisionId,stockItemId:itemId,agreedPriceCents:1000,commissionRateBps:2000,createdAt:1});
  await ctx.db.insert('stockLots',{stockItemId:itemId,source:{kind:'consignment',consignmentId:dossierId,depositorId:contactId},originalQuantity:1,remainingQuantity:1,originalCostCents:null,remainingCostCents:null,acquiredAt:1,taxRateBps:null,openingBalanceOnly:false,createdAt:1});return {itemId,revisionId};
 });
 const saleArgs={operationId:'deposit-sale',reference:'D1',occurredAt:2000,lines:[{stockItemId:ids.itemId,quantity:1,lineTotalCents:1000}],payment:{status:'pending',cashCents:0,transferCents:0}};
 await assert.rejects(()=>user.mutation(mutation('transactions:createSale'),saleArgs),/CONSIGNMENT_SIGNATURE_REQUIRED/);assert.equal((await t.run(ctx=>ctx.db.query('sales').collect())).length,0);
 await t.run(ctx=>ctx.db.patch(ids.revisionId,{signatureState:'signed'}));const saleId=await user.mutation(mutation('transactions:createSale'),saleArgs);
 assert.equal((await user.query(query('transactions:balance'),{depositorId:contactId})).balanceCents,0);
 await user.mutation(mutation('transactions:correctPayment'),{operationId:'collect',saleId,occurredAt:3000,payment:{status:'received',cashCents:1000,transferCents:0}});
 assert.equal((await user.query(query('transactions:balance'),{depositorId:contactId})).balanceCents,800);
 await user.mutation(mutation('transactions:recordPayout'),{operationId:'pay400',depositorId:contactId,amountCents:400,occurredAt:4000,method:'cash'});
 await assert.rejects(()=>user.mutation(mutation('transactions:recordPayout'),{operationId:'pay401',depositorId:contactId,amountCents:401,occurredAt:4000,method:'cash'}),/PAYMENT_EXCEEDS_BALANCE/);
 await user.mutation(mutation('transactions:cancelSale'),{operationId:'cancel-deposit',saleId});
 assert.equal((await user.query(query('transactions:balance'),{depositorId:contactId})).balanceCents,-400);
 const [restored]=await t.run(ctx=>ctx.db.query('stockLots').collect());assert.equal(restored.remainingCostCents,null);assert.equal(restored.remainingQuantity,1);
});

test('purchase metadata corrections preserve historical cents and reject stale revisions',async()=>{
 const {t,user,contactId}=await setup();
 const result=await user.mutation(mutation('operations:createPurchase'),{operationId:'legacy-cost',sellerId:contactId,reference:'P',occurredAt:1000,items:[{operationId:'i1',name:'Original',marketValueCents:1000,discountPercent:70,purchasePriceCents:700,askingPriceCents:1000,vatRegime:'margin'}]});
 await t.run(async ctx=>{const [line]=await ctx.db.query('purchaseLines').collect();const [lot]=await ctx.db.query('stockLots').collect();await ctx.db.patch(line._id,{costCents:701});await ctx.db.patch(lot._id,{originalCostCents:701});});
 const detail=()=>user.query(query('purchaseEditing:detail'),{purchaseId:result.purchaseId});
 const before=await detail();const request={operationId:'correction',purchaseId:result.purchaseId,expectedDigest:before.expectedDigest,items:[{itemId:result.itemIds[0],operationId:'i1',name:'Renamed',marketValueCents:1000,discountPercent:70}],removedIds:[]};
 await user.mutation(mutation('purchaseEditing:save'),request);
 assert.equal((await t.run(ctx=>ctx.db.query('purchaseLines').collect()))[0].costCents,701);
 assert.equal((await t.run(ctx=>ctx.db.query('stockLots').collect()))[0].originalCostCents,701);
 await assert.rejects(()=>user.mutation(mutation('purchaseEditing:save'),{...request,operationId:'stale'}),/PURCHASE_CHANGED/);
 await user.mutation(mutation('purchaseEditing:save'),{...request,operationId:'valuation',expectedDigest:(await detail()).expectedDigest,items:[{...request.items[0],discountPercent:80}]});
 assert.equal((await t.run(ctx=>ctx.db.query('purchaseLines').collect()))[0].costCents,800);
});
const signature=[[[0.1,0.2],[0.2,0.6],[0.3,0.2],[0.4,0.6],[0.5,0.2]]];
test('signed consignment revisions and returns preserve immutable originals and consume stock once',async()=>{
 const {t,user,accountId,contactId}=await setup();
 await t.run(ctx=>ctx.db.patch(accountId,{signatory:{firstName:'QA',lastName:'Agent',capacity:'Test',signature}}));
 const created=await user.mutation(mutation('consignmentOperations:createConsignment'),{operationId:'dossier',sellerId:contactId,reference:'D',occurredAt:1000,contractTerms:{version:'v1',text:'Conditions'},items:[{operationId:'d1',name:'Deposit',productType:'card',askingPriceCents:1000,commissionRateBps:2000}]});
 const prepare=()=>t.mutation(mutation('signedReceipts:prepare'),{ownerId:accountId,kind:'consignment',targetId:created.consignmentId,identity:{name:'QA Shop'}});
 const draft=await prepare();const sign={ownerId:accountId,id:draft.id,company:signature,client:signature,accepted:true};
 await t.mutation(mutation('signedReceipts:sign'),sign);
 let dossier=await t.run(ctx=>ctx.db.get(created.consignmentId));assert.equal((await t.run(ctx=>ctx.db.get(dossier!.currentRevisionId!)))!.signatureState,'awaiting_signature');
 const archive={id:draft.id,objectKey:'test/original.pdf',filename:'original.pdf',sha256:'1'.repeat(64)};
 await t.mutation(mutation('signedReceipts:archive'),archive);await t.mutation(mutation('signedReceipts:archive'),archive);
 await assert.rejects(()=>t.mutation(mutation('signedReceipts:archive'),{...archive,objectKey:'replacement.pdf'}),/ARCHIVE_IMMUTABLE/);
 assert.equal((await t.run(ctx=>ctx.db.get(dossier!.currentRevisionId!)))!.signatureState,'signed');
 await user.mutation(mutation('consignmentOperations:updateConsignmentTerms'),{operationId:'revision',itemId:created.itemIds[0],askingPriceCents:1200,commissionRateBps:2000,authorizationNote:'Client requested revised price'});
 dossier=await t.run(ctx=>ctx.db.get(created.consignmentId));assert.equal((await t.run(ctx=>ctx.db.get(dossier!.currentRevisionId!)))!.signatureState,'awaiting_signature');
 await assert.rejects(()=>user.mutation(mutation('transactions:createSale'),{operationId:'sale',reference:'S',occurredAt:2000,lines:[{stockItemId:created.itemIds[0],quantity:1,lineTotalCents:1200}],payment:{status:'received',cashCents:1200,transferCents:0}}),/CONSIGNMENT_SIGNATURE_REQUIRED/);
 const returnId=await user.mutation(mutation('consignmentDocuments:prepareReturn'),{operationId:'return',consignmentId:created.consignmentId,itemIds:created.itemIds,occurredAt:2000,conditionNotes:'Unchanged'});
 assert.equal((await t.run(ctx=>ctx.db.get(created.itemIds[0])))!.quantity,1);
 const returned=await t.mutation(mutation('signedReceipts:prepare'),{ownerId:accountId,kind:'consignment_return',targetId:returnId,identity:{name:'QA Shop'}});
 const signed={...sign,id:returned.id};await t.mutation(mutation('signedReceipts:sign'),signed);await t.mutation(mutation('signedReceipts:sign'),signed);
 const item=await t.run(ctx=>ctx.db.get(created.itemIds[0]));assert.equal(item!.quantity,0);assert.equal(item!.status,'returned');
 const ops=await t.run(ctx=>ctx.db.query('stockOperations').collect());assert.equal(ops.filter(o=>o.kind==='return').length,1);
 const activity=await user.query(query('inventory:activity'),{itemId:created.itemIds[0],size:25,cursor:null});assert.deepEqual(activity.items.map((e:any)=>[e.kind,e.quantityDelta]).sort(),[['acquisition',1],['consignment-return',-1],['consignment-terms',0]].sort());assert.equal(activity.items.find((e:any)=>e.kind==='consignment-return').occurredAt,2000);
 assert.equal((await t.run(ctx=>ctx.db.query('documentSignatures').collect())).length,4);
 const events=await user.query(query('readModels:browse'),{resource:'events',consignmentId:created.consignmentId,size:50});
 assert.deepEqual(events.items.map((e:any)=>e.kind).sort(),['return','terms']);
 const returnedEvent=events.items.find((e:any)=>e.kind==='return'),termsEvent=events.items.find((e:any)=>e.kind==='terms');
 assert.equal(returnedEvent.itemId,created.itemIds[0]);assert.equal(returnedEvent.occurredAt,2000);assert.equal(returnedEvent.quantity,1);assert.equal(returnedEvent.returnId,returnId);
 assert.equal(termsEvent.previousPriceCents,1000);assert.equal(termsEvent.askingPriceCents,1200);assert.equal(termsEvent.authorizationNote,'Client requested revised price');
 assert.equal(termsEvent.sellerName,'QA supplier');assert.equal(termsEvent.changeJson,undefined);
 const history=await user.query(query('consignmentOperations:consignmentHistory'),{});assert.equal(history[0].items[0].events.length,2);
 await t.run(async ctx=>{
  await ctx.db.insert('legacyMappings',{createdAt:1,oldTable:'items',oldId:'old-deposit',newTable:'stockItems',newId:created.itemIds[0],batch:'fixture'});
  await ctx.db.insert('auditEvents',{createdAt:1,record:{table:'stockItems',id:created.itemIds[0]},action:'legacy-import:consignmentEvents',occurredAt:1500,legacyTable:'consignmentEvents',legacyId:'old-event',changeJson:JSON.stringify({kind:'terms',itemId:'old-deposit',askingPriceCents:1100,commissionRateBps:1900,authorizationNote:'Historical consent',occurredAt:1400,operationDigest:'PRIVATE VAULT'})});
 });
 const restored=await user.query(query('readModels:browse'),{resource:'events',itemId:created.itemIds[0],size:50});
 assert.equal(restored.items.length,3);const imported=restored.items.find((e:any)=>e.authorizationNote==='Historical consent');
 assert.equal(imported.consignmentId,created.consignmentId);assert.equal(imported.occurredAt,1400);assert.equal(imported.askingPriceCents,1100);assert.equal(JSON.stringify(restored).includes('PRIVATE VAULT'),false);
 const restoredHistory=await user.query(query('consignmentOperations:consignmentHistory'),{});assert.equal(restoredHistory[0].items[0].events.length,3);

});

test('canonical public products expose public attributes while preserving private metadata and catalogue references',async()=>{
 const {t,user,contactId}=await setup();
 const result=await user.mutation(mutation('transactions:createPurchase'),{operationId:'metadata',contactId,type:'supplier',reference:'ATTR',occurredAt:1000,lines:[{product:{type:'card',name:'Metadata card',description:'Public description',publicAttributes:{finish:'Reverse'},privateAttributes:{supplierEvidence:'Private evidence'},variant:'Reverse',catalogue:{provider:'tcgdex',cardId:'xy1-1',setId:'xy1'}},quantity:1,costCents:123,askingPriceCents:300,tax:{regime:'other',rateBps:2100}}]});
 await t.run(ctx=>ctx.db.patch(result.itemIds[0],{visible:true,privateNotes:'Secret inspection notes'}));
 const staff=await user.query(query('readModels:record'),{resource:'stock',id:result.itemIds[0]});assert.equal(staff.privateAttributes.supplierEvidence,'Private evidence');assert.equal(staff.privateNotes,'Secret inspection notes');assert.equal(staff.catalogueCardId,'xy1-1');
 const publicItem=await t.query(query('operations:publicProduct'),{itemId:result.itemIds[0]});assert.deepEqual(publicItem.publicAttributes,{finish:'Reverse'});assert.equal(publicItem.variant,'Reverse');
 for(const field of ['privateAttributes','privateNotes','costCents','purchasePriceCents','sellerId','depositorId','lots','ownerId'])assert.equal(publicItem[field],undefined);
});

test('shared product revisions prevent lost edits across separate physical items',async()=>{
 const {t,user,contactId}=await setup();const purchase=await user.mutation(mutation('transactions:createPurchase'),receive(contactId,'shared-product',1,100));
 const itemA=purchase.itemIds[0];const itemB=await t.run(async ctx=>{const a=await ctx.db.get(itemA);return ctx.db.insert('stockItems',{productId:a!.productId,tracking:'individual',askingPriceCents:200,visible:false,status:'available',quantity:0,origin:'supplier',createdAt:1});});
 const before=await user.query(query('readModels:record'),{resource:'stock',id:itemB});assert.equal(before.productRevision,1);
 const args={expectedRevision:1,expectedProductRevision:before.productRevision,name:'First updated name',description:'',series:'',identifier:'',askingPriceCents:200,hiddenFromCatalogue:true,gradingGrade:'',gradingCertificate:''};
 await user.mutation(mutation('inventory:updateProduct'),{...args,itemId:itemA});
 await assert.rejects(()=>user.mutation(mutation('inventory:updateProduct'),{...args,itemId:itemB,name:'Stale second edit'}),/REVISION_CONFLICT/);
 const after=await user.query(query('readModels:record'),{resource:'stock',id:itemB});assert.equal(after.name,'First updated name');assert.equal(after.productRevision,2);assert.equal(after.revision??1,1);
});

test('canonical Convention uses real recency and stable public facets across page and language filters',async()=>{
 const {t,user,contactId}=await setup();
 const result=await user.mutation(mutation('transactions:createPurchase'),{operationId:'catalogue-facets',contactId,type:'supplier',reference:'FACETS',occurredAt:1000,lines:['French','English','Hidden'].map((name,index)=>({product:{type:'card',name,description:''},quantity:2,costCents:100,askingPriceCents:300,tax:{regime:'other',rateBps:2100}}))});
 // Deliberately make the lexically smaller ID newer so an ID comparator cannot pass.
 const ordered=[...result.itemIds].slice(0,2).sort();
 await t.run(async ctx=>{
  for(const [index,id]of ordered.entries()){const item=await ctx.db.get(id);await ctx.db.patch(id,{visible:true,createdAt:index===0?9000:1000});await ctx.db.patch(item!.productId,{language:index===0?'fr':'en'});const companyId=await ctx.db.insert('gradingCompanies',{name:index===0?'PSA':'CGC',normalizedName:index===0?'psa':'cgc',createdAt:1});await ctx.db.insert('itemGradings',{stockItemId:id,companyId,grade:'9.5',createdAt:1});}
 });
 const base={search:'',gradingStatus:'all',gradingCompany:'',gradingGrade:'',paginationOpts:{numItems:1,cursor:null}};
 const recent=await t.query(query('operations:publicCatalogue'),{...base,sort:'recent'});
 assert.equal(recent.page[0].id,ordered[0]);assert.equal(recent.page[0].quantity,2);assert.deepEqual(recent.languages,['en','fr']);assert.deepEqual(recent.gradingCompanies,['CGC','PSA']);
 const english=await t.query(query('operations:publicCatalogue'),{...base,language:'en'});assert.equal(english.page[0].id,ordered[1]);
 const empty=await t.query(query('operations:publicCatalogue'),{...base,search:'no-match'});assert.equal(empty.page.length,0);assert.deepEqual(empty.gradingCompanies,recent.gradingCompanies);
 for(const field of ['costCents','privateNotes','sellerId','createdAt'])assert.equal(field in recent.page[0],false);
});

test('canonical hidden public prices roundtrip and never leak through detail, filters or sorting',async()=>{
 const {t,user,contactId}=await setup();
 const result=await user.mutation(mutation('transactions:createPurchase'),receive(contactId,'hidden-price',1,100));
 const itemId=result.itemIds[0];

 await t.run(async ctx=>{const original=await ctx.db.get(itemId);const {_id,_creationTime,...fields}=original!;await ctx.db.insert('stockItems',{...fields,askingPriceCents:500,visible:true});});
 const update={itemId,name:'Hidden offer',description:'',series:'',identifier:'',askingPriceCents:12345,hiddenFromCatalogue:false,gradingGrade:'',gradingCertificate:''};
 const base={search:'',gradingStatus:'all',gradingCompany:'',gradingGrade:'',paginationOpts:{numItems:48,cursor:null}};
 await user.mutation(mutation('inventory:updateProduct'),update);
 assert.equal((await t.query(query('operations:publicProduct'),{itemId})).salePriceCents,12345);
 await user.mutation(mutation('inventory:updateProduct'),{...update,priceVisible:false});
 const staff=await user.query(query('readModels:record'),{resource:'stock',id:itemId});
 assert.equal(staff.priceVisible,false);assert.equal(staff.askingPriceCents,12345);
 for(const field of ['salePriceCents','askingPriceCents','purchasePriceCents'])assert.equal(Object.hasOwn(await t.query(query('operations:publicProduct'),{itemId}),field),false);
 // An older client omitting the flag must preserve the hidden state.
 await user.mutation(mutation('inventory:updateProduct'),update);
 assert.equal(Object.hasOwn(await t.query(query('operations:publicProduct'),{itemId}),'salePriceCents'),false);
 for(const sort of ['price-asc','price-desc']) {
  const sorted=await t.query(query('operations:publicCatalogue'),{...base,sort});
  assert.equal(sorted.page.length,2);assert.equal(sorted.page.at(-1)!.id,itemId);
  const before=await t.query(query('operations:publicCatalogue'),{...base,sort,minPrice:1,maxPrice:2});
  assert.ok(before.page.some((r:any)=>r.id===itemId));
  assert.equal(Object.hasOwn(before.page.find((r:any)=>r.id===itemId),'salePriceCents'),false);
  await user.mutation(mutation('inventory:updateProduct'),{...update,askingPriceCents:999999});
  const after=await t.query(query('operations:publicCatalogue'),{...base,sort,minPrice:1,maxPrice:2});
  assert.deepEqual(after,before);
  assert.deepEqual(await t.query(query('operations:publicCatalogue'),{...base,sort}),sorted);
 }
 await user.mutation(mutation('inventory:updateProduct'),{...update,priceVisible:true});
 assert.equal((await t.query(query('operations:publicProduct'),{itemId})).salePriceCents,12345);
 assert.equal((await user.query(query('readModels:record'),{resource:'stock',id:itemId})).priceVisible,true);
});
