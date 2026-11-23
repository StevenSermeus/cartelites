import { v } from 'convex/values';
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server';
import type { TableNames } from './_generated/dataModel';
import { references, rewriteReference } from './migrationReferences';
import { schemas, type Table } from '../../../apps/api/scripts/migration/model';

const runArgs={batch:v.string(),sourceDigest:v.string(),planDigest:v.string()};
async function run(ctx:MutationCtx,args:{batch:string;sourceDigest:string;planDigest:string}) {
 const value=await ctx.db.query('migrationRuns').withIndex('by_batch',q=>q.eq('batch',args.batch)).unique();
 if(!value||value.sourceDigest!==args.sourceDigest||value.planDigest!==args.planDigest)throw new Error('MIGRATION_SOURCE_CHANGED');
 return value;
}
export const begin=internalMutation({args:{...runArgs,countsJson:v.string(),totalsJson:v.string()},handler:async(ctx,args)=>{
 const prior=await ctx.db.query('migrationRuns').withIndex('by_batch',q=>q.eq('batch',args.batch)).unique();
 if(prior){await run(ctx,args);if(prior.countsJson!==args.countsJson||prior.totalsJson!==args.totalsJson)throw new Error('MIGRATION_PLAN_CHANGED');return {status:prior.status};}
 if(await ctx.db.query('migrationRuns').first())throw new Error('TARGET_ALREADY_INITIALIZED');
 // Refuse attaching an import to an existing shop, even if no migration marker exists.
 for(const table of Object.keys(schemas) as Table[])if(await ctx.db.query(table).first())throw new Error('TARGET_NOT_EMPTY');
 // An older projection/checkpoint could skip the newly imported history. Resume of
 // this run returns above; only a first import requires a completely clean target.
 for(const table of ['itemActivity','itemActivityBuilds','itemActivityJobs'] as const)if(await ctx.db.query(table).first())throw new Error(`TARGET_NOT_EMPTY:${table}`);
 const counts=JSON.parse(args.countsJson);for(const table of Object.keys(schemas))if(!Number.isSafeInteger(counts[table])||counts[table]<0)throw new Error('INVALID_COUNTS');
 await ctx.db.insert('migrationRuns',{...args,status:'importing',createdAt:Date.now()});return {status:'importing'};
}});
async function binding(ctx:MutationCtx,batch:string,table:string,id:string) {
 const found=await ctx.db.query('legacyMappings').withIndex('by_source',q=>q.eq('batch',batch).eq('oldTable',`normalized:${table}`).eq('oldId',id).eq('newTable',table)).unique();
 if(!found)throw new Error(`MISSING_DEPENDENCY:${table}:${id}`);
 const realId=ctx.db.normalizeId(table as TableNames,found.newId);
 if(!realId||!await ctx.db.get(realId))throw new Error('BROKEN_MIGRATION_BINDING');
 return found.newId;
}
export const importBatch=internalMutation({args:{...runArgs,entries:v.array(v.object({table:v.string(),row:v.any(),serialized:v.string(),hash:v.string()}))},handler:async(ctx,args)=>{
 const migration=await run(ctx,args);if(args.entries.length>50)throw new Error('BATCH_TOO_LARGE');
 let inserted=0,replayed=0;
 for(const entry of args.entries){
  if(!(entry.table in schemas))throw new Error('INVALID_TABLE');
  const table=entry.table as Table;
  const data=schemas[table].parse(entry.row) as Record<string,any>;
  const prior=await ctx.db.query('legacyMappings').withIndex('by_source',q=>q.eq('batch',args.batch).eq('oldTable',`normalized:${table}`).eq('oldId',data.id).eq('newTable',table)).unique();
  if(prior){if(prior.sourceHash!==entry.hash)throw new Error('MIGRATION_RECORD_CHANGED');await binding(ctx,args.batch,table,data.id);replayed++;continue;}
  if(migration.status==='complete')throw new Error('MIGRATION_ALREADY_COMPLETE');
  const stableId=data.id;delete data.id;
  for(const ref of references(table,data))rewriteReference(data,ref.path,await binding(ctx,args.batch,ref.table,ref.id));
  if(table==='consignments')delete data.currentRevisionId; // Completed transactionally after both sides exist.
  if(table==='documents') {data.inputSnapshot={...data.inputSnapshot,json:JSON.stringify(data.inputSnapshot.value)};delete data.inputSnapshot.value;data.shopSnapshotJson=JSON.stringify(data.shopSnapshot);delete data.shopSnapshot;}
  if(table==='documentSignatures'){data.identityJson=JSON.stringify(data.identity);delete data.identity;}
  if(table==='auditEvents'){data.changeJson=JSON.stringify(data.change);delete data.change;}
  // IDs and every persisted field are checked by the target table's Convex validator.
  const realId=await ctx.db.insert(table,data as never);
  await ctx.db.insert('legacyMappings',{oldTable:`normalized:${table}`,oldId:stableId,newTable:table,newId:realId,batch:args.batch,sourceHash:entry.hash,createdAt:Date.now()});inserted++;
 }
 return {inserted,replayed};
}});
export const linkConsignments=internalMutation({args:{...runArgs,links:v.array(v.object({id:v.string(),revisionId:v.string()}))},handler:async(ctx,args)=>{
 await run(ctx,args);if(args.links.length>100)throw new Error('BATCH_TOO_LARGE');
 for(const link of args.links){
  const dossierId=ctx.db.normalizeId('consignments',await binding(ctx,args.batch,'consignments',link.id))!;
  const revisionId=ctx.db.normalizeId('consignmentRevisions',await binding(ctx,args.batch,'consignmentRevisions',link.revisionId))!;
  const revision=await ctx.db.get(revisionId);if(revision?.consignmentId!==dossierId)throw new Error('REVISION_DOSSIER_MISMATCH');
  const dossier=await ctx.db.get(dossierId);if(dossier?.currentRevisionId&&dossier.currentRevisionId!==revisionId)throw new Error('REVISION_CHANGED');
  await ctx.db.patch(dossierId,{currentRevisionId:revisionId});
 }
 return {linked:args.links.length};
}});
export const reconcile=internalQuery({args:{batch:v.string()},handler:async(ctx,args)=>{
 const migration=await ctx.db.query('migrationRuns').withIndex('by_batch',q=>q.eq('batch',args.batch)).unique();if(!migration)throw new Error('UNKNOWN_MIGRATION');
 const expected=JSON.parse(migration.countsJson),counts:Record<string,number>={},errors:string[]=[];
 for(const table of Object.keys(schemas) as Table[]){
  const rows=await ctx.db.query(table).collect();counts[table]=table==='legacyMappings'?rows.filter(r=>!('oldTable'in r)||!String(r.oldTable).startsWith('normalized:')).length:rows.length;
  if(counts[table]!==expected[table])errors.push(`COUNT_MISMATCH:${table}`);
 }
 const items=await ctx.db.query('stockItems').collect(),lots=await ctx.db.query('stockLots').collect();
 for(const item of items){const itemLots=lots.filter(l=>l.stockItemId===item._id);if(item.quantity!==itemLots.reduce((n,l)=>n+l.remainingQuantity,0))errors.push(`QUANTITY_MISMATCH:${item._id}`);}
 for(const dossier of await ctx.db.query('consignments').collect())if(!dossier.currentRevisionId)errors.push(`MISSING_REVISION:${dossier._id}`);
 const purchases=await ctx.db.query('purchaseLines').collect(),sales=await ctx.db.query('sales').collect(),lines=await ctx.db.query('saleLines').collect(),payments=await ctx.db.query('salePayments').collect();
 const active=new Set(sales.filter(s=>s.status==='confirmed').map(s=>s._id));
 const sum=(values:(number|null)[])=>values.reduce<number>((n,x)=>n+(x??0),0);
 const totals={stockQuantity:sum(items.map(x=>x.quantity)),lotRemainingQuantity:sum(lots.map(x=>x.remainingQuantity)),knownPurchaseCostCents:sum(purchases.map(x=>x.costCents)),unknownPurchaseCosts:purchases.filter(x=>x.costCents===null).length,knownLotRemainingCostCents:sum(lots.map(x=>x.remainingCostCents)),unknownLotCosts:lots.filter(x=>x.remainingCostCents===null).length,activeSalesCents:sum(lines.filter(x=>active.has(x.saleId)).map(x=>x.lineTotalCents)),activePaymentCents:sum(payments.filter(x=>x.status==='active').map(x=>x.cashCents+x.transferCents)),collectedDepositorEntitlementCents:sum(lines.filter(x=>active.has(x.saleId)&&x.paymentStatus==='received').map(x=>x.depositorAmountCents)),payoutsCents:sum((await ctx.db.query('depositorPayouts').collect()).map(x=>x.amountCents)),documents:counts.documents,files:counts.files,signatures:counts.documentSignatures};
 const expectedTotals=JSON.parse(migration.totalsJson);for(const [key,value]of Object.entries(totals))if(expectedTotals[key]!==value)errors.push(`TOTAL_MISMATCH:${key}`);
 return {status:migration.status,counts,errors,totals};
}});
export const complete=internalMutation({args:runArgs,handler:async(ctx,args)=>{const current=await run(ctx,args);await ctx.db.patch(current._id,{status:'complete',completedAt:Date.now()});return {status:'complete'};}});
export const originalObjects=internalQuery({args:{batch:v.string()},handler:async(ctx,args)=>{
 if(!await ctx.db.query('migrationRuns').withIndex('by_batch',q=>q.eq('batch',args.batch)).unique())throw new Error('UNKNOWN_MIGRATION');
 const mappings=await ctx.db.query('legacyMappings').withIndex('by_source',q=>q.eq('batch',args.batch).eq('oldTable','normalized:files')).collect();
 const files=await Promise.all(mappings.map(m=>{const id=ctx.db.normalizeId('files',m.newId);return id?ctx.db.get(id):null;}));
 return files.flatMap(f=>f?[{objectKey:f.objectKey,sha256:f.sha256,contentType:f.contentType}]:[]);
}});
export const accountBinding=internalQuery({args:{batch:v.string(),stableId:v.string()},handler:async(ctx,args)=>{
 const mapping=await ctx.db.query('legacyMappings').withIndex('by_source',q=>q.eq('batch',args.batch).eq('oldTable','normalized:accounts').eq('oldId',args.stableId).eq('newTable','accounts')).unique();
 if(!mapping)throw new Error('ACCOUNT_MAPPING_NOT_FOUND');return mapping.newId;
}});

