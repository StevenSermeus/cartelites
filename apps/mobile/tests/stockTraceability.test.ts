import test from 'node:test';
import assert from 'node:assert/strict';
import {stockLot,stockLots,lotOriginLabel,itemActivityPage,quantityChangeLabel,nextActivityCursor,nextActivityPage,previousActivityPage} from '../src/data/stockTraceability';

test('legacy and canonical lot aliases preserve exact quantities and costs, including genuine zero',()=>{
  const legacy=stockLot({_id:'lot-a',received:3,remaining:0,totalCostCents:1503,remainingCostCents:0,occurredAt:0,receiptId:'receipt-a',receipt:{supplier:'QA supplier',reference:'QA invoice'}});
  assert.equal(legacy.originalQuantity,3);assert.equal(legacy.remainingQuantity,0);assert.equal(legacy.originalCostCents,1503);assert.equal(legacy.remainingCostCents,0);assert.equal(legacy.occurredAt,0);assert.equal(lotOriginLabel(legacy),'Achat fournisseur');
  const canonical=stockLot({_id:'lot-b',source:{kind:'purchase',purchaseId:'purchase-b'},receipt:{type:'supplier',reference:'REF'},originalQuantity:5,remainingQuantity:2,originalCostCents:1001,remainingCostCents:401,acquiredAt:100});
  assert.equal(canonical.sourceId,'purchase-b');assert.equal(canonical.originalQuantity,5);assert.equal(canonical.originalCostCents,1001);assert.equal(lotOriginLabel(canonical),'Achat fournisseur');
});
test('explicit unknown canonical values never fall through to legacy aliases or invented opening origins',()=>{
  const lot=stockLot({_id:'unknown',originalCostCents:null,totalCostCents:9900,remainingCostCents:null,acquiredAt:null,occurredAt:123});
  assert.equal(lot.originalCostCents,null);assert.equal(lot.remainingCostCents,null);assert.equal(lot.occurredAt,null);assert.equal(lot.originalQuantity,null);assert.equal(lotOriginLabel(lot),'Origine historique');
  assert.equal(lotOriginLabel(stockLot({_id:'balance',openingBalanceOnly:true,source:{kind:'legacy-unknown'}})),'Solde initial repris');
  assert.equal(lotOriginLabel(stockLot({_id:'consigned',source:{kind:'consignment',consignmentId:'deposit'}})),'Dépôt-vente');
});
test('malformed lots and unsafe costs are explicit data errors rather than misleading balances',()=>{
  assert.throws(()=>stockLots({}),/invalide/);assert.throws(()=>stockLot({_id:'bad',remaining:-1}),/incohérent/);assert.throws(()=>stockLot({_id:'bad',totalCostCents:Number.MAX_SAFE_INTEGER+1}),/incohérent/);
});
test('movement pages preserve separate allocation rows and distinguish unknown dates, null delta and real zero',()=>{
  const page=itemActivityPage({items:[{id:'move-a',kind:'sale',occurredAt:null,quantityDelta:null,source:{type:'sales',id:'same-sale'},lotId:'lot-a'},{id:'move-b',kind:'purchase-correction',occurredAt:0,quantityDelta:0,source:{type:'sales',id:'same-sale'},lotId:'lot-b'}],nextCursor:null,isDone:true,historyStatus:'incomplete'});
  assert.equal(page.items.length,2);assert.equal(page.items[0].occurredAt,null);assert.equal(page.items[1].occurredAt,0);assert.equal(quantityChangeLabel(page.items[0].quantityDelta),'Variation non renseignée');assert.equal(quantityChangeLabel(page.items[1].quantityDelta),'Quantité inchangée');assert.equal(quantityChangeLabel(-2),'-2 unité(s)');assert.equal(quantityChangeLabel(3),'+3 unité(s)');
});
test('empty intermediate activity pages continue and duplicate taps cannot skip a cursor or leave page one',()=>{
  const page=itemActivityPage({items:[],nextCursor:'next-real-cursor',isDone:false,historyStatus:'indexing'});
  const first=[undefined];assert.equal(nextActivityCursor(page,first),'next-real-cursor');
  const second=nextActivityPage(first,page.nextCursor);assert.deepEqual(nextActivityPage(second,page.nextCursor),second);assert.equal(nextActivityCursor(page,second),null);
  assert.deepEqual(previousActivityPage(second),first);assert.deepEqual(previousActivityPage(first),first);
  assert.throws(()=>itemActivityPage({items:[],nextCursor:null,isDone:false,historyStatus:'complete'}),/curseur/);
  assert.throws(()=>itemActivityPage({items:[],nextCursor:null,isDone:true,historyStatus:'invented'}),/invalide/);
});

test('an opened legacy lot retains its opening provenance even with an inherited supplier receipt',()=>{
  const lot=stockLot({_id:'boosters',openingId:'opening',receiptId:'original-receipt',receipt:{reference:'INV-1'},received:36,remaining:35,totalCostCents:1000,remainingCostCents:973});
  assert.equal(lot.sourceId,'opening');assert.equal(lotOriginLabel(lot),'Ouverture de display');
});
