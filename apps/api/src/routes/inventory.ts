import { z, type OpenAPIHono } from '@hono/zod-openapi';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import type { Variables } from '../auth/middleware.js';
import { env } from '../env.js';
import { requestR2 } from '../storage/r2.js';
const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  qty = z.number().int().min(1).max(100000),
  date = z
    .number()
    .int()
    .min(0)
    .refine((n) => Number.isFinite(new Date(n).getTime()));
const product = z.object({
  tcg: z.enum(['pokemon', 'riftbound', 'other']).optional(),
  name: z.string().trim().min(1).max(300),
  productType: z.enum(['card', 'sealed', 'other']),
  format: z.enum(['display', 'booster', 'box', 'other']).optional(),
  packSize: qty.optional(),
  series: z.string().max(300).optional(),
  identifier: z.string().max(100).optional(),
  language: z.enum(['fr', 'en', 'ja', 'zh']).optional(),
  condition: z.enum(['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO']).optional(),
  gradingCompany: z.enum(['PSA', 'CollectAura', 'PCA', 'CCC']).optional(),
  gradingGrade: z.string().max(32).optional(),
  gradingCertificate: z.string().max(100).optional(),
  askingPriceCents: money,
  taxRateBps: z.number().int().min(0).max(10000),
});
const operation = { operationId: z.string().uuid() };
export function registerInventoryRoutes(app: OpenAPIHono<{ Variables: Variables }>) {
  app.get('/inventory/evidence', async (c) => {
    const client = new ConvexHttpClient(env.CONVEX_URL);
    client.setAuth(c.get('accessToken'));
    return c.json(
      await client.query(makeFunctionReference<'query'>('inventory:evidence'), {
        receiptId: c.req.query('receiptId'),
        giftId: c.req.query('giftId'),
      }),
    );
  });
  const mutations: [string, string, z.ZodTypeAny][] = [
    [
      '/stock/product',
      'updateProduct',
      z
        .object({
          tcg: product.shape.tcg,
          itemId: z.string(),
          name: z.string().trim().min(1).max(300),
          description: z.string().max(3000),
          series: z.string().max(300),
          identifier: z.string().max(100),
          askingPriceCents: money,
          hiddenFromCatalogue: z.boolean(),
          language: product.shape.language,
          condition: product.shape.condition,
          gradingCompany: product.shape.gradingCompany,
          gradingGrade: z.string().max(32),
          gradingCertificate: z.string().max(100),
        })
        .strict(),
    ],
    [
      '/supplier-receipts',
      'receive',
      z.object({
        ...operation,
        supplier: z.string().trim().min(1).max(200),
        reference: z.string().trim().min(1).max(200),
        occurredAt: date,
        lines: z
          .array(
            z.object({
              itemId: z.string().optional(),
              product,
              quantity: qty,
              unitCostCents: money,
            }),
          )
          .min(1)
          .max(50),
      }),
    ],
    [
      '/stock/open',
      'openDisplay',
      z.object({
        ...operation,
        itemId: z.string(),
        targetId: z.string().optional(),
        product: product.optional(),
        quantity: qty,
        packSize: z.number().int().min(1).max(1000),
        occurredAt: date,
      }),
    ],
    [
      '/stock/donate',
      'donate',
      z.object({
        ...operation,
        itemId: z.string(),
        quantity: qty,
        occurredAt: date,
        recipient: z.string().max(300).optional(),
        reason: z.string().trim().min(1).max(1000),
        note: z.string().max(3000).optional(),
      }),
    ],
    [
      '/stock/reverse',
      'reverse',
      z.object({ ...operation, giftId: z.string().optional(), openingId: z.string().optional() }),
    ],
  ];
  for (const [path, fn, schema] of mutations)
    app.post(path, async (c) => {
      const input = schema.safeParse(await c.req.json());
      if (!input.success) return c.json({ error: 'INVALID_INVENTORY' }, 400);
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const result = await client.mutation(
        makeFunctionReference<'mutation'>(`inventory:${fn}`),
        input.data,
      );
      return c.json({ result }, 201);
    });
  app.get('/stock/:id/lots', async (c) => {
    const client = new ConvexHttpClient(env.CONVEX_URL);
    client.setAuth(c.get('accessToken'));
    return c.json(
      await client.query(makeFunctionReference<'query'>('inventory:detail'), {
        itemId: c.req.param('id'),
      }),
    );
  });
  app.get('/supplier-receipts', async (c) => {
    const client = new ConvexHttpClient(env.CONVEX_URL);
    client.setAuth(c.get('accessToken'));
    return c.json(
      await client.query(makeFunctionReference<'query'>('inventory:receipts'), {
        paginationOpts: { numItems: 25, cursor: c.req.query('cursor') || null },
      }),
    );
  });
  app.get('/gifts', async (c) => {
    const filters = z
      .object({
        from: z.coerce.number().int().min(0),
        to: z.coerce.number().int().min(0),
        cursor: z.string().optional(),
      })
      .safeParse(c.req.query());
    if (!filters.success) return c.json({ error: 'INVALID_DATE' }, 400);
    const client = new ConvexHttpClient(env.CONVEX_URL);
    client.setAuth(c.get('accessToken'));
    return c.json(
      await client.query(makeFunctionReference<'query'>('inventory:gifts'), {
        from: filters.data.from,
        to: filters.data.to,
        paginationOpts: { numItems: 50, cursor: filters.data.cursor || null },
      }),
    );
  });
  app.post('/stock/photo', async (c) => {
    const input = z
      .object({ itemId: z.string(), attachmentId: z.string(), action: z.enum(['cover', 'remove']) })
      .safeParse(await c.req.json());
    if (!input.success) return c.json({ error: 'INVALID_ATTACHMENT' }, 400);
    const client = new ConvexHttpClient(env.CONVEX_URL);
    client.setAuth(c.get('accessToken'));
    const result = (await client.mutation(
      makeFunctionReference<'mutation'>('inventory:photo'),
      input.data,
    )) as { objectKey: string };
    if (input.data.action === 'remove') {
      await requestR2('DELETE', result.objectKey).catch(() => undefined);
      await requestR2('DELETE', `${result.objectKey}.thumb.webp`).catch(() => undefined);
    }
    return c.json({ ok: true });
  });
}
