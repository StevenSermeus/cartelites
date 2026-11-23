import test from 'node:test';
import assert from 'node:assert/strict';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import legacySchema from '../functions/schema';
import rebuildSchema from '../rebuild/functions/schema';
import {authenticated} from './helpers/session';
const q=(name:string)=>makeFunctionReference<'query'>(name);
const base={search:'',gradingStatus:'all',gradingCompany:'',gradingGrade:'',paginationOpts:{numItems:1,cursor:null},sort:'name'};
for(const rebuild of [false,true])test(`${rebuild?'rebuild':'legacy'} series: exact grouped filters, all-stock facets, privacy, auth and cursor binding`,async()=>{
 const modules=rebuild?{
  './functions/auth.ts':()=>import('../rebuild/functions/auth'),
  './functions/readModels.ts':()=>import('../rebuild/functions/readModels'),
  './functions/operations.ts':()=>import('../rebuild/functions/operations'),
  './functions/_generated/server.js':()=>import('../rebuild/functions/_generated/server.js'),
 }:{
  './functions/readModels.ts':()=>import('../functions/readModels'),
  './functions/operations.ts':()=>import('../functions/operations'),
  './functions/_generated/server.js':()=>import('../functions/_generated/server.js'),
 };
 const t:any=convexTest(rebuild?rebuildSchema:legacySchema,modules);
 let user:any;
 if(rebuild){
  const id=await t.run((ctx:any)=>ctx.db.insert('accounts',{email:'series@example.invalid',passwordHash:'test',sessionVersion:0,createdAt:1}));
  await t.mutation(makeFunctionReference<'mutation'>('auth:startSession'),{id,jti:'series-session',sessionVersion:0,expiresAt:Date.now()+60000,now:Date.now()});
  user=t.withIdentity({subject:id,sv:0,sessionJti:'series-session'});
 }else user=await authenticated(t,'staff');
 await t.run(async(ctx:any)=>{
  const specs=[
   ['A','pokemon','Origines',true,1,'available'],['B','riftbound','Origines · Foil',true,1,'available'],
   ['C','riftbound','Origines · Alternate',true,1,'available'],['D','riftbound','Origines 2',true,1,'available'],
   ['E','riftbound','Staff secret',false,1,'available'],['F','riftbound','Zero secret',true,0,'available'],
   ['G','riftbound','Sold secret',true,1,'sold'],
  ];
  for(const [name,tcg,series,visible,quantity,status] of specs){
   if(rebuild){const productId=await ctx.db.insert('products',{description:'',name,tcg,type:'card',set:series,createdAt:1});await ctx.db.insert('stockItems',{productId,origin:'supplier',tracking:'quantity',askingPriceCents:100,visible,quantity,status,createdAt:1});}
   else await ctx.db.insert('items',{name,tcg,series,origin:'supplier',productType:'card',askingPriceCents:100,hiddenFromCatalogue:!visible,quantity,status,ownerId:'staff',operationId:String(name),purchaseOccurredAt:1,vatRegime:'other',createdAt:1});
  }
  if(rebuild){
   const contactId=await ctx.db.insert('contacts',{kind:'person',name:'Private',createdAt:1});
   for(const state of ['pending','removed','contract']){
    const productId=await ctx.db.insert('products',{description:'',name:state,tcg:'riftbound',type:'card',set:`${state} secret`,createdAt:1});
    const stockItemId=await ctx.db.insert('stockItems',{productId,origin:state==='contract'?'consignment':'purchase',tracking:'individual',askingPriceCents:100,visible:true,quantity:1,status:'available',createdAt:1});
    let source;
    if(state==='contract'){
     const consignmentId=await ctx.db.insert('consignments',{depositorId:contactId,reference:state,occurredAt:1,status:'open',createdAt:1});
     source={kind:'consignment',consignmentId,depositorId:contactId};
    }else{
     const purchaseId=await ctx.db.insert('purchases',{contactId,type:'buyback',reference:state,occurredAt:1,status:state==='pending'?'pending':'active',createdAt:1});
     const purchaseLineId=await ctx.db.insert('purchaseLines',{purchaseId,stockItemId,quantity:1,costCents:10,estimatedValueCents:null,buybackRateBps:null,tax:{regime:'margin',rateBps:null},...(state==='removed'?{removedAt:2}:{}),createdAt:1});
     source={kind:'purchase',purchaseId,purchaseLineId};
     // Real removals also remove availability; keep this anomalous row to test staff eligibility.
     if(state==='removed')await ctx.db.patch(stockItemId,{visible:false});
    }
    await ctx.db.insert('stockLots',{stockItemId,source,originalQuantity:1,remainingQuantity:1,originalCostCents:10,remainingCostCents:10,acquiredAt:1,taxRateBps:null,openingBalanceOnly:false,createdAt:1});
   }
  }else{
   const sellerId=await ctx.db.insert('sellers',{name:'Private',ownerId:'staff',operationId:'s',operationDigest:'',createdAt:1});
   const purchaseId=await ctx.db.insert('purchases',{sellerId,reference:'pending',status:'pending',occurredAt:1,ownerId:'staff',operationId:'p',operationDigest:'',createdAt:1});
   const consignmentId=await ctx.db.insert('consignments',{sellerId,reference:'pending',flowVersion:2,contractStatus:'awaiting_signature',occurredAt:1,ownerId:'staff',operationId:'c',operationDigest:'',createdAt:1});
   for(const [series,source] of [['pending secret',{purchaseId}],['contract secret',{consignmentId,origin:'consignment'}],['removed secret',{origin:'supplier',removedPurchaseId:purchaseId}]])await ctx.db.insert('items',{name:series,series,tcg:'riftbound',...source,askingPriceCents:100,quantity:1,status:'available',ownerId:'staff',operationId:series,purchaseOccurredAt:1,vatRegime:'other',createdAt:1});
  }
 });
 await assert.rejects(()=>t.query(q('readModels:stockSeries'),{}),/UNAUTHENTICATED/);
 assert.deepEqual(await user.query(q('readModels:stockSeries'),{tcg:'riftbound'}),['Origines','Origines 2','Staff secret']);
 assert.deepEqual(await user.query(q('readModels:stockSeries'),{tcg:'pokemon'}),['Origines']);
 const known = await user.query(q('readModels:stockSeries'),{tcg:'riftbound',includeUnavailable:true});
 assert.ok(known.includes('Sold secret')); assert.ok(known.includes('Zero secret'));
 await assert.rejects(()=>t.query(q('readModels:stockSeries'),{tcg:'riftbound',includeUnavailable:true}),/UNAUTHENTICATED/);
 assert.equal((await user.query(q('readModels:browse'),{resource:'stock',series:'x'.repeat(300)})).items.length,0);
 for(const [tcg,expected] of [['pokemon',['A']],['riftbound',['B','C']]] as const){
  let cursor:string|undefined;const names:string[]=[];
  do{
   const args={resource:'stock',size:1,tcg,series:'origines',...(cursor?{cursor}:{})};
   const page=await user.query(q('readModels:browse'),args);names.push(...page.items.map((i:any)=>i.name));cursor=page.nextCursor??undefined;
   if(cursor)for(const changed of [{series:'Origines 2'},{tcg:'other'}])await assert.rejects(()=>user.query(q('readModels:browse'),{...args,...changed,cursor}),/INVALID_CURSOR/);
  }while(cursor);
  assert.deepEqual(names.sort(),expected);
 }
 const first=await t.query(q('operations:publicCatalogue'),{...base,tcg:'riftbound',series:'origines'});
 assert.equal(first.totalCount,2);assert.equal(first.page.length,1);assert.deepEqual(first.series,['Origines','Origines 2']);
 const next=await t.query(q('operations:publicCatalogue'),{...base,tcg:'riftbound',series:'origines',paginationOpts:{numItems:1,cursor:first.continueCursor}});
 assert.notEqual(first.page[0].id,next.page[0].id);assert.equal(next.isDone,true);
 const empty=await t.query(q('operations:publicCatalogue'),{...base,tcg:'riftbound',series:'Orig',search:'no match',minPrice:1000});
 assert.equal(empty.totalCount,0);assert.deepEqual(empty.series,first.series);
 assert.deepEqual((await t.query(q('operations:publicCatalogue'),{...base,tcg:'pokemon'})).series,['Origines']);
 await assert.rejects(()=>user.query(q('readModels:browse'),{resource:'stock',series:'x'.repeat(301)}),/INVALID_PAGINATION/);
 await assert.rejects(()=>t.query(q('operations:publicCatalogue'),{...base,series:'x'.repeat(301)}),/INVALID/);
});
