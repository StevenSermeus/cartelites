import { authenticated } from './helpers/session';
import assert from 'node:assert/strict';
import test from 'node:test';
import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import schema from '../functions/schema';
const modules = {
  './functions/readModels.ts': () => import('../functions/readModels'),
  './functions/_generated/server.js': () => import('../functions/_generated/server.js'),
};
const browse = makeFunctionReference<'query'>('readModels:browse');
const record = makeFunctionReference<'query'>('readModels:record');
const dashboard = makeFunctionReference<'query'>('readModels:dashboardSummary');
test('bounded client reads authenticate, continue without duplicates and search legacy records', async () => {
  const t = convexTest(schema, modules), user = (await authenticated(t, 'staff'));
  await assert.rejects(t.query(browse, { resource: 'sellers', size: 2 }), /UNAUTHENTICATED/);
  await t.run(async ctx => {
    for (let i = 0; i < 7; i++) await ctx.db.insert('sellers', { name: i === 0 ? 'Élodie Martin' : `Client ${i}`, email: `client${i}@example.test`, phone: `047000000${i}`, ownerId: 'another-staff', operationId: String(i), operationDigest: '', createdAt: i });
  });
  let cursor: string | undefined, seen: string[] = [];
  do {
    const result = await user.query(browse, { resource: 'sellers', size: 2, ...(cursor ? { cursor } : {}) });
    assert.ok(result.items.length <= 2);
    seen.push(...result.items.map((r: { _id: string }) => r._id));
    cursor = result.nextCursor ?? undefined;
  } while (cursor);
  assert.equal(seen.length, 7); assert.equal(new Set(seen).size, 7);
  let found: { name: string }[] = []; cursor = undefined;
  do {
    const result = await user.query(browse, { resource: 'sellers', size: 2, search: 'elodie martin', ...(cursor ? { cursor } : {}) });
    found.push(...result.items); cursor = result.nextCursor ?? undefined;
  } while (cursor);
  assert.equal(found.length, 1); assert.equal(found[0].name, 'Élodie Martin');
  const first = await user.query(browse, { resource: 'sellers', size: 2 });
  await assert.rejects(user.query(browse, { resource: 'sellers', size: 3, cursor: first.nextCursor }), /INVALID_CURSOR/);
  await assert.rejects(user.query(browse, { resource: 'sellers', size: 51 }), /INVALID_PAGINATION/);
  assert.equal(await user.query(record, { resource: 'stock', id: seen[0] }), null);
});
test('full-scope aggregates preserve pending collections, legacy deposits and negative balances', async () => {
  const t = convexTest(schema, modules), user = (await authenticated(t, 'staff'));
  const sellerId = await t.run(async ctx => {
    const sellerId = await ctx.db.insert('sellers', { name: 'Déposant', ownerId: 'staff', operationId: 'seller', operationDigest: '', createdAt: 1 });
    const consignmentId = await ctx.db.insert('consignments', { sellerId, reference: 'D1', ownerId: 'staff', operationId: 'deposit', operationDigest: '', occurredAt: Date.now(), createdAt: 1 });
    const itemId = await ctx.db.insert('items', { consignmentId, origin: 'consignment', ownerId: 'staff', operationId: 'item', purchaseOccurredAt: Date.now(), name: 'Carte', vatRegime: 'other', status: 'sold', createdAt: 1 });
    for (const [id, paymentStatus] of [['pending', 'pending'], ['legacy', undefined]] as const) await ctx.db.insert('sales', { itemId, consignmentId, sellerId, origin: 'consignment', ownerId: 'staff', operationId: id, operationDigest: '', occurredAt: Date.now(), salePriceCents: 10000, commissionCents: 3000, depositorAmountCents: 7000, paymentStatus, status: 'active', createdAt: 1 });
    await ctx.db.insert('consignmentPayments', { sellerId, ownerId: 'staff', operationId: 'paid', operationDigest: '', amountCents: 8000, occurredAt: Date.now(), method: 'cash', createdAt: 1 });
    return sellerId;
  });
  const balance = await user.query(record, { resource: 'balances', id: sellerId });
  assert.equal(balance.earnedCents, 7000); assert.equal(balance.paidCents, 8000); assert.equal(balance.balanceCents, -1000);
  const { summary, days } = await user.query(dashboard, {});
  assert.equal(summary.pendingCents, 10000); assert.equal(summary.unknownCents, 10000);
  assert.equal(summary.salesCents, 0); assert.equal(summary.regularizationCents, 1000);
  assert.equal(summary.commissions, 6000); assert.equal(days.length, 1);
});

