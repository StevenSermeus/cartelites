import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEbay, searchEbay, displayedMoney } from '../src/marketPrices/ebay.js';
import {
  normalizeCardmarket,
  searchCardmarket,
  cardmarketProductUrl,
} from '../src/marketPrices/cardmarket.js';
import { ProviderError } from '../src/marketPrices/common.js';
const now = Date.parse('2026-11-23T12:00:00Z');
const query = { source: 'ebay_us' as const, query: 'Blastoise 60/106', mode: 'sold' as const };
// Deliberately synthetic DOM regression fixtures. Live access is reported separately, never inferred from them.
const ebay = (content: string, next = '') =>
  `<html><title>Blastoise | eBay</title><ul class="srp-results">${content}</ul>${next}</html>`;
const card = (
  options: {
    id?: string;
    price?: string;
    attributes?: string;
    host?: string;
    kind?: string;
    title?: string;
  } = {},
) =>
  `<li class="${options.kind ?? 's-card'}"><a class="${options.kind ?? 's-card'}__link" href="https://www.${options.host ?? 'ebay.com'}/itm/${options.id ?? '123456789012'}"><h3 class="${options.kind ?? 's-card'}__title">${options.title ?? 'Blastoise 60/106 PSA 9 French'}</h3></a><span class="${options.kind ?? 's-card'}__price">${options.price ?? 'US $1,234.56'}</span><div class="s-card__attribute-row">${options.attributes ?? 'Sold Nov 21, 2026'}</div><div class="s-card__attribute-row">Free shipping</div><img src="https://i.ebayimg.com/test.jpg"></li>`;
const productUrl =
  'https://www.cardmarket.com/en/Pokemon/Products/Singles/Base-Set/Blastoise-V1-BS2';
const cm = (rows: string) =>
  `<html><title>Blastoise | Cardmarket</title><link rel="canonical" href="${productUrl}"><h1>Blastoise (BS 2)<small>Base Set - Singles</small></h1><dl><dt>Price Trend</dt><dd>169,12 €</dd></dl><div id="table"><div class="table-body">${rows}</div></div></html>`;
const offer = (price = '1.234,56 €') =>
  `<div class="article-row" id="articleRow2102771147"><span class="seller-name"><a href="/en/Pokemon/Users/Seller">Seller</a></span><div class="product-attributes"><span class="icon" aria-label="French"></span></div><div class="article-condition"><span class="badge">NM</span></div><div class="col-offer"><div class="price-container"><span class="color-primary">${price}</span></div></div></div>`;
