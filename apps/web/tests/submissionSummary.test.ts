import test from 'node:test';
import assert from 'node:assert/strict';
import { submissionSummary } from '../src/lib/submissionSummary';

test('purchase recovery identifies the frozen reference, contact and original cost', () => {
  const draft = { reference: 'ORIGINAL', occurredAt: 123, items: [{ purchasePriceCents: 701 }] };
  const pending = {
    path: '/purchases',
    body: JSON.stringify(draft),
    context: { client: { name: 'QA submitted' } },
  };
  draft.reference = 'edited';
  draft.items[0].purchasePriceCents = 0;
  assert.deepEqual(submissionSummary(pending), {
    label: 'Rachat soumis',
    reference: 'ORIGINAL',
    occurredAt: 123,
    party: 'QA submitted',
    quantity: 1,
    totalCents: 701,
  });
});
test('sale recovery sums saved line totals without multiplying quantities again', () => {
  const summary = submissionSummary({
    path: '/sales/bulk',
    body: JSON.stringify({
      occurredAt: 123,
      items: [
        { quantity: 3, salePriceCents: 1000 },
        { quantity: 2, salePriceCents: 500 },
      ],
    }),
  });
  assert.equal(summary?.quantity, 5);
  assert.equal(summary?.totalCents, 1500);
  assert.equal(summary?.occurredAt, 123);
});
test('payout and supplier summaries use saved reference, amounts and quantities', () => {
  const payout = submissionSummary({
    path: '/consignments/payments',
    body: JSON.stringify({ reference: 'BANK-ORIGINAL', amountCents: 1200 }),
  });
  assert.equal(payout?.reference, 'BANK-ORIGINAL');
  assert.equal(payout?.totalCents, 1200);
  const receipt = submissionSummary({
    path: '/supplier-receipts',
    body: JSON.stringify({
      reference: 'INVOICE',
      supplier: 'QA Supplier',
      lines: [
        { quantity: 3, unitCostCents: 101 },
        { quantity: 2, unitCostCents: 50 },
      ],
    }),
  });
  assert.equal(receipt?.party, 'QA Supplier');
  assert.equal(receipt?.quantity, 5);
  assert.equal(receipt?.totalCents, 403);
});
test('unknown money remains absent and reversals are identified separately', () => {
  assert.equal(
    submissionSummary({
      path: '/purchases',
      body: JSON.stringify({ items: [{ purchasePriceCents: null }] }),
    })?.totalCents,
    undefined,
  );
  assert.equal(
    submissionSummary({ path: '/stock/reverse', body: JSON.stringify({ giftId: 'original-gift' }) })
      ?.label,
    'Annulation de don soumise',
  );
  assert.equal(
    submissionSummary({
      path: '/stock/reverse',
      body: JSON.stringify({ openingId: 'original-opening' }),
    })?.reference,
    'original-opening',
  );
});


test('payment correction summary preserves the received split/date and cancellation identity', () => {
  const payment=submissionSummary({path:'/sales/payment',body:JSON.stringify({saleId:'sale-a',cashCents:123,transferCents:456,receivedAt:12345}),context:{name:'Original card'}});
  assert.deepEqual(payment,{label:'Encaissement soumis',reference:'sale-a',party:'Original card',totalCents:579,occurredAt:12345});
  const cancelled=submissionSummary({path:'/sales/cancel',body:JSON.stringify({saleId:'sale-b'}),context:{name:'Cancelled card'}});
  assert.deepEqual(cancelled,{label:'Annulation de vente soumise',reference:'sale-b',party:'Cancelled card'});
});
