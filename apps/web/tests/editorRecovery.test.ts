import test from 'node:test';
import assert from 'node:assert/strict';
import { PurchaseCorrectionRecovery } from '../src/lib/purchaseCorrectionRecovery';
import { correctionDraft, type CorrectionSnapshot } from '../src/lib/purchaseCorrection';
import { ConsignmentDocumentRecovery } from '../src/lib/consignmentDocumentRecovery';
import { DossierRecoveryVault } from '../src/lib/dossierRecovery';
import { AccountSession } from '../src/lib/accountScope';

const snapshot = (): CorrectionSnapshot => ({
  purchase: { _id: 'purchase-a', reference: 'ORIGINAL', status: 'active' },
  expectedDigest: 'original-digest',
  lockedIds: ['sold'],
  items: [
    {
      _id: 'free',
      name: 'Original',
      status: 'available',
      purchasePriceCents: 701,
      marketValueCents: 1000,
      discountPercent: 70,
    },
    { _id: 'sold', name: 'Protected', status: 'sold', purchasePriceCents: 1000 },
  ],
});

test('purchase correction freezes digest, line identity and review snapshot after a lost POST response', async () => {
  const recovery = new PurchaseCorrectionRecovery();
  const data = snapshot();
  const rows = [correctionDraft(data.items[0])];
  rows[0].name = 'Submitted name';
  const first = recovery.prepareCorrection('purchase-a', data, rows);
  const commits = new Map<string, unknown>();
  let lose = true;
  let requests = 0;
  const request = async <T>(path: string, init?: RequestInit) => {
    assert.equal(path, '/purchases/purchase-a/edit');
    assert.equal(init?.method, 'POST');
    requests++;
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.expectedDigest, 'original-digest');
    assert.equal(payload.items[0].name, 'Submitted name');
    assert.deepEqual(payload.removedIds, []);
    assert.equal(payload.items.length, 1);
    commits.set(payload.operationId, { itemIds: ['free', 'sold'] });
    if (lose) {
      lose = false;
      throw new Error('Response lost after correction');
    }
    return commits.get(payload.operationId) as T;
  };
  await assert.rejects(recovery.execute(request));
  rows[0].name = 'Later editable name';
  data.expectedDigest = 'later-digest';
  data.purchase.reference = 'later-ref';
  assert.equal(recovery.prepareCorrection('different-purchase', data, rows), first);
  assert.equal(first.context.snapshot.purchase.reference, 'ORIGINAL');
  assert.equal(first.context.rows[0].name, 'Submitted name');
  assert.equal(first.context.plan.afterCents, 1701);
  await recovery.execute(request);
  await assert.rejects(Promise.reject(new Error('Refresh failed')));
  await recovery.execute(request);
  assert.equal(requests, 2);
  assert.equal(commits.size, 1);
  assert.equal(recovery.state, 'confirmed');
});

test('account and dossier remounts retain only their own correction recovery', async () => {
  const vault = new DossierRecoveryVault(
    (account) => new PurchaseCorrectionRecovery(account),
    (value) => value.state !== 'idle',
  );
  const a = vault.forRequest({ accountId: 'a' }, 'purchase-a');
  const data = snapshot();
  const rows = [correctionDraft(data.items[0])];
  rows[0].name = 'Submitted';
  a.prepareCorrection('purchase-a', data, rows);
  assert.equal(vault.forRequest({ accountId: 'b' }, 'purchase-a').state, 'idle');
  assert.equal(vault.forRequest({ accountId: 'a' }, 'purchase-b').state, 'idle');
  assert.equal(vault.forRequest({ accountId: 'a' }, 'purchase-a'), a);
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
  await assert.rejects(a.execute(b), /RECOVERY_ACCOUNT_MISMATCH/);
  assert.equal(sends, 0);
});

test('return recovery preserves selected articles, notes, date and operation ID despite later edits', async () => {
  const recovery = new ConsignmentDocumentRecovery();
  const names = ['Original item'];
  const original = recovery.prepareReturn(
    {
      consignmentId: 'deposit-a',
      itemIds: ['item-a'],
      occurredAt: 123,
      conditionNotes: 'Original condition',
    },
    {
      reference: 'ORIGINAL',
      sellerName: 'QA',
      itemNames: names,
      occurredAt: 123,
      conditionNotes: 'Original condition',
    },
  );
  const requests: string[] = [];
  let lose = true;
  const request = async <T>(path: string, init?: RequestInit) => {
    assert.equal(path, '/consignments/returns/prepare');
    assert.equal(init?.method, 'POST');
    requests.push(String(init?.body));
    if (lose) {
      lose = false;
      throw new Error('Lost return response');
    }
    return { id: 'prepared-return' } as T;
  };
  await assert.rejects(recovery.returns.execute(request));
  names[0] = 'Edited item';
  recovery.prepareReturn(
    {
      consignmentId: 'deposit-b',
      itemIds: ['item-b'],
      occurredAt: 456,
      conditionNotes: 'Edited condition',
    },
    {
      reference: 'EDITED',
      sellerName: 'Other',
      itemNames: ['Other'],
      occurredAt: 456,
      conditionNotes: 'Edited',
    },
  );
  assert.equal(recovery.returns.current, original);
  assert.deepEqual(original.context.itemNames, ['Original item']);
  await recovery.returns.execute(request);
  await assert.rejects(Promise.reject(new Error('Refresh failed')));
  await recovery.returns.execute(request);
  assert.equal(requests.length, 2);
  assert.equal(requests[0], requests[1]);
  assert.equal(original.context.conditionNotes, 'Original condition');
});

test('a confirmed statement retries only its PDF/read follow-up without another creation', async () => {
  const recovery = new ConsignmentDocumentRecovery();
  recovery.prepareStatement('seller-a', { reference: 'deposit-a', sellerName: 'Original seller' });
  let posts = 0;
  const request = async <T>() => {
    posts++;
    return { id: 'statement-a' } as T;
  };
  assert.deepEqual(await recovery.statement.execute(request), { id: 'statement-a' });
  await assert.rejects(Promise.reject(new Error('PDF unavailable')));
  recovery.prepareStatement('seller-b', { reference: 'deposit-b', sellerName: 'Changed seller' });
  assert.deepEqual(await recovery.statement.execute(request), { id: 'statement-a' });
  assert.equal(posts, 1);
  assert.equal(recovery.statement.current?.context.sellerName, 'Original seller');
});

test('returns and statements remain separate and restore for the same account/dossier after login', () => {
  const vault = new DossierRecoveryVault(
    (account) => new ConsignmentDocumentRecovery(account),
    (value) => value.returns.state !== 'idle' || value.statement.state !== 'idle',
  );
  const a = vault.forRequest({ accountId: 'a' }, 'deposit-a');
  a.prepareReturn(
    { consignmentId: 'deposit-a', itemIds: ['one'], occurredAt: 1, conditionNotes: 'Original' },
    {
      reference: 'deposit-a',
      sellerName: 'QA',
      itemNames: ['One'],
      occurredAt: 1,
      conditionNotes: 'Original',
    },
  );
  a.prepareStatement('seller-a', { reference: 'deposit-a', sellerName: 'QA' });
  assert.notEqual(
    JSON.parse(a.returns.current!.body).operationId,
    JSON.parse(a.statement.current!.body).operationId,
  );
  assert.equal(vault.forRequest({ accountId: 'b' }, 'deposit-a').returns.state, 'idle');
  assert.equal(vault.forRequest({ accountId: 'a' }, 'deposit-b').statement.state, 'idle');
  assert.equal(vault.forRequest({ accountId: 'a' }, 'deposit-a'), a);
});
