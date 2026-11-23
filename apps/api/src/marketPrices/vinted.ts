import type { MarketListing, MarketMoney, MarketPriceQuery, MarketPriceResult } from '../generated/marketPrices.js';
import { baseResult, evidence, matchSummary, object, ProviderError, safeUrl, string, type FetchLike, type RetainProviderPage } from './common.js';
import { fetchPublicHtml } from './publicHtml.js';

// RSC extraction adapted from googlarz/vinted-mcp-cli (MIT).
// Copyright (c) 2026 vinted-cli contributors. Full notice: THIRD_PARTY_NOTICES.md.
function jsonAt(input: string, start: number): unknown {
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (quoted) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') quoted = false; }
    else if (ch === '"') quoted = true;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      if (--depth === 0) { try { return JSON.parse(input.slice(start, i + 1)); } catch { throw new ProviderError('schema'); } }
    }
  }
  throw new ProviderError('schema');
}
export function parseVintedPage(html: string): { items: unknown[]; page: number; totalPages: number } {
  let flight = '';
  for (const part of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try { flight += JSON.parse(part[1]); } catch { throw new ProviderError('schema'); }
  }
  const marker = '"items":{"items":[', offset = flight.indexOf(marker);
  if (offset < 0) throw new ProviderError('schema');
  const items = jsonAt(flight, offset + marker.length - 1);
  const pg = flight.indexOf('"pagination":{', offset), pagination = pg < 0 ? {} : object(jsonAt(flight, pg + '"pagination":'.length));
  if (!Array.isArray(items) || items.length > 100 || !Number.isInteger(pagination.current_page) ||
      !Number.isInteger(pagination.total_pages) || Number(pagination.current_page) < 1 ||
      Number(pagination.total_pages) < 0 || Number(pagination.total_pages) > 100) throw new ProviderError('schema');
  return { items, page: Number(pagination.current_page), totalPages: Number(pagination.total_pages) };
}
function amount(value: unknown): MarketMoney | null {
  const row = object(value), currency = string(row.currencyCode), decimal = string(row.amount);
  if (!currency || !/^[A-Z]{3}$/.test(currency) || !decimal || !/^\d+(?:\.\d+)?$/.test(decimal)) return null;
  const digits = new Intl.NumberFormat('en', {style:'currency',currency}).resolvedOptions().maximumFractionDigits ?? 2;
  const parts = decimal.split('.'), fraction = parts[1] ?? '';
  if (fraction.slice(digits).replace(/0/g, '')) return null;
  const minor = Number(BigInt(parts[0]) * 10n ** BigInt(digits) + BigInt(fraction.slice(0,digits).padEnd(digits, '0') || '0'));
  return Number.isSafeInteger(minor) ? { amountMinor: minor, currency } : null;
}
export function normalizeVintedPage(body: unknown, query: MarketPriceQuery, now: number): MarketPriceResult {
  const payload = object(body);
  if (!Array.isArray(payload.items) || payload.items.length > 100 || payload.page !== (query.page ?? 1)) throw new ProviderError('schema');
  const listings: MarketListing[] = [];
  let skipped = 0;
  for (const raw of payload.items) {
    const entry = object(raw), row = object(entry.productItem), id = String(row.id ?? entry.id ?? ''), title = string(row.title);
    const path = string(row.url), url = path ? safeUrl(new URL(path, 'https://www.vinted.fr').href, ['vinted.fr']) : null;
    const price = amount(row.priceWithDiscount) ?? amount(row.price), fee = amount(row.serviceFee), total = amount(row.totalItemPrice);
    if (!/^\d+$/.test(id) || !title || !url || !new URL(url).pathname.startsWith(`/items/${id}-`) || !price) { skipped++; continue; }
    const photos = Array.isArray(row.thumbnailUrls) ? row.thumbnailUrls : [], photo = object(photos[0]);
    const imageUrl = safeUrl(string(photo.url) ?? string(photos[0]) ?? string(row.thumbnailUrl), ['vinted.net', 'vinted.com']);
    const facts = { language: null, gradingCompany: null, grade: null, collectorNumber: null, setName: null };
    const match = evidence(query, facts);
    const warnings = ['Prix demandé, pas une vente terminée.', 'Langue, numéro et gradation non vérifiés dans le texte de l’annonce.'];
    if (row.priceWithDiscount && !amount(row.priceWithDiscount)) warnings.push('La remise affichée ne peut pas être interprétée.');
    const consistentTotal = total && fee && total.currency === price.currency && fee.currency === price.currency && total.amountMinor === price.amountMinor + fee.amountMinor;
    if (total && !consistentTotal) warnings.push('Total et frais de protection non rapprochés du prix de l’article.');
    listings.push({ id, source: 'vinted', provider: 'vinted_public', title, url, imageUrl,
      state: 'active', format: 'fixed_price', price, priceRange: null, priceBasis: 'asking', shipping: null,
      buyerProtectionFee: fee, totalBeforeShipping: consistentTotal ? total : null, soldAt: null, condition: null,
      ...facts, match, ...matchSummary(match), warnings });
  }
  if (payload.items.length && !listings.length) throw new ProviderError('schema');
  const page = query.page ?? 1, totalPages = Math.min(Number(payload.totalPages), 10);
  return { ...baseResult(query, now), provider: 'vinted_public', status: listings.length ? 'ready' : 'empty', listings,
    nextPage: page < totalPages ? page + 1 : null, message: listings.length ? 'Annonces publiques Vinted chargées directement.' : 'Aucune annonce publique trouvée.',
    limitations: ['Vinted expose des annonces actives, pas un historique de ventes réussies.', 'Le catalogue public limite les recherches à 10 pages. Les prix restent dans leur devise d’origine.', ...(skipped ? [`${skipped} entrée(s) non exploitable(s) ignorée(s).`] : [])] };
}
export async function searchVinted(query: MarketPriceQuery, fetcher: FetchLike, now: number, timeoutMs: number, retain?: RetainProviderPage) {
  if (query.mode !== 'active' || (query.page ?? 1) > 10 || query.cursor) return { ...baseResult(query, now), provider: 'vinted_public' as const, status: 'unsupported' as const,
    message: query.mode !== 'active' ? 'Vinted expose uniquement les annonces actives.' : 'Cette recherche Vinted dépasse la pagination disponible.' };
  // Observed in the public category tree, 2026-11-23: single trading cards.
  const url = new URL('https://www.vinted.fr/catalog/4875-single-trading-cards');
  url.searchParams.set('search_text', query.query); url.searchParams.set('page', String(query.page ?? 1)); url.searchParams.set('order', 'relevance');
  const payload = parseVintedPage(await fetchPublicHtml(fetcher, url.href, timeoutMs));
  const result = normalizeVintedPage(payload, query, now);
  retain?.({provider:'vinted',body:payload,receivedAt:now});
  return result;
}
