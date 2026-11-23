import { OpenAPIHono, z } from '@hono/zod-openapi';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { env } from '../env.js';
import { readImageVariant } from '../storage/images.js';

const publicCatalogueQuery = makeFunctionReference<'query'>('operations:publicCatalogue');
const price = z.string().regex(/^\d+(?:\.\d{1,2})?$/).transform(value => Math.round(Number(value) * 100))
  .refine(value => Number.isSafeInteger(value) && value >= 0);
const catalogueQuery = z.object({
  tcg: z.enum(['all','pokemon','riftbound','other']).default('all'),
  sort: z.enum(['recent','name','price-asc','price-desc']).optional(),
  size: z.coerce.number().int().min(1).max(48).default(12),
  cursor: z.string().regex(/^\d+$/).refine(value=>Number.isSafeInteger(Number(value))).optional(),
  series: z.string().max(300).optional(), search: z.string().max(200).default(''), language: z.string().max(20).optional(),
  min: price.optional(), max: price.optional(),
  gradingStatus: z.enum(['all','graded','ungraded']).default('all'),
  gradingCompany: z.string().max(100).default(''), gradingGrade: z.string().max(100).default(''),
}).refine(value => value.min === undefined || value.max === undefined || value.min <= value.max);

export function catalogueRoutes() {
  const app = new OpenAPIHono();
  app.get('/api/v1/catalogue/:itemId', async c => {
    const client = new ConvexHttpClient(env.CONVEX_URL);
    const product = await client.query(makeFunctionReference<'query'>('operations:publicProduct'), {itemId:c.req.param('itemId')});
    c.header('Cache-Control','no-store');
    return product ? c.json(product) : c.json({error:'PRODUCT_NOT_FOUND'},404);
  });
  app.get('/api/v1/catalogue/:itemId/photo', photoHandler);
  app.get('/api/v1/catalogue/:itemId/photos/:photoId', photoHandler);
  async function photoHandler(c: import('hono').Context) {
    c.header('Cache-Control', 'private, no-store');
    const client = new ConvexHttpClient(env.CONVEX_URL);
    const photo = await client.action(makeFunctionReference<'action'>('authService:execute'), {
      secret: env.CONVEX_AUTH_SECRET,
      operation: 'cataloguePhotoObject',
      payload: { itemId: c.req.param('itemId'), ...(c.req.param('photoId') ? {photoId:c.req.param('photoId')} : {}) },
    }) as { objectKey: string; contentType: string } | null;
    if (!photo || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.contentType))
      return c.json({ error: 'PHOTO_NOT_FOUND' }, 404);
    const { stored, contentType } = await readImageVariant(photo.objectKey, photo.contentType, c.req.query('size') === 'thumbnail');
    if (!stored.ok || !stored.body) return c.json({ error: 'PHOTO_NOT_FOUND' }, 404);
    c.header('Content-Type', contentType);
    c.header('X-Content-Type-Options', 'nosniff');
    return c.body(stored.body);
  }
  app.get('/api/v1/catalogue', async (c) => {
    const client = new ConvexHttpClient(env.CONVEX_URL);
    const parsed = catalogueQuery.safeParse(Object.fromEntries(Object.entries(c.req.query()).filter(([,value])=>value!=='')));
    if (!parsed.success) return c.json({error:'INVALID_CATALOGUE_QUERY'},400);
    const input = parsed.data;
    const page = await client.query(publicCatalogueQuery, {
      tcg: input.tcg, sort: input.sort, language: input.language,
      paginationOpts: { numItems: input.size, cursor: input.cursor ?? null },
      series: input.series, search: input.search, minPrice: input.min, maxPrice: input.max,
      gradingStatus: input.gradingStatus, gradingCompany: input.gradingCompany, gradingGrade: input.gradingGrade,
    } as never);
    return c.json(page as never);
  });
  return app;
}
