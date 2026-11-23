import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountMemory } from '../src/lib/accountMemory';
import { SaleTicketEmailAttempt } from '../src/lib/saleTicketEmailAttempt';

test('account switch hides an uncertain email; same-account remount recovers its original identity', () => {
  const memories = new AccountMemory(() => ({
    attempt: new SaleTicketEmailAttempt(),
    recipient: '',
  }));
  const first = memories.forRequest({ accountId: 'a' }, 'documents');
  first.recipient = 'original@example.test';
  const original = first.attempt.prepare('ticket-a', first.recipient);
  first.attempt.reject(new TypeError('response lost'));
  const second = memories.forRequest({ accountId: 'b' }, 'documents');
  assert.equal(second.recipient, '');
  assert.equal(second.attempt.status, 'idle');
  const restored = memories.forRequest({ accountId: 'a' }, 'documents');
  assert.equal(restored, first);
  assert.equal(restored.attempt.status, 'unknown');
  assert.deepEqual(restored.attempt.prepare('changed', 'other@example.test'), original);
  assert.notEqual(memories.forRequest({ accountId: 'a' }, 'another-ticket'), first);
  assert.notEqual(memories.forRequest({}), memories.forRequest({}));
});
