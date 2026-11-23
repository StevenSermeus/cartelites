import test from 'node:test';
import assert from 'node:assert/strict';
import { SaleTicketEmailAttempt } from '../src/lib/saleTicketEmailAttempt';

test('network and server-unknown outcomes keep the original key and destination for status checks', () => {
  const attempt = new SaleTicketEmailAttempt();
  const original = attempt.prepare('ticket-a', ' qa@example.test ');
  attempt.reject(new TypeError('Failed to fetch'));
  assert.equal(attempt.status, 'unknown');
  assert.deepEqual(attempt.prepare('ticket-b', 'changed@example.test'), original);
  attempt.resolve('unknown');
  assert.deepEqual(attempt.prepare('ticket-a', 'qa@example.test'), original);
  assert.throws(() => attempt.retryFailed(), /CONFIRMED_FAILURE/);
  attempt.reject(new Error('EMAIL_RESULT_UNKNOWN'));
  assert.equal(attempt.status, 'unknown');
  assert.deepEqual(attempt.prepare('ticket-a', 'qa@example.test'), original);
});

test('confirmed failed response permits a fresh key only through the explicit retry action', () => {
  const attempt = new SaleTicketEmailAttempt();
  const original = attempt.prepare('ticket-a', 'qa@example.test');
  attempt.resolve('failed');
  assert.equal(attempt.status, 'failed');
  // Merely checking an existing failure must not create another attempt.
  assert.deepEqual(attempt.prepare('ticket-a', 'qa@example.test'), original);
  attempt.resolve('failed');
  attempt.retryFailed();
  const retry = attempt.prepare('ticket-a', 'corrected@example.test');
  assert.notEqual(JSON.parse(retry.body).operationId, JSON.parse(original.body).operationId);
  assert.equal(JSON.parse(retry.body).recipient, 'corrected@example.test');
});

test('confirmed provider failure errors are retryable; unexpected provider states remain uncertain', () => {
  const attempt = new SaleTicketEmailAttempt();
  attempt.prepare('ticket-a', 'qa@example.test');
  attempt.reject(new Error('EMAIL_DELIVERY_FAILED'));
  assert.equal(attempt.status, 'failed');
  attempt.retryFailed();
  const retry = attempt.prepare('ticket-a', 'qa@example.test');
  for (const state of ['sending', 'pending', 'unexpected']) {
    attempt.resolve(state);
    assert.equal(attempt.status, 'unknown');
    assert.throws(() => attempt.retryFailed(), /CONFIRMED_FAILURE/);
    assert.deepEqual(attempt.prepare('ticket-a', 'qa@example.test'), retry);
  }
});

test('accepted attempts allow a separately confirmed subsequent email', () => {
  const attempt = new SaleTicketEmailAttempt();
  const original = attempt.prepare('ticket-a', 'qa@example.test');
  attempt.resolve('accepted');
  assert.equal(attempt.status, 'accepted');
  const next = attempt.prepare('ticket-b', 'other@example.test');
  assert.notEqual(next.body, original.body);
  assert.match(next.path, /ticket-b\/email$/);
  assert.equal(JSON.parse(next.body).recipient, 'other@example.test');
});

test('validated pre-send rejection allows correcting the recipient without trapping an uncertain attempt',()=>{
 for(const code of ['INVALID_EMAIL','EMAIL_DELIVERY_UNAVAILABLE']){
  const attempt=new SaleTicketEmailAttempt(),first=attempt.prepare('ticket-a','wrong@example.test');
  attempt.reject(new Error(code));assert.equal(attempt.status,'failed');attempt.retryFailed();
  const retry=attempt.prepare('ticket-a','corrected@example.test');assert.notEqual(first.body,retry.body);assert.equal(JSON.parse(retry.body).recipient,'corrected@example.test');
 }
});

test('stale ticket rejection releases the old destination only through deliberate selection', () => {
 const attempt = new SaleTicketEmailAttempt();
 const first = attempt.prepare('old-ticket', 'qa@example.test');
 attempt.reject(new Error('TICKET_STALE'));
 assert.equal(attempt.status, 'stale');
 assert.throws(() => attempt.retryFailed(), /CONFIRMED_FAILURE/);
 attempt.releaseStale();
 const current = attempt.prepare('current-ticket', 'qa@example.test');
 assert.match(current.path, /current-ticket\/email$/);
 assert.notEqual(JSON.parse(current.body).operationId, JSON.parse(first.body).operationId);
});

test('later preflight rejection cannot clear an earlier uncertain delivery', () => {
 for (const code of ['TICKET_STALE', 'INVALID_EMAIL', 'EMAIL_DELIVERY_UNAVAILABLE']) {
  const attempt = new SaleTicketEmailAttempt();
  const first = attempt.prepare('old-ticket', 'qa@example.test');
  attempt.reject(new TypeError('Failed to fetch'));
  attempt.prepare('current-ticket', 'other@example.test');
  attempt.reject(new Error(code));
  assert.equal(attempt.status, 'unknown');
  assert.throws(() => attempt.releaseStale(), /REQUIRES_STALE/);
  assert.throws(() => attempt.retryFailed(), /CONFIRMED_FAILURE/);
  assert.deepEqual(attempt.prepare('current-ticket', 'other@example.test'), first);
 }
});
