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

test('payment routes require authentication before recording cash or bank receipts', async (t) => {
  const mutation = t.mock.method(ConvexHttpClient.prototype, 'mutation', async () =>
    assert.fail('Unauthenticated mutation'),
  );
  const response = await app().request(
    '/sales/payment',
    post(
      {
        operationId: randomUUID(),
        saleId: 'sale',
        cashCents: 10000,
        transferCents: 0,
        receivedAt: 1000,
      },
      false,
    ),
  );
  assert.equal(response.status, 401);
  assert.equal(mutation.mock.callCount(), 0);
});

test('mixed basket forwards payment breakdown once to the atomic backend mutation', async (t) => {
  const body = {
    operationId: randomUUID(),
    occurredAt: 1000,
    items: [
      { itemId: 'first', salePriceCents: 8000 },
      { itemId: 'second', salePriceCents: 2000 },
    ],
    paymentStatus: 'received',
    payment: { cashCents: 4000, transferCents: 6000, receivedAt: 2000, reference: 'VIR-42' },
  };
  t.mock.method(ConvexHttpClient.prototype, 'mutation', async (ref, args) => {
    assert.equal(getFunctionName(ref), 'operations:createSales');
    assert.deepEqual(args, body);
    return { ids: ['one', 'two'] };
  });
  const response = await app().request('/sales/bulk', post(body));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ids: ['one', 'two'] });
});

test('recording a later receipt forwards date and reference, and rejects negative amounts', async (t) => {
  const body = {
    operationId: randomUUID(),
    saleId: 'sale',
    cashCents: 0,
    transferCents: 10000,
    receivedAt: 2000,
    reference: 'BANK',
  };
  const mutation = t.mock.method(ConvexHttpClient.prototype, 'mutation', async (ref, args) => {
    assert.equal(getFunctionName(ref), 'operations:recordSalePayment');
    assert.deepEqual(args, body);
    return 'sale';
  });
  assert.equal((await app().request('/sales/payment', post(body))).status, 200);
  assert.equal(
    (await app().request('/sales/payment', post({ ...body, cashCents: -1 }))).status,
    400,
  );
  assert.equal(mutation.mock.callCount(), 1);
});

test('payment business errors preserve machine-readable codes for the interfaces', async (t) => {
  t.mock.method(ConvexHttpClient.prototype, 'mutation', async () => {
    throw new Error('[Request ID] Server Error INVALID_SALE_PAYMENT');
  });
  const response = await app().request(
    '/sales/payment',
    post({
      operationId: randomUUID(),
      saleId: 'sale',
      cashCents: 100,
      transferCents: 0,
      receivedAt: 1000,
    }),
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'INVALID_SALE_PAYMENT' });
});
