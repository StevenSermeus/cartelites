import { authenticated } from './helpers/session';
import assert from 'node:assert/strict';
import test from 'node:test';
import { convexTest } from 'convex-test';
import schema from '../functions/schema';
import { api } from '../functions/_generated/api';

const modules = { './functions/operations.ts': () => import('../functions/operations'), './functions/_generated/server.js': () => import('../functions/_generated/server.js') };

test('public catalogue filters before pagination and reports matching total', async () => {
  const t = convexTest(schema, modules);
  const purchaseId = await t.run(async (ctx) => ctx.db.insert('purchases', {
    ownerId: 'owner', operationId: 'op', operationDigest: 'digest', sellerId: await ctx.db.insert('sellers', {
      ownerId: 'owner', operationId: 'seller', operationDigest: 'digest', name: 'Seller', createdAt: 1,
    }), occurredAt: 1, reference: 'P-1', status: 'active', createdAt: 1,
  }));
  await t.run(async (ctx) => {
    for (let i = 0; i < 15; i++) await ctx.db.insert('items', {
      ownerId: 'owner', operationId: `item-${i}`, purchaseId, purchaseOccurredAt: 1,
      name: `Card ${i}`, purchasePriceCents: 100, askingPriceCents: 200,
      vatRegime: 'margin', status: 'available', createdAt: i,
      ...(i < 3 ? { gradingCompany: 'PSA' as const } : {}),
    });
  });

  const first = await t.query(api.operations.publicCatalogue, {
    paginationOpts: { numItems: 12, cursor: null }, search: '', gradingStatus: 'ungraded',
    gradingCompany: '', gradingGrade: '',
  });
  assert.equal(first.page.length, 12);
  assert.equal(first.totalCount, 12);
  assert.equal(first.isDone, true);

  const secondPage = await t.query(api.operations.publicCatalogue, {
    paginationOpts: { numItems: 2, cursor: null }, search: '', gradingStatus: 'all',
    gradingCompany: '', gradingGrade: '',
  });
  assert.equal(secondPage.page.length, 2);
  assert.equal(secondPage.totalCount, 15);
  assert.equal(secondPage.isDone, false);
  const lastPage = await t.query(api.operations.publicCatalogue, {
    paginationOpts: { numItems: 2, cursor: secondPage.continueCursor }, search: '', gradingStatus: 'all',
    gradingCompany: '', gradingGrade: '',
  });
  assert.equal(lastPage.page.length, 2);
  assert.equal(lastPage.isDone, false);
});

test('mixed purchase persists each TCG and convention filters before pagination with legacy Pokémon default', async () => {
  const t = convexTest(schema, modules);
  const user = (await authenticated(t, 'owner'));
  const sellerId = await user.mutation(api.operations.createSeller, { operationId: 'seller-mixed', name: 'Seller' });
  const purchase = await user.mutation(api.operations.createPurchase, {
    operationId: 'mixed', sellerId, occurredAt: 1, reference: 'MIX',
    items: [
      { operationId: 'p', name: 'Pikachu', tcg: 'pokemon' as const },
      { operationId: 'r', name: 'Sett', tcg: 'riftbound' as const },
      { operationId: 'legacy', name: 'Ancienne carte' },
    ].map(item => ({ ...item, purchasePriceCents: 100, askingPriceCents: 200, vatRegime: 'margin' as const })),
  });
  await t.run(async ctx => { await ctx.db.patch(purchase.purchaseId, { status: 'active' }); });
  const items = await t.run(async ctx => Promise.all(purchase.itemIds.map(id => ctx.db.get(id))));
  assert.deepEqual(items.map(i => i?.tcg), ['pokemon', 'riftbound', undefined]);
  const base = { paginationOpts: { numItems: 1, cursor: null }, search: '', gradingStatus: 'all', gradingCompany: '', gradingGrade: '' };
  const rift = await t.query(api.operations.publicCatalogue, { ...base, tcg: 'riftbound' });
  assert.equal(rift.totalCount, 1);
  assert.equal(rift.page[0].name, 'Sett');
  assert.equal(rift.page[0].tcg, 'riftbound');
  assert.equal(rift.isDone, true);
  const pokemon = await t.query(api.operations.publicCatalogue, { ...base, tcg: 'pokemon' });
  assert.equal(pokemon.totalCount, 2);
  assert.equal(pokemon.isDone, false);
  const next = await t.query(api.operations.publicCatalogue, { ...base, tcg: 'pokemon', paginationOpts: { numItems: 1, cursor: pokemon.continueCursor } });
  assert.equal(next.page[0].tcg, 'pokemon');
  assert.notEqual(next.page[0].id, pokemon.page[0].id);
  const all = await t.query(api.operations.publicCatalogue, { ...base, tcg: 'all' });
  assert.equal(all.totalCount, 3);
});

