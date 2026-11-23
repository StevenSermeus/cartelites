import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SubmittedAttempt,
  PendingPurchasePhotos,
  RequestFailure,
} from '../src/lib/submittedAttempt';

for (const path of ['/purchases', '/sales/bulk', '/consignments/payments']) {
  test(`${path}: a lost response and edited fields recover the original operation without a duplicate`, async () => {
    const attempt = new SubmittedAttempt<{ id: string }, { note: string }>();
    const commits = new Map<string, { id: string }>();
    const requests: string[] = [];
    let lost = true;
    const request = async <T>(_path: string, init: RequestInit): Promise<T> => {
      requests.push(String(init.body));
      const payload = JSON.parse(String(init.body));
      if (!commits.has(payload.operationId)) commits.set(payload.operationId, { id: 'saved' });
      if (lost) {
        lost = false;
        throw new TypeError('Network response lost after commit');
      }
      return commits.get(payload.operationId) as T;
    };
    const first = attempt.prepare(path, { amountCents: 701 }, { note: 'submitted' });
    await assert.rejects(attempt.execute(request), /lost after commit/);
    assert.throws(() => attempt.release(), /UNRESOLVED/);
    const retry = attempt.prepare('/different-operation', { amountCents: 999 }, { note: 'edited' });
    assert.equal(retry, first);
    assert.equal(retry.context.note, 'submitted');
    assert.deepEqual(await attempt.execute(request), { id: 'saved' });
    assert.equal(requests[0], requests[1]);
    assert.equal(commits.size, 1);
  });
}
test('a confirmed write remains cached when a subsequent refresh fails', async () => {
  const attempt = new SubmittedAttempt<{ id: string }>();
  let posts = 0;
  attempt.prepare('/consignments/payments', { amountCents: 100 }, undefined);
  const request = async <T>() => {
    posts++;
    return { id: 'saved' } as T;
  };
  await attempt.execute(request);
  await assert.rejects(Promise.reject(new Error('Refresh unavailable')));
  assert.equal(attempt.state, 'confirmed');
  assert.deepEqual(await attempt.execute(request), { id: 'saved' });
  assert.equal(posts, 1);
});
for (const rejection of [
  new RequestFailure('Rate limited', 429),
  new RequestFailure('Sign in again', 401, 'INVALID_SESSION'),
  new RequestFailure('Not found', 404, 'ITEM_NOT_FOUND'),
  new RequestFailure('Invalid payment', 409, 'INVALID_PAYMENT'),
  new RequestFailure('Unavailable', 409, 'ITEM_STATE_INVALID'),
  new RequestFailure('Sale conflict', 409, 'SALE_CONFLICT'),
]) {
  test(`lost response then ${rejection.status}/${rejection.code ?? 'HTTP'} remains unresolved until same-key acknowledgement`, async () => {
    const attempt = new SubmittedAttempt<{ id: string }>();
    const original = attempt.prepare('/sales/bulk', { amountCents: 100 }, undefined).body;
    const committed = new Map([[JSON.parse(original).operationId, { id: 'already-saved' }]]);
    await assert.rejects(
      attempt.execute(async () => {
        throw new TypeError('Lost after commit');
      }),
    );
    for (let retry = 0; retry < 2; retry++) {
      await assert.rejects(
        attempt.execute(async () => {
          throw rejection;
        }),
      );
      assert.equal(attempt.state, 'unknown');
      assert.throws(() => attempt.release(), /UNRESOLVED/);
      assert.equal(attempt.prepare('/sales/bulk', { amountCents: 999 }, undefined).body, original);
    }
    assert.deepEqual(
      await attempt.execute(async <T>(_path: string, init: RequestInit) => {
        assert.equal(init.body, original);
        return committed.get(JSON.parse(String(init.body)).operationId) as T;
      }),
      { id: 'already-saved' },
    );
    assert.equal(attempt.state, 'confirmed');
    assert.equal(committed.size, 1);
    attempt.release();
    assert.equal(attempt.state, 'idle');
  });
}
test('initial definitive business rejection remains reviewable when no earlier execution is unresolved', async () => {
  for (const code of [
    'INVALID_PAYMENT',
    'PAYMENT_EXCEEDS_BALANCE',
    'ITEM_STATE_INVALID',
    'SALE_CONFLICT',
  ]) {
    const attempt = new SubmittedAttempt();
    const original = attempt.prepare('/sales/bulk', { amountCents: 100 }, undefined).body;
    await assert.rejects(
      attempt.execute(async () => {
        throw new RequestFailure(code, 409, code);
      }),
    );
    assert.equal(attempt.state, 'rejected');
    attempt.release();
    assert.notEqual(attempt.prepare('/sales/bulk', { amountCents: 99 }, undefined).body, original);
  }
});
test('a definitive rejection followed by an ambiguous retry becomes sticky too', async () => {
  const attempt = new SubmittedAttempt();
  attempt.prepare('/purchases', {}, undefined);
  await assert.rejects(
    attempt.execute(async () => {
      throw new RequestFailure('Rate limited', 429);
    }),
  );
  assert.equal(attempt.state, 'rejected');
  await assert.rejects(
    attempt.execute(async () => {
      throw new Error('Server response lost');
    }),
  );
  await assert.rejects(
    attempt.execute(async () => {
      throw new RequestFailure('Sign in again', 401);
    }),
  );
  assert.equal(attempt.state, 'unknown');
  assert.throws(() => attempt.release(), /UNRESOLVED/);
});
test('only explicit server rejections allow reviewed edits; 5xx and idempotency conflicts stay frozen', async () => {
  for (const error of [
    new RequestFailure('invalid', 500, 'INVALID_PAYMENT'),
    new RequestFailure('conflict', 409, 'IDEMPOTENCY_KEY_REUSED'),
    new RequestFailure('timeout', 408),
  ]) {
    const attempt = new SubmittedAttempt();
    attempt.prepare('/sales/bulk', {}, undefined);
    await assert.rejects(
      attempt.execute(async () => {
        throw error;
      }),
    );
    assert.equal(attempt.state, 'unknown');
    assert.throws(() => attempt.release(), /UNRESOLVED/);
  }
  const attempt = new SubmittedAttempt();
  const first = attempt.prepare('/consignments/payments', { amountCents: 999 }, undefined).body;
  await assert.rejects(
    attempt.execute(async () => {
      throw new RequestFailure('Balance exceeded', 409, 'PAYMENT_EXCEEDS_BALANCE');
    }),
  );
  assert.equal(attempt.state, 'rejected');
  assert.equal(
    attempt.prepare('/consignments/payments', { amountCents: 100 }, undefined).body,
    first,
  );
  attempt.release();
  assert.notEqual(
    attempt.prepare('/consignments/payments', { amountCents: 100 }, undefined).body,
    first,
  );
});
test('partial photo failure retains original file and committed IDs; retries only remaining files with stable identity', async () => {
  const queue = new PendingPurchasePhotos<object>();
  const firstFile = { name: 'one' },
    secondFile = { name: 'two' };
  queue.add([
    { purchaseId: 'purchase-saved', itemId: 'item-one', name: 'one', file: firstFile },
    { purchaseId: 'purchase-saved', itemId: 'item-two', name: 'two', file: secondFile },
  ]);
  const commits = new Set<string>();
  const calls: { itemId: string; id: string }[] = [];
  let loseResponse = true;
  const upload = async (itemId: string, _file: object, id: string) => {
    commits.add(id);
    calls.push({ itemId, id });
    if (itemId === 'item-two' && loseResponse) {
      loseResponse = false;
      throw new Error('Upload response lost');
    }
  };
  assert.equal((await queue.retry(upload)).length, 1);
  assert.equal(queue.rows.length, 1);
  assert.equal(queue.rows[0].file, secondFile);
  assert.equal(queue.rows[0].purchaseId, 'purchase-saved');
  assert.deepEqual(await queue.retry(upload), []);
  assert.equal(queue.rows.length, 0);
  assert.equal(calls.length, 3);
  assert.equal(calls[1].id, calls[2].id);
  assert.equal(calls[2].itemId, 'item-two');
  assert.equal(commits.size, 2);
});


for(const code of ['SALE_CANCELLED','RETURN_BEFORE_DEPOSIT','PURCHASE_CHANGED','PURCHASE_ITEM_LOCKED','PURCHASE_TOO_LARGE','ITEM_UNAVAILABLE_AT_DATE']) {
  test(`${code}: an initial atomic rejection is reviewable but cannot resolve earlier uncertainty`,async()=>{
    const rejected=new SubmittedAttempt();rejected.prepare('/sales/payment',{saleId:'s'},undefined);
    const failure=new RequestFailure('Rejected',409,code);
    await assert.rejects(()=>rejected.execute(async()=>{throw failure;}));
    assert.equal(rejected.state,'rejected');rejected.release();assert.equal(rejected.state,'idle');
    const uncertain=new SubmittedAttempt();uncertain.prepare('/sales/payment',{saleId:'s'},undefined);
    await assert.rejects(()=>uncertain.execute(async()=>{throw new TypeError('Lost response');}));
    await assert.rejects(()=>uncertain.execute(async()=>{throw failure;}));
    assert.equal(uncertain.state,'unknown');assert.throws(()=>uncertain.release(),/UNRESOLVED/);
  });
}
