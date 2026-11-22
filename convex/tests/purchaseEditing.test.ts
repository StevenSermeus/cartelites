import assert from 'node:assert/strict';
import test from 'node:test';
import { convexTest } from 'convex-test';
import schema from '../functions/schema';
import { api } from '../functions/_generated/api';
const modules = {
  './functions/purchaseEditing.ts': () => import('../functions/purchaseEditing'),
  './functions/operations.ts': () => import('../functions/operations'),
  './functions/_generated/server.js': () => import('../functions/_generated/server.js'),
};
async function fixture() {
  const t = convexTest(schema, modules),
    user = t.withIdentity({ subject: 'employee' });
  const sellerId = await user.mutation(api.operations.createSeller, {
    operationId: 'seller',
    name: 'Client',
  });
  const result = await user.mutation(api.operations.createPurchase, {
    operationId: 'buy',
    sellerId,
    occurredAt: 1000,
    reference: 'R-1',
    buyerNote: '  Complément de 100 € si PSA 10.  ',
    sellerNote: 'Accord vendeur.',
    items: [0, 1].map((i) => ({
      operationId: `card-${i}`,
      name: `Carte ${i}`,
      marketValueCents: 10000,
      discountPercent: 80,
      purchasePriceCents: 8000,
      vatRegime: 'margin' as const,
    })),
  });
  await user.mutation(api.operations.validatePurchase, { purchaseId: result.purchaseId });
  return { t, user, ...result };
}
test('editing adds/removes/revalues cards atomically and retry preserves identities and audit', async () => {
  const { t, user, purchaseId, itemIds } = await fixture();
  const detail = await user.query(api.purchaseEditing.detail, { purchaseId });
  assert.equal(detail.purchase.buyerNote, 'Complément de 100 € si PSA 10.');
  assert.equal(detail.purchase.sellerNote, 'Accord vendeur.');
  const args = {
    purchaseId,
    operationId: 'edit',
    expectedDigest: detail.expectedDigest,
    removedIds: [itemIds[1]],
    items: [
      {
        itemId: itemIds[0],
        operationId: 'a',
        name: 'Carte corrigée',
        marketValueCents: 20000,
        discountPercent: 75,
      },
      { operationId: 'new', name: 'Nouvelle carte', marketValueCents: 10000, discountPercent: 70 },
    ],
  };
  const result = await user.mutation(api.purchaseEditing.save, args);
  assert.deepEqual(await user.mutation(api.purchaseEditing.save, args), result);
  const after = await user.query(api.purchaseEditing.detail, { purchaseId });
  assert.equal(after.items.length, 2);
  assert.equal(
    after.items.reduce((s, i) => s + (i.purchasePriceCents ?? 0), 0),
    22000,
  );
  assert.equal(after.items[0]._id, itemIds[0]);
  const removed = await t.run((ctx) => ctx.db.get(itemIds[1]));
  assert.equal(removed?.removedPurchaseId, purchaseId);
  assert.equal(removed?.purchaseId, undefined);
  const history = await t.run((ctx) => ctx.db.query('purchaseEdits').collect());
  assert.equal(history.length, 1);
  assert.equal(history[0].before.length, 2);
  await assert.rejects(
    user.mutation(api.purchaseEditing.save, { ...args, operationId: 'stale' }),
    /PURCHASE_CHANGED/,
  );
  await assert.rejects(t.mutation(api.purchaseEditing.save, args), /UNAUTHENTICATED/);
  await assert.rejects(
    t
      .withIdentity({ subject: 'employee', scope: 'realtime:read' })
      .mutation(api.purchaseEditing.save, args),
    /READ_ONLY_TOKEN/,
  );
});
test('sold cards and concurrent sales cannot be changed, invalid input rolls back', async () => {
  const { t, user, purchaseId, itemIds } = await fixture();
  const old = await user.query(api.purchaseEditing.detail, { purchaseId });
  const args = {
    purchaseId,
    operationId: 'edit',
    expectedDigest: old.expectedDigest,
    removedIds: [],
    items: [
      {
        itemId: itemIds[0],
        operationId: 'a',
        name: 'Carte',
        marketValueCents: 10000,
        discountPercent: 70,
      },
    ],
  };
  await assert.rejects(
    user.mutation(api.purchaseEditing.save, {
      ...args,
      items: [{ ...args.items[0], discountPercent: 101 }],
    }),
    /INVALID_PURCHASE/,
  );
  assert.equal((await t.run((ctx) => ctx.db.get(itemIds[0])))?.purchasePriceCents, 8000);
  await user.mutation(api.operations.createSale, {
    operationId: 'sale',
    itemId: itemIds[0],
    occurredAt: 2000,
    salePriceCents: 12000,
  });
  await assert.rejects(user.mutation(api.purchaseEditing.save, args), /PURCHASE_CHANGED/);
  const latest = await user.query(api.purchaseEditing.detail, { purchaseId });
  assert.deepEqual(latest.lockedIds, [itemIds[0]]);
  await assert.rejects(
    user.mutation(api.purchaseEditing.save, { ...args, expectedDigest: latest.expectedDigest }),
    /PURCHASE_ITEM_LOCKED/,
  );
});
