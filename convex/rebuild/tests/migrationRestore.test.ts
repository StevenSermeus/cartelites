import test from 'node:test';
import assert from 'node:assert/strict';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../functions/schema';
import {assertMigrationPolicy,assertRestoreTarget} from '../functions/migrationPolicy';
import {normalize,digest} from '../../../apps/api/scripts/migration/normalize';
import {planConvexImport} from '../../../apps/api/scripts/migration/import-convex';

const modules={
 './functions/migrationService.ts':()=>import('../functions/migrationService'),
 './functions/migration.ts':()=>import('../functions/migration'),
 './functions/itemActivity.ts':()=>import('../functions/itemActivity'),
 './functions/_generated/server.js':()=>import('../functions/_generated/server.js'),
};
const execute=makeFunctionReference<'action'>('migrationService:execute');
const secret='restore-test-secret-32-characters-long';
const row=(_id:string,data:Record<string,unknown>)=>({_id,createdAt:1,ownerId:'u',...data});
function fixture(){return normalize({
 accounts:[row('u',{email:'restore@example.invalid',passwordHash:'preserved-hash',sessionVersion:2})],
 sellers:[row('client',{name:'Historical client'})],
 purchases:[row('purchase',{sellerId:'client',reference:'P',occurredAt:1,status:'active'})],
 items:[row('item',{purchaseId:'purchase',purchaseOccurredAt:1,name:'Card',status:'available',askingPriceCents:250,vatRegime:'margin'})],
 signedReceipts:[row('receipt',{kind:'purchase',targetId:'purchase',snapshot:{client:{name:'Original signer'},items:[{name:'Original card'}]},identity:{company:'Original shop'},signedAt:2,companySignature:[[[0,0],[1,1]]],clientSignature:[[[2,2],[3,3]]],consent:'original consent',objectKey:'signed/original.pdf',sha256:'a'.repeat(64)})],
});}
function setup(){
 const migration=fixture();assert.deepEqual(migration.errors,[]);
 const entries=planConvexImport(migration),run={batch:`canonical-v1:${migration.sourceDigest}`,sourceDigest:migration.sourceDigest,planDigest:digest(entries.map(e=>[e.table,e.row.id,e.hash]))};
 const begin={...run,countsJson:JSON.stringify(Object.fromEntries(Object.entries(migration.tables).map(([table,rows])=>[table,rows.length]))),totalsJson:JSON.stringify(migration.reconciliation)};
 const t=convexTest(schema,modules);
 const call=(operation:string,payload:unknown=run,credential=secret)=>t.action(execute,{secret:credential,operation,payload});
 return {t,migration,entries,run,begin,call};
}
async function environment(sourceDigest:string,work:()=>Promise<void>){
 const env={MIGRATION_MODE:'restore',MIGRATION_SECRET:secret,MIGRATION_TARGET_URL:'https://restore.convex.cloud',CONVEX_CLOUD_URL:'https://restore.convex.cloud',MIGRATION_SOURCE_DIGEST:sourceDigest};
 const prior=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 try{await work();}finally{for(const [key,value] of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
}

test('restore origins are strict and the rehearsal policy remains unchanged',()=>{
 assert.equal(assertRestoreTarget('https://RESTORE.convex.cloud/'),'https://restore.convex.cloud');
 assert.equal(assertRestoreTarget('http://127.0.0.1:3220/'),'http://127.0.0.1:3220');
 assert.equal(assertRestoreTarget('http://[::1]:3220'),'http://[::1]:3220');
 for(const url of ['http://remote.example:3220','http://localhost','http://localhost:80','http://127.1:3220','https://u:p@example.com','https://@example.com','https://example.com/path','https://example.com/a/..','https://example.com/?','https://example.com/#',' https://example.com','https://example.com\\evil',...['3001','3210','3211','5174'].map(port=>`http://localhost:${port}`)])assert.throws(()=>assertRestoreTarget(url),Error,url);
 assert.doesNotThrow(()=>assertMigrationPolicy({MIGRATION_MODE:'isolated-rehearsal',CONVEX_CLOUD_URL:'http://localhost:3210'},null));
 assert.throws(()=>assertMigrationPolicy({MIGRATION_MODE:'isolated-rehearsal',CONVEX_CLOUD_URL:'https://remote.example'},{}),/LOCAL_REHEARSAL_ONLY/);
});

test('actual action authenticates and enforces restore mode, target and source for every operation',async()=>{
 const {migration,call,run,begin,t}=setup();
 await environment(migration.sourceDigest,async()=>{
  await assert.rejects(()=>call('begin',begin,'wrong'),/UNAUTHORIZED_MIGRATION/);
  await assert.rejects(()=>call('begin',begin,'x'.repeat(secret.length)),/UNAUTHORIZED_MIGRATION/);
  process.env.MIGRATION_MODE='disabled';await assert.rejects(()=>call('begin',begin),/MIGRATION_DISABLED/);
  process.env.MIGRATION_MODE='isolated-rehearsal';await assert.rejects(()=>call('begin',begin),/LOCAL_REHEARSAL_ONLY/);
  process.env.MIGRATION_MODE='restore';process.env.MIGRATION_SECRET='short';await assert.rejects(()=>call('begin',begin,'short'),/INVALID_MIGRATION_SECRET/);process.env.MIGRATION_SECRET=secret;
  for(const target of ['', 'https://other.convex.cloud','https://restore.convex.cloud/']){process.env.MIGRATION_TARGET_URL=target;await assert.rejects(()=>call('begin',begin),/MIGRATION_TARGET_MISMATCH/);}
  process.env.MIGRATION_TARGET_URL='https://restore.convex.cloud';
  for(const value of ['', 'A'.repeat(64), 'a'.repeat(63)]){process.env.MIGRATION_SOURCE_DIGEST=value;await assert.rejects(()=>call('begin',begin),/INVALID_MIGRATION_SOURCE_DIGEST/);}
  process.env.MIGRATION_SOURCE_DIGEST=migration.sourceDigest;
  for(const operation of ['begin','batch','links','reconcile','complete','objects','accountBinding','rebuildActivity']){
   for(const payload of [null,{}, {...run,batch:'other'}, {...run,sourceDigest:'b'.repeat(64)}])await assert.rejects(()=>call(operation,payload),/MIGRATION_SOURCE_MISMATCH/);
  }
  assert.equal(await t.run(ctx=>ctx.db.query('migrationRuns').first()),null);
 });
});

test('actual restore refuses nonempty targets and imports replay safely preserving documents, file and identity bindings',async()=>{
 const {t,migration,entries,run,begin,call}=setup();
 await environment(migration.sourceDigest,async()=>{
  const existing=await t.run(ctx=>ctx.db.insert('accounts',{email:'existing@example.invalid',passwordHash:'x',sessionVersion:0,createdAt:1}));
  await assert.rejects(()=>call('begin',begin),/TARGET_NOT_EMPTY/);await t.run(ctx=>ctx.db.delete(existing));
  assert.deepEqual(await call('begin',begin),{status:'importing'});assert.deepEqual(await call('begin',begin),{status:'importing'});
  await assert.rejects(()=>call('begin',{...begin,planDigest:'changed'}),/MIGRATION_SOURCE_CHANGED/);
  await assert.rejects(()=>call('complete'),/RECONCILIATION_FAILED/);
  await assert.rejects(()=>call('rebuildActivity'),/COMPLETE_IMPORT_REQUIRED/);
  await assert.rejects(()=>call('batch',{...run,entries:[{...entries[0],hash:'wrong'}]}),/INVALID_RECORD_HASH/);
  for(let i=0;i<entries.length;i+=50){const batch=entries.slice(i,i+50);assert.deepEqual(await call('batch',{...run,entries:batch}),{inserted:batch.length,replayed:0});assert.deepEqual(await call('batch',{...run,entries:batch}),{inserted:0,replayed:batch.length});}
  const before=await t.run(async ctx=>({documents:await ctx.db.query('documents').collect(),signatures:await ctx.db.query('documentSignatures').collect(),files:await ctx.db.query('files').collect(),mappings:await ctx.db.query('legacyMappings').collect()}));
  const document=before.documents[0],file=before.files[0];
  assert.deepEqual(JSON.parse(document.inputSnapshot.json),migration.tables.documents[0].inputSnapshot.value);
  assert.deepEqual(JSON.parse(document.shopSnapshotJson),migration.tables.documents[0].shopSnapshot);
  assert.equal(document.pdfFileId,file._id);assert.equal(file.objectKey,'signed/original.pdf');assert.equal(file.sha256,'a'.repeat(64));
  for(const signature of before.signatures){const original=migration.tables.documentSignatures.find(s=>s.role===signature.role)!;assert.deepEqual(signature.strokes,original.strokes);assert.deepEqual(JSON.parse(signature.identityJson),original.identity);assert.equal(signature.documentId,document._id);}
  const stableId=migration.tables.accounts[0].id;
  const accountId=await call('accountBinding',{batch:run.batch,stableId});
  assert.equal(accountId,before.mappings.find(m=>m.oldTable==='normalized:accounts'&&m.oldId===stableId)?.newId);
  assert.deepEqual(await call('objects',{batch:run.batch}),[{objectKey:file.objectKey,sha256:file.sha256,contentType:file.contentType}]);
  assert.deepEqual((await call('reconcile',{batch:run.batch}) as any).errors,[]);
  assert.deepEqual(await call('complete'),{status:'complete'});
  assert.deepEqual(await call('begin',begin),{status:'complete'});
  for(let i=0;i<entries.length;i+=50){const batch=entries.slice(i,i+50);assert.deepEqual(await call('batch',{...run,entries:batch}),{inserted:0,replayed:batch.length});}
  let result=await call('rebuildActivity',{batch:run.batch}) as any;
  assert.equal(result.complete,false); // One bounded page, not an action-side loop.
  assert.deepEqual(await call('begin',begin),{status:'complete'}); // Own checkpoint does not block a resume.
  for(let i=0;!result.complete&&i<100;i++)result=await call('rebuildActivity',{batch:run.batch});
  assert.equal(result.complete,true);
  assert.deepEqual(await t.run(async ctx=>({documents:await ctx.db.query('documents').collect(),signatures:await ctx.db.query('documentSignatures').collect(),files:await ctx.db.query('files').collect(),mappings:await ctx.db.query('legacyMappings').collect()})),before);
  await t.run(ctx=>ctx.db.insert('products',{type:'card',name:'Unexpected',description:'',createdAt:1}));
  await assert.rejects(()=>call('rebuildActivity',{batch:run.batch}),/RECONCILIATION_FAILED/);
 });
});


test('a first restore refuses completed and partial activity checkpoints instead of skipping imported history',async()=>{
 for(const complete of [false,true]){
  const {t,migration,begin,call}=setup();
  await environment(migration.sourceDigest,async()=>{
   const checkpoint=await t.run(ctx=>ctx.db.insert('itemActivityBuilds',{name:'v1',phase:2,cursor:null,complete,processed:7}));
   await assert.rejects(()=>call('begin',begin),/TARGET_NOT_EMPTY:itemActivityBuilds/);
   assert.equal(await t.run(ctx=>ctx.db.query('migrationRuns').first()),null);
   assert.equal((await t.run(ctx=>ctx.db.get(checkpoint)))?.processed,7);
  });
 }
});
