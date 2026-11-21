import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import test from 'node:test';
import { ConvexHttpClient } from 'convex/browser';
import { getFunctionName } from 'convex/server';
import type { ConvexAccountRepository } from '../src/db/accountRepository.js';

// Ephemeral test keys: exercise the real auth middleware without external services.
const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
Object.assign(process.env, {
  CONVEX_URL: 'https://example.convex.cloud',
  CONVEX_AUTH_SECRET: 'x'.repeat(32),
  R2_ENDPOINT: 'https://storage.example.test',
  R2_BUCKET: 'test',
  R2_ACCESS_KEY_ID: 'test',
  R2_SECRET_ACCESS_KEY: 'test',
  JWT_ISSUER: 'https://api.example.test',
  JWT_AUDIENCE: 'test',
  JWT_PRIVATE_KEY_PEM: keys.privateKey,
  JWT_PUBLIC_KEY_PEM: keys.publicKey,
  WEB_ORIGIN: 'https://example.test',
});
const { operationRoutes } = await import('../src/routes/operations.js');
const { issueToken } = await import('../src/auth/tokens.js');
const token = await issueToken('employee');
const app = () =>
  operationRoutes({ isSessionValid: async () => true } as unknown as ConvexAccountRepository);
const post = (body: unknown, authenticated = true) => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});

test('supplier, gift and opening routes validate quantities before authenticated mutations', async (t) => {
  const calls: string[] = [];
  t.mock.method(ConvexHttpClient.prototype, 'mutation', async (ref, args) => {
    calls.push(getFunctionName(ref));
    return 'id';
  });
  const body = {
    operationId: randomUUID(),
    supplier: 'Distribution',
    reference: 'F-1',
    occurredAt: 1000,
    lines: [
      {
        product: {
          name: 'Booster',
          productType: 'sealed',
          format: 'booster',
          askingPriceCents: 600,
          taxRateBps: 2100,
        },
        quantity: 36,
        unitCostCents: 300,
      },
    ],
  };
  assert.equal((await app().request('/supplier-receipts', post(body, false))).status, 401);
  assert.equal((await app().request('/supplier-receipts', post(body))).status, 201);
  assert.equal(
    (
      await app().request(
        '/supplier-receipts',
        post({ ...body, lines: [{ ...body.lines[0], quantity: 0 }] }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await app().request(
        '/stock/donate',
        post({
          operationId: randomUUID(),
          itemId: 'x',
          quantity: 1,
          occurredAt: 1000,
          reason: 'Concours',
        }),
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await app().request(
        '/stock/open',
        post({
          operationId: randomUUID(),
          itemId: 'x',
          targetId: 'y',
          quantity: 1,
          packSize: 0,
          occurredAt: 1000,
        }),
      )
    ).status,
    400,
  );
  assert.deepEqual(calls, ['inventory:receive', 'inventory:donate']);
});
test('quantity remains explicit in the unified sales API', async (t) => {
  t.mock.method(ConvexHttpClient.prototype, 'mutation', async (ref, args) => {
    assert.equal(getFunctionName(ref), 'operations:createSales');
    assert.equal(args.items[0].quantity, 3);
    assert.equal(args.items[0].salePriceCents, 1800);
    return { ids: ['sale'] };
  });
  assert.equal(
    (
      await app().request(
        '/sales/bulk',
        post({
          operationId: randomUUID(),
          occurredAt: 1000,
          items: [{ itemId: 'booster', quantity: 3, salePriceCents: 1800 }],
        }),
      )
    ).status,
    201,
  );
});
test('gift export reads preserve dates and cursor and require authentication', async (t) => {
  t.mock.method(ConvexHttpClient.prototype, 'query', async (ref, args) => {
    assert.equal(getFunctionName(ref), 'inventory:gifts');
    assert.deepEqual(args, { from: 0, to: 2000, paginationOpts: { numItems: 50, cursor: 'next' } });
    return { page: [], isDone: true };
  });
  assert.equal(
    (
      await app().request('/gifts?from=0&to=2000&cursor=next', {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
    200,
  );
  assert.equal((await app().request('/gifts?from=0&to=2000')).status, 401);
});

test('product editing validates fields and refuses stock or accounting changes', async (t) => {
  const calls: string[] = [];
  t.mock.method(ConvexHttpClient.prototype, 'mutation', async (ref, args) => {
    assert.equal(args.tcg, 'riftbound');
    calls.push(getFunctionName(ref));
    return { id: 'item' };
  });
  const body = {
    itemId: 'item',
    tcg: 'riftbound',
    name: 'Display',
    description: '',
    series: '',
    identifier: '',
    askingPriceCents: 14000,
    hiddenFromCatalogue: false,
    gradingGrade: '',
    gradingCertificate: '',
  };
  assert.equal((await app().request('/stock/product', post(body, false))).status, 401);
  assert.equal((await app().request('/stock/product', post(body))).status, 201);
  for (const invalid of [
    { ...body, name: '' },
    { ...body, askingPriceCents: -1 },
    { ...body, quantity: 500 },
    { ...body, taxRateBps: 0 },
  ]) {
    assert.equal((await app().request('/stock/product', post(invalid))).status, 400);
  }
  assert.deepEqual(calls, ['inventory:updateProduct']);
});

test('supplier API preserves other universe and Chinese language', async (t) => {
  let received: any;
  t.mock.method(ConvexHttpClient.prototype, 'mutation', async (_ref, args) => { received = args; return { id: 'receipt' }; });
  const product = { name: 'Autre display chinois', productType: 'sealed', format: 'display', tcg: 'other', language: 'zh', askingPriceCents: 10000, taxRateBps: 2100 };
  const body = { operationId: randomUUID(), supplier: 'Fournisseur', reference: 'F-CH', occurredAt: 1000, lines: [{ product, quantity: 1, unitCostCents: 5000 }] };
  assert.equal((await app().request('/supplier-receipts', post(body))).status, 201);
  assert.equal(received.lines[0].product.tcg, 'other');
  assert.equal(received.lines[0].product.language, 'zh');
  assert.equal((await app().request('/supplier-receipts', post({ ...body, lines: [{ ...body.lines[0], product: { ...product, language: 'invalid' } }] }))).status, 400);
});

test('purchase editing requires authentication and preserves card values and removal selection', async (t) => {
  let received: any;
  t.mock.method(ConvexHttpClient.prototype, 'mutation', async (ref, args) => { assert.equal(getFunctionName(ref), 'purchaseEditing:save'); received = args; return { itemIds: ['item'] }; });
  const body = { operationId: randomUUID(), expectedDigest: 'snapshot', removedIds: ['old'], items: [{ operationId: randomUUID(), itemId: 'item', name: 'Carte', marketValueCents: 10000, discountPercent: 75 }] };
  assert.equal((await app().request('/purchases/purchase/edit', post(body, false))).status, 401);
  assert.equal((await app().request('/purchases/purchase/edit', post(body))).status, 200);
  assert.equal(received.purchaseId, 'purchase'); assert.equal(received.items[0].discountPercent, 75);
  assert.deepEqual(received.removedIds, ['old']);
  assert.equal((await app().request('/purchases/purchase/edit', post({ ...body, items: [{ ...body.items[0], discountPercent: 110 }] }))).status, 400);
});