test('Convention photos respect visibility and source status on every read without exposing private metadata', async () => {
  const { internal } = await import('../functions/_generated/api');
  const t = convexTest(schema, modules);
  const user = (await authenticated(t, 'owner'));
  const sellerId = await user.mutation(api.operations.createSeller, { operationId: 'photo-seller', name: 'Seller' });
  const purchase = await user.mutation(api.operations.createPurchase, {
    operationId: 'photo-purchase', sellerId, occurredAt: 1, reference: 'PHOTO',
    items: [{ operationId: 'photo-item', name: 'Sett', tcg: 'riftbound', purchasePriceCents: 100, askingPriceCents: 200, vatRegime: 'margin' }],
  });
  const itemId = purchase.itemIds[0];
  const resolve = () => t.query(internal.operations.cataloguePhotoObject, { itemId });
  await user.mutation(api.operations.createAttachment, {
    itemId, objectKey: `attachments/${user.accountId}/document`, filename: 'receipt.pdf', contentType: 'application/pdf', size: 10,
  });
  await user.mutation(api.operations.createAttachment, {
    itemId, purchaseId: purchase.purchaseId, objectKey: `cards/${user.accountId}/receipt`, filename: 'receipt.png', contentType: 'image/png', size: 10,
  });
  await t.run(ctx => ctx.db.patch(purchase.purchaseId, { status: 'active' }));
  assert.equal(await resolve(), null, 'PDF and purchase receipts stay private');
  await user.mutation(api.operations.createAttachment, {
    itemId, objectKey: `${user.accountId}/legacy-photo`, filename: 'card.png', contentType: 'image/png', size: 10,
  });
  assert.deepEqual(await resolve(), { objectKey: `${user.accountId}/legacy-photo`, contentType: 'image/png' });
  const page = await t.query(api.operations.publicCatalogue, {
    paginationOpts: { numItems: 12, cursor: null }, search: '', gradingStatus: 'all', gradingCompany: '', gradingGrade: '',
  });
  assert.equal(page.page[0].hasPhoto, true);
  assert.equal(JSON.stringify(page).includes('legacy-photo'), false);
  assert.equal(JSON.stringify(page).includes('objectKey'), false);
  await t.run(ctx => ctx.db.patch(itemId, { hiddenFromCatalogue: true }));
  assert.equal(await resolve(), null);
  await t.run(ctx => ctx.db.patch(itemId, { hiddenFromCatalogue: false, status: 'sold' }));
  assert.equal(await resolve(), null);
  await t.run(ctx => ctx.db.patch(itemId, { status: 'available' }));
  for (const status of ['pending', 'cancelled'] as const) {
    await t.run(ctx => ctx.db.patch(purchase.purchaseId, { status }));
    assert.equal(await resolve(), null);
  }
  assert.equal(await t.query(internal.operations.cataloguePhotoObject, { itemId: 'invalid' }), null);
});

test('attachment prefixes enforce owner and purpose while accepting legacy keys', async () => {
  const t = convexTest(schema, modules);
  const user = (await authenticated(t, 'owner'));
  const sellerId = await user.mutation(api.operations.createSeller, { operationId: 'prefix-seller', name: 'Seller' });
  const purchase = await user.mutation(api.operations.createPurchase, {
    operationId: 'prefix-purchase', sellerId, occurredAt: 1, reference: 'PREFIX',
    items: [{ operationId: 'prefix-item', name: 'Card', purchasePriceCents: 100, vatRegime: 'margin' }],
  });
  const base = { itemId: purchase.itemIds[0], filename: 'card.png', contentType: 'image/png', size: 10 };
  await user.mutation(api.operations.createAttachment, { ...base, objectKey: `cards/${user.accountId}/new-photo` });
  await user.mutation(api.operations.createAttachment, { ...base, objectKey: `${user.accountId}/old-photo` });
  for (const objectKey of ['cards/another-owner/photo', `attachments/${user.accountId}/photo`, `cards/${user.accountId}/../photo`, `cards/${user.accountId}/`]) {
    await assert.rejects(user.mutation(api.operations.createAttachment, { ...base, objectKey }), /INVALID_ATTACHMENT/);
  }
  await assert.rejects(user.mutation(api.operations.createAttachment, { ...base, objectKey: `cards/${user.accountId}/pdf`, contentType: 'application/pdf' }), /INVALID_ATTACHMENT/);
});

