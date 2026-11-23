/** Read-only acceptance against the local rehearsal. Never load production .env. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { seriesOptions, matchesSeries, itemTcg } from '../packages/domain/src/seriesFilter.ts';

loadEnvFile('/tmp/cartelites-canonical-rehearsal/api.env');
assert.equal(process.env.CONVEX_URL, 'http://127.0.0.1:3220');
assert.equal(process.env.DATA_MODEL, 'canonical');
const base = 'http://127.0.0.1:3002/api/v1';
const currentRoutesInProcess = !process.argv.includes('--running');
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Local acceptance forbids external transport');
  return originalFetch(input, init);
};
const credentials = JSON.parse(await readFile('/tmp/cartelites-ui-account.json', 'utf8'));
const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'ios' }, body: JSON.stringify(credentials) });
assert.equal(login.status, 200);
const { accessToken } = await login.json();
try {
  // Import current routes, so a separately running API process cannot mask stale code.
  const { OpenAPIHono } = await import('../apps/api/node_modules/@hono/zod-openapi/dist/index.js');
  const { ConvexAccountRepository } = await import('../apps/api/src/db/accountRepository.ts');
  const { operationRoutes } = await import('../apps/api/src/routes/operations.ts');
  const { catalogueRoutes } = await import('../apps/api/src/routes/catalogue.ts');
  const app = new OpenAPIHono();
  app.route('/', catalogueRoutes());
  app.route('/api/v1', operationRoutes(new ConvexAccountRepository()));
  async function get(path: string, authenticated = true) {
    const options = { headers: authenticated ? { Authorization: `Bearer ${accessToken}` } : {} };
    const response = currentRoutesInProcess ? await app.request('http://localhost/api/v1' + path, options) : await fetch(base + path, options);
    assert.equal(response.status, 200, path + ' HTTP ' + response.status);
    return response.json();
  }
  async function stock(params: Record<string, string> = {}) {
    const rows: any[] = [], seen = new Set<string>(); let cursor: string | null = null;
    do {
      const query = new URLSearchParams({ size: '25', ...params, ...(cursor ? { cursor } : {}) });
      const result = await get('/stock?' + query);
      rows.push(...result.items); cursor = result.nextCursor;
      if (cursor) { assert.ok(!seen.has(cursor)); seen.add(cursor); }
    } while (cursor);
    return rows;
  }
  const allStock = await stock();
  const checks = [];
  for (const tcg of ['pokemon', 'riftbound']) {
    const facets = await get('/stock/series?tcg=' + tcg);
    assert.deepEqual(facets, seriesOptions(allStock, tcg));
    const known = await get('/stock/series?tcg=' + tcg + '&includeUnavailable=true');
    assert.ok(facets.every((label: string) => known.includes(label)));
    for (const series of facets) {
      const filtered = await stock({ tcg, series });
      const expected = allStock.filter(item => itemTcg(item) === tcg && matchesSeries(item, series));
      assert.deepEqual(filtered.map(row => row._id).sort(), expected.map(row => row._id).sort());
    }
    let cursor: string | null = null, publicRows: any[] = [], publicSeries: string[] = [];
    do {
      const page = await get('/catalogue?' + new URLSearchParams({ tcg, size: '48', ...(cursor ? { cursor } : {}) }), false);
      publicSeries = page.series; publicRows.push(...page.page); cursor = page.isDone ? null : page.continueCursor;
    } while (cursor);
    assert.deepEqual(publicSeries, seriesOptions(publicRows, tcg));
    for (const series of publicSeries) {
      const page = await get('/catalogue?' + new URLSearchParams({ tcg, series, size: '1' }), false);
      assert.equal(page.totalCount, publicRows.filter(item => matchesSeries(item, series)).length);
      assert.deepEqual(page.series, publicSeries);
    }
    const empty = await get('/catalogue?' + new URLSearchParams({ tcg, series: '__unknown_series_acceptance__' }), false);
    assert.equal(empty.totalCount, 0); assert.deepEqual(empty.series, publicSeries);
    checks.push({ tcg, availableSeries: facets.length, knownSeries: known.length, publicSeries: publicSeries.length, publicItems: publicRows.length });
  }
  const unauthorized = currentRoutesInProcess ? await app.request('http://localhost/api/v1/stock/series') : await fetch(base + '/stock/series');
  assert.equal(unauthorized.status, 401);
  const evidence = { checkedAt: new Date().toISOString(), backend: process.env.CONVEX_URL, currentRoutesInProcess, allStockItems: allStock.length, checks, unauthorizedStatus: unauthorized.status, businessWrites: 0, externalRequests: 0 };
  await writeFile(currentRoutesInProcess ? 'docs/rebuild/series-filter-local-check.json' : 'docs/rebuild/series-filter-running-check.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await fetch(base + '/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'X-Client-Platform': 'ios' } });
  globalThis.fetch = originalFetch;
}
