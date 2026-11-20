import { createHash } from 'node:crypto';
import { z, type OpenAPIHono } from '@hono/zod-openapi';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import type { Variables } from '../auth/middleware.js';
import { env } from '../env.js';
import { receiptIdentity } from '../receiptIdentity.js';
import { requestR2 } from '../storage/r2.js';
import { sendBrevoEmail, EmailDeliveryError } from '../email/brevo.js';
import { createSaleTicketPdf, type TicketSnapshot } from '../receipts/saleTicket.js';
type Ticket = {
  _id: string;
  snapshot: TicketSnapshot;
  identity?: typeof receiptIdentity;
  objectKey?: string;
  sha256?: string;
  filename?: string;
};
const service = new ConvexHttpClient(env.CONVEX_URL);
const call = <T>(operation: string, payload: Record<string, unknown>) =>
  service.action(makeFunctionReference<'action'>('authService:execute'), {
    secret: env.CONVEX_AUTH_SECRET,
    operation,
    payload,
  }) as Promise<T>;
async function archive(client: ConvexHttpClient, id: string) {
  let ticket = (await client.query(makeFunctionReference<'query'>('saleTickets:get'), {
    id,
  })) as Ticket;
  ticket = await call<Ticket>('ticketIdentity', { id, identity: receiptIdentity });
  if (!ticket.objectKey) {
    const bytes = Buffer.from(createSaleTicketPdf(ticket.snapshot, ticket.identity!), 'ascii');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const objectKey = `sale-tickets/${id}/${sha256}.pdf`,
      filename = `ticket-${id}.pdf`;
    const stored = await requestR2('PUT', objectKey, bytes, 'application/pdf');
    if (!stored.ok) throw new Error('ARCHIVE_UNAVAILABLE');
    await call('ticketArchive', { id, objectKey, sha256, filename });
    ticket = { ...ticket, objectKey, sha256, filename };
  }
  const stored = await requestR2('GET', ticket.objectKey!);
  if (!stored.ok) throw new Error('ARCHIVE_UNAVAILABLE');
  const bytes = Buffer.from(await stored.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== ticket.sha256)
    throw new Error('ARCHIVE_INTEGRITY_ERROR');
  return { ticket, bytes };
}
export function registerSaleTicketRoutes(app: OpenAPIHono<{ Variables: Variables }>) {
  app.post('/sale-tickets', async (c) => {
    const input = z
      .object({
        operationId: z.string().uuid(),
        saleIds: z.array(z.string().min(1)).min(1).max(100),
      })
      .safeParse(await c.req.json());
    if (!input.success) return c.json({ error: 'INVALID_TICKET' }, 400);
    const client = new ConvexHttpClient(env.CONVEX_URL);
    client.setAuth(c.get('accessToken'));
    const id = await client.mutation(
      makeFunctionReference<'mutation'>('saleTickets:prepare'),
      input.data,
    );
    return c.json({ id }, 201);
  });
  app.get('/sale-tickets', async (c) => {
    const saleId = c.req.query('saleId');
    if (!saleId) return c.json({ error: 'INVALID_TICKET' }, 400);
    const client = new ConvexHttpClient(env.CONVEX_URL);
    client.setAuth(c.get('accessToken'));
    return c.json(
      await client.query(makeFunctionReference<'query'>('saleTickets:list'), { saleId }),
    );
  });
  app.get('/sale-tickets/:id/pdf', async (c) => {
    const client = new ConvexHttpClient(env.CONVEX_URL);
    client.setAuth(c.get('accessToken'));
    try {
      const { ticket, bytes } = await archive(client, c.req.param('id'));
      c.header('Cache-Control', 'private, no-store');
      return c.json({ filename: ticket.filename, pdfBase64: bytes.toString('base64') });
    } catch (e) {
      if (e instanceof Error && /ARCHIVE_/.test(e.message))
        return c.json({ error: e.message }, 503);
      throw e;
    }
  });
  app.get('/sale-tickets/:id', async (c) => {
    const client = new ConvexHttpClient(env.CONVEX_URL);
    client.setAuth(c.get('accessToken'));
    return c.json(
      await client.query(makeFunctionReference<'query'>('saleTickets:get'), {
        id: c.req.param('id'),
      }),
    );
  });
  app.post('/sale-tickets/:id/email', async (c) => {
    const input = z
      .object({ operationId: z.string().uuid(), recipient: z.string().email().max(300) })
      .safeParse(await c.req.json());
    if (!input.success) return c.json({ error: 'INVALID_EMAIL' }, 400);
    if (!env.BREVO_API_KEY || !env.BREVO_FROM_EMAIL)
      return c.json({ error: 'EMAIL_DELIVERY_UNAVAILABLE' }, 503);
    const client = new ConvexHttpClient(env.CONVEX_URL);
    client.setAuth(c.get('accessToken'));
    const { ticket, bytes } = await archive(client, c.req.param('id'));
    const attempt = await call<{ id: string; send: boolean; status: string }>('ticketClaimEmail', {
      ticketId: ticket._id,
      ...input.data,
    });
    if (!attempt.send) return c.json({ status: attempt.status });
    try {
      const result = await sendBrevoEmail(
        {
          apiKey: env.BREVO_API_KEY,
          fromEmail: env.BREVO_FROM_EMAIL,
          fromName: env.BREVO_FROM_NAME,
        },
        {
          to: input.data.recipient,
          subject: `Votre ticket de vente · ${ticket.snapshot.reference}`,
          html: '<p>Bonjour,</p><p>Vous trouverez votre ticket de vente en pièce jointe.</p>',
          text: 'Bonjour, votre ticket de vente est joint à ce message.',
          attachments: [{ filename: ticket.filename!, content: bytes }],
        },
      );
      await call('ticketEmailResult', {
        id: attempt.id,
        status: 'accepted',
        messageId: result.messageId,
      });
      return c.json({ status: 'accepted' });
    } catch (e) {
      const status = e instanceof EmailDeliveryError && e.status ? 'failed' : 'unknown';
      await call('ticketEmailResult', { id: attempt.id, status });
      return c.json(
        { status, error: status === 'unknown' ? 'EMAIL_RESULT_UNKNOWN' : 'EMAIL_DELIVERY_FAILED' },
        502,
      );
    }
  });
}
