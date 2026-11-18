import assert from 'node:assert/strict';
import { test } from 'node:test';

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

test('R2 requests use path-style bucket keys and AWS region auto signing scope', async () => {
  const { requestR2 } = await import('../src/storage/r2.js');
  const originalFetch = globalThis.fetch;
  let captured: { url: URL; init: RequestInit } | undefined;
  globalThis.fetch = (async (input, init) => {
    captured = { url: new URL(String(input)), init: init ?? {} };
    return new Response('ok', { status: 200 });
  }) as typeof fetch;

  try {
    const response = await requestR2('PUT', 'owner/id with space/file!.jpg', new Uint8Array([1, 2]), 'image/jpeg');
    assert.equal(response.status, 200);
    assert.equal(captured?.url.href, 'https://account-id.r2.cloudflarestorage.com/private%20bucket/owner/id%20with%20space/file%21.jpg');
    const headers = new Headers(captured?.init.headers);
    assert.equal(captured?.init.method, 'PUT');
    assert.match(headers.get('authorization') ?? '', /Credential=r2-access\/\d{8}\/auto\/s3\/aws4_request/);
    assert.match(headers.get('authorization') ?? '', /SignedHeaders=host;x-amz-content-sha256;x-amz-date/);
    assert.equal(headers.get('content-type'), 'image/jpeg');
    assert.equal(headers.get('x-amz-content-sha256'), 'a12871fee210fb8619291eaea194581cbd2531e4b23759d225f6806923f63222');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
