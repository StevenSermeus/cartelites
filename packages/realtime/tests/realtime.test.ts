import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConvexClient } from 'convex/browser';
import { browseArgs, createRealtime } from '../src/index';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function harness() {
  const updates = new Set<(value: unknown) => void>();
  let closed = 0;
  const socket = {
    onUpdate(_name: unknown, _args: unknown, callback: (value: unknown) => void) {
      updates.add(callback); return () => updates.delete(callback);
    },
    close: async () => { closed++; },
    setAuth() {},
  };
  return { socket: socket as unknown as ConvexClient, updates, closed: () => closed };
}
test('multiple views share a socket and receive successive pushed values without HTTP reloads', async () => {
  const h = harness(); let connections = 0;
  const live = createRealtime(async () => { connections++; return { url: 'https://example.convex.cloud' }; }, () => h.socket);
  const a: unknown[] = [], b: unknown[] = [];
  const stopA = live.subscribe('readModels:browse', { resource: 'stock' }, v => a.push(v), assert.fail);
  const stopB = live.subscribe('readModels:browse', { resource: 'stock' }, v => b.push(v), assert.fail);
  await tick();
  for (const update of h.updates) update({ price: 100 });
  for (const update of h.updates) update({ price: 200 });
  assert.deepEqual(a, [{ price: 100 }, { price: 200 }]); assert.deepEqual(a, b);
  assert.equal(connections, 1);
  stopA(); assert.equal(h.closed(), 0);
  stopB(); assert.equal(h.closed(), 1); assert.equal(h.updates.size, 0);
});
test('unmount or instance change during credential loading never opens a stale socket', async () => {
  let resolve!: (config: { url: string }) => void; let opened = 0;
  const live = createRealtime(() => new Promise(r => { resolve = r; }), () => { opened++; return harness().socket; });
  const stop = live.subscribe('readModels:browse', {}, () => assert.fail('Unexpected update'), assert.fail);
  stop(); resolve({ url: 'https://old.convex.cloud' }); await tick();
  assert.equal(opened, 0);
});
test('reset removes listeners and clears protected results through error callbacks', async () => {
  const h = harness(); let failures = 0;
  const live = createRealtime(async () => ({ url: 'https://example.convex.cloud' }), () => h.socket);
  live.subscribe('readModels:browse', {}, () => assert.fail('Unexpected update'), () => failures++);
  await tick(); live.reset();
  assert.equal(failures, 1); assert.equal(h.updates.size, 0); assert.equal(h.closed(), 1);
});
test('browse arguments preserve filters, coerce HTTP numeric values and omit undefined', () => {
  assert.deepEqual(browseArgs('/stock', { size: '10', from: '12', cursor: undefined, visibility: 'hidden' }),
    { resource: 'stock', size: 10, search: '', from: 12, visibility: 'hidden' });
  assert.throws(() => browseArgs('/unknown', {}));
});
test('credential loading can retry after a temporary API failure', async () => {
  const h = harness(); let attempts = 0; let failures = 0;
  const live = createRealtime(async () => {
    if (++attempts === 1) throw new Error('offline');
    return { url: 'https://example.convex.cloud' };
  }, () => h.socket);
  const stopA = live.subscribe('readModels:browse', {}, () => {}, () => failures++);
  await tick();
  const stopB = live.subscribe('readModels:browse', {}, () => {}, assert.fail);
  await tick(); assert.equal(attempts, 2); assert.equal(failures, 1); assert.equal(h.updates.size, 1);
  stopA(); stopB();
});
test('credentials refresh from the API and cannot cross instance boundaries', async () => {
  const h = harness(); let fetchToken!: () => Promise<string | null | undefined>;
  let requests = 0; let errors = 0;
  h.socket.setAuth = (fetcher) => { fetchToken = () => fetcher({ forceRefreshToken: true }); };
  const live = createRealtime(async () => ({ url: ++requests < 3 ? 'https://one.convex.cloud' : 'https://two.convex.cloud', token: `token-${requests}` }), () => h.socket);
  const stop = live.subscribe('readModels:browse', {}, () => {}, () => errors++);
  await tick();
  assert.equal(await fetchToken(), 'token-1');
  assert.equal(await fetchToken(), 'token-2');
  assert.equal(await fetchToken(), null); assert.equal(errors, 1);
  stop();
});
