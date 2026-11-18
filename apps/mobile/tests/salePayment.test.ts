import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSaleSettlement, type PaymentDraft } from '../src/data/salePayment';

const draft: PaymentDraft = {
  mode: 'mixed',
  cash: '40,25',
  transfer: '59.75',
  date: '2026-11-18',
  reference: ' BANK-1 ',
};
test('mixed reception accepts comma amounts and preserves exact cents and date', () => {
  const value = buildSaleSettlement(draft, 10000);
  assert.equal(value.paymentStatus, 'received');
  assert.equal(value.payment?.cashCents, 4025);
  assert.equal(value.payment?.transferCents, 5975);
  assert.equal(value.payment?.reference, 'BANK-1');
  assert.ok(value.payment);
  assert.equal(new Date(value.payment.receivedAt).getDate(), 18);
});
test('pending and each single mode distinguish receipt from not yet received', () => {
  assert.deepEqual(buildSaleSettlement({ ...draft, mode: 'pending' }, 10000), {
    paymentStatus: 'pending',
  });
  assert.equal(buildSaleSettlement({ ...draft, mode: 'cash' }, 10000).payment?.cashCents, 10000);
  assert.equal(buildSaleSettlement({ ...draft, mode: 'cash' }, 10000).payment?.transferCents, 0);
  assert.equal(buildSaleSettlement({ ...draft, mode: 'transfer' }, 10000).payment?.cashCents, 0);
});
test('reject wrong totals, blank selection, excessive decimals and invalid date', () => {
  for (const value of [
    { ...draft, cash: '40.251' },
    { ...draft, transfer: '60' },
    { ...draft, mode: '' as const },
    { ...draft, date: '2026-02-30' },
  ])
    assert.throws(() => buildSaleSettlement(value, 10000));
});
