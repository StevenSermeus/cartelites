import assert from 'node:assert/strict';
import test from 'node:test';
import {formatMarketMoney,marketPriceLabel,safeMarketUrl} from '../src/data/marketPrices';
import type {MarketListing} from '../../../packages/domain/src/marketPrices';
test('market money retains its own currency precision and unknown prices never become zero',()=>{
 assert.equal(formatMarketMoney(null),'Non renseigné');
 assert.match(formatMarketMoney({amountMinor:1234,currency:'EUR'}),/12,34/);
 assert.match(formatMarketMoney({amountMinor:1234,currency:'JPY'}),/1\s?234/);
 assert.match(formatMarketMoney({amountMinor:0,currency:'USD'}),/0,00/);
});
test('an accepted offer never presents an advertised amount as a final sold price',()=>{
 const listing={priceBasis:'accepted_offer_unknown',price:{amountMinor:50000,currency:'EUR'}} as MarketListing;
 assert.equal(marketPriceLabel(listing),'Offre acceptée · montant final non communiqué');
 assert.equal(safeMarketUrl('https://gradedcardcenter.com/listing/1'),true);
 assert.equal(safeMarketUrl('javascript:alert(1)'),false);
 assert.equal(safeMarketUrl('file:///private/test'),false);
});
