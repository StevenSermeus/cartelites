import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import type { ConvexAccountRepository } from '../src/db/accountRepository.js';

// Entire transport is isolated: no real Convex, R2, email or user credentials.
const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
Object.assign(process.env, {
  DATA_MODEL: 'legacy',
  CONVEX_URL: 'https://example.convex.cloud',
  CONVEX_AUTH_SECRET: 'x'.repeat(32),
  R2_ENDPOINT: 'https://storage.example.test',
  R2_BUCKET: 'test', R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test',
  JWT_ISSUER: 'https://api.example.test', JWT_AUDIENCE: 'test',
  JWT_PRIVATE_KEY_PEM: keys.privateKey, JWT_PUBLIC_KEY_PEM: keys.publicKey,
  WEB_ORIGIN: 'https://example.test',
});
const { attachmentRoutes } = await import('../src/routes/attachments.js');
const { issueToken } = await import('../src/auth/tokens.js');

test('committed photo survives failed thumbnail on identical retry and later retry recovers', async () => {
  const objects = new Map<string, Uint8Array>();
  const deletes: string[] = [];
  let failThumbnail = false;
  let commits = 0;
  let linkedObject = '';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'storage.example.test') {
      const key = url.pathname;
      if (init?.method === 'PUT') {
        if (key.endsWith('.thumb.webp') && failThumbnail) return new Response('temporary failure', { status: 503 });
        objects.set(key, new Uint8Array(init.body as Uint8Array));
        return new Response(null, { status: 200 });
      }
      if (init?.method === 'DELETE') {
        deletes.push(key); objects.delete(key);
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected storage method: ${init?.method}`);
    }
    assert.equal(url.hostname, 'example.convex.cloud');
    assert.equal(url.pathname, '/api/mutation');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.path, 'operations:createAttachment');
    const payload = Array.isArray(body.args) ? body.args[0] : body.args;
    const key = `/test/${payload.objectKey}`;
    assert.ok(objects.has(key));
    assert.ok(objects.has(`${key}.thumb.webp`));
    if (!linkedObject) { linkedObject = key; commits++; }
    else assert.equal(key, linkedObject, 'retry must address the same archived object');
    return Response.json({ status: 'success', value: 'attachment-id' });
  };
  try {
    const app = attachmentRoutes({ isSessionValid: async () => true } as unknown as ConvexAccountRepository);
    const token = await issueToken('review-test-account');
    const operationId = randomUUID();
    const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#c5a55c' } }).png().toBuffer();
    const upload = async () => {
      const form = new FormData();
      form.set('file', new File([bytes], 'photo.png', { type: 'image/png' }));
      form.set('itemId', 'synthetic-item'); form.set('operationId', operationId);
      return app.request('/attachments', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    };
    // The client loses this successful response and repeats the same operation.
    assert.equal((await upload()).status, 201);
    const archived = Buffer.from(objects.get(linkedObject)!);
    failThumbnail = true;
    const interrupted = await upload();
    assert.equal(interrupted.status, 502);
    assert.equal((await interrupted.json()).error, 'ATTACHMENT_STORAGE_UNAVAILABLE');
    assert.deepEqual(deletes, [], 'a retry must never delete an already committed photo');
    assert.deepEqual(Buffer.from(objects.get(linkedObject)!), archived);
    failThumbnail = false;
    const recovered = await upload();
    assert.equal(recovered.status, 201);
    assert.equal((await recovered.json()).id, 'attachment-id');
    assert.equal(commits, 1);
    assert.equal(objects.size, 2);
    assert.deepEqual(Buffer.from(objects.get(linkedObject)!), archived);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
