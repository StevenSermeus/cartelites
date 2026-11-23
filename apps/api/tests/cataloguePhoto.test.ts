import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConvexHttpClient } from 'convex/browser';

process.env.PORT ??= '3001';
process.env.CONVEX_URL ??= 'http://127.0.0.1:3210';
process.env.CONVEX_AUTH_SECRET ??= 'x'.repeat(32);
process.env.R2_ENDPOINT ??= 'https://account-id.r2.cloudflarestorage.com';
process.env.R2_BUCKET ??= 'private bucket';
process.env.R2_ACCESS_KEY_ID ??= 'r2-access';
process.env.R2_SECRET_ACCESS_KEY ??= 'r2-secret';
process.env.JWT_ISSUER ??= 'http://127.0.0.1:3001';
process.env.JWT_AUDIENCE ??= 'test';
process.env.JWT_PRIVATE_KEY_PEM ??= 'test';
process.env.JWT_PUBLIC_KEY_PEM ??= 'test';
process.env.WEB_ORIGIN ??= 'http://localhost:5174';

const { catalogueRoutes } = await import('../src/routes/catalogue.js');

test('public photo route checks eligibility even on cache hits and keeps browser caching disabled', async (t) => {
  let permitted = false;
  let contentType = 'image/png';
  let storageReads = 0;
  let permissionChecks = 0;
  let objectKey = 'cards/owner/image';
  t.mock.method(ConvexHttpClient.prototype, 'action', async (_ref, args) => {
    permissionChecks++;
    assert.equal(args.operation, 'cataloguePhotoObject');
    assert.equal(args.secret, process.env.CONVEX_AUTH_SECRET);
    assert.deepEqual(args.payload, { itemId: 'item' });
    return permitted ? { objectKey, contentType } : null;
  });
  t.mock.method(globalThis, 'fetch', async () => {
    storageReads++;
    return new Response(new Uint8Array([1, 2]), { status: 200 });
  });
  const app = catalogueRoutes();
  let response = await app.request('/api/v1/catalogue/item/photo');
  assert.equal(response.status, 404);
  assert.equal(storageReads, 0);
  permitted = true;
  response = await app.request('/api/v1/catalogue/item/photo');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2]);
  response = await app.request('/api/v1/catalogue/item/photo');
  assert.equal(response.status, 200);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2]);
  assert.equal(storageReads, 1, 'cached bytes avoid another R2 request');
  assert.equal(permissionChecks, 3, 'each request checks current visibility');
  permitted = false;
  assert.equal((await app.request('/api/v1/catalogue/item/photo')).status, 404);
  permitted = true;
  contentType = 'application/pdf';
  assert.equal((await app.request('/api/v1/catalogue/item/photo')).status, 404);
  assert.equal(storageReads, 1);
  contentType = 'image/png';
  objectKey = 'cards/owner/replacement';
  assert.equal((await app.request('/api/v1/catalogue/item/photo')).status, 200);
  assert.equal(storageReads, 2, 'replacement photo gets its own cache entry');
});

test('catalogue HTTP rejects unsafe prices, oversized pages and invalid filters before backend work',async t=>{
 let calls=0;let payload:any;
 t.mock.method(ConvexHttpClient.prototype,'query',async(_ref,args)=>{calls++;payload=args;return {page:[],totalCount:0,isDone:true,continueCursor:'0'};});
 const app=catalogueRoutes();
 for(const query of ['size=0','size=49','size=1.5','size=Infinity','min=NaN','min=-1','min=10&max=9','min=9007199254740992','cursor=-1','cursor=1.5','gradingStatus=private','language='+('x'.repeat(21)),'search='+('x'.repeat(201))]){
  const result=await app.request(`/api/v1/catalogue?${query}`);assert.equal(result.status,400,query);assert.deepEqual(await result.json(),{error:'INVALID_CATALOGUE_QUERY'});
 }
 assert.equal(calls,0);
 const valid=await app.request('/api/v1/catalogue?size=48&min=0.29&max=10.01&language=fr&gradingCompany=CGC&cursor=12');assert.equal(valid.status,200);assert.equal(calls,1);assert.equal(payload.minPrice,29);assert.equal(payload.maxPrice,1001);assert.equal(payload.language,'fr');assert.deepEqual(payload.paginationOpts,{numItems:48,cursor:'12'});
});

test('series routes validate, forward authenticated facets before stock IDs, and preserve public series', async t => {
 const { OpenAPIHono } = await import('@hono/zod-openapi');
 const { getFunctionName } = await import('convex/server');
 const { registerPaginatedReads, readPageQuery } = await import('../src/routes/paginatedReads.js');
 const calls: {name:string;args:any}[]=[];
 t.mock.method(ConvexHttpClient.prototype,'query',async (ref:any,args:any)=>{calls.push({name:getFunctionName(ref),args});return ['Origines'];});
 let token='';t.mock.method(ConvexHttpClient.prototype,'setAuth',(value:string)=>{token=value;});
 const app = new OpenAPIHono<any>();
 app.use('*',async(c,next)=>{c.set('accessToken','staff-token');await next();});
 registerPaginatedReads(app);
 const response=await app.request('/stock/series?tcg=riftbound');
 assert.equal(response.status,200);assert.deepEqual(await response.json(),['Origines']);assert.equal(token,'staff-token');
 assert.deepEqual(calls.pop(),{name:'readModels:stockSeries',args:{tcg:'riftbound'}});
 for (const [value, expected] of [['true',true],['false',false]] as const) {
  assert.equal((await app.request('/stock/series?tcg=pokemon&includeUnavailable='+value)).status,200);
  assert.deepEqual(calls.pop(),{name:'readModels:stockSeries',args:{tcg:'pokemon',includeUnavailable:expected}});
 }
 assert.equal((await app.request('/stock/series?includeUnavailable=maybe')).status,400);
 assert.equal((await app.request('/stock/series?tcg=unknown')).status,400);
 assert.equal(readPageQuery.safeParse({tcg:'unknown'}).success,false);
 assert.equal(readPageQuery.safeParse({series:'x'.repeat(301)}).success,false);
 await app.request('/stock?tcg=riftbound&series=Origines');
 assert.equal(calls.at(-1)?.args.series,'Origines');assert.equal(calls.at(-1)?.args.tcg,'riftbound');
 const catalogue=catalogueRoutes();
 assert.equal((await catalogue.request('/api/v1/catalogue?tcg=riftbound&series=Origines')).status,200);
 assert.equal(calls.at(-1)?.args.series,'Origines');
 assert.equal((await catalogue.request('/api/v1/catalogue?series='+ 'x'.repeat(301))).status,400);
});
