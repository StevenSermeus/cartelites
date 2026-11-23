import test from 'node:test';
import assert from 'node:assert/strict';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../functions/schema';
const modules={'./functions/migration.ts':()=>import('../functions/migration'),'./functions/_generated/server.js':()=>import('../functions/_generated/server.js')};
const repair=makeFunctionReference<'mutation'>('migration:repairLocalConsignmentEventPointers');
test('local legacy event repair changes only mapped index pointer, is previewable/idempotent and denies other environments',async()=>{
 const t=convexTest(schema,modules),batch='offline-v2:source';
 const ids=await t.run(async ctx=>{
  const productId=await ctx.db.insert('products',{type:'card',name:'Fixture',description:'',createdAt:1});
  const itemId=await ctx.db.insert('stockItems',{productId,tracking:'individual',askingPriceCents:100,visible:false,status:'returned',quantity:0,origin:'consignment',createdAt:1});
  const auditId=await ctx.db.insert('auditEvents',{legacyTable:'consignmentEvents',legacyId:'event',action:'legacy-import:consignmentEvents',occurredAt:1,changeJson:JSON.stringify({_id:'event',itemId:'old-item',kind:'return',extra:'preserve'}),createdAt:1});
  await ctx.db.insert('migrationRuns',{batch,sourceDigest:'source',planDigest:'plan',status:'complete',countsJson:'{}',totalsJson:'{}',createdAt:1});
  await ctx.db.insert('legacyMappings',{batch,oldTable:'items',oldId:'old-item',newTable:'stockItems',newId:itemId,createdAt:1});
  await ctx.db.insert('legacyMappings',{batch,oldTable:'consignmentEvents',oldId:'event',newTable:'auditEvents',newId:auditId,createdAt:1});
  return {itemId,auditId};
 });
 const prior=await t.run(ctx=>ctx.db.get(ids.auditId)),environment={mode:process.env.MIGRATION_MODE,url:process.env.CONVEX_CLOUD_URL};
 try{
  process.env.MIGRATION_MODE='isolated-rehearsal';process.env.CONVEX_CLOUD_URL='https://example.convex.cloud';
  await assert.rejects(()=>t.mutation(repair,{dryRun:false}),/LOCAL_QA_REPAIR_ONLY/);
  process.env.CONVEX_CLOUD_URL='http://127.0.0.1:3224';await assert.rejects(()=>t.mutation(repair,{dryRun:false}),/LOCAL_QA_REPAIR_ONLY/);
  process.env.CONVEX_CLOUD_URL='http://127.0.0.1:3220';
  assert.deepEqual(await t.mutation(repair,{dryRun:true}),{dryRun:true,inspected:1,repaired:1,unchanged:0});
  assert.deepEqual(await t.run(ctx=>ctx.db.get(ids.auditId)),prior);
  assert.deepEqual(await t.mutation(repair,{dryRun:false}),{dryRun:false,inspected:1,repaired:1,unchanged:0});
  assert.deepEqual(await t.run(ctx=>ctx.db.get(ids.auditId)),{...prior,record:{table:'stockItems',id:ids.itemId}});
  assert.deepEqual(await t.mutation(repair,{dryRun:false}),{dryRun:false,inspected:1,repaired:0,unchanged:1});
 }finally{
  if(environment.mode===undefined)delete process.env.MIGRATION_MODE;else process.env.MIGRATION_MODE=environment.mode;
  if(environment.url===undefined)delete process.env.CONVEX_CLOUD_URL;else process.env.CONVEX_CLOUD_URL=environment.url;
 }
});
