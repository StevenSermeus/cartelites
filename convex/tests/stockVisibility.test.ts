import { authenticated } from './helpers/session';
import assert from 'node:assert/strict';
import test from 'node:test';
import { convexTest } from 'convex-test';
import { api } from '../functions/_generated/api';
import schema from '../functions/schema';

const modules = {
  './functions/operations.ts': () => import('../functions/operations'),
  './functions/consignmentOperations.ts': () => import('../functions/consignmentOperations'),
  './functions/_generated/server.js': () => import('../functions/_generated/server.js'),
};
const catalogue = {
  paginationOpts: { numItems: 2, cursor: null },
  search: '',
  gradingStatus: 'all',
  gradingCompany: '',
  gradingGrade: '',
};
async function fixture() {
  const t = convexTest(schema, modules);
  const user = (await authenticated(t, 'employee'));
  const sellerId = await user.mutation(api.operations.createSeller, {
    operationId: 'seller',
    name: 'Client',
  });
  const purchase = await user.mutation(api.operations.createPurchase, {
    operationId: 'purchase',
    sellerId,
    occurredAt: 1000,
    reference: 'P-1',
    items: Array.from({ length: 4 }, (_, i) => ({
      operationId: `card-${i}`,
      name: `Carte ${i}`,
      purchasePriceCents: 100,
      askingPriceCents: 1000,
      vatRegime: 'margin' as const,
    })),
  });
  await user.mutation(api.operations.validatePurchase, { purchaseId: purchase.purchaseId });
  const deposit = await user.mutation(api.operations.createConsignment, {
    operationId: 'deposit',
    sellerId,
    occurredAt: 1000,
    reference: 'D-1',
    items: [
      {
        operationId: 'box',
        name: 'Display scellé',
        productType: 'sealed',
        askingPriceCents: 10000,
        commissionRateBps: 3000,
      },
    ],
  });
  return { t, user, ids: [...purchase.itemIds, ...deposit.itemIds] };
}

test('hide mixed stock atomically, filter public counts before pagination, retain internal inventory', async () => {
  const { t, user, ids } = await fixture();
  assert.equal((await t.query(api.operations.publicCatalogue, catalogue)).totalCount, 5);
  const result = await user.mutation(api.operations.setStockVisibility, {
    operationId: 'hide',
    itemIds: [ids[0], ids[4]],
    hidden: true,
  });
  assert.equal(result.updatedCount, 2);
  const stock = await user.query(api.operations.stock, {});
  assert.equal(stock.length, 5);
  assert.equal(stock.filter((item) => item.hiddenFromCatalogue).length, 2);
  const first = await t.query(api.operations.publicCatalogue, catalogue);
  assert.equal(first.totalCount, 3);
  assert.equal(first.page.length, 2);
  assert.equal(first.isDone, false);
  assert.ok(first.page.every((item) => ![ids[0], ids[4]].includes(item.id)));
  const second = await t.query(api.operations.publicCatalogue, {
    ...catalogue,
    paginationOpts: { numItems: 2, cursor: first.continueCursor },
  });
  assert.equal(second.page.length, 1);
  assert.equal(second.isDone, true);
  assert.equal(
    (await t.query(api.operations.publicCatalogue, { ...catalogue, search: 'Display' })).totalCount,
    0,
  );
  await user.mutation(api.operations.setStockVisibility, {
    operationId: 'show',
    itemIds: [ids[0], ids[4]],
    hidden: false,
  });
  assert.equal((await t.query(api.operations.publicCatalogue, catalogue)).totalCount, 5);
});

test('visibility retries are idempotent and cannot reapply an old action after a newer one', async () => {
  const { t, user, ids } = await fixture();
  const hide = { operationId: 'hide', itemIds: [ids[0]], hidden: true };
  assert.deepEqual(await user.mutation(api.operations.setStockVisibility, hide), {
    updatedCount: 1,
  });
  assert.deepEqual(await user.mutation(api.operations.setStockVisibility, hide), {
    updatedCount: 1,
  });
  await assert.rejects(
    user.mutation(api.operations.setStockVisibility, { ...hide, hidden: false }),
    /IDEMPOTENCY_KEY_REUSED/,
  );
  await user.mutation(api.operations.setStockVisibility, {
    ...hide,
    operationId: 'show',
    hidden: false,
  });
  await user.mutation(api.operations.setStockVisibility, hide);
  assert.equal((await t.run((ctx) => ctx.db.get(ids[0])))?.hiddenFromCatalogue, false);
  assert.equal(
    (await t.run((ctx) => ctx.db.query('stockVisibilityOperations').collect())).length,
    2,
  );
});

test('sold stale selection aborts the whole batch and hidden products remain sellable', async () => {
  const { t, user, ids } = await fixture();
  await user.mutation(api.operations.setStockVisibility, {
    operationId: 'hide',
    itemIds: [ids[0]],
    hidden: true,
  });
  const saleId = await user.mutation(api.operations.createSale, {
    operationId: 'sale',
    itemId: ids[0],
    occurredAt: 2000,
    salePriceCents: 1000,
  });
  assert.equal(typeof saleId, 'string');
  await assert.rejects(
    user.mutation(api.operations.setStockVisibility, {
      operationId: 'stale',
      itemIds: [ids[1], ids[0]],
      hidden: true,
    }),
    /ITEM_UNAVAILABLE/,
  );
  assert.equal((await t.run((ctx) => ctx.db.get(ids[1])))?.hiddenFromCatalogue, undefined);
  await user.mutation(api.operations.cancelSale, {
    operationId: 'cancel',
    saleId: saleId as never,
  });
  const returned = (await user.query(api.operations.stock, {})).find((item) => item._id === ids[0]);
  assert.equal(returned?.hiddenFromCatalogue, true);
  assert.equal((await t.query(api.operations.publicCatalogue, catalogue)).totalCount, 4);
});

test('visibility requires authentication and a bounded unique selection', async () => {
  const { t, user, ids } = await fixture();
  const input = { operationId: 'hide', itemIds: [ids[0]], hidden: true };
  await assert.rejects(t.mutation(api.operations.setStockVisibility, input), /UNAUTHENTICATED/);
  for (const itemIds of [[], [ids[0], ids[0]], Array(501).fill(ids[0])])
    await assert.rejects(
      user.mutation(api.operations.setStockVisibility, { ...input, itemIds }),
      /INVALID_STOCK_SELECTION/,
    );
  // Authenticated colleagues share the company's stock, as for other operations.
  await (await authenticated(t, 'colleague')).mutation(api.operations.setStockVisibility, input);
  assert.equal(
    (await user.query(api.operations.stock, {})).find((item) => item._id === ids[0])
      ?.hiddenFromCatalogue,
    true,
  );
});
