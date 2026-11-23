import test from 'node:test';
import assert from 'node:assert/strict';
import {
  correctionCents,
  correctionDraft,
  correctionLine,
  correctionPlan,
  correctionPurchaseCents,
  newCorrectionDraft,
  type CorrectionSnapshot,
} from '../src/lib/purchaseCorrection';

const snapshot = (): CorrectionSnapshot => ({
  purchase: { _id: 'purchase-1', reference: 'QA-1', status: 'active' },
  expectedDigest: 'server-digest',
  lockedIds: ['sold'],
  items: [
    {
      _id: 'free',
      name: 'Carte modifiable',
      status: 'available',
      purchasePriceCents: 700,
      marketValueCents: 1000,
      discountPercent: 70,
      series: 'Série',
      askingPriceCents: 1200,
    },
    { _id: 'sold', name: 'Carte vendue', status: 'sold', purchasePriceCents: 999 },
  ],
});
test('decimal amounts retain exact cents and reject rounding, exponents and overflow', () => {
  assert.equal(correctionCents('10,01'), 1001);
  assert.equal(correctionCents('0.1'), 10);
  assert.equal(correctionCents('00012.30'), 1230);
  for (const value of ['', '-1', '1.005', '1e2', 'Infinity', '90071992547410'])
    assert.throws(() => correctionCents(value));
});
test('unchanged historical lines are excluded and recorded costs remain exact', () => {
  const data = snapshot();
  data.items[0].purchasePriceCents = 701; // legacy rounded original differs from current formula
  const plan = correctionPlan(data, [correctionDraft(data.items[0])]);
  assert.deepEqual(plan.items, []);
  assert.deepEqual(plan.removedIds, []);
  assert.equal(plan.beforeCents, 1700);
  assert.equal(plan.afterCents, 1700);
  assert.equal(plan.expectedDigest, 'server-digest');
});
test('locked sold/donated lines never appear in mutations or removals', () => {
  const data = snapshot();
  const rows = [correctionDraft(data.items[0])];
  rows[0].marketInput = '20.01';
  const plan = correctionPlan(data, rows);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].itemId, 'free');
  assert.equal(plan.afterCents, 1401 + 999);
  assert.deepEqual(plan.removedIds, []);
  assert.throws(() => correctionPlan(data, [...rows, correctionDraft(data.items[1])]), /protégée/);
});
test('removal-only correction can retain protected cards but cannot empty the dossier', () => {
  const data = snapshot();
  const plan = correctionPlan(data, []);
  assert.deepEqual(plan.removedIds, ['free']);
  assert.equal(plan.afterCents, 999);
  data.items = data.items.slice(0, 1);
  data.lockedIds = [];
  assert.throws(() => correctionPlan(data, []), /au moins une carte/);
});
test('added cards use stable operation identities and correct rounded purchase cents', () => {
  const data = snapshot();
  const add = newCorrectionDraft();
  add.name = 'QA ajout';
  add.marketInput = '10.01';
  add.percentInput = '70';
  const rows = [correctionDraft(data.items[0]), add];
  const one = correctionPlan(data, rows),
    two = correctionPlan(data, rows);
  assert.deepEqual(one.items, two.items);
  assert.equal(one.items[0].operationId, add.operationId);
  assert.equal(one.addedCount, 1);
  assert.equal(one.updatedCount, 0);
  assert.equal(one.afterCents, 700 + 999 + 701);
});
test('empty optional references clear text explicitly while blank asking price preserves existing value', () => {
  const data = snapshot();
  const row = correctionDraft(data.items[0]);
  row.series = '';
  row.identifier = '';
  row.askingInput = '';
  const line = correctionLine(row);
  assert.equal(line.series, '');
  assert.equal(line.identifier, '');
  assert.equal(line.askingPriceCents, 1200);
  row.askingInput = '0';
  assert.equal(correctionLine(row).askingPriceCents, 0);
});
test('duplicate identities, cancelled dossiers and percentages outside range are rejected', () => {
  const data = snapshot();
  const row = correctionDraft(data.items[0]);
  assert.throws(() => correctionPlan(data, [row, { ...row }]), /plusieurs fois/);
  row.percentInput = '100.01';
  assert.throws(() => correctionPlan(data, [row]), /0 et 100/);
  row.percentInput = '70';
  data.purchase.status = 'cancelled';
  assert.throws(() => correctionPlan(data, [row]), /annulé/);
});

test('metadata-only changes preserve historical costs even when stored valuation calculates another cent', () => {
  const data = snapshot();
  data.items[0].purchasePriceCents = 701;
  const draft = correctionDraft(data.items[0]);
  draft.name = 'Nom corrigé';
  draft.series = 'Série corrigée';
  draft.askingInput = '15.00';
  const plan = correctionPlan(data, [draft]);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].name, 'Nom corrigé');
  assert.equal(plan.beforeCents, 1700);
  assert.equal(plan.afterCents, 1700);
  assert.equal(correctionPurchaseCents(plan.items[0], data.items[0]), 701);
  assert.equal('purchasePriceCents' in plan.items[0], false);
});
test('only an explicit valuation change recalculates the recorded acquisition cost', () => {
  const data = snapshot();
  data.items[0].purchasePriceCents = 701;
  const draft = correctionDraft(data.items[0]);
  draft.name = 'Nom corrigé';
  draft.percentInput = '71';
  assert.equal(correctionPlan(data, [draft]).afterCents, 710 + 999);
  draft.percentInput = '70';
  draft.marketInput = '20.00';
  assert.equal(correctionPlan(data, [draft]).afterCents, 1400 + 999);
  draft.marketInput = '010,00';
  draft.percentInput = '70.0';
  assert.equal(correctionPlan(data, [draft]).afterCents, 701 + 999);
});
test('metadata edits preserve acquisition cost when legacy market valuation is absent', () => {
  const data = snapshot();
  delete data.items[0].marketValueCents;
  delete data.items[0].discountPercent;
  data.items[0].purchasePriceCents = 701;
  const draft = correctionDraft(data.items[0]);
  draft.name = 'Nom corrigé';
  assert.equal(correctionPlan(data, [draft]).afterCents, 701 + 999);
  assert.equal(correctionPurchaseCents(correctionLine(draft), data.items[0]), 701);
});
test('missing historical costs cannot silently become zero in drafts or correction totals', () => {
  const data = snapshot();
  data.items[0].purchasePriceCents = null;
  assert.throws(() => correctionDraft(data.items[0]), /coût historique.*inconnu/i);
  assert.throws(() => correctionPlan(data, []), /coût historique.*inconnu/i);
  const known = snapshot(),
    line = correctionLine(correctionDraft(known.items[0]));
  assert.throws(() => correctionPurchaseCents(line, data.items[0]), /coût historique.*inconnu/i);
  known.items[0].purchasePriceCents = 0;
  assert.equal(correctionPlan(known, [correctionDraft(known.items[0])]).beforeCents, 999);
});
