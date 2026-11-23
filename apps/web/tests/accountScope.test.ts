import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AccountSession,
  AccountRecoveryVault,
  hasRetainedAccountWork,
  type ScopedRequestInit,
} from '../src/lib/accountScope';
import {
  SubmittedAttempt,
  PendingPurchasePhotos,
  RequestFailure,
} from '../src/lib/submittedAttempt';

test('private requests and upload headers bind the immutable original account', async () => {
  const session = new AccountSession();
  session.select('account-a');
  const scope = session.scope('account-a');
  let calls = 0;
  const request = scope.bind(
    async <T>(_path: string, init?: RequestInit) => {
      calls++;
      assert.equal(new Headers(init?.headers).get('X-Expected-Account-ID'), 'account-a');
      return {} as T;
    },
    () => {},
  );
  assert.equal(request.accountId, 'account-a');
  assert.equal(Reflect.set(request, 'accountId', 'account-b'), false);
  await request('/stock');
  assert.equal(
    scope.headers({ 'Content-Type': 'image/png' }).get('X-Expected-Account-ID'),
    'account-a',
  );
  session.select('account-b');
  await assert.rejects(request('/sales/bulk', { method: 'POST' }), /ACCOUNT_SCOPE_CHANGED/);
  assert.throws(() => scope.headers(), /ACCOUNT_SCOPE_CHANGED/);
  assert.equal(calls, 1);
});

test('account-keyed recovery retains original request and files without exposing them through another account', async () => {
  const vault = new AccountRecoveryVault<{
    attempt: SubmittedAttempt<unknown>;
    photos: PendingPurchasePhotos<object>;
  }>((value) => value.attempt.state !== 'idle');
  const create = (owner: string) => ({
    attempt: new SubmittedAttempt(owner),
    photos: new PendingPurchasePhotos<object>(),
  });
  const original = vault.forAccount('a', () => create('a'));
  const file = { privatePhoto: true };
  original.attempt.prepare('/purchases', { reference: 'private-reference' }, undefined);
  original.photos.add([{ purchaseId: 'saved-a', itemId: 'item-a', name: 'photo', file }]);
  const session = new AccountSession();
  session.select('b');
  let sends = 0;
  const b = session.scope('b').bind(
    async <T>() => {
      sends++;
      return {} as T;
    },
    () => {},
  );
  const other = vault.forAccount('b', () => create('b'));
  assert.equal(other.attempt.state, 'idle');
  assert.equal(other.photos.rows.length, 0);
  await assert.rejects(original.attempt.execute(b), /RECOVERY_ACCOUNT_MISMATCH/);
  assert.equal(sends, 0);
  const restored = vault.forAccount('a', () => {
    throw new Error('must restore');
  });
  assert.equal(restored, original);
  assert.equal(restored.photos.rows[0].file, file);
  assert.equal(hasRetainedAccountWork(), true);
});

test('late completions cannot update transport state after logout, even after returning to the same account', async () => {
  const session = new AccountSession();
  session.select('a');
  const original = session.scope('a');
  let resolve!: () => void;
  const pending = new Promise<void>((done) => {
    resolve = done;
  });
  let csrfUpdates = 0;
  const request = original.bind(
    async <T>(_path: string, init?: RequestInit) => {
      await pending;
      (init as ScopedRequestInit).assertAccountScope?.();
      csrfUpdates++;
      return {} as T;
    },
    () => {},
  );
  const completion = assert.rejects(request('/stock'), /ACCOUNT_SCOPE_CHANGED/);
  session.select(null);
  session.select('b');
  session.select('a');
  resolve();
  await completion;
  assert.equal(csrfUpdates, 0);
  assert.throws(() => original.assertActive(), /ACCOUNT_SCOPE_CHANGED/);
  session.scope('a').assertActive();
});

test('session rejection invalidates the private boundary; service outage preserves it', async () => {
  for (const code of [
    'ACCOUNT_MISMATCH',
    'UNAUTHENTICATED',
    'INVALID_SESSION',
    'ACCOUNT_DISABLED',
  ]) {
    const session = new AccountSession();
    session.select('a');
    const scope = session.scope('a');
    let invalidations = 0;
    const request = scope.bind(
      async () => {
        throw new Error(code);
      },
      () => {
        invalidations++;
        session.select(null);
      },
    );
    await assert.rejects(request('/stock'), new RegExp(code));
    assert.equal(invalidations, 1);
    assert.throws(() => scope.assertActive(), /ACCOUNT_SCOPE_CHANGED/);
  }
  const session = new AccountSession();
  session.select('a');
  const scope = session.scope('a');
  const request = scope.bind(
    async () => {
      throw new RequestFailure('Service unavailable', 503, 'AUTH_SERVICE_UNAVAILABLE');
    },
    () => {
      throw new Error('must not invalidate');
    },
  );
  await assert.rejects(request('/stock'), /Service unavailable/);
  scope.assertActive();
});

test('an old async failure cannot overwrite a successful same-account recovery after remount', async () => {
  const session = new AccountSession();
  session.select('a');
  const oldScope = session.scope('a');
  let reject!: () => void;
  const pending = new Promise<void>((_resolve, fail) => {
    reject = () => fail(new Error('Old response lost'));
  });
  const oldRequest = oldScope.bind(
    async <T>() => {
      await pending;
      return {} as T;
    },
    () => {},
  );
  const attempt = new SubmittedAttempt<{ id: string }>('a');
  const body = attempt.prepare('/sales/bulk', { amountCents: 100 }, undefined).body;
  const oldCompletion = assert.rejects(attempt.execute(oldRequest), /ACCOUNT_SCOPE_CHANGED/);
  session.select(null);
  session.select('b');
  session.select('a');
  const recovered = session.scope('a').bind(
    async <T>(_path: string, init?: RequestInit) => {
      assert.equal(init?.body, body);
      return { id: 'saved' } as T;
    },
    () => {},
  );
  await attempt.execute(recovered);
  reject();
  await oldCompletion;
  assert.equal(attempt.state, 'confirmed');
  assert.equal(attempt.current?.unresolvedExecution, false);
  assert.deepEqual(attempt.current?.result, { id: 'saved' });
});
