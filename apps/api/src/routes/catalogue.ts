import { OpenAPIHono } from '@hono/zod-openapi';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { env } from '../env.js';

const publicCatalogueQuery = makeFunctionReference<'query'>('operations:publicCatalogue');

export function catalogueRoutes() {
  const app = new OpenAPIHono();
  app.get('/api/v1/catalogue', async (c) => {
    const client = new ConvexHttpClient(env.CONVEX_URL);
    const cursor = c.req.query('cursor');
    const page = await client.query(publicCatalogueQuery, {
      paginationOpts: { numItems: Math.min(48, Math.max(1, Number(c.req.query('size')) || 12)), cursor: cursor || null },
      search: c.req.query('search') ?? '',
      minPrice: c.req.query('min') ? Math.round(Number(c.req.query('min')) * 100) : undefined,
      maxPrice: c.req.query('max') ? Math.round(Number(c.req.query('max')) * 100) : undefined,
      gradingStatus: c.req.query('gradingStatus') ?? 'all',
      gradingCompany: c.req.query('gradingCompany') ?? '',
      gradingGrade: c.req.query('gradingGrade') ?? '',
    } as never);
    return c.json(page as never);
  });
  return app;
}
