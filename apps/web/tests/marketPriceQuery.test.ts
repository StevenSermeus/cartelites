import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMarketQuery, marketIdentityKey, marketQuery } from '../src/lib/marketPriceQuery.ts';
test('research query includes identity but never private fields or valuation amounts', () => {
  const item = {
    name: 'Pikachu',
    identifier: '60/106',
    series: 'Set',
    language: 'fr',
    gradingCompany: 'PSA',
    gradingGrade: '9.5',
    privateNotes: 'never transmit',
    privateAttributes: { secret: 'private' },
    marketValue: '100',
    askingPrice: '90',
  };
  const result = buildMarketQuery(item, 'gcc', 'sold', marketQuery(item));
  assert.equal(result.query, 'Pikachu 60/106 PSA 9.5');
  assert.equal(result.language, 'fr');
  assert.equal(result.grade, '9.5');
  assert.equal(result.page, 1);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(JSON.stringify(result).includes('100'), false);
});
test('unrelated form edits do not invalidate market research, card identity changes do', () => {
  const item = { name: 'Pikachu', language: 'fr', marketValue: '100' };
  assert.equal(marketIdentityKey(item), marketIdentityKey({ ...item, marketValue: '200' }));
  assert.notEqual(marketIdentityKey(item), marketIdentityKey({ ...item, language: 'en' }));
  assert.notEqual(marketIdentityKey(item), marketIdentityKey({ ...item, gradingGrade: '9' }));
});
test('Cardmarket exact product choice starts at page one and pagination retains its identity', async () => {
  const { selectMarketProduct } = await import('../src/lib/marketPriceQuery.ts');
  const url = 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/Base-Set/Pikachu';
  const query = selectMarketProduct(
    { source: 'cardmarket', query: 'Pikachu', mode: 'active', page: 4, cursor: 'old' },
    url,
  );
  assert.equal(query.productUrl, url);
  assert.equal(query.page, 1);
  assert.equal(query.cursor, undefined);
  assert.equal({ ...query, page: 2 }.productUrl, url);
});
test('exact product input is Cardmarket-only, rejects alternate hosts and never leaks between sources', async () => {
  const { cardmarketProductUrl, selectMarketProduct } = await import(
    '../src/lib/marketPriceQuery.ts'
  );
  const url = 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/Base-Set/Pikachu';
  assert.equal(
    buildMarketQuery({ name: 'Pikachu' }, 'cardmarket', 'active', 'Pikachu', url).productUrl,
    url,
  );
  assert.equal(
    buildMarketQuery({ name: 'Pikachu' }, 'gcc', 'sold', 'Pikachu', url).productUrl,
    undefined,
  );
  assert.equal(cardmarketProductUrl(` ${url}#ignored `), url);
  for (const invalid of [
    'https://attacker.example/fr/Pokemon/Products/Pikachu',
    'https://www.cardmarket.com/fr/Pokemon/Products',
    'https://me:secret@www.cardmarket.com/fr/Pokemon/Products/Pikachu',
    'http://www.cardmarket.com/fr/Pokemon/Products/Pikachu',
    'javascript:alert(1)',
    'https://www.cardmarket.com:3000/fr/Pokemon/Products/Pikachu',
  ])
    assert.throws(() => cardmarketProductUrl(invalid));
  assert.throws(() => selectMarketProduct({ source: 'gcc', query: 'Pikachu' }, url));
});
