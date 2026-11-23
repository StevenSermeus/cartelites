import { z } from 'zod';
import type { MarketPriceQuery, MarketPriceResult } from '../generated/marketPrices.js';
import { baseResult, failure, type FetchLike, type ProviderPage, type RetainProviderPage } from './common.js';
import { searchGcc, normalizeGcc } from './gcc.js';
import { searchVinted, normalizeVintedPage } from './vinted.js';
import { searchEbay, normalizeEbay } from './ebay.js';
import { searchCardmarket, normalizeCardmarket } from './cardmarket.js';
const filter = z.string().trim().min(1).max(100).optional();
export const marketPriceQuerySchema = z.object({
  source: z.enum(['cardmarket', 'ebay_fr', 'ebay_us', 'vinted', 'gcc']),
  query: z.string().trim().min(1).max(200).transform(value => value.replace(/\s+/g, ' ')),
  productUrl: z.string().url().max(1500).refine(value => {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.cardmarket.com' && !url.username && !url.password && !url.port && /^\/[a-z]{2}\/[A-Za-z][A-Za-z0-9]*\/Products\/(?:Singles|Cards)\//.test(url.pathname) && !url.hash && !url.search;
  }, 'Lien produit Cardmarket attendu.').optional(),
  mode: z.enum(['sold', 'active']).default('sold'),
  page: z.coerce.number().int().min(1).max(100).default(1),
  cursor: z.string().min(1).max(4096).optional(),
  language: filter, gradingCompany: filter, grade: filter, collectorNumber: filter, setName: filter,
}).strict().refine(value => !value.productUrl || value.source === 'cardmarket', 'Le lien produit est réservé à Cardmarket.');
export type MarketPriceServiceOptions = {
  fetcher?: FetchLike; now?: () => number; timeoutMs?: number; maxCacheEntries?: number; cacheTtlMs?: number;
};
/** Direct public retrieval in the existing API process; no paid provider or extra daemon. */
export function createMarketPriceService(options: MarketPriceServiceOptions = {}) {
  const fetcher = options.fetcher ?? fetch, now = options.now ?? Date.now,
    timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? 12000, 15000)),
    maxEntries = Math.max(1, Math.min(options.maxCacheEntries ?? 100, 500)),
    ttl = Math.max(1, Math.min(options.cacheTtlMs ?? 300000, 300000));
  type Page = { result: MarketPriceResult; raw?: ProviderPage };
  const cache = new Map<string, { expires: number; page: Page }>(), inFlight = new Map<string, Promise<Page>>();
  const normalizers = { gcc: normalizeGcc, vinted: normalizeVintedPage, ebay: normalizeEbay, cardmarket: normalizeCardmarket };
  const lastRequest = new Map<string, number>();
  async function run(query: MarketPriceQuery, retain: RetainProviderPage): Promise<MarketPriceResult> {
    const time = now();
    try {
      if (query.source === 'gcc') return await searchGcc(query, fetcher, time, timeoutMs, retain);
      if (query.source === 'vinted') return await searchVinted(query, fetcher, time, timeoutMs, retain);
      if (query.source === 'cardmarket') return await searchCardmarket(query, fetcher, time, timeoutMs, retain);
      return await searchEbay(query, fetcher, time, timeoutMs, retain);
    } catch (error) { return failure(query, error, time); }
  }
  function present(page: Page, query: MarketPriceQuery, cached = false): MarketPriceResult {
    try {
      const result = page.raw ? normalizers[page.raw.provider](page.raw.body, query, page.raw.receivedAt) : structuredClone(page.result);
      return { ...result, cached: cached || page.result.cached };
    } catch (error) { return failure(query, error, now()); }
  }
  return {
    async search(input: MarketPriceQuery): Promise<MarketPriceResult> {
      const query = marketPriceQuerySchema.parse(input), time = now();
      // Structured identity fields are comparison evidence, not additional upstream requests.
      const key = JSON.stringify({ source: query.source, query: query.query, mode: query.mode, page: query.page, cursor: query.cursor, productUrl: query.productUrl });
      const cached = cache.get(key);
      if (cached && cached.expires > time) { cache.delete(key); cache.set(key, cached); return present(cached.page, query, true); }
      if (inFlight.has(key)) return present(await inFlight.get(key)!, query, true);
      // Requests are user-triggered. Bound frequency before reaching each external site.
      if (inFlight.size >= 8 || time - (lastRequest.get(query.source) ?? -Infinity) < 1000)
        return { ...baseResult(query, time), message: 'Réessayez dans quelques secondes.', retryAfterSeconds: 2 };
      lastRequest.set(query.source, time);
      const work = (async (): Promise<Page> => { let raw: ProviderPage | undefined; const result = await run(query, value => { raw = value; }); return { result, raw }; })();
      inFlight.set(key, work);
      try {
        const page = await work;
        cache.set(key, { expires: now() + (['ready', 'empty'].includes(page.result.status) ? ttl : Math.min(ttl, 30000)), page });
        while (cache.size > maxEntries) cache.delete(cache.keys().next().value!);
        return present(page, query);
      } finally { inFlight.delete(key); }
    },
    clearCache() { cache.clear(); },
  };
}
