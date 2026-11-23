import { authenticated } from './helpers/session';
import assert from 'node:assert/strict';
import test from 'node:test';
import { convexTest } from 'convex-test';
import schema from '../functions/schema';
import { api } from '../functions/_generated/api';
const modules = {
  './functions/operations.ts': () => import('../functions/operations'),
  './functions/_generated/server.js': () => import('../functions/_generated/server.js'),
};
const base = { page: 1, size: 3, search: '', status: 'all' as const };
test('history authenticates, searches and filters before server pagination', async () => {
  const t = convexTest(schema, modules),
    user = (await authenticated(t, 'owner'));
  await assert.rejects(t.query(api.operations.purchaseHistoryPage, base), /UNAUTHENTICATED/);
  await t.run(async (ctx) => {
    const sellerId = await ctx.db.insert('sellers', {
      ownerId: 'owner',
      operationId: 's',
      operationDigest: 's',
      name: 'Élodie Martin',
      createdAt: 1,
    });
    for (let i = 0; i < 13; i++) {
      const purchaseId = await ctx.db.insert('purchases', {
        ownerId: 'owner',
        operationId: `p${i}`,
        operationDigest: `p${i}`,
        sellerId,
        reference: `R-${String(i).padStart(2, '0')}`,
        occurredAt: 1000 + i,
        status: i % 2 ? 'active' : 'pending',
        createdAt: 1,
      });
      await ctx.db.insert('items', {
        ownerId: 'owner',
        operationId: `i${i}`,
        purchaseId,
        purchaseOccurredAt: 1000 + i,
        name: `Card ${i}`,
        purchasePriceCents: 100,
        vatRegime: 'margin',
        status: 'available',
        createdAt: 1,
      });
    }
  });
  const first = await user.query(api.operations.purchaseHistoryPage, base);
  assert.equal(first.totalCount, 13);
  assert.equal(first.totalPages, 5);
  assert.equal(first.rows.length, 3);
  assert.equal(first.rows[0].reference, 'R-12');
  const second = await user.query(api.operations.purchaseHistoryPage, { ...base, page: 2 });
  assert.equal(second.rows[0].reference, 'R-09');
  assert.equal(new Set([...first.rows, ...second.rows].map((p) => p._id)).size, 6);
  const filtered = await user.query(api.operations.purchaseHistoryPage, {
    ...base,
    status: 'active',
    search: 'elodie',
    from: 1003,
    to: 1009,
  });
  assert.equal(filtered.totalCount, 4);
  assert.equal(filtered.totalPages, 2);
  assert.deepEqual(
    filtered.rows.map((p) => p.reference),
    ['R-09', 'R-07', 'R-05'],
  );
  assert.equal(filtered.rows[0].items.length, 1);
  const exact = await user.query(api.operations.purchaseHistoryPage, {
    ...base,
    search: 'R-04 martin',
  });
  assert.equal(exact.totalCount, 1);
  assert.equal(exact.rows[0].reference, 'R-04');
  const empty = await user.query(api.operations.purchaseHistoryPage, {
    ...base,
    search: 'absent',
    page: 99,
  });
  assert.equal(empty.totalCount, 0);
  assert.equal(empty.page, 1);
  assert.deepEqual(empty.rows, []);
  const last = await user.query(api.operations.purchaseHistoryPage, { ...base, page: 99 });
  assert.equal(last.page, 5);
  assert.equal(last.rows.length, 1);
  for (const bad of [{ page: 0 }, { size: 51 }, { page: 1.5 }, { from: 20, to: 10 }])
    await assert.rejects(user.query(api.operations.purchaseHistoryPage, { ...base, ...bad }));
});
