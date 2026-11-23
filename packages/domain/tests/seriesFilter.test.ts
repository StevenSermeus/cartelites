import assert from 'node:assert/strict';
import test from 'node:test';
import { itemTcg, matchesSeries, seriesOptions } from '../src/seriesFilter';

test('series selection is exact, accent/case tolerant and does not confuse named extensions', () => {
  const item = { tcg: 'pokemon', series: 'Écarlate et Violet' };
  assert.equal(matchesSeries(item, '  ecarlate  ET violet '), true);
  assert.equal(matchesSeries(item, 'Écarlate'), false);
  assert.equal(matchesSeries(item, ''), true);
  assert.equal(matchesSeries({}, 'Origines'), false);
});

test('series choices group legacy Riftbound variants, deduplicate and scope by game', () => {
  const items = [
    { tcg: 'riftbound', series: 'Origins · foil · Signée' },
    { tcg: 'riftbound', series: 'Origins' },
    { tcg: 'pokemon', series: 'Origines Antiques' },
    { series: 'Écarlate et Violet' },
    { tcg: 'pokemon', series: 'ecarlate et violet' },
    { tcg: 'other', series: 'Collection privée' },
    { tcg: 'pokemon', series: '' },
  ];
  assert.deepEqual(seriesOptions(items, 'riftbound'), ['Origins']);
  assert.deepEqual(seriesOptions(items, 'pokemon'), ['Écarlate et Violet', 'Origines Antiques']);
  assert.equal(matchesSeries(items[0], 'Origins'), true);
  assert.equal(itemTcg({ productType: 'sealed' }), 'other');
  assert.equal(itemTcg({}), 'pokemon');
  assert.equal(seriesOptions(items, 'all').length, 4);
});