test('dashboard distributions reconcile games, origins and received sales', async () => {
  const t = convexTest(schema, modules), user = (await authenticated(t, 'staff'));
  await t.run(async ctx => {
    const sellerId = await ctx.db.insert('sellers', { name: 'Source', ownerId: 'staff', operationId: 's', operationDigest: '', createdAt: 1 });
    const purchaseId = await ctx.db.insert('purchases', { sellerId, reference: 'P1', ownerId: 'staff', operationId: 'p', operationDigest: '', occurredAt: Date.now(), createdAt: 1, status: 'active' });
    const consignmentId = await ctx.db.insert('consignments', { sellerId, reference: 'D2', ownerId: 'staff', operationId: 'd', operationDigest: '', occurredAt: Date.now(), createdAt: 1 });
    const base = { ownerId: 'staff', purchaseOccurredAt: Date.now(), name: 'Article', vatRegime: 'margin' as const, createdAt: 1 };
    await ctx.db.insert('items', { ...base, purchaseId, operationId: 'legacy', status: 'available', hiddenFromCatalogue: true });
    await ctx.db.insert('items', { ...base, purchaseId, productType: 'other', operationId: 'other', status: 'available' });
    await ctx.db.insert('items', { ...base, consignmentId, tcg: 'riftbound', operationId: 'deposit-stock', status: 'available' });
    const bought = await ctx.db.insert('items', { ...base, purchaseId, tcg: 'pokemon', purchasePriceCents: 400, operationId: 'sold', status: 'sold' });
    const deposited = await ctx.db.insert('items', { ...base, consignmentId, origin: 'consignment', tcg: 'riftbound', operationId: 'sold-deposit', status: 'sold' });
    const saleBase = { ownerId: 'staff', operationDigest: '', occurredAt: Date.now(), createdAt: 1, status: 'active' as const };
    await ctx.db.insert('sales', { ...saleBase, itemId: bought, operationId: 'received', salePriceCents: 1000, paymentStatus: 'received', payment: { cashCents: 1000, transferCents: 0, receivedAt: Date.now() } });
    await ctx.db.insert('sales', { ...saleBase, itemId: bought, operationId: 'loss', salePriceCents: 200, paymentStatus: 'pending' });
    await ctx.db.insert('sales', { ...saleBase, itemId: deposited, consignmentId, sellerId, origin: 'consignment', commissionCents: 300, depositorAmountCents: 700, operationId: 'commission', salePriceCents: 1000, paymentStatus: 'pending' });
    await ctx.db.insert('sales', { ...saleBase, itemId: bought, operationId: 'cancelled', salePriceCents: 99999, status: 'cancelled' });
  });
  const result = await user.query(dashboard, {});
  assert.deepEqual(result.byTcg.map((row: { stockCount: number }) => row.stockCount), [1, 1, 1]);
  assert.deepEqual(result.byTcg.map((row: { marginCents: number }) => row.marginCents), [400, 300, 0]);
  assert.deepEqual(result.byOrigin.map((row: { stockCount: number }) => row.stockCount), [2, 1]);
  assert.deepEqual(result.byOrigin.map((row: { marginCents: number }) => row.marginCents), [400, 300]);
  assert.equal(result.summary.net, 700);
  assert.equal(result.days.reduce((sum: number, day: { sales: number }) => sum + day.sales, 0), 1000);
  assert.equal(result.summary.salesCents, 1000);
});

test('stock product filters include legacy cards, exclude other types and bind pagination cursors', async () => {
  const t = convexTest(schema, modules), user = (await authenticated(t, 'staff'));
  await t.run(async ctx => {
    const sellerId = await ctx.db.insert('sellers', {name:'Client',ownerId:'staff',operationId:'s',operationDigest:'',createdAt:1});
    const purchaseId = await ctx.db.insert('purchases', {sellerId,reference:'P',ownerId:'staff',operationId:'p',operationDigest:'',occurredAt:1,createdAt:1,status:'active'});
    for (const [name, productType, gradingCompany] of [['legacy', undefined, undefined], ['card', 'card', undefined], ['graded', 'card', 'PSA'], ['sealed', 'sealed', undefined], ['other', 'other', undefined]] as const) {
      await ctx.db.insert('items', {name,productType,gradingCompany,purchaseId,ownerId:'staff',operationId:name,purchaseOccurredAt:1,vatRegime:'margin',status:'available',createdAt:1});
    }
  });
  const collect = async (productType: string, gradingStatus = 'all') => {
    let cursor: string | undefined; const names: string[] = [];
    do {
      const page = await user.query(browse, {resource:'stock',size:2,productType,gradingStatus,...(cursor ? {cursor} : {})});
      names.push(...page.items.map((item: {name:string})=>item.name)); cursor=page.nextCursor ?? undefined;
    } while (cursor);
    return names.sort();
  };
  assert.deepEqual(await collect('card'), ['card','graded','legacy']);
  assert.deepEqual(await collect('card','graded'), ['graded']);
  assert.deepEqual(await collect('sealed'), ['sealed']);
  assert.deepEqual(await collect('other'), ['other']);
  assert.equal((await collect('all')).length,5);
  const first = await user.query(browse,{resource:'stock',size:2,productType:'card'});
  await assert.rejects(user.query(browse,{resource:'stock',size:2,productType:'sealed',cursor:first.nextCursor}), /INVALID_CURSOR/);
  await assert.rejects(user.query(browse,{resource:'stock',productType:'invalid'}));
});
