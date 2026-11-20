import { createHash, randomUUID } from 'node:crypto';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { authMiddleware, type Variables } from '../auth/middleware.js';
import type { ConvexAccountRepository } from '../db/accountRepository.js';
import { env } from '../env.js';
import { receiptIdentity } from '../receiptIdentity.js';
import { createPurchaseReceiptPdf, type ReceiptPdfInput } from '../receipts/purchaseReceipt.js';
import {
  createConsignmentReceiptPdf,
  type ConsignmentReceiptInput,
} from '../receipts/consignmentReceipt.js';
import { validSignature, type Signature } from '../receipts/signature.js';
import { requestR2 } from '../storage/r2.js';
import { sendBrevoEmail, EmailDeliveryError } from '../email/brevo.js';
import { signedReceiptEmail } from '../email/signedReceipt.js';

const target = z.object({
  kind: z.enum(['purchase', 'consignment']),
  targetId: z.string().min(1).max(100),
});
const signature = z.custom<Signature>(validSignature);
const signing = z
  .object({ company: signature, client: signature, accepted: z.literal(true) })
  .strict();
type Row = {
  _id: string;
  kind: 'purchase' | 'consignment';
  snapshot: ReceiptPdfInput & ConsignmentReceiptInput;
  identity: typeof receiptIdentity;
  signedAt?: number;
  companySignature?: Signature;
  clientSignature?: Signature;
  objectKey?: string;
  filename?: string;
  sha256?: string;
  emailStatus?: string;
  emailError?: string;
};
const service = new ConvexHttpClient(env.CONVEX_URL);
async function call<T>(operation: string, payload: Record<string, unknown>): Promise<T> {
  return service.action(makeFunctionReference<'action'>('authService:execute'), {
    secret: env.CONVEX_AUTH_SECRET,
    operation,
    payload,
  }) as Promise<T>;
}
function render(row: Row): Uint8Array {
  const input = {
    ...row.snapshot,
    ...(row.signedAt
      ? {
          signatures: {
            company: row.companySignature!,
            client: row.clientSignature!,
            signedAt: row.signedAt,
          },
        }
      : {}),
  };
  return Buffer.from(
    row.kind === 'purchase'
      ? createPurchaseReceiptPdf(input, row.identity.logo, row.identity)
      : createConsignmentReceiptPdf(input, row.identity.logo, row.identity),
    'ascii',
  );
}
async function ensureArchive(row: Row) {
  if (row.objectKey) return row;
  const bytes = render(row);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const objectKey = `signed-receipts/${row._id}/${sha256}.pdf`;
  const filename = `${row.kind === 'purchase' ? 'rachat' : 'depot'}-${row.snapshot.reference.replace(/[^a-z0-9-]/gi, '-')}-signe.pdf`;
  const stored = await requestR2('PUT', objectKey, bytes, 'application/pdf');
  if (!stored.ok) throw new Error('ARCHIVE_UNAVAILABLE');
  await call('receiptArchive', { id: row._id, objectKey, sha256, filename });
  return { ...row, objectKey, sha256, filename };
}
async function archivedBytes(row: Row) {
  const response = await requestR2('GET', row.objectKey!);
  if (!response.ok) throw new Error('ARCHIVE_UNAVAILABLE');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== row.sha256)
    throw new Error('ARCHIVE_INTEGRITY_ERROR');
  return bytes;
}
async function email(row: Row, retry: boolean) {
  const attempt = randomUUID();
  if (!(await call<boolean>('receiptClaimEmail', { id: row._id, attempt, retry })))
    return { emailStatus: row.emailStatus ?? 'pending', emailError: row.emailError };
  if (!env.BREVO_API_KEY || !env.BREVO_FROM_EMAIL || !row.snapshot.client.email) {
    const status = !row.snapshot.client.email ? 'no_email' : 'not_configured';
    await call('receiptEmailResult', { id: row._id, attempt, status });
    return { emailStatus: status };
  }
  let status: string,
    messageId: string | undefined,
    reason: string | undefined,
    httpStatus: number | undefined;
  try {
    const result = await sendBrevoEmail(
      { apiKey: env.BREVO_API_KEY, fromEmail: env.BREVO_FROM_EMAIL, fromName: env.BREVO_FROM_NAME },
      {
        to: row.snapshot.client.email,
        ...signedReceiptEmail({
          kind: row.kind,
          reference: row.snapshot.reference,
          clientName: row.snapshot.client.name,
          signedAt: row.signedAt,
          filename: row.filename!,
          identity: row.identity,
        }),
        attachments: [{ filename: row.filename!, content: await archivedBytes(row) }],
      },
    );
    status = 'accepted';
    messageId = result.messageId;
  } catch (error) {
    reason = error instanceof EmailDeliveryError ? error.reason : 'archive_unavailable';
    httpStatus = error instanceof EmailDeliveryError ? error.status : undefined;
    console.error('Receipt email failed', {
      receiptId: row._id,
      provider: 'brevo',
      reason,
      httpStatus,
    });
    status =
      error instanceof EmailDeliveryError && (!error.status || error.status >= 500)
        ? 'unknown'
        : 'failed';
  }
  await call('receiptEmailResult', {
    id: row._id,
    attempt,
    status,
    ...(messageId ? { messageId } : {}),
    ...(reason ? { error: reason } : {}),
    ...(httpStatus ? { httpStatus } : {}),
  });
  return { emailStatus: status, emailError: reason, emailHttpStatus: httpStatus };
}
export function receiptRoutes(repo: ConvexAccountRepository) {
  const app = new OpenAPIHono<{ Variables: Variables }>();
  app.use('*', authMiddleware(repo));
  app.use('*', bodyLimit({ maxSize: 512_000 }));
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store');
    await next();
  });
  app.onError((error, c) => {
    const code = [
      'SIGNATORY_REQUIRED',
      'RECEIPT_CHANGED',
      'RECEIPT_EXPIRED',
      'ALREADY_SIGNED',
      'INVALID_SIGNATURE',
      'RECEIPT_TARGET_INVALID',
      'ARCHIVE_UNAVAILABLE',
      'ARCHIVE_INTEGRITY_ERROR',
      'RECEIPT_ITEMS_LIMIT',
    ].find((code) => error.message.includes(code));
    return c.json(
      { error: code ?? 'RECEIPT_UNAVAILABLE' },
      code?.startsWith('ARCHIVE_') ? 503 : 409,
    );
  });
  app.get('/delivery-config', (c) =>
    c.json({
      provider: 'brevo',
      configured: Boolean(env.BREVO_API_KEY && env.BREVO_FROM_EMAIL),
      fromEmail: env.BREVO_FROM_EMAIL,
    }),
  );
  app.get('/', async (c) => {
    const input = target.safeParse(c.req.query());
    if (!input.success) return c.json({ error: 'INVALID_TARGET' }, 400);
    return c.json(await call('receiptList', { ...input.data, ownerId: c.get('ownerId') }));
  });
  app.post('/prepare', async (c) => {
    const input = target.safeParse(await c.req.json());
    if (!input.success) return c.json({ error: 'INVALID_TARGET' }, 400);
    const draft = await call<{ id: string; snapshot: Row['snapshot']; consent: string }>(
      'receiptPrepare',
      { ...input.data, ownerId: c.get('ownerId'), identity: receiptIdentity },
    );
    const pdfBase64 = Buffer.from(
      render({
        _id: draft.id,
        kind: input.data.kind,
        snapshot: draft.snapshot,
        identity: receiptIdentity,
      }),
    ).toString('base64');
    return c.json({ ...draft, pdfBase64 });
  });
  app.post('/:id/sign', async (c) => {
    const input = signing.safeParse(await c.req.json());
    if (!input.success) return c.json({ error: 'INVALID_SIGNATURE_OR_CONSENT' }, 400);
    const signed = await call<Row>('receiptSign', {
      ...input.data,
      id: c.req.param('id'),
      ownerId: c.get('ownerId'),
    });
    const row = await ensureArchive(signed);
    const delivery = await email(row, false);
    return c.json({ id: row._id, sha256: row.sha256, ...delivery, signedAt: row.signedAt });
  });
  app.get('/:id/pdf', async (c) => {
    let row = await call<Row>('receiptGet', { id: c.req.param('id'), ownerId: c.get('ownerId') });
    if (!row.signedAt) return c.json({ error: 'NOT_SIGNED' }, 409);
    row = await ensureArchive(row);
    return c.json({
      pdfBase64: (await archivedBytes(row)).toString('base64'),
      filename: row.filename,
    });
  });
  app.post('/:id/email', async (c) => {
    let row = await call<Row>('receiptGet', { id: c.req.param('id'), ownerId: c.get('ownerId') });
    if (!row.signedAt) return c.json({ error: 'NOT_SIGNED' }, 409);
    row = await ensureArchive(row);
    return c.json(await email(row, true));
  });
  return app;
}
