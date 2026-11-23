import assert from 'node:assert/strict';
import { test } from 'node:test';
import { purchaseSnapshot, readPurchaseSnapshot, updateLocalPurchase, type LocalPurchaseDraft, type LocalPurchaseState } from '../src/data/localPurchaseDrafts';
const draft = (id: string, clientId = ''): LocalPurchaseDraft => ({ id, clientId, date: '2026-11-20', step: 0, updatedAt: 1, rows: [{ key: id, name: '', series: '', identifier: '', marketValue: '', discountPercent: '70', askingPrice: '', askingPriceTouched: false, photo: null, language: 'fr', condition: 'NM', catalogueImageUrl: '', cardSearch: '', cardResults: [], searching: false }] });
test('switching clients preserves independent cards, prices and progress', () => {
  let state: LocalPurchaseState = { activeId: 'a', drafts: [draft('a', 'alice'), draft('b', 'bob')] };
  state = updateLocalPurchase(state, 'rows', rows => rows.map(row => ({ ...row, name: 'Mew', marketValue: '100', included: true })));
  state = updateLocalPurchase(state, 'step', 2);
  state = { ...state, activeId: 'b' };
  state = updateLocalPurchase(state, 'rows', rows => rows.map(row => ({ ...row, name: 'Pikachu', marketValue: '25' })));
  assert.equal(state.drafts[0].rows[0].name, 'Mew');
  assert.equal(state.drafts[0].rows[0].marketValue, '100');
  assert.equal(state.drafts[0].step, 2);
  assert.equal(state.drafts[1].rows[0].name, 'Pikachu');
  assert.equal(state.drafts[1].step, 0);
});
test('restart round trip preserves multiple drafts and photo references, clears transient searches', () => {
  const a = draft('a', 'alice');
  a.rows[0].photo = { uri: 'file:///documents/photo', name: 'carte.jpg', mimeType: 'image/jpeg' };
  a.rows[0].searching = true;
  a.rows[0].catalogueCardId = 'xy6-60';
  a.rows[0].catalogueSetId = 'xy6';
  const original = { activeId: 'b', drafts: [a, draft('b', 'bob'), draft('empty')] };
  const saved = purchaseSnapshot(original);
  const restored = readPurchaseSnapshot(JSON.stringify({ version: 1, revision: 8, state: saved }));
  assert.equal(restored.revision, 8);
  assert.equal(restored.state.activeId, 'b');
  assert.equal(restored.state.drafts.length, 2);
  assert.equal(restored.state.drafts[0].rows[0].photo?.uri, 'file:///documents/photo');
  assert.equal(restored.state.drafts[0].rows[0].searching, false);
  assert.equal(restored.state.drafts[0].rows[0].catalogueCardId, 'xy6-60');
  assert.equal(restored.state.drafts[0].rows[0].catalogueSetId, 'xy6');
  assert.equal(a.rows[0].searching, true);
});
test('removing one draft from a persisted collection leaves the other intact', () => {
  const state = { activeId: 'b', drafts: [draft('a', 'alice'), draft('b', 'bob')] };
  const saved = purchaseSnapshot({ ...state, drafts: state.drafts.filter(d => d.id !== 'a') });
  assert.deepEqual(saved.drafts.map(d => d.clientId), ['bob']);
});
test('corrupt or unsupported snapshots are rejected rather than silently cleared', () => {
  assert.throws(() => readPurchaseSnapshot('{broken'));
  assert.throws(() => readPurchaseSnapshot(JSON.stringify({ version: 2, revision: 1, state: { drafts: [] } })));
  assert.throws(() => readPurchaseSnapshot(JSON.stringify({ version: 1, revision: 1, state: { drafts: [{ id: 'broken' }] } })));
});
