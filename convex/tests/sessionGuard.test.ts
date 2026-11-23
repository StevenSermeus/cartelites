import test from 'node:test';
import assert from 'node:assert/strict';
import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import schema from '../functions/schema';
import { api, internal } from '../functions/_generated/api';
import { authenticated } from './helpers/session';
const modules = {
  './functions/operations.ts': () => import('../functions/operations'),
  './functions/auth.ts': () => import('../functions/auth'),
  './functions/inventory.ts': () => import('../functions/inventory'),
  './functions/purchaseEditing.ts': () => import('../functions/purchaseEditing'),
  './functions/saleTickets.ts': () => import('../functions/saleTickets'),
  './functions/workspaceReads.ts': () => import('../functions/workspaceReads'),
  './functions/gradingCompanies.ts': () => import('../functions/gradingCompanies'),
  './functions/consignmentOperations.ts': () => import('../functions/consignmentOperations'),
  './functions/consignmentDocuments.ts': () => import('../functions/consignmentDocuments'),
  './functions/readModels.ts': () => import('../functions/readModels'),
  './functions/_generated/server.js': () => import('../functions/_generated/server.js'),
};
async function fixture() {
  const t = convexTest(schema, modules),
    user = await authenticated(t);
  const sellerId = await user.mutation(api.operations.createSeller, {
    operationId: 'seed',
    name: 'QA',
  });
  const purchase = await user.mutation(api.operations.createPurchase, {
    operationId: 'purchase',
    sellerId,
    reference: 'QA',
    occurredAt: 1,
    items: [{ operationId: 'card', name: 'QA', purchasePriceCents: 100, vatRegime: 'margin' }],
  });
  return { t, user, sellerId, purchase };
}
function calls(f: Awaited<ReturnType<typeof fixture>>) {
  return {
    reads: [
      ['operations:sellerHistory', {}],
      ['operations:stock', {}],
      ['inventory:detail', { itemId: f.purchase.itemIds[0] }],
      ['purchaseEditing:detail', { purchaseId: f.purchase.purchaseId }],
      ['saleTickets:list', { saleId: '123;sales' }],
      ['workspaceReads:products', { paginationOpts: { numItems: 10, cursor: null } }],
      ['gradingCompanies:list', {}],
      ['consignmentOperations:consignmentHistory', {}],
      ['consignmentDocuments:list', { sellerId: f.sellerId }],
      ['readModels:browse', { resource: 'stock' }],
    ] as const,
    writes: [
      ['operations:createSeller', { operationId: 'forbidden', name: 'Forbidden' }],
      [
        'inventory:receive',
        { operationId: 'forbidden', supplier: 'QA', reference: 'QA', occurredAt: 1, lines: [] },
      ],
      [
        'purchaseEditing:save',
        {
          operationId: 'forbidden',
          purchaseId: f.purchase.purchaseId,
          expectedDigest: 'unknown',
          items: [],
          removedIds: [],
        },
      ],
      ['saleTickets:prepare', { operationId: 'forbidden', saleIds: [] }],
      ['gradingCompanies:save', { name: 'Forbidden' }],
      [
        'consignmentOperations:createConsignment',
        {
          operationId: 'forbidden',
          sellerId: f.sellerId,
          reference: 'QA',
          occurredAt: 1,
          items: [],
        },
      ],
      ['consignmentDocuments:createStatement', { operationId: 'forbidden', sellerId: f.sellerId }],
    ] as const,
  };
}
// Generate a real ID without requiring a business sale; deleted IDs still satisfy ID validators.
async function saleId(
  t: Awaited<ReturnType<typeof fixture>>['t'],
  itemId: Awaited<ReturnType<typeof fixture>>['purchase']['itemIds'][number],
) {
  return t.run(async (ctx) => {
    const id = await ctx.db.insert('sales', {
      ownerId: 'fixture',
      operationId: 'identifier',
      operationDigest: '{}',
      itemId,
      occurredAt: 1,
      salePriceCents: 100,
      status: 'active',
      createdAt: 1,
    });
    await ctx.db.delete(id);
    return id;
  });
}
async function assertAllDenied(
  f: Awaited<ReturnType<typeof fixture>>,
  identity: Parameters<typeof f.t.withIdentity>[0],
) {
  const user = f.t.withIdentity(identity),
    paths = calls(f),
    id = await saleId(f.t, f.purchase.itemIds[0]);
  for (const [path, args] of paths.reads)
    await assert.rejects(
      user.query(
        makeFunctionReference<'query'>(path),
        path === 'saleTickets:list' ? { saleId: id } : args,
      ),
      /INVALID_SESSION/,
      path,
    );
  for (const [path, args] of paths.writes)
    await assert.rejects(
      user.mutation(makeFunctionReference<'mutation'>(path), args),
      /INVALID_SESSION/,
      path,
    );
  assert.equal((await f.t.run((ctx) => ctx.db.query('sellers').collect())).length, 1);
}
test('ordinary full-session JWTs are rejected after logout across every guarded read and mutation family', async () => {
  const f = await fixture();
  await f.t.mutation(internal.auth.revokeSession, {
    jti: f.user.sessionJti,
    expiresAt: Date.now() + 60000,
  });
  await assertAllDenied(f, { subject: f.user.accountId, sv: 0, sessionJti: f.user.sessionJti });
});
test('password reset invalidates ordinary and realtime tokens; a fresh session succeeds', async () => {
  const f = await fixture();
  await f.t.run((ctx) =>
    ctx.db.insert('passwordResetTokens', {
      accountId: f.user.accountId,
      tokenHash: 'qa-reset',
      expiresAt: Date.now() + 60000,
    }),
  );
  await f.t.mutation(internal.auth.consumePasswordReset, {
    tokenHash: 'qa-reset',
    passwordHash: 'new-hash',
    now: Date.now(),
  });
  await assertAllDenied(f, { subject: f.user.accountId, sv: 0, sessionJti: f.user.sessionJti });
  await assert.rejects(
    f.t
      .withIdentity({
        subject: f.user.accountId,
        sv: 0,
        sessionJti: f.user.sessionJti,
        scope: 'realtime:read',
      })
      .query(api.readModels.browse, { resource: 'stock' }),
    /INVALID_SESSION/,
  );
  const fresh = f.t.withIdentity({ subject: f.user.accountId, sv: 1, sessionJti: 'fresh-session' });
  assert.equal((await fresh.query(api.operations.sellerHistory, {})).length, 1);
});
test('read-only JWTs can query all private families but cannot perform direct mutations', async () => {
  const f = await fixture(),
    ro = f.t.withIdentity({
      subject: f.user.accountId,
      sv: 0,
      sessionJti: f.user.sessionJti,
      scope: 'realtime:read',
    }),
    id = await saleId(f.t, f.purchase.itemIds[0]);
  for (const [path, args] of calls(f).reads)
    await ro.query(
      makeFunctionReference<'query'>(path),
      path === 'saleTickets:list' ? { saleId: id } : args,
    );
  for (const [path, args] of calls(f).writes)
    await assert.rejects(
      ro.mutation(makeFunctionReference<'mutation'>(path), args),
      /READ_ONLY_TOKEN/,
      path,
    );
});
test('missing account/session identity, stale version and unsupported scope fail closed', async () => {
  const f = await fixture();
  for (const identity of [
    { subject: 'owner', sv: 0, sessionJti: 'fake' },
    { subject: f.user.accountId, sv: 0 },
    { subject: f.user.accountId, sv: 0, jti: 'not-exposed-by-convex' },
    { subject: f.user.accountId, sv: 2, sessionJti: 'wrong-version' },
    { subject: f.user.accountId, sv: -1, sessionJti: 'bad' },
    { subject: f.user.accountId, sv: 0, sessionJti: '', scope: 'custom' },
  ])
    await assert.rejects(
      f.t.withIdentity(identity).query(api.operations.stock, {}),
      /INVALID_SESSION/,
    );
  await f.t.run((ctx) => ctx.db.delete(f.user.accountId));
  await assertAllDenied(f, { subject: f.user.accountId, sv: 0, sessionJti: f.user.sessionJti });
});
test('accounts predating sessionVersion use zero and valid colleagues retain shared shop access', async () => {
  const f = await fixture();
  const legacy = await f.t.run((ctx) =>
    ctx.db.insert('accounts', { email: 'legacy@qa.test', passwordHash: 'hash', createdAt: 1 }),
  );
  const colleague = f.t.withIdentity({ subject: legacy, sv: 0, sessionJti: 'legacy-session' });
  assert.equal((await colleague.query(api.operations.sellerHistory, {})).length, 1);
  await colleague.mutation(api.operations.updateSeller, {
    sellerId: f.sellerId,
    name: 'Shared shop',
    email: '',
    phone: '',
  });
  assert.equal((await f.user.query(api.operations.sellerHistory, {}))[0].name, 'Shared shop');
});

test('elapsed revocation expiry never reactivates renewed JWTs and repeat logout only extends audit expiry', async () => {
  const f = await fixture(),
    identity = { subject: f.user.accountId, sv: 0, sessionJti: f.user.sessionJti };
  await f.t.mutation(internal.auth.revokeSession, { jti: f.user.sessionJti, expiresAt: 1 });
  await assertAllDenied(f, identity);
  assert.equal(
    await f.t.query(internal.auth.sessionIsValid, {
      id: f.user.accountId,
      jti: f.user.sessionJti,
      sessionVersion: 0,
      now: Date.now(),
    }),
    false,
  );
  await f.t.mutation(internal.auth.revokeSession, { jti: f.user.sessionJti, expiresAt: 100 });
  await f.t.mutation(internal.auth.revokeSession, { jti: f.user.sessionJti, expiresAt: 50 });
  const rows = await f.t.run((ctx) => ctx.db.query('revokedSessions').collect());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].expiresAt, 100);
});
