/** Canonical restore. Local rehearsal by default; explicit, source-bound restore mode for other targets. */
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs, parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { normalize, digest, type NormalizedMigration } from './normalize.js';
import { schemas, type Table } from './model.js';
import { assertRestoreTarget } from '../../../../convex/rebuild/functions/migrationPolicy.js';
import { verifyObjects } from './rehearse.js';
import { references } from '../../../../convex/rebuild/functions/migrationReferences.js';
export function planConvexImport(migration:NormalizedMigration){
 if(migration.errors.length)throw new Error('NORMALIZED_VALIDATION_FAILED');
 const pending=(Object.keys(schemas) as Table[]).flatMap(table=>migration.tables[table].map(row=>({table,row,serialized:JSON.stringify(row),hash:digest(row)})));
 const planned:typeof pending=[],seen=new Set<string>();
 while(pending.length){
  let progress=false;
  for(let i=0;i<pending.length;){const entry=pending[i];
   if(references(entry.table,entry.row).every(ref=>seen.has(`${ref.table}/${ref.id}`))){planned.push(entry);seen.add(`${entry.table}/${entry.row.id}`);pending.splice(i,1);progress=true;}else i++;
  }
  if(!progress)throw new Error(`CYCLIC_OR_MISSING_REFERENCES:${pending.slice(0,5).map(e=>e.table).join(',')}`);
 }
 return planned;
}
export function assertIsolatedTarget(value:string){
 const url=new URL(value);
 if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!url.port||['3001','3210','3211','5174'].includes(url.port)||url.pathname!=='/'||url.username||url.password||url.search||url.hash)throw new Error('Dedicated loopback rehearsal target required; active legacy ports refused');
 return url.origin;
}
export type ImportOptions = {
 url: string; secret: string; dryRun?: boolean; mode?: 'rehearsal' | 'restore';
 expectedSourceDigest?: string; objectDirectory?: string;
 onProgress?: (value: unknown) => void;
};
export async function importConvex(migration:NormalizedMigration,options:ImportOptions){
 const restore=options.mode==='restore';
 const url=restore?assertRestoreTarget(options.url):assertIsolatedTarget(options.url),entries=planConvexImport(migration);
 const planDigest=digest(entries.map(e=>[e.table,e.row.id,e.hash]));
 const run={batch:`canonical-v1:${migration.sourceDigest}`,sourceDigest:migration.sourceDigest,planDigest};
 const counts=Object.fromEntries(Object.entries(migration.tables).map(([table,rows])=>[table,rows.length]));
 if(options.expectedSourceDigest && options.expectedSourceDigest!==migration.sourceDigest)throw new Error('SOURCE_DIGEST_MISMATCH');
 if(restore&&!options.dryRun&&!/^[a-f0-9]{64}$/.test(options.expectedSourceDigest??''))throw new Error('EXPECTED_SOURCE_DIGEST_REQUIRED: use the sourceDigest from --dry-run');
 if(restore&&!options.dryRun&&migration.tables.files.length&&!options.objectDirectory)throw new Error('OBJECT_BACKUP_REQUIRED: pass --objects with the copied R2 directory');
 const objectChecks=options.objectDirectory?await verifyObjects(migration.tables.files.map(file=>({objectKey:file.objectKey,sha256:file.sha256})),options.objectDirectory):[];
 if(objectChecks.some(check=>check.status==='missing'||check.status==='mismatch'))throw new Error('OBJECT_BACKUP_INVALID: missing files or checksum mismatch');
 const objects={referenced:migration.tables.files.length,checked:objectChecks.length,baselineVerified:objectChecks.filter(c=>c.status==='verified').length,withoutHistoricalChecksum:objectChecks.filter(c=>c.status==='unverified-no-baseline').length,uploaded:0,storage:'Keep the existing R2 bucket and original object keys; this command does not upload or regenerate files.'};
 const preview={target:url,mode:restore?'restore':'rehearsal',...run,counts,totals:migration.reconciliation,warnings:migration.warnings,unmappedTables:migration.unmappedTables,objects};
 if(options.dryRun)return {...preview,networkImported:false as const};
 if(!options.secret||(restore&&options.secret.length<32))throw new Error('MIGRATION_SECRET required (at least 32 characters in restore mode)');
 const client=new ConvexHttpClient(url,{skipConvexDeploymentUrlCheck:true,logger:false,fetch:(input,init)=>fetch(input,{...init,redirect:'error'})});
 const info=await client.query(makeFunctionReference<'query'>('system:deploymentInfo'),{});
 if(info.dataModel!=='canonical'||info.schemaVersion!==1)throw new Error('CANONICAL_SCHEMA_V1_REQUIRED');
 const ref=makeFunctionReference<'action'>('migrationService:execute');
 const call=(operation:string,payload:unknown)=>client.action(ref,{secret:options.secret,operation,payload});
 await call('begin',{...run,countsJson:JSON.stringify(counts),totalsJson:JSON.stringify(migration.reconciliation)});
 let inserted=0,replayed=0;
 for(let start=0;start<entries.length;start+=50){
  const result=await call('batch',{...run,entries:entries.slice(start,start+50)}) as {inserted:number;replayed:number};
  inserted+=result.inserted;replayed+=result.replayed;options.onProgress?.({processed:Math.min(start+50,entries.length),total:entries.length,inserted,replayed});
 }
 const links=migration.tables.consignments.map(c=>({id:c.id,revisionId:c.currentRevisionId}));
 for(let start=0;start<links.length;start+=100)await call('links',{...run,links:links.slice(start,start+100)});
 const reconciliation=await call('reconcile',{batch:run.batch}) as {errors:string[]};
 if(reconciliation.errors.length)throw new Error(`RECONCILIATION_FAILED:${reconciliation.errors.join(',')}`);
 await call('complete',run);
 let activity: {complete:boolean}|undefined;
 if(restore){
  do { activity=await call('rebuildActivity',{batch:run.batch}) as {complete:boolean}; options.onProgress?.({phase:'activity',...activity}); } while(!activity.complete);
 }
 return {...preview,inserted,replayed,reconciliation,activity,networkImported:true as const,cutover:false};
}
async function main() {
 const {values,positionals}=parseArgs({allowPositionals:true,options:{
  'dry-run':{type:'boolean'},restore:{type:'boolean'},objects:{type:'string'},'source-digest':{type:'string'},config:{type:'string'},report:{type:'string'},help:{type:'boolean'},
 }});
 if(values.help){console.log('pnpm data:reimport export.json [Convex URL] [--config private.env] [--restore] [--dry-run] [--objects copied-r2] [--source-digest SHA256] [--report private.json]');return;}
 if(values.config){
  const config=parseEnv(await readFile(resolve(values.config),'utf8'));
  for(const key of ['MIGRATION_TARGET_URL','MIGRATION_SOURCE_DIGEST','MIGRATION_SECRET']){if(config[key]===undefined)delete process.env[key];else process.env[key]=config[key];}
 }
 const [input,url=process.env.MIGRATION_TARGET_URL]=positionals;
 if(!input||!url||positionals.length>2)throw new Error('Usage: pnpm data:reimport export.json [Convex URL] --config private.env --restore --objects copied-r2 [--dry-run]');
 const migration=normalize(JSON.parse(await readFile(resolve(input),'utf8')));
 const result=await importConvex(migration,{url,secret:process.env.MIGRATION_SECRET??'',dryRun:values['dry-run'],mode:values.restore?'restore':'rehearsal',expectedSourceDigest:values['source-digest']??process.env.MIGRATION_SOURCE_DIGEST,objectDirectory:values.objects,onProgress:value=>console.log(JSON.stringify(value))});
 if(values.report)await writeFile(resolve(values.report),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{const message=error instanceof Error?error.message:String(error),secret=process.env.MIGRATION_SECRET;console.error(secret?message.replaceAll(secret,'[REDACTED]'):message);process.exitCode=1;});
