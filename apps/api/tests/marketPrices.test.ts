import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarketPriceService, marketPriceQuerySchema } from '../src/marketPrices/index.js';
import { normalizeGcc } from '../src/marketPrices/gcc.js';
import { fetchJson, ProviderError, type FetchLike } from '../src/marketPrices/common.js';
const time = Date.parse('2026-11-23T12:00:00Z');
const gccRow = {
  id: '6b8221b3-3856-459c-9b0b-695381caabbb',
  status: 'SOLD',
  sellingType: 'FIXED_PRICE',
  priceInCents: 28000,
  soldAt: '2026-11-21T15:03:57.182Z',
  item: {
    title: 'PSA 9 Pikachu',
    gradingCompany: 'PSA',
    grade: '9',
    rectoImageKey: 'item/photo.jpg',
    collectible: {
      language: 'French',
      set: 'Neo Genesis',
      reference: '#5/111',
    },
  },
};
const gcc = (results: unknown[] = [gccRow], cursor: string | null = null) => ({
  info: { currentPage: 1, nextPage: cursor ? 2 : null, nextCursor: cursor },
  results,
});
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
test('GCC preserves exact cents, structured grading/language and cursor without guessing shipping', () => {
  const result = normalizeGcc(
      gcc(undefined, 'next-cursor'),
      {
        source: 'gcc',
        query: 'Pikachu',
        language: 'fr',
        grade: '9',
        gradingCompany: 'PSA',
        collectorNumber: '5/111',
        setName: 'Neo Genesis',
      },
      time,
    ),
    item = result.listings[0];
  assert.equal(result.status, 'ready');
  assert.deepEqual(item.price, { amountMinor: 28000, currency: 'EUR' });
  assert.equal(item.shipping, null);
  assert.equal(item.match.language, 'match');
  assert.equal(item.match.collectorNumber, 'match');
  assert.equal(item.grade, '9');
  assert.equal(result.nextCursor, 'next-cursor');
  assert.equal(result.nextPage, 2);
  assert.equal(item.priceBasis, 'provider_sold');
});

test('GCC missing evidence stays unknown and an ambiguous reference is not claimed exact', () => {
  const row = {
    ...gccRow,
    item: {
      ...gccRow.item,
      grade: 'Authentic',
      collectible: { reference: '#005/111' },
    },
  };
  const item = normalizeGcc(
    gcc([row]),
    {
      source: 'gcc',
      query: 'Pikachu French PSA 9',
      language: 'fr',
      collectorNumber: '5/111',
    },
    time,
  ).listings[0];
  assert.equal(item.match.language, 'unknown');
  assert.equal(item.match.collectorNumber, 'mismatch');
  assert.equal(item.grade, 'Authentic');
  assert.equal(item.match.gradingCompany, 'unknown');
});

test('GCC active auctions are current bids, never completed sales', () => {
  const item = normalizeGcc(
    gcc([{ ...gccRow, status: 'ON_SALE', sellingType: 'PRIVATE' }]),
    { source: 'gcc', query: 'Pikachu', mode: 'active' },
    time,
  ).listings[0];
  assert.equal(item.state, 'active');
  assert.equal(item.format, 'auction');
  assert.equal(item.priceBasis, 'current_bid');
  const unknown = normalizeGcc(
    gcc([{ ...gccRow, status: 'ON_SALE', sellingType: 'FUTURE_TYPE' }]),
    { source: 'gcc', query: 'Pikachu', mode: 'active' },
    time,
  ).listings[0];
  assert.equal(unknown.format, 'unknown');
  assert.equal(unknown.priceBasis, 'unknown');
});

test('bounded five-minute provider cache recomputes evidence and cannot be mutated by caller', async () => {
  let current = time,
    calls = 0;
  const service = createMarketPriceService({
    now: () => current,
    maxCacheEntries: 2,
    fetcher: async () => {
      calls++;
      return response(gcc());
    },
  });
  const query = { source: 'gcc' as const, query: 'Pikachu' };
  const first = await service.search(query);
  first.listings[0].title = 'mutated';
  assert.equal((await service.search(query)).listings[0].title, 'PSA 9 Pikachu');
  assert.equal(calls, 1);
  assert.equal((await service.search(query)).cached, true);
  current += 300001;
  await service.search(query);
  assert.equal(calls, 2);
  assert.equal(
    (await service.search({ ...query, language: 'fr' })).listings[0].match.language,
    'match',
  );
  assert.equal(
    (await service.search({ ...query, language: 'en' })).listings[0].match.language,
    'mismatch',
  );
  assert.equal((await service.search(query)).listings[0].match.language, 'unknown');
  assert.equal(calls, 2);
  current += 1001; await service.search({ ...query, query: 'Bulbasaur' });
  current += 1001; await service.search({ ...query, query: 'Squirtle' });
  current += 1001; await service.search(query);
  assert.equal(calls, 5);
});

