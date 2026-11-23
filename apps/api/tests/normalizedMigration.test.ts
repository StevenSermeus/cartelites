import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {normalize,digest} from '../scripts/migration/normalize.js';
import {initializeStage,importLocal,exportStagedTables,packageObjects} from '../scripts/migration/import-local.js';
import type {Export} from '../scripts/migration/rehearse.js';
const row=(id:string,fields:Record<string,unknown>)=>({_id:id,createdAt:1,ownerId:'u',...fields});
function fixture():Export{return {
 accounts:[row('u',{email:'fixture@example.invalid',passwordHash:'hash',sessionVersion:1})],
 sellers:[row('contact',{name:'Fixture contact'})],
 purchases:[row('p',{sellerId:'contact',reference:'P',occurredAt:1,status:'active'})],
 items:[row('card',{purchaseId:'p',purchaseOccurredAt:1,name:'Card',status:'sold',askingPriceCents:250,gradingCompany:'Custom',gradingGrade:'Authentic',vatRegime:'margin'}),row('supplier',{origin:'supplier',quantity:2,purchaseOccurredAt:1,name:'Sealed',productType:'sealed',status:'available',taxRateBps:2100,vatRegime:'other'})],
 supplierReceipts:[row('receipt',{supplier:'Supplier',reference:'F',occurredAt:1,itemIds:['supplier'],totalCostCents:301})],
 stockLots:[row('lot',{itemId:'supplier',receiptId:'receipt',received:3,remaining:2,totalCostCents:301,remainingCostCents:201,occurredAt:1,taxRateBps:2100})],
 sales:[row('s1',{itemId:'card',occurredAt:2,status:'active',salePriceCents:250,paymentStatus:'received',payment:{cashCents:100,transferCents:150,receivedAt:3}}),row('s2',{itemId:'supplier',occurredAt:2,status:'active',quantity:1,salePriceCents:200,costCents:100,allocations:[{lotId:'lot',quantity:1,costCents:100}],paymentStatus:'pending'})],
 salePaymentEvents:[row('correction',{saleId:'s1',previousPayment:{cashCents:250,transferCents:0,receivedAt:2},payment:{cashCents:100,transferCents:150,receivedAt:3}})],
 signedReceipts:[row('doc',{kind:'purchase',targetId:'p',snapshot:{items:[{name:'Frozen historical'}]},identity:{company:'Historical shop'},signedAt:2,companySignature:{paths:['frozen']},clientSignature:{paths:['original']},consent:'original consent'})],
};}
test('normalized model separates products/items/provenance and preserves unknown costs and immutable signatures',()=>{
 const source=fixture(),n=normalize(source);assert.deepEqual(n.errors,[]);assert.equal(n.tables.products.length,2);assert.equal(n.tables.stockItems.length,2);assert.equal(n.tables.purchaseLines.find(l=>l.quantity===1)?.costCents,null);assert.equal(n.tables.itemGradings[0].grade,'Authentic');assert.equal(n.tables.saleAllocations.length,2);assert.equal(n.reconciliation.activeSalesCents,450);assert.equal(n.reconciliation.activePaymentCents,250);assert.equal(n.reconciliation.unknownPurchaseCosts,1);assert.equal(n.tables.salePayments.filter(p=>p.status==='superseded').length,1);assert.deepEqual(n.tables.documents[0].inputSnapshot.value,source.signedReceipts[0].snapshot);assert.deepEqual(n.tables.documentSignatures.map(s=>s.strokes),[source.signedReceipts[0].companySignature,source.signedReceipts[0].clientSignature]);assert.deepEqual(n.legacyVault,source);assert.deepEqual(normalize(source),n);
});
test('cancelled sales preserve allocations/restoration and reverse collected payment',()=>{
 const source=fixture();source.sales[0].status='cancelled';source.items[0].status='available';
 const n=normalize(source);assert.deepEqual(n.errors,[]);assert.equal(n.tables.saleAllocations.filter(a=>a.restored).length,1);assert.equal(n.tables.salePayments.filter(p=>p.status==='reversed').length,1);assert.equal(n.reconciliation.activePaymentCents,0);assert.equal(n.reconciliation.activeSalesCents,200);
});
test('local import checkpoints resume, deduplicate and reject source or committed-data changes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cartelites-stage-test-'));
 try{
  const n=normalize(fixture());await initializeStage(dir);
  const partial=await importLocal(n,dir,{batchSize:7,maxBatches:1});assert.equal(partial.complete,false);assert.equal(partial.records,7);
  await assert.rejects(exportStagedTables(dir),/Incomplete/);
  const done=await importLocal(n,dir,{batchSize:11});assert.equal(done.complete,true);
  assert.deepEqual(await importLocal(n,dir),done);assert.deepEqual(await exportStagedTables(dir),JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(n.tables).map(([t,r])=>[t,[...r].sort((a,b)=>a.id.localeCompare(b.id))])))));
  const changed=fixture();changed.items[0].name='changed';await assert.rejects(importLocal(normalize(changed),dir),/source\/plan changed/);
  const state=JSON.parse(await readFile(join(dir,'state.json'),'utf8'));const first=Object.values(state.tables.accounts)[0] as {hash:string};first.hash='tampered';await writeFile(join(dir,'state.json'),JSON.stringify(state));await assert.rejects(importLocal(n,dir),/checksum mismatch/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('original PDFs are copied byte-for-byte and corrupt restored originals are refused',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cartelites-object-test-'));
 try{
  const source=fixture(),bytes=Buffer.from('%PDF-1.4 original signed bytes');source.signedReceipts[0].objectKey='signed/original.pdf';source.signedReceipts[0].sha256=createHash('sha256').update(bytes).digest('hex');
  const n=normalize(source),objects=join(dir,'source'),stage=join(dir,'stage');await mkdir(join(objects,'signed'),{recursive:true});await writeFile(join(objects,'signed/original.pdf'),bytes);await initializeStage(stage);await importLocal(n,stage);
  assert.deepEqual(await packageObjects(n,objects,stage),{objects:1,baselineVerified:1});assert.deepEqual(await readFile(join(stage,'objects/signed/original.pdf')),bytes);
  await writeFile(join(objects,'signed/original.pdf'),'corrupt');await assert.rejects(packageObjects(n,objects,stage),/verification failed/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('individual consignment owners never merge and partial payouts remain separate',()=>{
 const source=fixture();source.consignments=[row('c1',{sellerId:'contact',reference:'D',occurredAt:1,contractRevision:2,contractStatus:'signed',contractTerms:{version:'v1',text:'Frozen terms'}})];source.items.push(row('consigned',{consignmentId:'c1',origin:'consignment',purchaseOccurredAt:1,name:'Card',status:'sold',commissionRateBps:2000,agreedPriceCents:500,vatRegime:'other'}));source.sales.push(row('s3',{itemId:'consigned',consignmentId:'c1',sellerId:'contact',occurredAt:2,status:'active',salePriceCents:500,commissionCents:100,depositorAmountCents:400,paymentStatus:'received',payment:{cashCents:500,transferCents:0,receivedAt:2}}));source.consignmentPayments=[row('pay1',{sellerId:'contact',amountCents:150,method:'cash',occurredAt:3}),row('pay2',{sellerId:'contact',amountCents:50,method:'transfer',occurredAt:4})];
 const n=normalize(source);assert.deepEqual(n.errors,[]);assert.equal(n.tables.products.length,3);assert.equal(n.tables.stockLots.filter(l=>l.source.kind==='consignment').length,1);assert.equal(n.reconciliation.collectedDepositorEntitlementCents-n.reconciliation.payoutsCents,200);assert.equal(n.tables.depositorPayouts.length,2);
});

test('signed receipt client identities and return renderer retain actual legacy input semantics',()=>{
 const source=fixture();const client={name:'Frozen client',email:'client@example.invalid'};
 source.signedReceipts[0].snapshot={client,signatory:{firstName:'Alex',lastName:'Martin',capacity:'Gérant'},items:[]};
 source.signedReceipts.push(row('return-doc',{kind:'consignment_return',targetId:'return',snapshot:{client,lines:[]},identity:{},signedAt:2,clientSignature:[[[0,0],[1,1]]]}));
 source.consignments=[row('c',{sellerId:'contact',reference:'D',occurredAt:1})];
 source.consignmentReturns=[row('return',{consignmentId:'c',occurredAt:2,itemIds:[],conditionNotes:''})];
 const result=normalize(source);
 assert.deepEqual(result.tables.documentSignatures.filter(s=>s.role==='client').map(s=>s.identity),[client,client]);
 assert.equal(result.tables.documents.find(d=>d.kind==='consignment_return')?.inputSnapshot.renderer,'consignmentDocument');
 assert.deepEqual(result.tables.documentSignatures.find(s=>s.role==='company')?.identity,{signatory:{firstName:'Alex',lastName:'Martin',capacity:'Gérant'},shop:source.signedReceipts[0].identity});
});

test('legacy display/gift movements preserve history without duplicating acquisitions or current balances',()=>{
 const source:Export={
  supplierReceipts:[row('receipt',{supplier:'QA',reference:'F',occurredAt:1,totalCostCents:2002})],
  items:[row('display',{origin:'supplier',quantity:1,purchaseOccurredAt:1,name:'Display',productType:'sealed',format:'display',status:'available',taxRateBps:2100}),row('booster',{origin:'supplier',quantity:35,purchaseOccurredAt:2,name:'Booster',productType:'sealed',format:'booster',status:'available',taxRateBps:2100})],
  stockLots:[row('source',{itemId:'display',receiptId:'receipt',received:2,remaining:1,totalCostCents:2002,remainingCostCents:1001,occurredAt:1,taxRateBps:2100}),row('opened',{itemId:'booster',receiptId:'receipt',openingId:'open',received:36,remaining:35,totalCostCents:1001,remainingCostCents:974,occurredAt:2,taxRateBps:2100})],
  stockOpenings:[row('open',{sourceId:'display',targetId:'booster',quantity:1,packSize:36,occurredAt:2,allocations:[{lotId:'source',quantity:1,costCents:1001}]})],
  stockGifts:[row('gift',{itemId:'booster',quantity:1,costCents:27,occurredAt:3,reason:'QA',note:'Private note',allocations:[{lotId:'opened',quantity:1,costCents:27}]})],
 };
 const n=normalize(source);assert.deepEqual(n.errors,[]);assert.equal(n.tables.purchaseLines.length,1);assert.equal(n.reconciliation.knownPurchaseCostCents,2002);
 const opening=n.tables.stockOperations.find(o=>o.kind==='display-opening')!;assert.equal(opening.packSize,36);assert.equal(opening.quantity,1);assert.ok(opening.targetItemId);assert.equal(opening.historyComplete,true);
 assert.equal(n.tables.stockOperations.find(o=>o.kind==='gift')!.note,'Private note');
 for(const lot of n.tables.stockLots){const movements=n.tables.stockMovements.filter(m=>m.lotId===lot.id);assert.equal(movements.reduce((sum,m)=>sum+m.quantityDelta,0),lot.remainingQuantity);assert.equal(movements.reduce((sum,m)=>sum+m.costDeltaCents!,0),lot.remainingCostCents);}
});

test('opened stock already sold restores a nonnegative initial ledger and preserves sale allocations',()=>{
 const source:Export={supplierReceipts:[row('r',{supplier:'QA',reference:'R',occurredAt:1,totalCostCents:1000})],items:[row('d',{origin:'supplier',quantity:0,purchaseOccurredAt:1,name:'Display',status:'sold'}),row('b',{origin:'supplier',quantity:9,purchaseOccurredAt:2,name:'Booster',status:'available'})],stockLots:[row('d-lot',{itemId:'d',receiptId:'r',received:1,remaining:0,totalCostCents:1000,remainingCostCents:0,occurredAt:1}),row('b-lot',{itemId:'b',receiptId:'r',openingId:'o',received:10,remaining:9,totalCostCents:1000,remainingCostCents:900,occurredAt:2})],stockOpenings:[row('o',{sourceId:'d',targetId:'b',quantity:1,packSize:10,occurredAt:2,allocations:[{lotId:'d-lot',quantity:1,costCents:1000}]})],sales:[row('s',{itemId:'b',quantity:1,occurredAt:3,status:'active',salePriceCents:200,costCents:100,paymentStatus:'pending',allocations:[{lotId:'b-lot',quantity:1,costCents:100}]})]};
 const n=normalize(source);assert.deepEqual(n.errors,[]);assert.equal(n.tables.purchaseLines.length,1);
 for(const lot of n.tables.stockLots){const movements=n.tables.stockMovements.filter(m=>m.lotId===lot.id);assert.equal(movements.reduce((sum,m)=>sum+m.quantityDelta,0),lot.remainingQuantity);assert.equal(movements.reduce((sum,m)=>sum+m.costDeltaCents!,0),lot.remainingCostCents);}
 assert.equal(n.tables.stockOperations.filter(o=>o.kind==='sale').length,1);
});
test('every cancellation request binding retains its exact digest and maps to the existing sale without another reversal',()=>{
 const source=fixture();source.sales[0].status='cancelled';source.items[0].status='available';
 const first={operationId:'first-cancel',saleId:'s1'},second={operationId:'repeat-cancel',saleId:'s1'};
 source.saleCancellations=[row('cancel-1',{...first,operationDigest:JSON.stringify(first)}),row('cancel-2',{...second,operationDigest:JSON.stringify(second)})];
 const n=normalize(source);assert.deepEqual(n.errors,[]);assert.equal(n.tables.sales.length,2);assert.equal(n.tables.stockOperations.filter(op=>op.kind==='reversal').length,1);
 const sale=n.tables.legacyMappings.find(map=>map.oldTable==='sales'&&map.oldId==='s1'&&map.newTable==='sales')!.newId;
 const operations=n.tables.operations.filter(op=>op.kind==='saleCancellations');assert.equal(operations.length,2);
 for(const [index,request]of source.saleCancellations.entries()){
  const operation=operations.find(op=>op.key===request.operationId)!;assert.equal(operation.actor,'u');assert.equal(operation.payloadHash,request.operationDigest);assert.deepEqual(operation.results,[{table:'sales',id:sale}]);
  const audit=n.tables.auditEvents.find(event=>event.legacyTable==='saleCancellations'&&event.legacyId===request._id)!;assert.deepEqual(audit.change,request);assert.deepEqual(audit.record,{table:'sales',id:sale});
  assert.equal(n.tables.legacyMappings.some(map=>map.oldTable==='saleCancellations'&&map.oldId===`cancel-${index+1}`&&map.newId===sale),true);
 }
 assert.deepEqual(n.legacyVault.saleCancellations,source.saleCancellations);assert.ok(n.warnings.some(warning=>warning.includes('not replay-compatible')));assert.deepEqual(normalize(source),n);
 source.saleCancellations[0].saleId='missing';assert.ok(normalize(source).errors.some(error=>error.includes('missing legacy sale')));
});

test('disposable item activity projection stays in the private vault and is explicitly rebuilt, never imported as business history',()=>{
 const source={itemActivity:[{_id:'old-projection',key:'sale:s',quantityDelta:-1}],itemActivityBuilds:[{_id:'old-checkpoint',complete:true}],itemActivityJobs:[{_id:'old-job',pending:false}]};
 const result=normalize(source);assert.deepEqual(result.errors,[]);assert.deepEqual(result.legacyVault,source);assert.equal(result.tables.auditEvents.length,0);assert.deepEqual(result.unmappedTables.sort(),Object.keys(source).sort());assert.ok(result.warnings.some(w=>w.includes('rebuild its index')));
});


test('applied cancellation timestamp evidence survives normalization while old unknown timestamps remain unmarked',()=>{
 const source=fixture();source.sales[0].status='cancelled';source.items[0].status='available';
 let result=normalize(source);assert.equal(result.tables.stockOperations.find(o=>o.kind==='reversal')?.occurredAtKnown,undefined);
 source.saleCancellations=[row('cancel',{saleId:'s1',operationId:'cancel',operationDigest:'original',createdAt:9999,applied:true}),row('repeat',{saleId:'s1',operationId:'repeat',operationDigest:'repeat',createdAt:12000,applied:false})];
 result=normalize(source);assert.deepEqual(result.errors,[]);const reversal=result.tables.stockOperations.find(o=>o.kind==='reversal');assert.equal(reversal?.occurredAt,9999);assert.equal(reversal?.occurredAtKnown,true);
});
