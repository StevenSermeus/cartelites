import { OpenAPIHono } from '@hono/zod-openapi';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { env } from '../env.js';
import { readImage } from '../storage/images.js';

const publicCatalogueQuery = makeFunctionReference<'query'>('operations:publicCatalogue');

export function catalogueRoutes() {
  const app = new OpenAPIHono();
  app.get('/api/v1/catalogue/:itemId/photo', async (c) => {
    c.header('Cache-Control', 'private, no-store');
    const client = new ConvexHttpClient(env.CONVEX_URL);
    const photo = await client.action(makeFunctionReference<'action'>('authService:execute'), {
      secret: env.CONVEX_AUTH_SECRET,
      operation: 'cataloguePhotoObject',
      payload: { itemId: c.req.param('itemId') },
    }) as { objectKey: string; contentType: string } | null;
    if (!photo || !['image/jpeg', 'image/png'].includes(photo.contentType))
      return c.json({ error: 'PHOTO_NOT_FOUND' }, 404);
    const stored = await readImage(photo.objectKey);
    if (!stored.ok || !stored.body) return c.json({ error: 'PHOTO_NOT_FOUND' }, 404);
    c.header('Content-Type', photo.contentType);
    c.header('X-Content-Type-Options', 'nosniff');
    return c.body(stored.body);
  });
  app.get('/api/v1/catalogue', async (c) => {
    const client = new ConvexHttpClient(env.CONVEX_URL);
    const cursor = c.req.query('cursor');
    const tcg = c.req.query('tcg') ?? 'all';
    if (!['all', 'pokemon', 'riftbound'].includes(tcg)) return c.json({ error: 'TCG invalide' }, 400);
    const page = await client.query(publicCatalogueQuery, {
      tcg,
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
