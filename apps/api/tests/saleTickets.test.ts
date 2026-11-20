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
  BREVO_API_KEY: 'test',
  BREVO_FROM_EMAIL: 'shop@example.test',
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

const { createSaleTicketPdf } = await import('../src/receipts/saleTicket.js');
const { receiptIdentity } = await import('../src/receiptIdentity.js');
const { createHash } = await import('node:crypto');
const snapshot = {
  reference: 'VEN-TEST',
  occurredAt: 1000,
  lines: [
    {
      saleId: 'sale',
      name: 'Display',
      quantity: 2,
      totalCents: 28000,
      status: 'active',
      paymentStatus: 'received',
      payment: { cashCents: 28000, transferCents: 0 },
      vatRegime: 'other',
      origin: 'supplier',
      taxRateBps: 2100,
    },
  ],
};
test('ticket PDF archives on R2, downloads validated bytes and email sends the archived version', async (t) => {
  let row: any = { _id: 'ticket', snapshot, identity: receiptIdentity };
  let stored: Buffer | undefined;
  let emails = 0;
  let claimed = false;
  t.mock.method(ConvexHttpClient.prototype, 'query', async () => row);
  t.mock.method(ConvexHttpClient.prototype, 'action', async (ref, args) => {
    switch (args.operation) {
      case 'ticketIdentity':
        return row;
      case 'ticketArchive':
        row = { ...row, ...args.payload };
        return;
      case 'ticketClaimEmail':
        if (claimed) return { id: 'attempt', send: false, status: 'accepted' };
        claimed = true;
        return { id: 'attempt', send: true, status: 'sending' };
      case 'ticketEmailResult':
        return;
      default:
        assert.fail(args.operation);
    }
  });
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).includes('api.brevo.com')) {
      emails++;
      const body = JSON.parse(init!.body as string);
      assert.equal(body.to[0].email, 'client@example.test');
      assert.equal(body.attachment[0].content, stored!.toString('base64'));
      return Response.json({ messageId: 'message' });
    }
    if (init?.method === 'PUT') {
      stored = Buffer.from(init.body as Uint8Array);
      return new Response(null, { status: 200 });
    }
    return new Response(stored, { status: 200 });
  });
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const response = await app().request('/sale-tickets/ticket/pdf', auth);
  assert.equal(response.status, 200);
  const pdf = await response.json();
  assert.ok(Buffer.from(pdf.pdfBase64, 'base64').toString('ascii').startsWith('%PDF-'));
  assert.ok(row.objectKey.startsWith('sale-tickets/ticket/'));
  assert.equal(createHash('sha256').update(stored!).digest('hex'), row.sha256);
  const input = { operationId: randomUUID(), recipient: 'client@example.test' };
  assert.equal((await app().request('/sale-tickets/ticket/email', post(input))).status, 200);
  assert.equal((await app().request('/sale-tickets/ticket/email', post(input))).status, 200);
  assert.equal(emails, 1);
  assert.equal((await app().request('/sale-tickets/ticket/pdf')).status, 401);
});
test('archive failure does not create a second sale or mark an archive successful', async (t) => {
  t.mock.method(ConvexHttpClient.prototype, 'query', async () => ({ _id: 'ticket', snapshot }));
  t.mock.method(ConvexHttpClient.prototype, 'action', async (ref, args) => {
    assert.equal(args.operation, 'ticketIdentity');
    return { _id: 'ticket', snapshot, identity: receiptIdentity };
  });
  const mutate = t.mock.method(ConvexHttpClient.prototype, 'mutation', async () =>
    assert.fail('no sale mutation'),
  );
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }));
  assert.equal(
    (
      await app().request('/sale-tickets/ticket/pdf', {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
    503,
  );
  assert.equal(mutate.mock.callCount(), 0);
});
test('ticket PDF paginates long mixed baskets and explicitly marks cancellation and unknown payment', () => {
  const pdf = createSaleTicketPdf(
    {
      ...snapshot,
      lines: Array.from({ length: 80 }, (_, i) => ({
        ...snapshot.lines[0],
        name: 'Article ' + i + ' ' + 'description '.repeat(10),
        status: i === 0 ? 'cancelled' : 'active',
        paymentStatus: 'unknown',
        payment: null,
      })),
    },
    receiptIdentity,
  );
  assert.ok(pdf.startsWith('%PDF-'));
  assert.ok((pdf.match(/\/Type \/Page\b/g) || []).length > 1);
  const text = Array.from(pdf.matchAll(/<([a-f0-9]+)>/gi), (m) =>
    Buffer.from(m[1], 'hex').toString('latin1'),
  ).join(' ');
  assert.match(text, /ANNULEE/);
  assert.match(text, /Paiement non renseign/);
  assert.match(text, /Article 79/);
});