test('Convention sorting is global before page slicing and preserves public projection',async()=>{
 const t=convexTest(schema,modules),user=(await authenticated(t, 'employee'));
 const sellerId=await user.mutation(api.operations.createSeller,{operationId:'sort-contact',name:'Private supplier'});
 const purchase=await user.mutation(api.operations.createPurchase,{operationId:'sort-purchase',sellerId,occurredAt:1,reference:'PRIVATE',items:[{name:'Zoro',price:900},{name:'Évoli',price:300},{name:'Abra',price:600}].map((row,i)=>({operationId:`sort-${i}`,name:row.name,purchasePriceCents:10,askingPriceCents:row.price,vatRegime:'margin' as const}))});
 await t.run(ctx=>ctx.db.patch(purchase.purchaseId,{status:'active'}));
 const base={search:'',gradingStatus:'all',gradingCompany:'',gradingGrade:'',paginationOpts:{numItems:1,cursor:null}};
 const first=await t.query(api.operations.publicCatalogue,{...base,sort:'price-asc'});
 assert.equal(first.page[0].name,'Évoli');
 const second=await t.query(api.operations.publicCatalogue,{...base,sort:'price-asc',paginationOpts:{numItems:1,cursor:first.continueCursor}});
 assert.equal(second.page[0].name,'Abra');
 assert.equal((await t.query(api.operations.publicCatalogue,{...base,sort:'price-desc'})).page[0].name,'Zoro');
 assert.equal((await t.query(api.operations.publicCatalogue,{...base,sort:'name'})).page[0].name,'Abra');
 assert.equal('purchasePriceCents' in first.page[0],false);assert.equal('sellerId' in first.page[0],false);
});

test('public catalogue facets span pages and filters without exposing hidden grading labels',async()=>{
 const t=convexTest(schema,modules),user=(await authenticated(t, 'employee'));
 const sellerId=await user.mutation(api.operations.createSeller,{operationId:'facets-contact',name:'Private supplier'});
 const purchase=await user.mutation(api.operations.createPurchase,{operationId:'facets-purchase',sellerId,occurredAt:1,reference:'PRIVATE',items:['Visible FR','Visible EN','Hidden'].map((name,i)=>({operationId:`facets-${i}`,name,purchasePriceCents:10,askingPriceCents:100,vatRegime:'margin' as const}))});
 await t.run(async ctx=>{await ctx.db.patch(purchase.purchaseId,{status:'active'});await ctx.db.patch(purchase.itemIds[0],{language:'fr',gradingCompany:'PSA',quantity:3});await ctx.db.patch(purchase.itemIds[1],{language:'en',gradingCompany:'CGC'});await ctx.db.patch(purchase.itemIds[2],{language:'ja',gradingCompany:'PRIVATE',hiddenFromCatalogue:true});});
 const base={search:'',gradingStatus:'all',gradingCompany:'',gradingGrade:'',paginationOpts:{numItems:1,cursor:null}};
 const page=await t.query(api.operations.publicCatalogue,{...base,language:'fr'});
 assert.equal(page.page.length,1);assert.equal(page.page[0].name,'Visible FR');assert.equal(page.page[0].quantity,3);
 assert.deepEqual(page.gradingCompanies,['CGC','PSA']);assert.deepEqual(page.languages,['en','fr']);
 const empty=await t.query(api.operations.publicCatalogue,{...base,search:'no-match',gradingCompany:'CGC'});
 assert.equal(empty.page.length,0);assert.deepEqual(empty.gradingCompanies,['CGC','PSA']);assert.deepEqual(empty.languages,['en','fr']);
 assert.equal(JSON.stringify(page).includes('PRIVATE'),false);
});
