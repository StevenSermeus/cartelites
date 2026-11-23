import { load } from 'cheerio';
import type {
  MarketListing,
  MarketMoney,
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

/** Public SRP layouts inspected against flipagent/flipagent's MIT ebay-scraper source.
 * Only DOM selectors are shared; no hosted scraper, proxy or remote process is used. */
export function ebaySearchUrl(query: MarketPriceQuery) {
  if (!['ebay_fr', 'ebay_us'].includes(query.source)) throw new ProviderError('schema');
  const url = new URL(
    '/sch/i.html',
    query.source === 'ebay_fr' ? 'https://www.ebay.fr' : 'https://www.ebay.com',
  );
  url.searchParams.set('_nkw', query.query);
  url.searchParams.set('_pgn', String(query.page ?? 1));
  url.searchParams.set('_ipg', '60');
  if ((query.mode ?? 'sold') === 'sold') {
    url.searchParams.set('LH_Sold', '1');
    url.searchParams.set('LH_Complete', '1');
    url.searchParams.set('_sop', '13');
  } else url.searchParams.set('_sop', '10');
  return url.toString();
}
/** Strict localized decimal parser: ambiguous separators and ranges never become one price. */
export function displayedMoney(text: string, locale: 'fr' | 'us'): MarketMoney | null {
  const dollarPrefixes: Record<string, string> = {
    US: 'USD',
    USD: 'USD',
    C: 'CAD',
    CA: 'CAD',
    CAD: 'CAD',
    A: 'AUD',
    AU: 'AUD',
    AUD: 'AUD',
    NZ: 'NZD',
    NZD: 'NZD',
    HK: 'HKD',
    HKD: 'HKD',
    S: 'SGD',
    SG: 'SGD',
    SGD: 'SGD',
    MX: 'MXN',
    MXN: 'MXN',
  };
  const currencies = new Set<string>();
  for (const match of text.matchAll(/(?:([A-Za-z]{1,5})\s*)?\$/g)) {
    const prefix = match[1]?.toUpperCase(),
      currency = prefix ? dollarPrefixes[prefix] : 'USD';
    if (!currency) return null;
    currencies.add(currency);
  }
  if (text.includes('€')) currencies.add('EUR');
  if (text.includes('£')) currencies.add('GBP');
  for (const code of text.matchAll(/\b(?:USD|EUR|GBP|CAD|AUD|NZD|HKD|SGD|MXN)\b/g))
    currencies.add(code[0]);
  if (currencies.size !== 1) return null;
  const currency = [...currencies][0];
  const parts = text.replace(/\u00a0|\u202f/g, ' ').match(/\d[\d., ]*/g);
  if (parts?.length !== 1) return null;
  let value = parts[0].trim();
  const pattern =
    locale === 'fr'
      ? /^(?:\d+|\d{1,3}(?:[ .]\d{3})+)(?:,\d{1,2})?$/
      : /^(?:\d+|\d{1,3}(?:[, ]\d{3})+)(?:\.\d{1,2})?$/;
  if (!pattern.test(value)) return null;
  value =
    locale === 'fr' ? value.replace(/[ .]/g, '').replace(',', '.') : value.replace(/[, ]/g, '');
  const amountMinor = Math.round(Number(value) * 100);
  return Number.isSafeInteger(amountMinor) ? { amountMinor, currency } : null;
}
function soldDate(text: string): string | null {
  const iso = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (iso && Number.isFinite(Date.parse(iso))) return iso;
  // A missing year remains unknown, rather than guessing from the current year.
  const months = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
  ];
  const full = text.match(/\b([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (!full) return null;
  const month = months.indexOf(full[1].toLowerCase().slice(0, 3));
  if (month < 0) return null;
  const date = new Date(Date.UTC(Number(full[3]), month, Number(full[2])));
  return date.getUTCMonth() === month ? date.toISOString().slice(0, 10) : null;
}
export function normalizeEbay(
  body: unknown,
  query: MarketPriceQuery,
  now: number,
): MarketPriceResult {
  if (typeof body !== 'string' || !['ebay_fr', 'ebay_us'].includes(query.source))
    throw new ProviderError('schema');
  const $ = load(body),
    locale = query.source === 'ebay_fr' ? 'fr' : 'us',
    host = locale === 'fr' ? 'ebay.fr' : 'ebay.com';
  if (
    /captcha|security measure|pardon our interruption|access denied|error page/i.test(
      $('title').text(),
    ) ||
    $('#challenge-form').length
  )
    throw new ProviderError('access');
  const listings: MarketListing[] = [],
    seen = new Set<string>();
  let skipped = 0;
  const rows = $('.srp-results li.s-card, .srp-results li.s-item');
  rows.each((_, element) => {
    const row = $(element);
    if (row.prevAll('.srp-river-answer--REWRITE_START,.srp-river-answer--MORE_RESULTS').length) {
      skipped++;
      return;
    }
    const title = row
      .find('.s-card__title,.s-item__title')
      .first()
      .text()
      .replace(/^New Listing\s*|^Nouvelle annonce\s*/i, '')
      .trim();
    const href = row.find('a.s-card__link,a.s-item__link').first().attr('href'),
      url = safeUrl(href, [host]);
    const id = url
      ? new URL(url).pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,15})(?:\/|$)/)?.[1]
      : undefined;
    if (!title || !id || !url || seen.has(id) || /Shop on eBay|Achetez sur eBay/i.test(title)) {
      skipped++;
      return;
    }
    seen.add(id);
    const rawPrice = row.find('.s-card__price,.s-item__price').first().text().trim(),
      rangeParts = rawPrice.split(/\s+(?:to|à|–|-)\s+/i);
    const low = rangeParts.length === 2 ? displayedMoney(rangeParts[0], locale) : null,
      high = rangeParts.length === 2 ? displayedMoney(rangeParts[1], locale) : null;
    const priceRange =
        low && high && low.currency === high.currency && low.amountMinor <= high.amountMinor
          ? { minimum: low, maximum: high }
          : null,
      price = rangeParts.length === 1 ? displayedMoney(rawPrice, locale) : null;
    const attributes = row
      .find(
        '.s-card__attribute-row,.s-card__caption,.s-item__title--tagblock,.s-item__caption,.s-item__ended-date',
      )
      .map((_, e) => $(e).text().trim())
      .get();
    const soldLabel = attributes.find((t) => /^(?:Sold\b|Vendu(?:e)?(?:s)?\b)/i.test(t)),
      sold = (query.mode ?? 'sold') === 'sold' && !!soldLabel;
    const summary = row.text(),
      accepted = /best offer accepted|offre (?:directe )?acceptée/i.test(summary),
      auction = /\d+\s*(?:bids?|enchères?)/i.test(summary),
      fixed = /buy it now|achat immédiat|fixed price|prix fixe/i.test(summary);
    const shippingText =
      row.find('.s-item__shipping,.s-item__logisticsCost').first().text().trim() ||
      attributes.find((t) => /shipping|delivery|livraison|port\b/i.test(t)) ||
      '';
    const shipping = /free (?:shipping|delivery)|livraison gratuite|port gratuit/i.test(
      shippingText,
    )
      ? { amountMinor: 0, currency: price?.currency ?? (locale === 'fr' ? 'EUR' : 'USD') }
      : displayedMoney(shippingText, locale);
    const details = {
        language: null,
        gradingCompany: null,
        grade: null,
        collectorNumber: null,
        setName: null,
      },
      match = evidence(query, details);
    const image = row.find('.s-card__image,.s-item__image-img,img').first();
    listings.push({
      id,
      source: query.source,
      provider: 'ebay_public',
      title,
      url,
      imageUrl: safeUrl(image.attr('src') ?? image.attr('data-src'), ['ebayimg.com']),
      state: sold ? 'sold' : query.mode === 'active' ? 'active' : 'unknown',
      format: auction ? 'auction' : fixed ? 'fixed_price' : 'unknown',
      price,
      priceRange,
      priceBasis: accepted
        ? 'accepted_offer_unknown'
        : sold
          ? 'provider_sold'
          : query.mode === 'active'
            ? auction
              ? 'current_bid'
              : fixed
                ? 'asking'
                : 'unknown'
            : 'unknown',
      shipping,
      buyerProtectionFee: null,
      totalBeforeShipping: null,
      soldAt: sold ? soldDate(soldLabel!) : null,
      condition:
        row.find('.s-card__subtitle,.s-item__subtitle,.SECONDARY_INFO').first().text().trim() ||
        null,
      ...details,
      match,
      ...matchSummary(match),
      warnings: [
        'Correspondance non confirmée : langue, extension et gradation ne sont pas déduites du titre.',
        ...(accepted
          ? ['Offre acceptée : le montant réellement payé peut différer du prix affiché.']
          : []),
        ...(!price && !priceRange ? ['Prix affiché non interprétable sans ambiguïté.'] : []),
        ...((query.mode ?? 'sold') === 'sold' && !sold
          ? ['Statut vendu non confirmé par cette annonce.']
          : []),
      ],
    });
  });
  const zero =
    /^\s*0\s+(?:results?|résultats?)/i.test($('.srp-controls__count-heading').first().text()) ||
    /no exact matches found|aucun résultat/i.test(
      $('.srp-save-null-search,.srp-river-answer--NONE').text(),
    );
  if (!listings.length && !zero) throw new ProviderError('schema');
  let nextPage: number | null = null;
  const next = $('a.pagination__next,a[rel="next"]').first().attr('href');
  if (next) {
    const url = safeUrl(new URL(next, ebaySearchUrl(query)).toString(), [host]);
    if (url) {
      const p = Number(new URL(url).searchParams.get('_pgn'));
      if (Number.isInteger(p) && p === (query.page ?? 1) + 1 && p <= 100) nextPage = p;
    }
  }
  return {
    ...baseResult(query, now),
    provider: 'ebay_public',
    status: listings.length ? 'ready' : 'empty',
    listings,
    nextPage,
    message: listings.length
      ? 'Annonces eBay publiques chargées.'
      : 'Aucun résultat exact affiché par eBay.',
    limitations: [
      'Lecture directe de la page publique, sans service tiers.',
      'Les offres acceptées et les frais non affichés restent inconnus.',
      ...(skipped
        ? [`${skipped} annonce(s) secondaire(s) ou non interprétable(s) ignorée(s).`]
        : []),
    ],
  };
}
export async function searchEbay(
  query: MarketPriceQuery,
  fetcher: FetchLike,
  now: number,
  timeoutMs: number,
  retain?: RetainProviderPage,
) {
  if (query.cursor || query.productUrl)
    return {
      ...baseResult(query, now),
      provider: 'ebay_public' as const,
      status: 'unsupported' as const,
      message: 'La recherche eBay utilise une requête et un numéro de page.',
    };
  const html = await fetchPublicHtml(fetcher, ebaySearchUrl(query), timeoutMs),
    result = normalizeEbay(html, query, now);
  retain?.({ provider: 'ebay', body: html, receivedAt: now });
  return result;
}
