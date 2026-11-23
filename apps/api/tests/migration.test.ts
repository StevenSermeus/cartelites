import assert from 'node:assert/strict';
import test from 'node:test';
import {rehearse} from '../scripts/migration/rehearse.js';
test('offline migration is deterministic, collision-free across tables and lossless for signed originals',()=>{
 const source={items:[{_id:'same',name:'Card',purchasePriceCents:123,unknownLegacy:{retained:true}}],signedReceipts:[{_id:'same',objectKey:'signed/original.pdf',sha256:'original',signedAt:4,snapshot:{immutable:true}}]};
 const a=rehearse(source),b=rehearse(source);assert.deepEqual(a,b);assert.notEqual(a.mappings[0].newId,a.mappings[1].newId);assert.deepEqual(a.tables.documents[0].source,source.signedReceipts[0]);assert.equal(a.objectReferences[0].objectKey,'signed/original.pdf');assert.equal(a.cutoverReady,false);
});
test('migration rejects duplicates and reports orphan allocations and inconsistent payment',()=>{
 assert.throws(()=>rehearse({items:[{_id:'x'},{_id:'x'}]}),/duplicate/);
 const result=rehearse({sales:[{_id:'s',itemId:'missing',salePriceCents:100,payment:{cashCents:1,transferCents:2},allocations:[{lotId:'missing'}]}]});
 assert.equal(result.errors.length,3);assert.match(result.warnings.join(' '),/unknown payment/);
});

test('CLI fails closed when a restored original is missing', async () => {
  const {mkdtemp,writeFile,rm,mkdir}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const {spawnSync}=await import('node:child_process');
  const root=await mkdtemp(join(tmpdir(),'migration-cli-'));
  try {
    await writeFile(join(root,'export.json'),JSON.stringify({signedReceipts:[{_id:'signed',objectKey:'missing.pdf',sha256:'a'.repeat(64)}]}));
    await mkdir(join(root,'objects'));
    const result=spawnSync(process.execPath,['--import',new URL('../node_modules/tsx/dist/loader.mjs',import.meta.url).pathname,new URL('../scripts/migration/rehearse.ts',import.meta.url).pathname,join(root,'export.json'),join(root,'result'),join(root,'objects')],{encoding:'utf8'});
    assert.equal(result.status,1,result.stderr);
  } finally {await rm(root,{recursive:true,force:true});}
});
