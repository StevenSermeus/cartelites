import { load } from 'cheerio';
import type {
  MarketListing,
  MarketPriceQuery,
  MarketPriceResult,
} from '../generated/marketPrices.js';
import {
  baseResult,
  evidence,
  matchSummary,
  ProviderError,
  safeUrl,
  type FetchLike,
  type RetainProviderPage,
} from './common.js';
import { fetchPublicHtml } from './publicHtml.js';
import { displayedMoney } from './ebay.js';
const ORIGIN = 'https://www.cardmarket.com';
/** Exact product only; never accept seller-account links, arbitrary hosts or credential URLs. */
export function cardmarketProductUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderError('schema');
  }
  if (
    url.origin !== ORIGIN ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/[a-z]{2}\/[A-Za-z][A-Za-z0-9]*\/Products\/(?:Singles|Cards)\/[^/]+\/[^/]+\/?$/.test(url.pathname) ||
    /%2f|%5c/i.test(url.pathname)
  )
    throw new ProviderError('schema');
  return url.toString();
}
export function cardmarketSearchUrl(query: MarketPriceQuery) {
  const url = query.productUrl
    ? new URL(cardmarketProductUrl(query.productUrl))
    : new URL('/fr/Pokemon/Products/Search', ORIGIN);
  if (!query.productUrl) url.searchParams.set('searchString', query.query);
  if ((query.page ?? 1) > 1) url.searchParams.set('site', String(query.page));
  return url.toString();
}
/** Uses actual article-row offer selectors, also documented in public Cardmarket extension source.
 * Product search minimums and price-trend widgets are deliberately never interpreted as listings. */
