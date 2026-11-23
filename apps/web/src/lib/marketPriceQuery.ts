import type {
  MarketPriceMode,
  MarketPriceQuery,
  MarketPriceSource,
} from '../../../../packages/domain/src/marketPrices';
export type MarketIdentity = {
  name: string;
  series?: string;
  identifier?: string;
  language?: string;
  gradingCompany?: string;
  gradingGrade?: string;
};
export const marketIdentityKey = (item: MarketIdentity) =>
  JSON.stringify([
    item.name,
    item.series,
    item.identifier,
    item.language,
    item.gradingCompany,
    item.gradingGrade,
  ]);
export const marketQuery = (item: MarketIdentity) =>
  [item.name, item.identifier, item.gradingCompany, item.gradingGrade]
    .filter(Boolean)
    .join(' ')
    .slice(0, 200);
export function buildMarketQuery(
  item: MarketIdentity,
  source: MarketPriceSource,
  mode: MarketPriceMode,
  query: string,
  productUrl?: string,
): MarketPriceQuery {
  return {
    source,
    query: query.trim(),
    ...(source === 'cardmarket' && productUrl?.trim()
      ? { productUrl: cardmarketProductUrl(productUrl) }
      : {}),
    mode,
    page: 1,
    language: item.language,
    gradingCompany: item.gradingCompany,
    grade: item.gradingGrade,
    collectorNumber: item.identifier,
    setName: item.series,
  };
}

/** A product URL is an identity choice, never a source endpoint supplied to the browser. */
export function cardmarketProductUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Collez une URL de fiche produit Cardmarket valide.');
  }
  if (
    url.protocol !== 'https:' ||
    !['cardmarket.com', 'www.cardmarket.com'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    !/^\/[a-z]{2}\/[^/]+\/Products\/.+/.test(url.pathname)
  )
    throw new Error('Utilisez une fiche produit https://www.cardmarket.com/…/Products/…');
  url.hash = '';
  return url.toString();
}
export function selectMarketProduct(query: MarketPriceQuery, productUrl: string): MarketPriceQuery {
  if (query.source !== 'cardmarket')
    throw new Error('Le choix de produit concerne uniquement Cardmarket.');
  return { ...query, productUrl: cardmarketProductUrl(productUrl), page: 1, cursor: undefined };
}
