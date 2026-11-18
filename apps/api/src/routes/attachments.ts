import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { bodyLimit } from 'hono/body-limit';
import type { Variables } from '../auth/middleware.js';
import { authMiddleware } from '../auth/middleware.js';
import type { ConvexAccountRepository } from '../db/accountRepository.js';
import { env } from '../env.js';
import { requestMinio } from '../storage/minio.js';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);
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
      const purchaseId = form.get('purchaseId');
      const itemId = form.get('itemId');
      if (!(file instanceof File) || (!purchaseId && !itemId))
        return c.json({ error: 'ATTACHMENT_TARGET_REQUIRED' }, 400);
      if (!allowedTypes.has(file.type))
        return c.json({ error: 'ATTACHMENT_TYPE_NOT_ALLOWED' }, 415);
      if (file.size < 1 || file.size > env.ATTACHMENT_MAX_BYTES)
        return c.json({ error: 'ATTACHMENT_SIZE_NOT_ALLOWED' }, 413);

      const ownerId = c.get('ownerId');
      const objectKey = `${ownerId}/${randomUUID()}`;
      const upload = await requestMinio(
        'PUT',
        objectKey,
        new Uint8Array(await file.arrayBuffer()),
        file.type,
      );
      if (!upload.ok) return c.json({ error: 'ATTACHMENT_STORAGE_UNAVAILABLE' }, 502);

      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      try {
        const id = await client.mutation(createAttachment, {
          purchaseId: purchaseId ? purchaseId.toString() : undefined,
          itemId: itemId ? itemId.toString() : undefined,
          objectKey,
          filename: file.name.replace(/[\r\n\\/]/g, '_').slice(0, 180),
          contentType: file.type,
          size: file.size,
        } as never);
        return c.json({ id, filename: file.name, contentType: file.type, size: file.size }, 201);
      } catch {
        await requestMinio('DELETE', objectKey).catch(() => undefined);
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
      const stored = await requestMinio('GET', attachment.objectKey);
      if (!stored.ok || !stored.body) return c.json({ error: 'ATTACHMENT_NOT_FOUND' }, 404);
      c.header('Content-Type', attachment.contentType);
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