export function normalizeCardmarket(
  body: unknown,
  query: MarketPriceQuery,
  now: number,
): MarketPriceResult {
  if (typeof body !== 'string' || query.source !== 'cardmarket') throw new ProviderError('schema');
  const $ = load(body),
    base = { ...baseResult(query, now), provider: 'cardmarket_public' as const };
  if (
    /just a moment|attention required|access denied|captcha/i.test($('title').text()) ||
    $('#challenge-form').length
  )
    throw new ProviderError('access');
  const nextHref = $('.pagination a[rel="next"],a[aria-label="Next"],a[aria-label="Suivant"]')
    .first()
    .attr('href');
  let nextPage: number | null = null;
  if (nextHref) {
    const next = safeUrl(new URL(nextHref, cardmarketSearchUrl(query)).toString(), [
      'cardmarket.com',
    ]);
    if (next) {
      const page = Number(new URL(next).searchParams.get('site'));
      if (page === (query.page ?? 1) + 1 && page <= 100) nextPage = page;
    }
  }
  if (!query.productUrl) {
    const candidates: NonNullable<MarketPriceResult['productCandidates']> = [],
      seen = new Set<string>();
    $(
      '#table .table-body a[href*="/Products/Singles/"],#table .table-body a[href*="/Products/Cards/"],.product-row a[href*="/Products/"]',
    ).each((_, element) => {
      const link = $(element),
        href = link.attr('href');
      if (!href) return;
      let url: string;
      try {
        url = cardmarketProductUrl(new URL(href, ORIGIN).toString());
      } catch {
        return;
      }
      const title = link.text().trim() || link.attr('title')?.trim();
      if (!title || seen.has(url) || candidates.length >= 50) return;
      seen.add(url);
      const image = link.closest('.row,.product-row').find('img').first(),
        imageUrl = safeUrl(image.attr('src'), ['cardmarket.com', 'mkmstatic.com']);
      candidates.push({ title, url, imageUrl });
    });
    const noResults = /no products found|no results|aucun (?:produit|résultat)/i.test(
      $('#table,.alert').text(),
    );
    if (!candidates.length && !noResults) throw new ProviderError('schema');
    return {
      ...base,
      status: candidates.length ? 'ready' : 'empty',
      listings: [],
      productCandidates: candidates,
      nextPage,
      message: candidates.length
        ? 'Choisissez la carte et son extension pour consulter les offres vendeurs.'
        : 'Aucun produit trouvé sur Cardmarket.',
      limitations: [
        'Les produits proposés ne sont pas des annonces vendeurs.',
        'Aucune version ou extension n’est choisie automatiquement.',
      ],
    };
  }
  const productUrl = cardmarketProductUrl(query.productUrl),
    canonical = $('link[rel="canonical"]').attr('href');
  if (canonical) {
    let actual: string;
    try {
      actual = cardmarketProductUrl(canonical);
    } catch {
      throw new ProviderError('schema');
    }
    if (
      new URL(actual).pathname.replace(/\/$/, '') !==
      new URL(productUrl).pathname.replace(/\/$/, '')
    )
      throw new ProviderError('schema');
  }
  const heading = $('h1').first(),
    title = heading.clone().find('small').remove().end().text().trim(),
    setName =
      heading
        .find('small')
        .first()
        .text()
        .replace(/\s*-?\s*Singles\s*$/, '')
        .trim() || null;
  if (!title) throw new ProviderError('schema');
  const listings: MarketListing[] = [],
    seen = new Set<string>();
  let skipped = 0;
  $('#table .table-body .article-row').each((_, element) => {
    const row = $(element),
      id = row.attr('id')?.match(/^articleRow(\d+)$/)?.[1];
    const priceText = row
        .find('.col-offer .price-container .color-primary,.mobile-offer-container .color-primary')
        .first()
        .text()
        .trim(),
      price = displayedMoney(priceText, 'fr');
    if (!id || seen.has(id) || !price) {
      skipped++;
      return;
    }
    seen.add(id);
    const language =
      row
        .find('.product-attributes .icon')
        .map(
          (_, e) =>
            $(e).attr('aria-label') ?? $(e).attr('data-original-title') ?? $(e).attr('title') ?? '',
        )
        .get()
        .find((value) =>
          /^(?:French|Français|English|Anglais|German|Allemand|Spanish|Espagnol|Italian|Italien|Japanese|Japonais|Chinese|Chinois|Portuguese|Portugais|Dutch|Néerlandais)$/i.test(
            value.trim(),
          ),
        )
        ?.trim() ?? null;
    const details = { language, gradingCompany: null, grade: null, collectorNumber: null, setName },
      match = evidence(query, details),
      seller = row.find('.seller-name a[href*="/Users/"]').first().text().trim();
    const condition =
      row
        .find(
          '.article-condition .badge,.article-condition [data-original-title],.article-condition',
        )
        .first()
        .text()
        .trim() || null;
    listings.push({
      id,
      source: 'cardmarket',
      provider: 'cardmarket_public',
      title: seller ? `${title} — ${seller}` : title,
      url: `${productUrl}#articleRow${id}`,
      imageUrl: safeUrl($('meta[property="og:image"]').attr('content'), [
        'cardmarket.com',
        'mkmstatic.com',
      ]),
      state: 'active',
      format: 'fixed_price',
      price,
      priceRange: null,
      priceBasis: 'asking',
      shipping: null,
      buyerProtectionFee: null,
      totalBeforeShipping: null,
      soldAt: null,
      condition,
      ...details,
      match,
      ...matchSummary(match),
      warnings: [
        'Prix demandé par le vendeur, pas une vente terminée.',
        'Frais de port inconnus. La gradation n’est pas déduite des commentaires vendeur.',
      ],
    });
  });
  const noOffers =
    /no articles available|no offers available|aucun(?:e)? (?:article|offre)|pas d.offre/i.test(
      $('#table .alert,#table .table-body,.alert').text(),
    );
  if (!listings.length && !noOffers) throw new ProviderError('schema');
  return {
    ...base,
    status: listings.length ? 'ready' : 'empty',
    listings,
    nextPage,
    message: listings.length
      ? 'Offres vendeurs de ce produit Cardmarket chargées.'
      : 'Aucune offre affichée pour ce produit.',
    limitations: [
      'Lecture directe de la page publique, sans service tiers.',
      'Les tendances et prix moyens ne sont pas des annonces ni des prix de vente attestés.',
      ...(skipped ? [`${skipped} offre(s) non interprétable(s) ignorée(s).`] : []),
    ],
  };
}
export async function searchCardmarket(
  query: MarketPriceQuery,
  fetcher: FetchLike,
  now: number,
  timeoutMs: number,
  retain?: RetainProviderPage,
) {
  if ((query.mode ?? 'sold') === 'sold')
    return {
      ...baseResult(query, now),
      provider: 'cardmarket_public' as const,
      status: 'unsupported' as const,
      message:
        'Cardmarket expose les offres actives. Les ventes individuelles terminées ne sont pas publiques.',
    };
  if (query.cursor)
    return {
      ...baseResult(query, now),
      provider: 'cardmarket_public' as const,
      status: 'unsupported' as const,
      message: 'Cardmarket utilise un numéro de page.',
    };
  const html = await fetchPublicHtml(fetcher, cardmarketSearchUrl(query), timeoutMs),
    result = normalizeCardmarket(html, query, now);
  retain?.({ provider: 'cardmarket', body: html, receivedAt: now });
  return result;
}
