import { authenticated } from './helpers/session';
import assert from 'node:assert/strict';
import test from 'node:test';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../functions/schema';
import {api,internal} from '../functions/_generated/api';
const modules={'./functions/inventory.ts':()=>import('../functions/inventory'),'./functions/gradingCompanies.ts':()=>import('../functions/gradingCompanies'),'./functions/operations.ts':()=>import('../functions/operations'),'./functions/_generated/server.js':()=>import('../functions/_generated/server.js')};
const save=makeFunctionReference<'mutation'>('gradingCompanies:save'), list=makeFunctionReference<'query'>('gradingCompanies:list');
test('grading companies require auth, support labels and prevent duplicate names/stale edits',async()=>{
 const t=convexTest(schema,modules),user=(await authenticated(t, 'u'));
 await assert.rejects(t.query(list,{}),/UNAUTHENTICATED/);
 const id=await user.mutation(save,{name:' Example Grading ',website:'https://example.org'});
 await assert.rejects(user.mutation(save,{name:'example grading'}),/EXISTS/);
 await assert.rejects(user.mutation(save,{id,name:'Changed',expectedRevision:0}),/REVISION_CONFLICT/);
 await user.mutation(save,{id,name:'Changed',expectedRevision:1,archived:true});
 const records=await user.query(list,{});assert.equal(records[0].revision,2);assert.ok(records[0].archivedAt);
 await assert.rejects((await authenticated(t, 'u', 'realtime:read')).mutation(save,{name:'Other'}),/READ_ONLY_TOKEN/);
});
test('public gallery never exposes evidence or private fields and rechecks availability',async()=>{
 const t=convexTest(schema,modules);
 const ids=await t.run(async ctx=>{
 const itemId=await ctx.db.insert('items',{ownerId:'u',operationId:'i',origin:'supplier',purchaseOccurredAt:1,name:'Public card',description:'Description',purchasePriceCents:100,askingPriceCents:300,quantity:2,vatRegime:'other',status:'available',createdAt:1,gradingNotes:'private',gradingCompany:'Custom',gradingGrade:'Authentic'});
 const purchaseId=await ctx.db.insert('purchases',{ownerId:'u',operationId:'p',operationDigest:'d',sellerId:await ctx.db.insert('sellers',{ownerId:'u',operationId:'s',operationDigest:'d',name:'Private seller',createdAt:1}),occurredAt:1,reference:'P',status:'active',createdAt:1});
 const photoId=await ctx.db.insert('attachments',{ownerId:'u',itemId,objectKey:'public.jpg',filename:'public.jpg',contentType:'image/jpeg',size:3,createdAt:1});
 const evidenceId=await ctx.db.insert('attachments',{ownerId:'u',itemId,purchaseId,objectKey:'private.jpg',filename:'private.jpg',contentType:'image/jpeg',size:3,createdAt:1});
 await ctx.db.patch(itemId,{coverPhotoId:evidenceId});return {itemId,photoId,evidenceId};
 });
 const item=await t.query(api.operations.publicProduct,{itemId:ids.itemId});
 assert.equal(item?.description,'Description');assert.equal(item?.gradingGrade,'Authentic');assert.deepEqual(item?.photos,[{id:ids.photoId}]);
 for(const key of ['purchasePriceCents','ownerId','gradingNotes','objectKey','sellerId'])assert.equal(key in item!,false);
 assert.equal(await t.query(internal.operations.cataloguePhotoObject,{itemId:ids.itemId,photoId:ids.evidenceId}),null);
 assert.equal((await t.query(internal.operations.cataloguePhotoObject,{itemId:ids.itemId}))?.objectKey,'public.jpg');
 await t.run(ctx=>ctx.db.patch(ids.itemId,{hiddenFromCatalogue:true}));
 assert.equal(await t.query(api.operations.publicProduct,{itemId:ids.itemId}),null);
 assert.equal(await t.query(internal.operations.cataloguePhotoObject,{itemId:ids.itemId,photoId:ids.photoId}),null);
});
test('configured registration overrides legacy setting, including first account',async()=>{
 const t=convexTest(schema,{'./functions/auth.ts':()=>import('../functions/auth'),'./functions/_generated/server.js':()=>import('../functions/_generated/server.js')});
 await assert.rejects(t.mutation(internal.auth.createAccount,{email:'closed@example.org',passwordHash:'test',registrationPolicy:'closed'}),/SIGNUP_DISABLED/);
 await t.mutation(internal.auth.setSignupEnabled,{enabled:false,now:1});
 await t.mutation(internal.auth.createAccount,{email:'open@example.org',passwordHash:'test',registrationPolicy:'open'});
 await t.mutation(internal.auth.createAccount,{email:'open2@example.org',passwordHash:'test',registrationPolicy:'open'});
});

test('legacy product metadata edits preserve private fields and reject stale revisions',async()=>{
 const t=convexTest(schema,modules),user=(await authenticated(t, 'u'));
 const itemId=await t.run(ctx=>ctx.db.insert('items',{ownerId:'u',operationId:'i',origin:'supplier',purchaseOccurredAt:1,name:'Card',purchasePriceCents:100,askingPriceCents:300,quantity:1,vatRegime:'other',status:'available',createdAt:1}));
 const edit={itemId,expectedRevision:0,name:'Card',description:'Public description',series:'Set',identifier:'001',askingPriceCents:300,hiddenFromCatalogue:false,gradingGrade:'',gradingCertificate:'',variant:'Reverse',publicAttributes:{Artist:'Example'},privateAttributes:{Evidence:'private'},privateNotes:'Private note',serialNumber:'private-serial'};
 await user.mutation(makeFunctionReference<'mutation'>('inventory:updateProduct'),edit);
 await assert.rejects(user.mutation(makeFunctionReference<'mutation'>('inventory:updateProduct'),{...edit,name:'Stale overwrite'}),/REVISION_CONFLICT/);
 const detail=await user.query(makeFunctionReference<'query'>('inventory:detail'),{itemId});
 assert.equal(detail.item.revision,1);assert.equal(detail.item.privateNotes,'Private note');
 const publicItem=await t.query(api.operations.publicProduct,{itemId});
 assert.deepEqual(publicItem?.publicAttributes,{Artist:'Example'});assert.equal(publicItem?.variant,'Reverse');
 for(const key of ['privateAttributes','privateNotes','serialNumber','revision'])assert.equal(key in publicItem!,false);
 const catalogue=await t.query(api.operations.publicCatalogue,{paginationOpts:{numItems:10,cursor:null},search:'',gradingStatus:'all',gradingCompany:'',gradingGrade:''});
 assert.equal(JSON.stringify(catalogue).includes('private'),false);
});
