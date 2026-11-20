import assert from 'node:assert/strict';
import test from 'node:test';
import { convexTest } from 'convex-test';
import schema from '../functions/schema';
import { internal } from '../functions/_generated/api';
const modules = {
  './functions/signedReceipts.ts': () => import('../functions/signedReceipts'),
  './functions/auth.ts': () => import('../functions/auth'),
  './functions/_generated/server.js': () => import('../functions/_generated/server.js'),
};
const signature = [
  [
    [0.1, 0.8],
    [0.2, 0.3],
    [0.3, 0.6],
    [0.5, 0.2],
    [0.8, 0.7],
  ],
];
async function fixture() {
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('accounts', {
      email: 'staff@example.com',
      passwordHash: 'test',
      createdAt: 1,
      signatory: { firstName: 'Alice', lastName: 'Martin', capacity: 'Mandataire' },
    });
    const otherId = await ctx.db.insert('accounts', {
      email: 'other@example.com',
      passwordHash: 'test',
      createdAt: 1,
    });
    const sellerId = await ctx.db.insert('sellers', {
      ownerId,
      name: 'Client',
      email: 'client@example.com',
      operationId: 'seller',
      operationDigest: '',
      createdAt: 1,
    });
    const targetId = await ctx.db.insert('purchases', {
      ownerId,
      sellerId,
      reference: 'ACHAT-1',
      occurredAt: 1,
      status: 'pending',
      operationId: 'purchase',
      operationDigest: '',
      createdAt: 1,
    });
    await ctx.db.insert('items', {
      ownerId,
      purchaseId: targetId,
      name: 'Carte',
      purchasePriceCents: 1200,
      purchaseOccurredAt: 1,
      vatRegime: 'margin',
      status: 'available',
      operationId: 'item',
      createdAt: 1,
    });
    return { ownerId, otherId, sellerId, targetId };
  });
  const draft = await t.mutation(internal.signedReceipts.prepare, {
    ownerId: data.ownerId,
    kind: 'purchase',
    targetId: data.targetId,
    identity: {},
  });
  return {
    t,
    ...data,
    draft,
    sign: {
      ownerId: data.ownerId,
      id: draft.id,
      company: signature,
      client: signature,
      accepted: true as const,
    },
  };
}
test('signatures are per account; saving names preserves a signature, clearing removes it', async () => {
  const { t, ownerId, otherId } = await fixture();
  const profile = { id: ownerId, firstName: 'Alice', lastName: 'Martin', capacity: 'Mandataire' };
  await t.mutation(internal.auth.setSignatoryProfile, { ...profile, signature });
  await t.mutation(internal.auth.setSignatoryProfile, profile);
  assert.deepEqual(
    (await t.query(internal.auth.signatoryProfile, { id: ownerId })).signature,
    signature,
  );
  assert.equal(
    (await t.query(internal.auth.signatoryProfile, { id: otherId })).signature,
    undefined,
  );
  await assert.rejects(
    t.mutation(internal.auth.setSignatoryProfile, { ...profile, signature: [[[5, 0]]] }),
    /INVALID_SIGNATURE/,
  );
  await t.mutation(internal.auth.setSignatoryProfile, { ...profile, signature: null });
  assert.equal((await t.query(internal.auth.signatoryProfile, { id: ownerId })).signature, null);
});
test('signing rejects changed documents, expired drafts, invalid strokes and another account', async () => {
  const { t, ownerId, otherId, targetId, draft, sign } = await fixture();
  await assert.rejects(
    t.mutation(internal.signedReceipts.sign, { ...sign, ownerId: otherId }),
    /RECEIPT_NOT_FOUND/,
  );
  await assert.rejects(
    t.mutation(internal.signedReceipts.sign, { ...sign, client: [] }),
    /INVALID_SIGNATURE/,
  );
  await t.run((ctx) => ctx.db.patch(targetId, { reference: 'CHANGED' }));
  await assert.rejects(t.mutation(internal.signedReceipts.sign, sign), /RECEIPT_CHANGED/);
  await t.run((ctx) => ctx.db.patch(draft.id, { createdAt: Date.now() - 31 * 60_000 }));
  await assert.rejects(t.mutation(internal.signedReceipts.sign, sign), /RECEIPT_EXPIRED/);
  assert.equal(
    (await t.query(internal.signedReceipts.list, { ownerId, kind: 'purchase', targetId })).length,
    0,
  );
});
test('signed versions are immutable, retries are idempotent and email attempts are serialized', async () => {
  const { t, ownerId, sellerId, draft, sign } = await fixture();
  const first = await t.mutation(internal.signedReceipts.sign, sign);
  const second = await t.mutation(internal.signedReceipts.sign, sign);
  assert.equal(first.signedAt, second.signedAt);
  await assert.rejects(
    t.mutation(internal.signedReceipts.sign, { ...sign, client: [signature[0].toReversed()] }),
    /ALREADY_SIGNED/,
  );
  await t.run((ctx) => ctx.db.patch(sellerId, { email: 'changed@example.com' }));
  const saved = await t.query(internal.signedReceipts.get, { ownerId, id: draft.id });
  assert.equal(saved.snapshot.client.email, 'client@example.com');
  await t.mutation(internal.signedReceipts.archive, {
    id: draft.id,
    objectKey: 'private/pdf',
    sha256: 'hash1',
    filename: 'signed.pdf',
  });
  await assert.rejects(
    t.mutation(internal.signedReceipts.archive, {
      id: draft.id,
      objectKey: 'private/pdf',
      sha256: 'hash2',
      filename: 'signed.pdf',
    }),
    /ARCHIVE_IMMUTABLE/,
  );
  assert.equal(
    await t.mutation(internal.signedReceipts.claimEmail, {
      id: draft.id,
      attempt: 'a',
      retry: false,
    }),
    true,
  );
  assert.equal(
    await t.mutation(internal.signedReceipts.claimEmail, {
      id: draft.id,
      attempt: 'b',
      retry: true,
    }),
    false,
  );
  await t.mutation(internal.signedReceipts.emailResult, {
    id: draft.id,
    attempt: 'wrong',
    status: 'accepted',
  });
  assert.equal(
    (await t.query(internal.signedReceipts.get, { ownerId, id: draft.id })).emailStatus,
    'sending',
  );
  await t.mutation(internal.signedReceipts.emailResult, {
    id: draft.id,
    attempt: 'a',
    status: 'accepted',
    messageId: 'brevo-id',
  });
  assert.equal(
    await t.mutation(internal.signedReceipts.claimEmail, {
      id: draft.id,
      attempt: 'c',
      retry: false,
    }),
    false,
  );
});

