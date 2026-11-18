import assert from 'node:assert/strict';
import test from 'node:test';
import { ImageCache } from '../src/storage/imageCache.js';

const options = { maxBytes: 6, maxEntryBytes: 4, maxEntries: 3, ttlMs: 100 };
test('hits reuse bytes, expiry reloads and LRU evicts within the byte budget', async () => {
  let clock = 0;
  const cache = new ImageCache({ ...options, now: () => clock });
  let reads = 0;
  const load = async () => { reads++; return new Response('abc'); };
  assert.equal(await (await cache.read('a', load)).text(), 'abc');
  await cache.read('b', load);
  assert.equal(await (await cache.read('a', load)).text(), 'abc');
  assert.equal(reads, 2);
  await cache.read('c', load); // b is least recently used.
  await cache.read('a', load);
  assert.equal(reads, 3);
  await cache.read('b', load);
  assert.equal(reads, 4);
  clock = 100;
  await cache.read('b', load);
  assert.equal(reads, 5);
});

test('large images stream intact without caching, including missing Content-Length', async () => {
  for (const declaredLength of [false, true]) {
    const cache = new ImageCache(options);
    let reads = 0;
    const load = async () => {
      reads++;
      return new Response(new ReadableStream({
        start(controller) {
          for (const part of ['abc', 'def', 'ghi']) controller.enqueue(new TextEncoder().encode(part));
          controller.close();
        },
      }), { headers: declaredLength ? { 'content-length': '9' } : {} });
    };
    assert.equal(await (await cache.read('large', load)).text(), 'abcdefghi');
    assert.equal(await (await cache.read('large', load)).text(), 'abcdefghi');
    assert.equal(reads, 2);
  }
});

test('errors and interrupted bodies are not cached; cache can be disabled', async () => {
  const cache = new ImageCache(options);
  assert.equal((await cache.read('a', async () => new Response('missing', { status: 404 }))).status, 404);
  await assert.rejects(cache.read('a', async () => new Response(new ReadableStream({
    start(controller) { controller.error(new Error('interrupted')); },
  }))), /interrupted/);
  assert.equal(await (await cache.read('a', async () => new Response('yes'))).text(), 'yes');
  const disabled = new ImageCache({ ...options, maxBytes: 0 });
  let reads = 0;
  const load = async () => { reads++; return new Response('yes'); };
  await disabled.read('a', load);
  await disabled.read('a', load);
  assert.equal(reads, 2);
});

test('entry count limits small images independently of the byte budget', async () => {
  const cache = new ImageCache({ ...options, maxEntries: 1 });
  let reads = 0;
  const load = async () => { reads++; return new Response('a'); };
  await cache.read('a', load);
  await cache.read('b', load);
  await cache.read('a', load);
  assert.equal(reads, 3);
});
