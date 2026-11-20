import { randomUUID, createHash } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { bodyLimit } from 'hono/body-limit';
import type { Variables } from '../auth/middleware.js';
import { authMiddleware } from '../auth/middleware.js';
import type { ConvexAccountRepository } from '../db/accountRepository.js';
import { env } from '../env.js';
import { requestR2 } from '../storage/r2.js';
import { optimizeImage } from '../storage/optimizeImage.js';
import { readImageVariant } from '../storage/images.js';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const createAttachment = makeFunctionReference<'mutation'>('operations:createAttachment');
const attachmentById = makeFunctionReference<'query'>('operations:attachmentById');
const attachmentsForPurchase = makeFunctionReference<'query'>('operations:attachmentsForPurchase');

export function attachmentRoutes(repo: ConvexAccountRepository) {
  const app = new OpenAPIHono<{ Variables: Variables }>();
  app.use('*', authMiddleware(repo));
  app.use('/attachments', bodyLimit({ maxSize: env.ATTACHMENT_MAX_BYTES + 64_000 }));

  app.openapi(
    createRoute({
      method: 'post',
      path: '/attachments',
      request: {
        body: {
          content: {
            'multipart/form-data': {
              schema: z.object({
                file: z.any(),
                purchaseId: z.string().optional(),
                itemId: z.string().optional(),
              }),
            },
          },
        },
      },
      responses: {
        201: { description: 'Justificatif téléversé' },
        400: { description: 'Fichier refusé' },
      },
    }),
    async (c) => {
      const requestLength = Number(c.req.header('content-length') ?? 0);
      if (requestLength > env.ATTACHMENT_MAX_BYTES + 64_000)
        return c.json({ error: 'ATTACHMENT_TOO_LARGE' }, 413);
      const form = await c.req.formData();
      const file = form.get('file');
      const operationId = form.get('operationId')?.toString();
      if (operationId && !z.string().uuid().safeParse(operationId).success) return c.json({error:'INVALID_ATTACHMENT'},400);
      const purchaseId = form.get('purchaseId');
      const itemId = form.get('itemId');
      const supplierReceiptId = form.get('supplierReceiptId'), giftId = form.get('giftId');
      if (!(file instanceof File) || (!purchaseId && !itemId && !supplierReceiptId && !giftId))
        return c.json({ error: 'ATTACHMENT_TARGET_REQUIRED' }, 400);
      if (!allowedTypes.has(file.type))
        return c.json({ error: 'ATTACHMENT_TYPE_NOT_ALLOWED' }, 415);
      if (file.size < 1 || file.size > env.ATTACHMENT_MAX_BYTES)
        return c.json({ error: 'ATTACHMENT_SIZE_NOT_ALLOWED' }, 413);

      let bytes = new Uint8Array(await file.arrayBuffer());
      let filename = file.name.replace(/[\r\n\\/]/g, '_').slice(0, 180);
      let contentType = file.type;
      let thumbnail: Uint8Array | undefined;
      if (file.type.startsWith('image/')) {
        try {
          const optimized = await optimizeImage(bytes, filename);
          bytes = new Uint8Array(optimized.body);
          filename = optimized.filename;
          contentType = optimized.contentType;
          thumbnail = optimized.thumbnail;
        } catch { return c.json({ error: 'ATTACHMENT_IMAGE_INVALID' }, 415); }
      }

      const ownerId = c.get('ownerId');
      const suffix = operationId ? operationId + '-' + createHash('sha256').update(bytes).digest('hex') : randomUUID();
      const objectKey = itemId && file.type.startsWith('image/')
        ? `cards/${ownerId}/${suffix}`
        : `attachments/${ownerId}/${suffix}`;
      const upload = await requestR2(
        'PUT',
        objectKey,
        bytes,
        contentType,
      );
      if (!upload.ok) return c.json({
        error: upload.status === 401 || upload.status === 403
          ? 'ATTACHMENT_STORAGE_ACCESS_DENIED'
          : 'ATTACHMENT_STORAGE_UNAVAILABLE',
      }, 502);

      if (thumbnail) {
        const result = await requestR2('PUT', `${objectKey}.thumb.webp`, thumbnail, 'image/webp');
        if (!result.ok) {
          await requestR2('DELETE', objectKey).catch(() => undefined);
          return c.json({ error: 'ATTACHMENT_STORAGE_UNAVAILABLE' }, 502);
        }
      }

      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      try {
        const id = await client.mutation(createAttachment, {
          operationId,
          supplierReceiptId: supplierReceiptId ? supplierReceiptId.toString() : undefined,
          giftId: giftId ? giftId.toString() : undefined,
          purchaseId: purchaseId ? purchaseId.toString() : undefined,
          itemId: itemId ? itemId.toString() : undefined,
          objectKey,
          filename,
          contentType,
          size: bytes.length,
        } as never);
        return c.json({ id, filename, contentType, size: bytes.length }, 201);
      } catch {
        if (!operationId) await requestR2('DELETE', objectKey).catch(() => undefined);
        if (thumbnail && !operationId) await requestR2('DELETE', `${objectKey}.thumb.webp`).catch(() => undefined);
        return c.json({ error: 'ATTACHMENT_TARGET_INVALID' }, 400);
      }
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/purchases/{purchaseId}/attachments',
      request: { params: z.object({ purchaseId: z.string().min(1) }) },
      responses: { 200: { description: 'Justificatifs du rachat' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const result = await client.query(attachmentsForPurchase, {
        purchaseId: c.req.valid('param').purchaseId,
      } as never);
      return c.json(result as never);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/attachments/{attachmentId}/download',
      request: { params: z.object({ attachmentId: z.string().min(1) }) },
      responses: {
        200: { description: 'Contenu du justificatif' },
        404: { description: 'Justificatif absent' },
      },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const attachment = (await client.query(attachmentById, {
        attachmentId: c.req.valid('param').attachmentId,
      } as never)) as { objectKey: string; filename: string; contentType: string };
      const { stored, contentType } = attachment.contentType.startsWith('image/')
        ? await readImageVariant(attachment.objectKey, attachment.contentType, c.req.query('size') === 'thumbnail')
        : { stored: await requestR2('GET', attachment.objectKey), contentType: attachment.contentType };
      if (!stored.ok || !stored.body) return c.json({ error: 'ATTACHMENT_NOT_FOUND' }, 404);
      c.header('Content-Type', contentType);
      c.header('X-Content-Type-Options', 'nosniff');
      c.header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      );
      c.header('Cache-Control', 'private, no-store');
      return c.body(stored.body);
    },
  );
  return app;
}
