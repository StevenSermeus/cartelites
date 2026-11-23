import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OperationAttempt, RequestGenerations } from '../src/lib/operationAttempt';
test('unknown network result retries the same mutation identity', () => {
  const operation = new OperationAttempt();
  const first = operation.prepare('/stock/donate', { itemId: 'A', quantity: 1 });
  assert.equal(operation.prepare('/stock/donate', { itemId: 'A', quantity: 1 }).body, first.body);
});
test('follow-up refresh failure does not repeat a confirmed mutation', () => {
  const operation = new OperationAttempt();
  operation.prepare('/stock/donate', { itemId: 'A', quantity: 1 });
  operation.confirm('gift-id');
  const retry = operation.prepare('/stock/donate', { itemId: 'A', quantity: 1 });
  assert.equal(retry.confirmed, true);
  assert.equal(retry.result, 'gift-id');
});
test('changed payload or explicit new operation gets fresh identity', () => {
  const operation = new OperationAttempt();
  const first = operation.prepare('/stock/open', { quantity: 1 }).body;
  const changed = operation.prepare('/stock/open', { quantity: 2 }).body;
  assert.notEqual(first, changed);
  operation.reset();
  assert.notEqual(operation.prepare('/stock/open', { quantity: 2 }).body, changed);
});
test('query and language edits invalidate pending search results', () => {
  const requests = new RequestGenerations();
  const oldFrench = requests.begin('draft-a');
  requests.begin('draft-a');
  assert.equal(oldFrench(), false);
  const newJapanese = requests.begin('draft-a');
  assert.equal(newJapanese(), true);
  const otherDraft = requests.begin('draft-b');
  assert.equal(newJapanese(), true);
  assert.equal(otherDraft(), true);
});
