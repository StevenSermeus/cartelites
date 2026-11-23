'use node';
import { createHash, timingSafeEqual } from 'node:crypto';
import { v } from 'convex/values';
import { makeFunctionReference } from 'convex/server';
import { action } from './_generated/server';
import { canonicalJson } from './migrationReferences';
import { assertMigrationPolicy } from './migrationPolicy';
import { schemas, type Table } from '../../../apps/api/scripts/migration/model';

export const execute=action({args:{secret:v.string(),operation:v.union(v.literal('begin'),v.literal('batch'),v.literal('links'),v.literal('reconcile'),v.literal('complete'),v.literal('objects'),v.literal('accountBinding'),v.literal('rebuildActivity')),payload:v.any()},handler:async(ctx,args):Promise<unknown>=>{
 const expected=process.env.MIGRATION_SECRET;
 const supplied=Buffer.from(args.secret),expectedBytes=Buffer.from(expected??'');
 if(!expected||supplied.length!==expectedBytes.length||!timingSafeEqual(supplied,expectedBytes))throw new Error('UNAUTHORIZED_MIGRATION');
 assertMigrationPolicy(process.env,args.payload);
 const mutate=(name:string,payload:unknown)=>ctx.runMutation(makeFunctionReference<'mutation'>(`migration:${name}`),payload as never);
 const reconcile=(batch:string)=>ctx.runQuery(makeFunctionReference<'query'>('migration:reconcile'),{batch});
 if(args.operation==='accountBinding')return ctx.runQuery(makeFunctionReference<'query'>('migration:accountBinding'),args.payload);
 if(args.operation==='objects')return ctx.runQuery(makeFunctionReference<'query'>('migration:originalObjects'),args.payload);
 if(args.operation==='begin')return mutate('begin',args.payload);
 if(args.operation==='batch'){
  if(!Array.isArray(args.payload.entries)||args.payload.entries.length>50)throw new Error('INVALID_BATCH');
  for(const entry of args.payload.entries){
   if(!(entry.table in schemas))throw new Error('INVALID_TABLE');
   const validator=schemas[entry.table as Table];
   if(canonicalJson(validator.parse(JSON.parse(entry.serialized)))!==canonicalJson(validator.parse(entry.row)))throw new Error('SERIALIZED_RECORD_MISMATCH');
   // Convex normalizes object key ordering in transport. Hash the original serialized bytes.
   if(createHash('sha256').update(entry.serialized).digest('hex')!==entry.hash)throw new Error('INVALID_RECORD_HASH');
  }
  return mutate('importBatch',args.payload);
 }
 if(args.operation==='links')return mutate('linkConsignments',args.payload);
 if(args.operation==='reconcile')return reconcile(args.payload.batch);
 const report=await reconcile(args.payload.batch) as {status:string;errors:string[]};
 if(args.operation==='rebuildActivity'&&report.status!=='complete')throw new Error('COMPLETE_IMPORT_REQUIRED');
 if(report.errors.length)throw new Error(`RECONCILIATION_FAILED:${report.errors.join(',')}`);
 if(args.operation==='rebuildActivity')return ctx.runMutation(makeFunctionReference<'mutation'>('itemActivity:rebuild'),{});
 return mutate('complete',args.payload);
}});
