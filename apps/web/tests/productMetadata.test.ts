import test from 'node:test';
import assert from 'node:assert/strict';
import { attributesRecord, attributeRows, unchangedMetadata } from '../src/lib/productMetadata.ts';
test('attributes roundtrip literal keys safely and trim keys without losing text values', () => {
  const value = JSON.parse('{"__proto__":"kept","Langue":" Français "}');
  const rows = attributeRows(value);
  assert.deepEqual({ ...attributesRecord(rows) }, value);
  assert.equal(attributesRecord([{ id: 'a', key: ' Finition ', value: 'Holo' }]).Finition, 'Holo');
});
test('attributes reject empty, duplicate, oversized and excessive pairs', () => {
  for (const rows of [
    [{ id: 'a', key: ' ', value: 'v' }],
    [{ id: 'a', key: 'a', value: 'x'.repeat(501) }],
    [{ id: 'a', key: 'x'.repeat(61), value: '' }],
    [
      { id: 'a', key: 'a', value: 'v' },
      { id: 'b', key: ' a ', value: 'v' },
    ],
    Array.from({ length: 21 }, (_, i) => ({ id: String(i), key: String(i), value: '' })),
  ])
    assert.throws(() => attributesRecord(rows));
});
test('photo revision refresh tolerates photo-only changes but detects concurrent metadata edits', () => {
  const previous = {
    name: 'Carte',
    revision: 1,
    productRevision: 2,
    coverPhotoId: 'first',
    publicAttributes: { A: '1', B: '2' },
  };
  assert.equal(
    unchangedMetadata(previous, {
      ...previous,
      revision: 2,
      coverPhotoId: 'second',
      publicAttributes: { B: '2', A: '1' },
    }),
    true,
  );
  for (const changed of [
    { name: 'Autre' },
    { privateNotes: 'Secret' },
    { variant: 'Holo' },
    { publicAttributes: { A: '2' } },
  ])
    assert.equal(unchangedMetadata(previous, { ...previous, ...changed }), false);
});
