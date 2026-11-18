import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { searchRiftCatalog, searchRiftbound, type RiftCatalog } from '../../packages/domain/src/riftbound';
const catalog: RiftCatalog = JSON.parse(readFileSync(new URL('./fixtures/openrift-sett.json', import.meta.url), 'utf8'));
test('real OpenRift Sett printings retain images, codes, sets and exact language', () => {
  const cards = searchRiftCatalog(catalog, 'sett');
  assert.ok(cards.length > 0);
  assert.equal(new Set(cards.map(c => c.id)).size, cards.length);
  for (const card of cards) {
    const printing = catalog.printings[card.id];
    assert.equal(card.localId, printing.publicCode);
    assert.deepEqual(card.availableLanguages, [card.language]);
    assert.equal(card.language, printing.language.toLowerCase());
    assert.ok(card.setName);
    if (printing.images.length) assert.equal(card.image, `https://openrift.app/media/cards/${printing.images[0].imageId}-400w.webp`);
  }
  const first = cards[0];
  assert.ok(searchRiftCatalog(catalog, first.localId).some(card => card.id === first.id));
  assert.deepEqual(searchRiftCatalog(catalog, 'Pikachu'), []);
  assert.deepEqual(searchRiftCatalog(catalog, ''), []);
});
test('Riftbound searches use only OpenRift and share a cached catalog', async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    urls.push(url);
    return new Response(JSON.stringify(catalog), { status: 200 });
  }) as typeof fetch;
  try {
    const [a, b] = await Promise.all([searchRiftbound('sett'), searchRiftbound('Sett')]);
    assert.ok(a.length);
    assert.deepEqual(a, b);
    await searchRiftbound('Sett');
    assert.deepEqual(urls, ['https://openrift.app/api/v1/catalog?langs=EN,FR']);
  } finally { globalThis.fetch = original; }
});
