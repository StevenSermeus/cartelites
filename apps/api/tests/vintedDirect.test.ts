import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVintedPage, parseVintedPage, searchVinted } from '../src/marketPrices/vinted.js';
import { fetchPublicHtml } from '../src/marketPrices/publicHtml.js';
import { ProviderError } from '../src/marketPrices/common.js';
const query = {source:'vinted' as const,query:'Pikachu',mode:'active' as const,page:1};
const row={id:123,productItem:{id:123,title:'Carte Pikachu',url:'/items/123-carte-pikachu',price:{amount:'12.34',currencyCode:'EUR'},serviceFee:{amount:'1.32',currencyCode:'EUR'},totalItemPrice:{amount:'13.66',currencyCode:'EUR'},thumbnailUrls:[{url:'https://images1.vinted.net/image.webp'}]}};
const body=(items:unknown[]=[row])=>({items,page:1,totalPages:10});
const html=(items:unknown[]=[row],page=1)=>{
 const flight=JSON.stringify({items:{items},pagination:{current_page:page,total_pages:10,total_entries:960,per_page:96}});
 const split=Math.floor(flight.length/2);
 return [flight.slice(0,split),flight.slice(split)].map(chunk=>`<script>self.__next_f.push([1,${JSON.stringify(chunk)}])</script>`).join('');
};
test('Vinted embedded data spans RSC chunks without evaluating scripts and retains exact public prices',()=>{
 const parsed=parseVintedPage(html([{...row,productItem:{...row.productItem,title:'Carte "Pikachu" [promo] \\ Pokémon'}}]));
 const result=normalizeVintedPage(parsed,query,1000),item=result.listings[0];
 assert.equal(item.price?.amountMinor,1234);assert.equal(item.buyerProtectionFee?.amountMinor,132);assert.equal(item.totalBeforeShipping?.amountMinor,1366);
 assert.equal(item.state,'active');assert.equal(item.priceBasis,'asking');assert.equal(item.soldAt,null);assert.equal(item.matchConfidence,'candidate');assert.equal(item.gradingCompany,null);assert.equal(result.nextPage,2);
 assert.equal(item.title,'Carte "Pikachu" [promo] \\ Pokémon');
});
test('Vinted uses actual minor units, never invents fractional precision, fees or a reconciled total',()=>{
 const normalize=(price:unknown,total:unknown)=>normalizeVintedPage(body([{...row,productItem:{...row.productItem,price,totalItemPrice:total}}]),query,1000).listings[0];
 assert.equal(normalize({amount:'500.00',currencyCode:'JPY'},null).price?.amountMinor,500);
 assert.throws(()=>normalize({amount:'1.234',currencyCode:'EUR'},null),ProviderError);
 assert.equal(normalize(row.productItem.price,{amount:'20.00',currencyCode:'USD'}).totalBeforeShipping,null);
});
test('Vinted malformed/challenge pages are unavailable rather than empty and row links stay on the source',()=>{
 for(const invalid of ['<html>Captcha</html>','<script>self.__next_f.push([1,"{bad"])</script>'])assert.throws(()=>parseVintedPage(invalid),ProviderError);
 assert.throws(()=>normalizeVintedPage(body([{...row,productItem:{...row.productItem,url:'https://evil.invalid/items/123-card'}}]),query,1),ProviderError);
 assert.throws(()=>normalizeVintedPage({...body(),page:2},query,1),ProviderError);
 assert.equal(normalizeVintedPage(body([]),query,1).status,'empty');
});
test('Vinted direct retrieval stays inside trading cards, preserves provider pages and sends no account credentials',async()=>{
 let calls=0;
 const result=await searchVinted({...query,page:2},async(input,init)=>{
  calls++;const url=new URL(String(input));assert.equal(url.hostname,'www.vinted.fr');assert.equal(url.pathname,'/catalog/4875-single-trading-cards');assert.equal(url.searchParams.get('page'),'2');
  assert.equal(new Headers(init?.headers).get('authorization'),null);assert.equal(new Headers(init?.headers).get('cookie'),null);assert.equal(init?.redirect,'error');
  return new Response(html([row],2));
 },1000,1000);
 assert.equal(result.listings.length,1);assert.equal(result.nextPage,3);assert.equal(calls,1);
 assert.equal((await searchVinted({...query,mode:'sold'},async()=>{throw Error('must not fetch')},1,1000)).status,'unsupported');
});
test('public HTML fetch bounds bytes/time and recognizes successful challenge responses',async()=>{
 await assert.rejects(()=>fetchPublicHtml(async()=>new Response('<title>Just a moment...</title>'),'https://www.vinted.fr'),(error:any)=>error.kind==='access');
 await assert.rejects(()=>fetchPublicHtml(async()=>new Response('x'.repeat(8_000_001)),'https://www.vinted.fr'),(error:any)=>error.kind==='schema');
 await assert.rejects(()=>fetchPublicHtml(async(_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(Error('private raw error')))),'https://www.vinted.fr',5),(error:any)=>error.kind==='timeout'&&!error.message.includes('private'));
});

test('malformed Vinted page stays a typed unavailable result on first and cached service reads',async()=>{
 const {createMarketPriceService}=await import('../src/marketPrices/index.js');
 for(const invalid of [html([row],2),html([{...row,productItem:{...row.productItem,url:'https://evil.invalid/items/123-card'}}])]){
  let calls=0;const service=createMarketPriceService({fetcher:async()=>{calls++;return new Response(invalid)}});
  for(let i=0;i<2;i++){const result=await service.search(query);assert.equal(result.status,'unavailable');assert.equal(result.listings.length,0);}
  assert.equal(calls,1);
 }
});