test('eBay current DOM preserves exact cents and sold evidence without inferring identity from title', () => {
  const result = normalizeEbay(
      ebay(
        card(),
        '<a class="pagination__next" href="https://www.ebay.com/sch/i.html?_pgn=2">Next</a>',
      ),
      { ...query, language: 'fr', grade: '9', collectorNumber: '60/106' },
      now,
    ),
    row = result.listings[0];
  assert.equal(result.nextPage, 2);
  assert.equal(row.price?.amountMinor, 123456);
  assert.equal(row.price?.currency, 'USD');
  assert.equal(row.state, 'sold');
  assert.equal(row.soldAt, '2026-11-21');
  assert.equal(row.shipping?.amountMinor, 0);
  assert.equal(row.match.grade, 'unknown');
  assert.equal(row.match.language, 'unknown');
  assert.equal(row.match.collectorNumber, 'unknown');
  assert.equal(row.matchConfidence, 'candidate');
});
test('eBay French legacy DOM preserves ranges and accepted-offer uncertainty', () => {
  const result = normalizeEbay(
      ebay(
        card({
          host: 'ebay.fr',
          kind: 's-item',
          price: '100,00 EUR à 200,00 EUR',
          attributes: 'Vendu le 21 nov. 2026 — Offre directe acceptée',
        }),
      ),
      { ...query, source: 'ebay_fr' },
      now,
    ),
    row = result.listings[0];
  assert.equal(row.price, null);
  assert.deepEqual(row.priceRange, {
    minimum: { amountMinor: 10000, currency: 'EUR' },
    maximum: { amountMinor: 20000, currency: 'EUR' },
  });
  assert.equal(row.priceBasis, 'accepted_offer_unknown');
  assert.equal(row.soldAt, null);
});
test('eBay active bids and unconfirmed sold state never become completed sale values', () => {
  const html = ebay(card({ attributes: '12 bids' }));
  const active = normalizeEbay(html, { ...query, mode: 'active' }, now).listings[0];
  assert.equal(active.state, 'active');
  assert.equal(active.priceBasis, 'current_bid');
  const missing = normalizeEbay(html, query, now).listings[0];
  assert.equal(missing.state, 'unknown');
  assert.equal(missing.priceBasis, 'unknown');
  const quantitySold = normalizeEbay(ebay(card({ attributes: '23 sold' })), query, now).listings[0];
  assert.equal(quantitySold.state, 'unknown');
});
test('eBay zero exact matches do not substitute relaxed search results or foreign-market links', () => {
  const html =
    ebay('<li class="srp-river-answer--REWRITE_START">Results matching fewer words</li>' + card()) +
    '<h1 class="srp-controls__count-heading">0 results for exact query</h1>';
  assert.equal(normalizeEbay(html, query, now).status, 'empty');
  assert.deepEqual(normalizeEbay(html, query, now).listings, []);
  assert.throws(() => normalizeEbay(ebay(card({ host: 'ebay.fr' })), query, now), ProviderError);
  assert.throws(
    () => normalizeEbay('<html><title>Unknown layout</title></html>', query, now),
    ProviderError,
  );
});
test('localized money parsing rejects ambiguous and multiple numbers', () => {
  assert.deepEqual(displayedMoney('1.234,56 €', 'fr'), { amountMinor: 123456, currency: 'EUR' });
  assert.deepEqual(displayedMoney('US $1,234.56', 'us'), { amountMinor: 123456, currency: 'USD' });
  for (const text of ['1,234.56 €', '12,3456 €', '10 € 20 €', '20.00 €'])
    assert.equal(displayedMoney(text, 'fr'), null);
});
test('Cardmarket exact product returns real seller offers, never price trends, and preserves language evidence', () => {
  const result = normalizeCardmarket(
      cm(offer()),
      {
        source: 'cardmarket',
        query: 'Blastoise',
        mode: 'active',
        productUrl,
        language: 'fr',
        setName: 'Base Set',
        grade: '9',
      },
      now,
    ),
    row = result.listings[0];
  assert.equal(result.listings.length, 1);
  assert.equal(row.id, '2102771147');
  assert.equal(row.price?.amountMinor, 123456);
  assert.equal(row.priceBasis, 'asking');
  assert.equal(row.state, 'active');
  assert.equal(row.shipping, null);
  assert.equal(row.condition, 'NM');
  assert.equal(row.match.language, 'match');
  assert.equal(row.match.setName, 'match');
  assert.equal(row.match.grade, 'unknown');
  assert.equal(row.soldAt, null);
  assert.equal(row.url, `${productUrl}#articleRow2102771147`);
});
test('Cardmarket text search exposes product choice and never chooses a set or turns minimum prices into offers', () => {
  const html = `<div id="table"><div class="table-body"><div class="row"><a href="${productUrl}">Blastoise Base Set</a><span>From 20,90 €</span></div><div class="row"><a href="https://www.cardmarket.com/en/Pokemon/Products/Singles/XY/Blastoise-EX">Blastoise EX XY</a><span>From 2,00 €</span></div></div></div>`;
  const result = normalizeCardmarket(
    html,
    { source: 'cardmarket', query: 'Blastoise', mode: 'active' },
    now,
  );
  assert.equal(result.productCandidates?.length, 2);
  assert.deepEqual(result.listings, []);
  assert.equal(result.status, 'ready');
});
test('Cardmarket rejects wrong canonical product, malformed offers and arbitrary fetch destinations', () => {
  const q = {
    source: 'cardmarket' as const,
    query: 'Blastoise',
    mode: 'active' as const,
    productUrl,
  };
  assert.throws(
    () =>
      normalizeCardmarket(
        cm(offer()).replace(
          `href="${productUrl}"`,
          'href="https://www.cardmarket.com/en/Pokemon/Products/Singles/XY/Blastoise-EX"',
        ),
        q,
        now,
      ),
    ProviderError,
  );
  assert.throws(() => normalizeCardmarket(cm(offer('Unknown')), q, now), ProviderError);
  assert.equal(
    normalizeCardmarket(cm('<div class="alert">No articles available</div>'), q, now).status,
    'empty',
  );
  for (const url of [
    'http://www.cardmarket.com/en/Pokemon/Products/Singles/Base-Set/Card',
    'https://attacker.example/en/Pokemon/Products/Singles/Base-Set/Card',
    productUrl + '?url=http://localhost',
    productUrl + '#hidden',
    'https://user:password@www.cardmarket.com/en/Pokemon/Products/Singles/Base-Set/Card',
    'https://www.cardmarket.com/en/Pokemon/Users/Someone/Offers/Singles',
  ])
    assert.throws(() => cardmarketProductUrl(url), ProviderError);
});
test('direct transports request only selected public marketplace and reject blocked access honestly', async () => {
  const calls: URL[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push(new URL(String(input)));
    assert.equal(new Headers(init?.headers).get('authorization'), null);
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.redirect, 'error');
    return new Response('Forbidden', { status: 403 });
  };
  for (const source of ['ebay_fr', 'ebay_us'] as const)
    await assert.rejects(
      () => searchEbay({ ...query, source, page: 2 }, fetcher, now, 100),
      (e) => e instanceof ProviderError && e.kind === 'access',
    );
  await assert.rejects(
    () =>
      searchCardmarket(
        { source: 'cardmarket', query: 'Blastoise', mode: 'active', productUrl },
        fetcher,
        now,
        100,
      ),
    (e) => e instanceof ProviderError && e.kind === 'access',
  );
  assert.deepEqual(
    calls.map((u) => u.hostname),
    ['www.ebay.fr', 'www.ebay.com', 'www.cardmarket.com'],
  );
  assert.equal(calls[0].searchParams.get('_nkw'), 'Blastoise 60/106');
  assert.equal(calls[0].searchParams.get('LH_Sold'), '1');
  assert.equal(calls[0].searchParams.get('_pgn'), '2');
  const unsupported = await searchCardmarket(
    { source: 'cardmarket', query: 'Blastoise', mode: 'sold' },
    fetcher,
    now,
    100,
  );
  assert.equal(unsupported.status, 'unsupported');
  assert.equal(calls.length, 3);
});

test('non-US dollar prefixes preserve currency and unknown prefixes never fall back to USD', () => {
  for (const [prefix, currency] of [
    ['NZ', 'NZD'],
    ['HK', 'HKD'],
    ['SG', 'SGD'],
    ['MX', 'MXN'],
    ['CA', 'CAD'],
    ['AU', 'AUD'],
  ])
    assert.deepEqual(displayedMoney(`${prefix} $12.50`, 'us'), { amountMinor: 1250, currency });
  assert.equal(displayedMoney('XYZ $12.50', 'us'), null);
  assert.equal(displayedMoney('EUR $12.50', 'us'), null);
});
