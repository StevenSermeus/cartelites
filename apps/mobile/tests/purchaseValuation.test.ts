import assert from 'node:assert/strict';
import test from 'node:test';
import { purchaseValuation, applyPurchasePercent } from '../src/data/purchaseValuation';
import { readPurchaseSnapshot, purchaseSnapshot } from '../src/data/localPurchaseDrafts';
import type { PurchaseDraft } from '../src/data/apiRepository';
const rows = [
  {
    key: 'a',
    included: true,
    name: 'Carte A',
    marketValue: '100,00',
    discountPercent: '80',
    askingPrice: '120',
    series: '',
    identifier: '',
    cardSearch: '',
    photo: null,
  },
  {
    key: 'b',
    included: true,
    name: 'Carte B',
    marketValue: '50',
    discountPercent: '70',
    askingPrice: '60',
    series: '',
    identifier: '',
    cardSearch: '',
    photo: null,
  },
] as PurchaseDraft[];
test('theoretical totals exclude unselected drafts and bulk percentage only changes chosen cards', () => {
  assert.deepEqual(purchaseValuation(rows), {
    marketCents: 15000,
    purchaseCents: 11500,
    theoreticalGainCents: 3500,
  });
  const changed = applyPurchasePercent(rows, ['a'], '75');
  assert.equal(changed[0].discountPercent, '75');
  assert.equal(changed[1].discountPercent, '70');
  assert.equal(changed[0].askingPrice, '120');
  assert.equal(rows[0].discountPercent, '80');
  assert.deepEqual(purchaseValuation(changed), {
    marketCents: 15000,
    purchaseCents: 11000,
    theoreticalGainCents: 4000,
  });
  assert.equal(
    purchaseValuation([...rows, { ...rows[0], included: false, marketValue: '' }])?.marketCents,
    15000,
  );
  assert.throws(() => applyPurchasePercent(rows, ['a'], '101'));
  assert.equal(purchaseValuation([{ ...rows[0], marketValue: '' }]), null);
});
test('existing v1 draft survives valuation and bulk changes without changing the stored original', () => {
  const state = {
    activeId: 'old',
    drafts: [{ id: 'old', clientId: 'client', date: '2026-11-21', step: 1, rows, updatedAt: 1 }],
  };
  const raw = JSON.stringify({ version: 1, revision: 7, state });
  const restored = readPurchaseSnapshot(raw);
  applyPurchasePercent(restored.state.drafts[0].rows, ['a'], '60');
  assert.equal(restored.state.drafts[0].rows[0].discountPercent, '80');
  assert.equal(purchaseSnapshot(restored.state).drafts[0].id, 'old');
  assert.equal(readPurchaseSnapshot(raw).revision, 7);
});
