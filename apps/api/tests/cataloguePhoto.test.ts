import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConvexHttpClient } from 'convex/browser';

process.env.PORT ??= '3001';
process.env.CONVEX_URL ??= 'http://127.0.0.1:3210';
process.env.CONVEX_AUTH_SECRET ??= 'x'.repeat(32);
process.env.R2_ENDPOINT ??= 'https://account-id.r2.cloudflarestorage.com';
process.env.R2_BUCKET ??= 'private bucket';
process.env.R2_ACCESS_KEY_ID ??= 'r2-access';
process.env.R2_SECRET_ACCESS_KEY ??= 'r2-secret';
process.env.JWT_ISSUER ??= 'http://127.0.0.1:3001';
process.env.JWT_AUDIENCE ??= 'test';
process.env.JWT_PRIVATE_KEY_PEM ??= 'test';
process.env.JWT_PUBLIC_KEY_PEM ??= 'test';
process.env.WEB_ORIGIN ??= 'http://localhost:5174';

const { catalogueRoutes } = await import('../src/routes/catalogue.js');

test('public photo route checks eligibility even on cache hits and keeps browser caching disabled', async (t) => {
  let permitted = false;
  let contentType = 'image/png';
  let storageReads = 0;
  let permissionChecks = 0;
  let objectKey = 'cards/owner/image';
  t.mock.method(ConvexHttpClient.prototype, 'action', async (_ref, args) => {
    permissionChecks++;
    assert.equal(args.operation, 'cataloguePhotoObject');
    assert.equal(args.secret, process.env.CONVEX_AUTH_SECRET);
    assert.deepEqual(args.payload, { itemId: 'item' });
    return permitted ? { objectKey, contentType } : null;
  });
  t.mock.method(globalThis, 'fetch', async () => {
    storageReads++;
    return new Response(new Uint8Array([1, 2]), { status: 200 });
  });
  const app = catalogueRoutes();
  let response = await app.request('/api/v1/catalogue/item/photo');
  assert.equal(response.status, 404);
  assert.equal(storageReads, 0);
  permitted = true;
  response = await app.request('/api/v1/catalogue/item/photo');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2]);
  response = await app.request('/api/v1/catalogue/item/photo');
  assert.equal(response.status, 200);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2]);
  assert.equal(storageReads, 1, 'cached bytes avoid another R2 request');
  assert.equal(permissionChecks, 3, 'each request checks current visibility');
  permitted = false;
  assert.equal((await app.request('/api/v1/catalogue/item/photo')).status, 404);
  permitted = true;
  contentType = 'application/pdf';
  assert.equal((await app.request('/api/v1/catalogue/item/photo')).status, 404);
  assert.equal(storageReads, 1);
  contentType = 'image/png';
  objectKey = 'cards/owner/replacement';
  assert.equal((await app.request('/api/v1/catalogue/item/photo')).status, 200);
  assert.equal(storageReads, 2, 'replacement photo gets its own cache entry');
});
