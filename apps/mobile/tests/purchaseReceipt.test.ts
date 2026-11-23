import assert from 'node:assert/strict';
import test from 'node:test';
import { completePurchaseItems, mapPurchaseReceipt } from '../src/data/purchaseReceipt';
import {loadReceiptDocument} from '../src/data/receiptDocument';
import type { Purchase, PurchaseItem } from '../src/data/apiRepository';
const item = (id: string): PurchaseItem => ({ _id: id, name: `Carte ${id}`, language: 'ja', condition: 'NM', purchasePriceCents: 1234, marketValueCents: 2468, discountPercent: 50, vatRegime: 'margin', gradingCompany: 'PSA', gradingGrade: '10', gradingCertificate: 'ABC' });
const purchase: Purchase = { _id: 'p', sellerId: 's', sellerName: 'Client', reference: 'R-1', occurredAt: 123456, status: 'active', items: [item('1')] };
test('receipt preserves validated status, cents and grading for preview and PDF', () => {
  const receipt = mapPurchaseReceipt(purchase, { _id: 's', name: 'Client', email: 'client@example.com' });
  assert.equal(receipt.status, 'active');
  assert.equal(receipt.occurredAt, purchase.occurredAt);
  assert.equal(receipt.items[0].purchasePriceCents, 1234);
  assert.equal(receipt.items[0].gradingCertificate, 'ABC');
  assert.equal(receipt.items[0].language, 'Japonais');
});
test('complete receipt traverses empty intermediate pages and includes more than 50 articles', async () => {
  const cursors: (string | undefined)[] = [];
  const items = await completePurchaseItems({ ...purchase, hasMoreItems: true }, async cursor => {
    cursors.push(cursor);
    if (!cursor) return { items: Array.from({ length: 50 }, (_, i) => item(String(i))), nextCursor: 'second', isDone: false };
    if (cursor === 'second') return { items: [], nextCursor: 'third', isDone: false };
    return { items: [item('50')], nextCursor: null, isDone: true };
  });
  assert.equal(items.length, 51);
  assert.deepEqual(cursors, [undefined, 'second', 'third']);
  assert.equal(mapPurchaseReceipt(purchase, { _id: 's', name: 'Client' }, items).items.reduce((sum, row) => sum + row.purchasePriceCents, 0), 51 * 1234);
});
test('incomplete pagination and failed pages never produce a partial receipt', async () => {
  await assert.rejects(completePurchaseItems({ ...purchase, hasMoreItems: true }, async () => ({ items: [item('1')], nextCursor: null, isDone: false })), /incomplet/);
  await assert.rejects(completePurchaseItems({ ...purchase, hasMoreItems: true }, async () => { throw new Error('Network'); }), /Network/);
  await assert.rejects(completePurchaseItems({ ...purchase, hasMoreItems: true }, async () => ({ items: [], nextCursor: 'same', isDone: false })), /incomplet/);
});
test('bounded complete receipt needs no extra pages', async () => {
  assert.deepEqual(await completePurchaseItems(purchase, async () => { throw new Error('Unexpected request'); }), purchase.items);
});
test('unknown costs block new PDF inputs while archived originals retain their exact bytes',async()=>{
 const unknown={...purchase,items:[{...item('unknown'),purchasePriceCents:null}]};
 assert.throws(()=>mapPurchaseReceipt(unknown,{_id:'s',name:'Client'}),/Coût d’achat non renseigné/);
 const original=await loadReceiptDocument(async()=>[{id:'original',signedAt:1}],async()=>({pdfBase64:'ARCHIVED-EXACT-BYTES'}),async()=>{mapPurchaseReceipt(unknown,{_id:'s',name:'Client'});return 'wrong';});
 assert.deepEqual(original,{pdf:'ARCHIVED-EXACT-BYTES',archived:true});
 assert.equal(mapPurchaseReceipt({...purchase,items:[{...item('zero'),purchasePriceCents:0}]},{_id:'s',name:'Client'}).items[0].purchasePriceCents,0);
});