/** Repair the earlier local QA import's event index pointer without touching its historical source. */
export const repairLocalConsignmentEventPointers=internalMutation({args:{dryRun:v.boolean()},handler:async(ctx,args)=>{
 if(process.env.MIGRATION_MODE!=='isolated-rehearsal'||process.env.CONVEX_CLOUD_URL!=='http://127.0.0.1:3220')throw new Error('LOCAL_QA_REPAIR_ONLY');
 const runs=await ctx.db.query('migrationRuns').take(2);if(runs.length!==1||runs[0].status!=='complete')throw new Error('COMPLETE_IMPORT_REQUIRED');
 const batch=`offline-v2:${runs[0].sourceDigest}`,mappings=await ctx.db.query('legacyMappings').withIndex('by_source',q=>q.eq('batch',batch).eq('oldTable','consignmentEvents')).take(101);
 if(mappings.length>100)throw new Error('REPAIR_LIMIT_EXCEEDED');let inspected=0,repaired=0,unchanged=0;
 for(const mapping of mappings.filter(m=>m.newTable==='auditEvents')){
  const id=ctx.db.normalizeId('auditEvents',mapping.newId),event=id?await ctx.db.get(id):null;
  if(!event||event.legacyTable!=='consignmentEvents'||event.legacyId!==mapping.oldId||event.action!=='legacy-import:consignmentEvents')throw new Error('AUDIT_SOURCE_MISMATCH');
  const source=JSON.parse(event.changeJson);if(typeof source.itemId!=='string')throw new Error('LEGACY_ITEM_MISSING');
  const itemMapping=await ctx.db.query('legacyMappings').withIndex('by_source',q=>q.eq('batch',batch).eq('oldTable','items').eq('oldId',source.itemId).eq('newTable','stockItems')).unique();
  const itemId=itemMapping?ctx.db.normalizeId('stockItems',itemMapping.newId):null;if(!itemId||!await ctx.db.get(itemId))throw new Error('LEGACY_ITEM_MAPPING_MISSING');
  inspected++;if(event.record?.table==='stockItems'&&event.record.id===itemId){unchanged++;continue;}
  const originalReturn=mappings.find(m=>m.oldId===mapping.oldId&&m.newTable==='consignmentReturns');
  if(event.record&&(event.record.table!=='consignmentReturns'||event.record.id!==originalReturn?.newId))throw new Error('AUDIT_POINTER_CHANGED');
  if(!args.dryRun)await ctx.db.patch(event._id,{record:{table:'stockItems',id:itemId}});repaired++;
 }
 return {dryRun:args.dryRun,inspected,repaired,unchanged};
}});
