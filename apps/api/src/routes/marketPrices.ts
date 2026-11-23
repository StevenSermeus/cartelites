import { OpenAPIHono } from '@hono/zod-openapi';
import { authMiddleware, type Variables } from '../auth/middleware.js';
import type { ConvexAccountRepository } from '../db/accountRepository.js';
import { env } from '../env.js';
import { createMarketPriceService, marketPriceQuerySchema } from '../marketPrices/index.js';

/** Authenticated research only: no pricing data or provider credentials in Convention. */
export function marketPriceRoutes(repo: ConvexAccountRepository) {
  const app = new OpenAPIHono<{ Variables: Variables }>();
  const service = createMarketPriceService();
  const requests = new Map<string, { start: number; count: number }>();
  app.use('/market-prices', authMiddleware(repo));
  app.get('/market-prices', async c => {
    c.header('Cache-Control', 'private, no-store');
    if (Object.values(c.req.queries()).some(values => values.length !== 1))
      return c.json({ error: 'INVALID_MARKET_QUERY' }, 400);
    const parsed = marketPriceQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'INVALID_MARKET_QUERY', details: parsed.error.flatten() }, 400);
    // GET initiates an external marketplace request. A cross-site navigation carries
    // SameSite=Lax cookies, but cannot supply this CORS-gated application header.
    if (!c.req.header('authorization')?.match(/^Bearer\s+/i) &&
        ((c.req.header('origin') !== env.WEB_ORIGIN &&
          !(c.req.header('origin') === undefined && c.req.header('sec-fetch-site') === 'same-origin')) ||
         c.req.header('x-market-research') !== '1'))
      return c.json({ error: 'MARKET_ORIGIN_REQUIRED' }, 403);
    const now = Date.now(), owner = c.get('ownerId');
    for (const [key, value] of requests) if (now - value.start >= 60000) requests.delete(key);
    const window = requests.get(owner) ?? { start: now, count: 0 };
    if (window.count >= 30 || (!requests.has(owner) && requests.size >= 1000)) {
      c.header('Retry-After', '60');
      return c.json({ error: 'MARKET_RATE_LIMIT', message: 'Réessayez dans une minute.' }, 429);
    }
    window.count++;
    requests.set(owner, window);
    return c.json(await service.search(parsed.data));
  });
  return app;
}
