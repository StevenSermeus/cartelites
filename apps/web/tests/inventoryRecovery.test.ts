import test from 'node:test';
import assert from 'node:assert/strict';
import { InventoryRecovery, type InventoryKind } from '../src/lib/inventoryRecovery';
import { AccountSession, AccountRecoveryVault } from '../src/lib/accountScope';

for (const [kind, path, result] of [
  ['receive', '/supplier-receipts', { id: 'receipt-a' }],
  ['gift', '/stock/donate', 'gift-a'],
  ['open', '/stock/open', { id: 'opening-a' }],
  ['reverse', '/stock/reverse', 'reversal-a'],
] as const) {
  test(`${kind}: lost response preserves payload and identity; changed operation cannot replace it`, async () => {
    const recovery = new InventoryRecovery<object>();
    const evidence = { name: 'original' };
    recovery.prepare(
      kind,
      path,
      { quantity: 1, reference: 'original' },
      kind === 'receive' || kind === 'gift' ? evidence : null,
    );
    const original = recovery.attempt.current!.body,
      attachmentId = recovery.context!.attachmentId;
    const commits = new Map<string, unknown>();
    let loseResponse = true;
    const bodies: string[] = [];
    const request = async <T>(actualPath: string, init?: RequestInit) => {
      assert.equal(actualPath, path);
      bodies.push(String(init?.body));
      const id = JSON.parse(String(init?.body)).operationId;
      commits.set(id, { result });
      if (loseResponse) {
        loseResponse = false;
        throw new Error('Lost after commit');
      }
      return commits.get(id) as T;
    };
    await assert.rejects(recovery.execute(request), /Lost/);
    assert.throws(
      () => recovery.prepare('gift', '/stock/donate', { quantity: 99 }, null),
      /RECOVERY_REQUIRED/,
    );
    assert.throws(() => recovery.release(), /UNRESOLVED/);
    assert.equal(recovery.attempt.current!.body, original);
    assert.equal(recovery.context!.attachmentId, attachmentId);
    assert.deepEqual(await recovery.execute(request), result);
    assert.equal(commits.size, 1);
    assert.equal(bodies[0], bodies[1]);
    await assert.rejects(Promise.reject(new Error('Refresh failed')));
    await recovery.execute(request);
    assert.equal(bodies.length, 2);
  });
}

test('failed evidence retains its File, target and UUID; retry cannot create another stock movement', async () => {
  const recovery = new InventoryRecovery<object>();
  const file = { name: 'invoice' };
  let mutationCount = 0;
  recovery.prepare('receive', '/supplier-receipts', { reference: 'invoice' }, file);
  const request = async <T>() => {
    mutationCount++;
    return { result: { id: 'saved-receipt' } } as T;
  };
  await recovery.execute(request);
  const uploadIds: string[] = [];
  let loseResponse = true;
  const upload = async (target: object, actualFile: object, id: string) => {
    assert.deepEqual(target, { supplierReceiptId: 'saved-receipt' });
    assert.equal(actualFile, file);
    uploadIds.push(id);
    if (loseResponse) {
      loseResponse = false;
      throw new Error('Attachment response lost');
    }
  };
  await assert.rejects(
    recovery.saveEvidence(upload, () => {}),
    /lost/,
  );
  assert.equal(recovery.state, 'confirmed');
  assert.equal(recovery.context?.file, file);
  assert.throws(() => recovery.release(), /EVIDENCE_PENDING/);
  await recovery.execute(request);
  await recovery.saveEvidence(upload, () => {});
  assert.equal(mutationCount, 1);
  assert.equal(uploadIds[0], uploadIds[1]);
  assert.equal(recovery.context?.file, null);
  await recovery.saveEvidence(upload, () => {});
  assert.equal(uploadIds.length, 2);
  recovery.release();
  assert.equal(recovery.state, 'idle');
});

test('account remount restores unresolved inventory and evidence only to its original owner', async () => {
  const vault = new AccountRecoveryVault<InventoryRecovery<object>>();
  const a = vault.forAccount('a', () => new InventoryRecovery('a'));
  const file = { name: 'private-invoice' };
  a.prepare('gift', '/stock/donate', { quantity: 1 }, file);
  const session = new AccountSession();
  session.select('b');
  let sends = 0;
  const b = session.scope('b').bind(
    async <T>() => {
      sends++;
      return { result: 'gift' } as T;
    },
    () => {},
  );
  await assert.rejects(a.execute(b), /RECOVERY_ACCOUNT_MISMATCH/);
  assert.equal(sends, 0);
  assert.equal(vault.forAccount('b', () => new InventoryRecovery('b')).state, 'idle');
  session.select('a');
  const restored = vault.forAccount('a', () => {
    throw new Error('must restore');
  });
  const current = session.scope('a').bind(
    async <T>(_path: string, init?: RequestInit) => {
      assert.equal(new Headers(init?.headers).get('X-Expected-Account-ID'), 'a');
      return { result: 'saved-gift' } as T;
    },
    () => {},
  );
  await restored.execute(current);
  assert.equal(restored.context?.file, file);
  assert.deepEqual(restored.context?.target, { giftId: 'saved-gift' });
});

test('reversal is an explicit separate operation after a completed opening', async () => {
  const recovery = new InventoryRecovery();
  recovery.prepare('open', '/stock/open', { itemId: 'display' }, null);
  const original = JSON.parse(recovery.attempt.current!.body).operationId;
  await recovery.execute(async <T>() => ({ result: { id: 'opening' } }) as T);
  assert.throws(
    () => recovery.prepare('reverse', '/stock/reverse', { openingId: 'opening' }, null),
    /RECOVERY_REQUIRED/,
  );
  recovery.release();
  recovery.prepare('reverse', '/stock/reverse', { openingId: 'opening' }, null);
  assert.equal(recovery.context?.kind, 'reverse');
  assert.equal(recovery.attempt.current!.path, '/stock/reverse');
  assert.notEqual(JSON.parse(recovery.attempt.current!.body).operationId, original);
});
