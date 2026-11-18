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

test('visibility bulk endpoint forwards explicit selection and visibility after authentication', async (t) => {
  const input = { operationId: randomUUID(), itemIds: ['first', 'second'], hidden: true };
  const mutation = t.mock.method(ConvexHttpClient.prototype, 'mutation', async (ref, args) => {
    assert.equal(getFunctionName(ref), 'operations:setStockVisibility');
    assert.deepEqual(args, input);
    return { updatedCount: 2 };
  });
  const response = await app().request('/stock/visibility', post(input));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { updatedCount: 2 });
  assert.equal((await app().request('/stock/visibility', post(input, false))).status, 401);
  assert.equal(mutation.mock.callCount(), 1);
});

test('visibility endpoint rejects empty, duplicate, oversized or invalid selections before mutation', async (t) => {
  const mutation = t.mock.method(ConvexHttpClient.prototype, 'mutation', async () =>
    assert.fail('invalid input'),
  );
  const input = { operationId: randomUUID(), itemIds: ['first'], hidden: true };
  for (const invalid of [
    { ...input, itemIds: [] },
    { ...input, itemIds: ['first', 'first'] },
    { ...input, itemIds: Array.from({ length: 501 }, (_, i) => String(i)) },
    { ...input, hidden: 'true' },
  ])
    assert.equal((await app().request('/stock/visibility', post(invalid))).status, 400);
  assert.equal(mutation.mock.callCount(), 0);
});

test('stale visibility selections produce a conflict the interface can explain', async (t) => {
  t.mock.method(ConvexHttpClient.prototype, 'mutation', async () => {
    throw new Error('Server Error ITEM_UNAVAILABLE');
  });
  const response = await app().request(
    '/stock/visibility',
    post({ operationId: randomUUID(), itemIds: ['sold'], hidden: true }),
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'ITEM_UNAVAILABLE' });
});