test('deposit signatures freeze agreed prices, commission and conditions; amended agreements require a new draft', async () => {
  const { t, ownerId, sellerId } = await fixture();
  const deposit = await t.run(async (ctx) => {
    const id = await ctx.db.insert('consignments', {
      ownerId,
      sellerId,
      reference: 'DEPOT-1',
      occurredAt: 1,
      notes: 'Conditions acceptées',
      operationId: 'deposit',
      operationDigest: '',
      createdAt: 1,
    });
    const itemId = await ctx.db.insert('items', {
      ownerId,
      consignmentId: id,
      origin: 'consignment',
      name: 'Display',
      agreedPriceCents: 10000,
      askingPriceCents: 11000,
      commissionRateBps: 3000,
      purchaseOccurredAt: 1,
      vatRegime: 'other',
      status: 'available',
      operationId: 'item-depot',
      createdAt: 1,
    });
    return { id, itemId };
  });
  const draft = await t.mutation(internal.signedReceipts.prepare, {
    ownerId,
    kind: 'consignment',
    targetId: deposit.id,
    identity: {},
  });
  assert.equal(draft.snapshot.items[0].askingPriceCents, 10000);
  assert.equal(draft.snapshot.items[0].commissionRateBps, 3000);
  await t.run((ctx) => ctx.db.patch(deposit.itemId, { agreedPriceCents: 9000 }));
  await assert.rejects(
    t.mutation(internal.signedReceipts.sign, {
      id: draft.id,
      ownerId,
      company: signature,
      client: signature,
      accepted: true,
    }),
    /RECEIPT_CHANGED/,
  );
});
