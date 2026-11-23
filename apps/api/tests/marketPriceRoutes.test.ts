import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import test from 'node:test';
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
// Block external transport; this file verifies route auth/rate/validation only.
globalThis.fetch = async () => new Response('Blocked', {status:403});
const { marketPriceRoutes } = await import('../src/routes/marketPrices.js');
const { issueToken } = await import('../src/auth/tokens.js');
const token = await issueToken('employee');

test('market research requires a valid live session and rejects unbounded/provider-controlled inputs', async () => {
  let valid = true;
  const app = marketPriceRoutes({ isSessionValid: async () => valid } as unknown as ConvexAccountRepository);
  const path = '/market-prices?source=cardmarket&mode=active&query=Pikachu';
  assert.equal((await app.request(path)).status, 401);
  const headers = { Authorization: `Bearer ${token}` };
  const allowed = await app.request(path, { headers });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('cache-control'), 'private, no-store');
  assert.equal((await allowed.json()).status, 'access_required');
  for (const suffix of ['&page=101', '&url=https://private.invalid', '&source=unknown', '&apiKey=secret']) {
    assert.equal((await app.request(path + suffix, { headers })).status, 400);
  }
  valid = false;
  assert.equal((await app.request(path, { headers })).status, 401);
});

test('market research limits each authenticated account before provider invocation', async () => {
  const app = marketPriceRoutes({ isSessionValid: async () => true } as unknown as ConvexAccountRepository);
  const headers = { Authorization: `Bearer ${token}` };
  for (let i = 0; i < 30; i++) assert.equal((await app.request('/market-prices?source=cardmarket&mode=active&query=Pikachu', { headers })).status, 200);
  const limited = await app.request('/market-prices?source=gcc&query=Pikachu', { headers });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
});

test('cookie navigation cannot initiate external research without application origin and custom header', async () => {
 const app=marketPriceRoutes({isSessionValid:async()=>true} as unknown as ConvexAccountRepository);
 const path='/market-prices?source=ebay_fr&query=Pikachu';
 const Cookie=`session=${token}`;
 assert.equal((await app.request(path,{headers:{Cookie}})).status,403);
 assert.equal((await app.request(path,{headers:{Cookie,Origin:'https://evil.invalid','X-Market-Research':'1'}})).status,403);
 assert.equal((await app.request(path,{headers:{Cookie,Origin:'https://example.test','X-Market-Research':'1'}})).status,200);
 assert.equal((await app.request(path,{headers:{Cookie,'Sec-Fetch-Site':'same-origin','X-Market-Research':'1'}})).status,200);
 assert.equal((await app.request(path,{headers:{Cookie,'Sec-Fetch-Site':'cross-site','X-Market-Research':'1'}})).status,403);
});
