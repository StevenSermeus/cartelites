import assert from 'node:assert/strict';
import test from 'node:test';
import { convexTest } from 'convex-test';
import schema from '../functions/schema';
import { api } from '../functions/_generated/api';

const modules = { './functions/operations.ts': () => import('../functions/operations') };

test('public catalogue filters before pagination and reports matching total', async () => {
  const t = convexTest(schema, modules);
  const purchaseId = await t.run(async (ctx) => ctx.db.insert('purchases', {
    ownerId: 'owner', operationId: 'op', operationDigest: 'digest', sellerId: await ctx.db.insert('sellers', {
      ownerId: 'owner', operationId: 'seller', operationDigest: 'digest', name: 'Seller', createdAt: 1,
    }), occurredAt: 1, reference: 'P-1', status: 'active', createdAt: 1,
  }));
  await t.run(async (ctx) => {
    for (let i = 0; i < 15; i++) await ctx.db.insert('items', {
      ownerId: 'owner', operationId: `item-${i}`, purchaseId, purchaseOccurredAt: 1,
      name: `Card ${i}`, purchasePriceCents: 100, askingPriceCents: 200,
      vatRegime: 'margin', status: 'available', createdAt: i,
      ...(i < 3 ? { gradingCompany: 'PSA' as const } : {}),
    });
  });

  const first = await t.query(api.operations.publicCatalogue, {
    paginationOpts: { numItems: 12, cursor: null }, search: '', gradingStatus: 'ungraded',
    gradingCompany: '', gradingGrade: '',
  });
  assert.equal(first.page.length, 12);
  assert.equal(first.totalCount, 12);
  assert.equal(first.isDone, true);

  const secondPage = await t.query(api.operations.publicCatalogue, {
    paginationOpts: { numItems: 2, cursor: null }, search: '', gradingStatus: 'all',
    gradingCompany: '', gradingGrade: '',
  });
  assert.equal(secondPage.page.length, 2);
  assert.equal(secondPage.totalCount, 15);
  assert.equal(secondPage.isDone, false);
  const lastPage = await t.query(api.operations.publicCatalogue, {
    paginationOpts: { numItems: 2, cursor: secondPage.continueCursor }, search: '', gradingStatus: 'all',
    gradingCompany: '', gradingGrade: '',
  });
  assert.equal(lastPage.page.length, 2);
  assert.equal(lastPage.isDone, false);
});
