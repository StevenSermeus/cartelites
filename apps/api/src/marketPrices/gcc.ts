import type {
  MarketListing,
  MarketPriceQuery,
  MarketPriceResult,
} from '../generated/marketPrices.js';
import {
  baseResult,
  date,
  evidence,
  matchSummary,
  fetchJson,
  integer,
  moneyMinor,
  object,
  ProviderError,
  string,
  type FetchLike,
  type RetainProviderPage,
} from './common.js';
export const GCC_ENDPOINT = 'https://api.gradedcardcenter.com/on-sale-items';
/** Observed anonymous response and public client route, 2026-11-23; no private account data requested. */
export function normalizeGcc(
  body: unknown,
  query: MarketPriceQuery,
  now: number,
): MarketPriceResult {
  const payload = object(body),
    info = object(payload.info);
  if (!Array.isArray(payload.results) || payload.results.length > 250 || !('nextCursor' in info))
    throw new ProviderError('schema');
  const mode = query.mode ?? 'sold',
    listings: MarketListing[] = [];
  let skipped = 0;
  for (const raw of payload.results) {
    const row = object(raw),
      item = object(row.item),
      card = object(item.collectible),
      id = string(row.id),
      title = string(item.title);
    if (
      !id ||
      !/^[0-9a-f-]{36}$/i.test(id) ||
      !title ||
      row.status !== (mode === 'sold' ? 'SOLD' : 'ON_SALE')
    ) {
      skipped++;
      continue;
    }
    const fixed = row.sellingType === 'FIXED_PRICE',
      auction = ['PRIVATE', 'WEEKLY', 'MONTHLY', 'PREMIUM', 'EVENT'].includes(
        String(row.sellingType),
      );
    const photo = string(item.rectoImageKey);
    const details = {
      language: string(card.language),
      gradingCompany: string(item.gradingCompany),
      grade: string(item.grade),
      collectorNumber: string(card.reference),
      setName: string(card.set),
    };
    listings.push({
      id,
      source: 'gcc',
      provider: 'gcc_public',
      title,
      url: `https://gradedcardcenter.com/item/${id}`,
      imageUrl: photo
        ? `https://cdn.gradedcardcenter.com/image/width=350,fit=contain,format=webp,quality=65/${photo.split('/').map(encodeURIComponent).join('/')}`
        : null,
      state: mode === 'sold' ? 'sold' : 'active',
      format: fixed ? 'fixed_price' : auction ? 'auction' : 'unknown',
      price: moneyMinor(row.priceInCents, 'EUR'),
      priceRange: null,
      priceBasis:
        mode === 'sold' ? 'provider_sold' : fixed ? 'asking' : auction ? 'current_bid' : 'unknown',
      shipping: null,
      buyerProtectionFee: null,
      totalBeforeShipping: null,
      soldAt: date(row.soldAt),
      condition: null,
      ...details,
      match: evidence(query, details),
      ...matchSummary(evidence(query, details)),
      warnings: [
        'Frais de port et frais éventuels non renseignés.',
        ...(mode === 'sold'
          ? ['Prix de vente affiché par GCC ; encaissement indépendant non vérifié.']
          : auction
            ? ['Enchère en cours : ce montant n’est pas un prix de vente final.']
            : []),
      ],
    });
  }
  if (payload.results.length && !listings.length) throw new ProviderError('schema');
  const cursor = string(info.nextCursor),
    next = integer(info.nextPage);
  if (cursor && cursor.length > 4096) throw new ProviderError('schema');
  return {
    ...baseResult(query, now),
    provider: 'gcc_public',
    status: listings.length ? 'ready' : 'empty',
    listings,
    nextPage: cursor ? (next ?? (query.page ?? 1) + 1) : null,
    nextCursor: cursor,
    message: listings.length
      ? 'Annonces publiques GCC chargées.'
      : 'Aucune annonce GCC disponible pour cette page.',
    limitations: [
      'Correspondances à vérifier : seules les données structurées renseignées sont comparées.',
      'Une page de résultats, pas un historique exhaustif.',
      ...(skipped
        ? [`${skipped} résultat(s) incomplet(s) ou au statut incompatible ignoré(s).`]
        : []),
    ],
  };
}
export async function searchGcc(
  query: MarketPriceQuery,
  fetcher: FetchLike,
  now: number,
  timeoutMs: number,
  retain?: RetainProviderPage,
) {
  if ((query.page ?? 1) > 1 && !query.cursor)
    return {
      ...baseResult(query, now),
      provider: 'gcc_public' as const,
      status: 'unsupported' as const,
      message: 'La page suivante nécessite le curseur retourné par GCC.',
    };
  const url = new URL(GCC_ENDPOINT);
  url.searchParams.set('searchText', query.query);
  url.searchParams.set('limit', '24');
  url.searchParams.set('status', (query.mode ?? 'sold') === 'sold' ? 'SOLD' : 'ON_SALE');
  url.searchParams.set('sortType', (query.mode ?? 'sold') === 'sold' ? 'SOLD_LAST' : 'ENDING_SOON');
  if (query.cursor) url.searchParams.set('cursor', query.cursor);
  const { body } = await fetchJson(
    fetcher,
    url.toString(),
    { headers: { Accept: 'application/json' } },
    timeoutMs,
  );
  const result = normalizeGcc(body, query, now);
  retain?.({ provider: 'gcc', body, receivedAt: now });
  return result;
}
