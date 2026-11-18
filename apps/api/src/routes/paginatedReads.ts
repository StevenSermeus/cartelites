import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import type { Variables } from '../auth/middleware.js';
import { env } from '../env.js';

export const readPageQuery = z.object({
  size: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().max(10000).optional(), search: z.string().max(200).default(''),
  status: z.string().max(30).optional(), origin: z.enum(['all', 'purchase', 'consignment']).optional(),
  visibility: z.enum(['all', 'visible', 'hidden']).optional(), paymentStatus: z.enum(['all', 'pending', 'received', 'unknown']).optional(),
  sellerId: z.string().max(100).optional(), purchaseId: z.string().max(100).optional(),
  consignmentId: z.string().max(100).optional(), itemId: z.string().max(100).optional(),
  from: z.coerce.number().finite().optional(), to: z.coerce.number().finite().optional(),
  gradingStatus: z.enum(['all', 'graded', 'ungraded']).optional(), gradingCompany: z.string().max(40).optional(), gradingText: z.string().max(100).optional(),
}).refine(value => value.from === undefined || value.to === undefined || value.from <= value.to);

/** Extends the existing GET routes. No parameters preserves their legacy response. */
export function registerPaginatedReads(app: OpenAPIHono<{ Variables: Variables }>) {
  const routes = [
    ['/sellers', 'sellers'], ['/stock', 'stock'], ['/sales', 'sales'], ['/purchases', 'purchases'],
    ['/consignments', 'consignments'], ['/consignments/balances', 'balances'], ['/conflicts', 'conflicts'],
    ['/consignments/payments', 'payments'], ['/attachments/page', 'attachments'], ['/consignments/events', 'events'],
  ] as const;
  for (const [path, resource] of routes) {
    app.get(path, async (c, next) => {
      if (!Object.keys(c.req.query()).length && !['payments', 'events', 'attachments'].includes(resource)) return next();
      const parsed = readPageQuery.safeParse(c.req.query());
      if (!parsed.success) return c.json({ error: 'INVALID_PAGINATION' }, 400);
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const result = await client.query(makeFunctionReference<'query'>('readModels:browse'), { resource, ...parsed.data });
      return c.json(result);
    });
  }
  for (const [path, resource] of routes.filter(([, resource]) => !['conflicts', 'payments', 'attachments', 'events'].includes(resource))) {
    app.get(`${path}/:id`, async (c, next) => {
      if (['page', 'balances', 'payments', 'events'].includes(c.req.param('id'))) return next();
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const result = await client.query(makeFunctionReference<'query'>('readModels:record'), { resource, id: c.req.param('id') });
      return result === null ? c.json({ error: 'RECORD_NOT_FOUND' }, 404) : c.json(result);
    });
  }
  app.get('/dashboard/summary', async c => {
    const client = new ConvexHttpClient(env.CONVEX_URL);
    client.setAuth(c.get('accessToken'));
    return c.json(await client.query(makeFunctionReference<'query'>('readModels:dashboardSummary'), {}));
  });
}
