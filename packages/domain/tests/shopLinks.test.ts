import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveShopLinks } from '../src/shopLinks';

test('shop links support another shop and an intentionally empty social list', () => {
  assert.deepEqual(resolveShopLinks([]), []);
  assert.deepEqual(
    resolveShopLinks([{ label: ' Actualités ', url: 'https://example.test/news' }]),
    [{ label: 'Actualités', url: 'https://example.test/news' }],
  );
});

test('public shop links reject executable URLs and embedded credentials', () => {
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,test',
    'https://user:secret@example.test',
    'file:///tmp/test',
  ])
    assert.throws(() => resolveShopLinks([{ label: 'Lien', url }]));
  assert.throws(() => resolveShopLinks([{ label: ' ', url: 'https://example.test' }]));
});
