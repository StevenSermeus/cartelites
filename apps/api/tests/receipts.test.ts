import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { ConvexHttpClient } from 'convex/browser';
import type { ConvexAccountRepository } from '../src/db/accountRepository.js';
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
  BREVO_API_KEY: 'test',
  BREVO_FROM_EMAIL: 'documents@example.com',
});
const { receiptRoutes } = await import('../src/routes/receipts.js');
const { authRoutes } = await import('../src/routes/auth.js');
const { issueToken } = await import('../src/auth/tokens.js');
const { receiptIdentity } = await import('../src/receiptIdentity.js');
const { env } = await import('../src/env.js');
const token = await issueToken('staff');
const repo = { isSessionValid: async () => true } as unknown as ConvexAccountRepository;
const request = (body?: unknown) => ({
  method: body === undefined ? 'GET' : 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const signature = [
  [
    [0.1, 0.8],
    [0.2, 0.3],
    [0.3, 0.6],
    [0.5, 0.2],
    [0.8, 0.7],
  ],
];
const snapshot = {
  reference: 'TEST',
  occurredAt: 1000,
  status: 'active',
  client: { name: 'Client', email: 'client@example.com' },
  signatory: { firstName: 'Alice', lastName: 'Martin', capacity: 'Mandataire' },
  items: [
    {
      name: 'Carte',
      series: '',
      identifier: '',
      purchasePriceCents: 1000,
      marketValueCents: 2000,
      discountPercent: 50,
    },
  ],
};
test('receipt routes require authentication and reject empty signatures before persistence', async (t) => {
  const app = receiptRoutes(repo);
  const call = t.mock.method(ConvexHttpClient.prototype, 'action', async () =>
    assert.fail('unexpected call'),
  );
  assert.equal((await app.request('/?kind=purchase&targetId=target')).status, 401);
  assert.equal(
    (await app.request('/doc/sign', request({ company: [], client: [], accepted: true }))).status,
    400,
  );
  assert.equal(call.mock.callCount(), 0);
});
test('signing archives the exact PDF before Brevo; downloads and retries use that original', async (t) => {
  let row: any = {
    _id: 'doc',
    kind: 'purchase',
    snapshot,
    identity: receiptIdentity,
    signedAt: 1000,
    companySignature: signature,
    clientSignature: signature,
    emailStatus: 'pending',
  };
  let stored: Buffer | undefined;
  let sends = 0;
  const events: string[] = [];
  t.mock.method(ConvexHttpClient.prototype, 'action', async (_ref, args: any) => {
    const p = args.payload;
    assert.equal(args.secret, env.CONVEX_AUTH_SECRET);
    switch (args.operation) {
      case 'receiptSign':
        assert.equal(p.ownerId, 'staff');
        return row;
      case 'receiptGet':
        return row;
      case 'receiptArchive':
        events.push('archive');
        row = { ...row, ...p };
        return;
      case 'receiptClaimEmail':
        if (row.emailStatus === 'accepted') return false;
        return true;
      case 'receiptEmailResult':
        row.emailStatus = p.status;
        return;
      case 'receiptList':
        return [];
      default:
        assert.fail(args.operation);
    }
  });
  t.mock.method(globalThis, 'fetch', async (input: any, init: any) => {
    if (String(input).startsWith('https://storage.example.test')) {
      if (init.method === 'PUT') {
        stored = Buffer.from(init.body);
        events.push('upload');
        return new Response(null, { status: 200 });
      }
      return new Response(stored!);
    }
    assert.equal(String(input), 'https://api.brevo.com/v3/smtp/email');
    events.push('email');
    sends++;
    assert.deepEqual(Buffer.from(JSON.parse(init.body).attachment[0].content, 'base64'), stored);
    return Response.json({ messageId: 'brevo-1' }, { status: 201 });
  });
  const app = receiptRoutes(repo);
  assert.equal((await app.request('/?kind=purchase&targetId=target', request())).status, 200);
  const signed = await app.request(
    '/doc/sign',
    request({ company: signature, client: signature, accepted: true }),
  );
  assert.equal(signed.status, 200);
  assert.equal((await signed.json()).emailStatus, 'accepted');
  assert.deepEqual(events, ['upload', 'archive', 'email']);
  await app.request(
    '/doc/sign',
    request({ company: signature, client: signature, accepted: true }),
  );
  assert.equal(sends, 1);
  const pdf = await (await app.request('/doc/pdf', request())).json();
  assert.deepEqual(Buffer.from(pdf.pdfBase64, 'base64'), stored);
  stored = Buffer.from('corrupt');
  assert.equal((await app.request('/doc/pdf', request())).status, 503);
});
test('reset uses Brevo and preserves the generic response for unknown accounts and provider failure', async (t) => {
  let known = true,
    sends = 0;
  const resetRepo = {
    canAttemptLogin: async () => true,
    createPasswordReset: async () => (known ? { email: 'client@example.com' } : null),
  } as unknown as ConvexAccountRepository;
  t.mock.method(globalThis, 'fetch', async (url: any, init: any) => {
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
    sends++;
    assert.equal(JSON.parse(init.body).to[0].email, 'client@example.com');
    return new Response('quota', { status: 429 });
  });
  t.mock.method(console, 'error', () => {});
  const app = authRoutes(resetRepo);
  const a = await app.request('/password-reset/request', request({ email: 'client@example.com' }));
  known = false;
  const b = await app.request('/password-reset/request', request({ email: 'unknown@example.com' }));
  assert.equal(a.status, 202);
  assert.equal(b.status, 202);
  assert.deepEqual(await a.json(), await b.json());
  assert.equal(sends, 1);
  const old = env.BREVO_API_KEY;
  env.BREVO_API_KEY = '';
  try {
    assert.equal(
      (await app.request('/password-reset/request', request({ email: 'client@example.com' })))
        .status,
      503,
    );
  } finally {
    env.BREVO_API_KEY = old;
  }
});
