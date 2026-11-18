import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { OpenAPIHono } from '@hono/zod-openapi';
import { ConvexHttpClient } from 'convex/browser';
import { getFunctionName } from 'convex/server';
import type { Variables } from '../src/auth/middleware.js';

// The route is exercised with a mocked Convex transport, without a live deployment.
Object.assign(process.env, {
  CONVEX_URL: 'https://example.convex.cloud',
  CONVEX_AUTH_SECRET: 'x'.repeat(32),
  R2_ENDPOINT: 'https://storage.example.test',
  R2_BUCKET: 'test',
  R2_ACCESS_KEY_ID: 'test',
  R2_SECRET_ACCESS_KEY: 'test',
  JWT_ISSUER: 'https://api.example.test',
  JWT_AUDIENCE: 'test',
  JWT_PRIVATE_KEY_PEM: 'unused',
  JWT_PUBLIC_KEY_PEM: 'unused',
  WEB_ORIGIN: 'https://example.test',
});
const { registerConsignmentRoutes } = await import('../src/routes/consignments.js');
function app() {
  const instance = new OpenAPIHono<{ Variables: Variables }>();
  instance.use('*', async (c, next) => {
    c.set('accessToken', 'test');
    await next();
  });
  registerConsignmentRoutes(instance);
  return instance;
}
const post = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const deposit = () => ({
  operationId: randomUUID(),
  sellerId: 'seller',
  occurredAt: 1000,
  reference: 'DEP-1',
  items: [
    {
      operationId: randomUUID(),
      name: 'Display scellé',
      productType: 'sealed',
      askingPriceCents: 10000,
    },
  ],
});

test('deposit route forwards a free-form sealed item and defaults to 30% without a purchase', async (t) => {
  let forwarded: Record<string, unknown> | undefined;
  t.mock.method(ConvexHttpClient.prototype, 'mutation', async (ref, args) => {
    assert.equal(getFunctionName(ref), 'operations:createConsignment');
    forwarded = args;
    return { consignmentId: 'deposit', itemIds: ['item'] };
  });
  const response = await app().request('/consignments', post(deposit()));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { consignmentId: 'deposit', itemIds: ['item'] });
  assert.ok(forwarded);
  const item = (forwarded.items as Record<string, unknown>[])[0];
  assert.equal(item.commissionRateBps, 3000);
  assert.equal(item.productType, 'sealed');
  assert.equal(item.purchasePriceCents, undefined);
  assert.equal(item.condition, undefined);
});

test('invalid deposit terms fail HTTP validation before a mutation', async (t) => {
  const mutation = t.mock.method(ConvexHttpClient.prototype, 'mutation', async () =>
    assert.fail('must not mutate'),
  );
  const base = deposit();
  for (const invalid of [
    { ...base, dueAt: 999 },
    { ...base, items: [] },
    { ...base, items: [base.items[0], base.items[0]] },
    { ...base, items: [{ ...base.items[0], commissionRateBps: 10001 }] },
    { ...base, items: [{ ...base.items[0], commissionRateBps: 30.5 }] },
    { ...base, items: [{ ...base.items[0], askingPriceCents: -1 }] },
    { ...base, items: [{ ...base.items[0], askingPriceCents: 99.5 }] },
  ])
    assert.equal((await app().request('/consignments', post(invalid))).status, 400);
  assert.equal(mutation.mock.callCount(), 0);
});

test('payment, restitution and amended agreement forward their complete contracts', async (t) => {
  const seen: { name: string; args: unknown }[] = [];
  t.mock.method(ConvexHttpClient.prototype, 'mutation', async (ref, args) => {
    seen.push({ name: getFunctionName(ref), args });
    return 'result-id';
  });
  const cases = [
    [
      '/consignments/payments',
      'recordConsignmentPayment',
      {
        operationId: randomUUID(),
        sellerId: 'seller',
        amountCents: 3500,
        occurredAt: 2000,
        method: 'Virement',
        reference: 'PAY-1',
      },
      201,
    ],
    [
      '/consignments/return',
      'returnConsignmentItem',
      { operationId: randomUUID(), itemId: 'item', occurredAt: 3000 },
      200,
    ],
    [
      '/consignments/terms',
      'updateConsignmentTerms',
      {
        operationId: randomUUID(),
        itemId: 'item',
        askingPriceCents: 9000,
        commissionRateBps: 2500,
        authorizationNote: 'Accord du déposant par e-mail',
      },
      200,
    ],
  ] as const;
  for (const [path, name, payload, status] of cases) {
    const response = await app().request(path, post(payload));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { id: 'result-id' });
    assert.deepEqual(seen.at(-1), { name: `operations:${name}`, args: payload });
  }
  assert.equal(
    (await app().request('/consignments/payments', post({ ...cases[0][2], amountCents: 0 })))
      .status,
    400,
  );
  assert.equal(
    (await app().request('/consignments/terms', post({ ...cases[2][2], authorizationNote: ' ' })))
      .status,
    400,
  );
  assert.equal(seen.length, 3);
});

test('history and balances routes expose the backend result without changing cent amounts', async (t) => {
  t.mock.method(ConvexHttpClient.prototype, 'query', async (ref) => {
    return getFunctionName(ref) === 'operations:consignmentHistory'
      ? [{ _id: 'deposit', items: [] }]
      : { balances: [{ sellerId: 'seller', balanceCents: -7000 }], payments: [] };
  });
  assert.deepEqual(await (await app().request('/consignments')).json(), [
    { _id: 'deposit', items: [] },
  ]);
  assert.deepEqual(await (await app().request('/consignments/balances')).json(), {
    balances: [{ sellerId: 'seller', balanceCents: -7000 }],
    payments: [],
  });
});

test('receipt identity supplies deployment branding to mobile without private configuration', async () => {
  const response = await app().request('/receipt-identity');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const identity = await response.json();
  assert.ok(identity.brand.name);
  assert.ok(identity.legal.companyName);
  assert.ok(identity.logo.jpegHex.startsWith('ffd8'));
  assert.equal(identity.legal.legalBases, undefined);
  assert.equal(identity.signatory, undefined);
});