test('GCC pagination passes the exact cursor and public endpoints never receive authorization', async () => {
  const calls: { url: URL; init: RequestInit | undefined }[] = [];
  let current=time;
  const service = createMarketPriceService({
    now:()=>current,
    fetcher: async (input, init) => {
      calls.push({ url: new URL(String(input)), init });
      return response(gcc());
    },
  });
  assert.equal(
    (await service.search({ source: 'gcc', query: 'Pikachu', page: 2 })).status,
    'unsupported',
  );
  current += 1001;
  await service.search({
    source: 'gcc',
    query: 'Pikachu',
    page: 2,
    cursor: 'cursor+value=',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.searchParams.get('searchText'), 'Pikachu');
  assert.equal(calls[0].url.searchParams.get('cursor'), 'cursor+value=');
  assert.equal(new Headers(calls[0].init?.headers).get('authorization'), null);
});

test('duplicate simultaneous searches share one provider request', async () => {
  let calls = 0;
  const service = createMarketPriceService({
    fetcher: async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return response(gcc());
    },
  });
  await Promise.all([
    service.search({ source: 'gcc', query: 'Pikachu' }),
    service.search({ source: 'gcc', query: 'Pikachu' }),
  ]);
  assert.equal(calls, 1);
});

test('timeout and oversize payload are bounded and sanitized', async () => {
  const hanging: FetchLike = async (_input, init) =>
    new Promise((_resolve, reject) =>
      init?.signal?.addEventListener('abort', () => reject(new Error('secret'))),
    );
  await assert.rejects(
    () => fetchJson(hanging, 'https://example.com', {}, 5),
    (error: unknown) => error instanceof ProviderError && error.kind === 'timeout',
  );
  await assert.rejects(
    () => fetchJson(async () => response({ data: 'x'.repeat(2_000_001) }), 'https://example.com'),
    (error: unknown) => error instanceof ProviderError && error.kind === 'schema',
  );
});

test('query validation rejects arbitrary sources, oversized terms, and extra request destinations', () => {
  assert.equal(
    marketPriceQuerySchema.safeParse({
      source: 'gcc',
      query: '  Pikachu   PSA  ',
    }).data?.query,
    'Pikachu PSA',
  );
  for (const input of [
    { source: 'internal', query: 'a' },
    { source: 'gcc', query: 'a'.repeat(201) },
    { source: 'gcc', query: 'a', url: 'http://localhost' },
    { source: 'gcc', query: 'a', page: 0 },
  ])
    assert.equal(marketPriceQuerySchema.safeParse(input).success, false);
});

test('generated API contract stays byte-for-byte synchronized with shared contract', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(
      new URL('../../../packages/domain/src/marketPrices.ts', import.meta.url),
      'utf8',
    ),
    generated = await readFile(
      new URL('../src/generated/marketPrices.ts', import.meta.url),
      'utf8',
    );
  assert.equal(
    generated,
    '// Generated from packages/domain/src/marketPrices.ts. Do not edit.\n' + source,
  );
});

test('confirmed matching requires all five explicit structured identity fields', () => {
  const result = normalizeGcc(
    gcc(),
    {
      source: 'gcc',
      query: 'Pikachu',
      language: 'fr',
      grade: '9',
      gradingCompany: 'PSA',
      collectorNumber: '5/111',
      setName: 'Neo Genesis',
    },
    time,
  );
  assert.equal(result.listings[0].matchConfidence, 'confirmed');
  assert.equal(
    normalizeGcc(gcc(), { source: 'gcc', query: 'Pikachu' }, time).listings[0].matchConfidence,
    'candidate',
  );
  assert.equal(
    normalizeGcc(
      gcc(),
      {
        source: 'gcc',
        query: 'Pikachu',
        language: 'en',
        grade: '9',
        gradingCompany: 'PSA',
        collectorNumber: '5/111',
        setName: 'Neo Genesis',
      },
      time,
    ).listings[0].matchConfidence,
    'candidate',
  );
});

test('authorization and rate limiting return typed status without raw provider body', async () => {
  for (const status of [401, 403, 429]) {
    const service = createMarketPriceService({
      fetcher: async () => response({ secret: 'not public' }, status),
    });
    const result = await service.search({ source: 'gcc', query: 'Pikachu' });
    assert.equal(result.status, status === 429 ? 'unavailable' : 'access_required');
    assert.equal(JSON.stringify(result).includes('not public'), false);
    if (status === 429) assert.equal(result.retryAfterSeconds, 60);
  }
});
