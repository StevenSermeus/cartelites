/** Local-only rehearsal/reimport package. No network clients or deployment commands. */
import { mkdir, readFile, writeFile, rename, rm, open, realpath, chmod } from 'node:fs/promises';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { normalize, digest, type NormalizedMigration } from './normalize.js';
import { schemas, validateTables, type Table, type Tables } from './model.js';
import { verifyObjects, type Export } from './rehearse.js';
type Entry={table:Table;id:string;data:unknown;hash:string};
type State={formatVersion:2;sourceDigest:string;planDigest:string;cursor:number;complete:boolean;tables:Record<string,Record<string,{data:unknown;hash:string}>>};
const marker='cartelites-local-staging-v2';
async function atomic(path:string,value:unknown) {
 const tmp=`${path}.${randomUUID()}.tmp`;
 const handle=await open(tmp,'wx',0o600);
 try {await handle.writeFile(JSON.stringify(value,null,2));await handle.sync();} finally {await handle.close();}
 await rename(tmp,path);
 const dir=await open(dirname(path),'r');try{await dir.sync();}finally{await dir.close();}
}
export function planEntries(migration:NormalizedMigration):Entry[] {
 return (Object.keys(schemas) as Table[]).sort().flatMap(table=>[...migration.tables[table]].sort((a,b)=>a.id.localeCompare(b.id)).map(data=>({table,id:data.id,data,hash:digest(data)})));
}
export async function initializeStage(directory:string) {
 await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
 const markerPath=resolve(directory,'.cartelites-stage');
 try {const existing=await readFile(markerPath,'utf8');if(existing!==marker)throw new Error('Incompatible staging directory');}
 catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await writeFile(markerPath,marker,{flag:'wx',mode:0o600});}
}
export async function importLocal(migration:NormalizedMigration,directory:string,options:{batchSize?:number;maxBatches?:number}={}) {
 if(migration.errors.length)throw new Error('Normalized validation failed; import refused');
 validateTables(migration.tables);
 const root=await realpath(directory);
 if(await readFile(resolve(root,'.cartelites-stage'),'utf8')!==marker)throw new Error('Not an explicitly initialized isolated local stage');
 const lock=resolve(root,'.import-lock');await mkdir(lock);
 try {
  const entries=planEntries(migration),planDigest=digest(entries.map(e=>[e.table,e.id,e.hash]));
  const statePath=resolve(root,'state.json');let state:State;
  try {state=JSON.parse(await readFile(statePath,'utf8')) as State;}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;state={formatVersion:2,sourceDigest:migration.sourceDigest,planDigest,cursor:0,complete:false,tables:{}};}
  if(state.formatVersion!==2||state.sourceDigest!==migration.sourceDigest||state.planDigest!==planDigest)throw new Error('Stage source/plan changed; use a new isolated directory');
  if(!Number.isSafeInteger(state.cursor)||state.cursor<0||state.cursor>entries.length)throw new Error('Invalid checkpoint cursor');
  // Revalidate all committed data on every resume. A cursor alone is never trusted.
  const stagedEntries=Object.values(state.tables).reduce((n,t)=>n+Object.keys(t).length,0);
  if(stagedEntries!==state.cursor)throw new Error('Checkpoint/record count mismatch');
  for(const e of entries.slice(0,state.cursor)){const saved=state.tables[e.table]?.[e.id];if(!saved||saved.hash!==e.hash||digest(saved.data)!==e.hash)throw new Error('Committed staging record checksum mismatch');schemas[e.table].parse(saved.data);}
  const size=options.batchSize??200;if(!Number.isSafeInteger(size)||size<1)throw new Error('Invalid batch size');
  let batches=0;
  while(state.cursor<entries.length&&(options.maxBatches===undefined||batches<options.maxBatches)) {
   for(const e of entries.slice(state.cursor,state.cursor+size)){
    const table=state.tables[e.table]??={};
    const old=table[e.id];if(old&&old.hash!==e.hash)throw new Error('ID collision with different content');
    table[e.id]={data:e.data,hash:e.hash};state.cursor++;
   }
   state.complete=state.cursor===entries.length;
   await atomic(statePath,state);batches++;
  }
  if(entries.length===0&&!state.complete){state.complete=true;await atomic(statePath,state);}
  await atomic(resolve(root,'legacy-vault.json'),migration.legacyVault);
  await atomic(resolve(root,'manifest.json'),{formatVersion:2,sourceDigest:migration.sourceDigest,planDigest,complete:state.complete,records:state.cursor,expectedRecords:entries.length,counts:Object.fromEntries(Object.entries(migration.tables).map(([t,r])=>[t,r.length])),reconciliation:migration.reconciliation,comparisons:migration.comparisons,unmappedTables:migration.unmappedTables,warnings:migration.warnings,networkImported:false,cutoverReady:false});
  return {complete:state.complete,records:state.cursor,expectedRecords:entries.length,planDigest};
 } finally {await rm(lock,{recursive:true});}
}
export async function packageObjects(migration:NormalizedMigration,sourceDirectory:string,stageDirectory:string) {
 const source=await realpath(sourceDirectory),stage=await realpath(stageDirectory);
 if(await readFile(resolve(stage,'.cartelites-stage'),'utf8')!==marker)throw new Error('Uninitialized stage');
 const refs=migration.tables.files.map(f=>({objectKey:f.objectKey,sha256:f.sha256}));
 const checks=await verifyObjects(refs,source);
 if(checks.some(c=>c.status==='missing'||c.status==='mismatch'))throw new Error('Object restore verification failed; package refused');
 const destination=resolve(stage,'objects');await mkdir(destination,{recursive:true,mode:0o700});
 const manifest=[];
 for(const ref of refs) {
  const path=resolve(source,ref.objectKey),rel=relative(source,path);
  if(!rel||rel.startsWith('..')||isAbsolute(rel))throw new Error('Unsafe object key');
  const from=await realpath(path);if(relative(source,from).startsWith('..'))throw new Error('Source object escapes directory');
  const target=resolve(destination,rel);await mkdir(dirname(target),{recursive:true,mode:0o700});
  const parent=await realpath(dirname(target));if(relative(destination,parent).startsWith('..'))throw new Error('Target object directory escapes package');
  // Replacing via rename avoids following a pre-existing target symlink.
  const temporary=`${target}.${randomUUID()}.tmp`;
  const handle=await open(temporary,'wx',0o600);try{await handle.writeFile(await readFile(from));await handle.sync();}finally{await handle.close();}
  await rename(temporary,target);
  const checksum=createHash('sha256').update(await readFile(target)).digest('hex');
  if(ref.sha256&&checksum!==ref.sha256)throw new Error('Copied object checksum mismatch');
  manifest.push({objectKey:ref.objectKey,sha256:checksum,baseline:ref.sha256??null,baselineVerified:!!ref.sha256});
 }
 await atomic(resolve(stage,'object-manifest.json'),manifest);
 return {objects:manifest.length,baselineVerified:manifest.filter(m=>m.baselineVerified).length};
}
export async function exportStagedTables(directory:string) {
 const state=JSON.parse(await readFile(resolve(directory,'state.json'),'utf8')) as State;
 if(!state.complete)throw new Error('Incomplete local import');
 const tables=Object.fromEntries(Object.keys(schemas).map(table=>[table,Object.values(state.tables[table]??{}).map(r=>{if(digest(r.data)!==r.hash)throw new Error('Staged checksum mismatch');return r.data;})])) as Tables;
 validateTables(tables);return tables;
}
async function main() {
 const [input,directory,...flags]=process.argv.slice(2);
 if(!input||!directory)throw new Error('Usage: node --import tsx scripts/migration/import-local.ts export.json private-output [--init] [--dry-run] [--objects copied-r2-directory]');
 const migration=normalize(JSON.parse(await readFile(input,'utf8')) as Export);
 if(flags.includes('--dry-run')){console.log(JSON.stringify({sourceDigest:migration.sourceDigest,reconciliation:migration.reconciliation,errors:migration.errors,warnings:migration.warnings,cutoverReady:false},null,2));if(migration.errors.length)process.exitCode=1;return;}
 if(flags.includes('--init'))await initializeStage(directory);
 const result=await importLocal(migration,directory);
 const objectIndex=flags.indexOf('--objects');
 const objects=objectIndex>=0?await packageObjects(migration,flags[objectIndex+1],directory):undefined;
 console.log(JSON.stringify({...result,objects,networkImported:false,cutoverReady:false},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
