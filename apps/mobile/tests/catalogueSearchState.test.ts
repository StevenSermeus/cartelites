import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptsCatalogueReply } from '../src/data/catalogueSearchState';
test('pending catalogue reply cannot replace a changed query or selected language', () => {
  const request = {query: 'Pikachu', language: 'fr'};
  assert.equal(acceptsCatalogueReply({cardSearch: 'Pikachu', language: 'fr'}, request), true);
  assert.equal(acceptsCatalogueReply({cardSearch: 'Eevee', language: 'fr'}, request), false);
  assert.equal(acceptsCatalogueReply({cardSearch: 'Pikachu', language: 'ja'}, request), false);
  assert.equal(acceptsCatalogueReply({cardSearch: 'Pikachu', language: 'fr', tcg: 'riftbound'}, request), false);
});
