/** A disposable read projection of existing ledgers; never an inventory authority. */
import {defineTable} from 'convex/server';
import {v} from 'convex/values';
export const activityKinds=['acquisition','sale','sale-cancellation','gift','gift-reversal','opening','opening-reversal','consignment-return','consignment-terms','purchase-correction','opening-balance'] as const;
export const activitySources=['items','stockItems','stockLots','stockMovements','purchases','supplierReceipts','consignments','consignmentReturns','sales','stockGifts','stockOpenings','consignmentEvents','stockOperations','auditEvents'] as const;
const originTables=['items','stockLots','sales','stockGifts','stockOpenings','consignmentEvents','saleCancellations','purchases','stockMovements','stockOperations','auditEvents'] as const;
const literalUnion=(values:readonly string[])=>v.union(...values.map(value=>v.literal(value)));
export const activityTables={
 itemActivity:defineTable({key:v.string(),originTable:literalUnion(originTables),originId:v.string(),itemId:v.string(),kind:literalUnion(activityKinds),occurredAt:v.union(v.number(),v.null()),quantityDelta:v.union(v.number(),v.null()),source:v.object({type:literalUnion(activitySources),id:v.string()}),lotId:v.optional(v.string()),reference:v.optional(v.string()),counterpartItemId:v.optional(v.string()),reversesId:v.optional(v.string()),incomplete:v.boolean()}).index('by_key',['key']).index('by_origin',['originTable','originId']).index('by_lot_kind',['lotId','kind']).index('by_item_date',['itemId','occurredAt']).index('by_item_incomplete',['itemId','incomplete']),
 itemActivityJobs:defineTable({sourceId:v.string(),cursor:v.union(v.string(),v.null()),pending:v.boolean()}).index('by_source',['sourceId']).index('by_pending',['pending']),
 itemActivityBuilds:defineTable({name:v.string(),phase:v.number(),cursor:v.union(v.string(),v.null()),complete:v.boolean(),processed:v.number()}).index('by_name',['name']),
};
export type ActivityEffect={key:string;itemId:string;kind:string;occurredAt:number|null;quantityDelta:number|null;source:{type:string;id:string};lotId?:string;reference?:string;counterpartItemId?:string;reversesId?:string;incomplete?:boolean};
export async function putActivity(ctx:any,effect:ActivityEffect){
 ctx.activityKeys?.add(effect.key);
 const value=JSON.parse(JSON.stringify({...effect,originTable:ctx.activityOrigin.table,originId:ctx.activityOrigin.id,incomplete:effect.incomplete??(effect.occurredAt===null||effect.quantityDelta===null)}));
 const previous=await ctx.db.query('itemActivity').withIndex('by_key',(q:any)=>q.eq('key',effect.key)).unique();
 if(previous){const {_id,_creationTime,...old}=previous;if(JSON.stringify(old)!==JSON.stringify(value))await ctx.db.replace(_id,value);}else await ctx.db.insert('itemActivity',value);
}
export async function removeActivitySource(ctx:any,table:string,id:string){
 const old=await ctx.db.query('itemActivity').withIndex('by_origin',(q:any)=>q.eq('originTable',table).eq('originId',id)).take(501);
 if(old.length>500)throw new Error('ACTIVITY_SOURCE_TOO_LARGE');
 for(const row of old)await ctx.db.delete(row._id);
}
export async function refreshActivity(ctx:any,table:string,row:any,project:(ctx:any,table:string,row:any)=>Promise<void>){
 const keys=new Set<string>();
 await project({...ctx,activityKeys:keys,activityOrigin:{table,id:row._id}},table,row);
 const old=await ctx.db.query('itemActivity').withIndex('by_origin',(q:any)=>q.eq('originTable',table).eq('originId',row._id)).take(501);
 if(old.length>500)throw new Error('ACTIVITY_SOURCE_TOO_LARGE');
 for(const entry of old)if(!keys.has(entry.key))await ctx.db.delete(entry._id);
}
/** Source writes and projection writes commit in the SAME Convex transaction.
 * The proxy is request scoped. Nested domain handlers share its dirty set, and
 * projection reads see the final state rather than half-created source records. */
export function withActivity(definition:any,tables:readonly string[],project:(ctx:any,table:string,row:any)=>Promise<void>){
 return {...definition,handler:async(ctx:any,args:any)=>{
  const dirty=new Map<string,string>();
  const mark=(id:string)=>{for(const table of tables)if(ctx.db.normalizeId(table,id)){dirty.set(id,table);break;}};
  const db=new Proxy(ctx.db,{get(target,key){
   if(key==='insert')return async(table:string,value:any)=>{const id=await target.insert(table,value);if(tables.includes(table))dirty.set(id,table);return id;};
   if(key==='delete')return async(id:string)=>{mark(id);await target.delete(id);};
   if(key==='patch'||key==='replace')return async(id:string,value:any)=>{await target[key](id,value);mark(id);};
   const value=target[key];return typeof value==='function'?value.bind(target):value;
  }});
  const result=await definition.handler({...ctx,db},args);
  for(const [id,table]of dirty){const row=await ctx.db.get(id);if(row)await project(ctx,table,row);else await removeActivitySource(ctx,table,id);}
  return result;
 }};
}
export async function readActivity(ctx:any,itemId:string,size:number,cursor:string|null){
 if(!Number.isInteger(size)||size<1||size>50||(cursor!==null&&cursor.length>10000))throw new Error('INVALID_ACTIVITY_QUERY');
 const state=await ctx.db.query('itemActivityBuilds').withIndex('by_name',(q:any)=>q.eq('name','v1')).unique();
 const pending=await ctx.db.query('itemActivityJobs').withIndex('by_pending',(q:any)=>q.eq('pending',true)).first();
 const result=await ctx.db.query('itemActivity').withIndex('by_item_date',(q:any)=>q.eq('itemId',itemId)).order('desc').paginate({numItems:size,cursor});
 const incomplete=await ctx.db.query('itemActivity').withIndex('by_item_incomplete',(q:any)=>q.eq('itemId',itemId).eq('incomplete',true)).first();
 return {items:result.page.map(({_id,_creationTime,key,itemId,incomplete,originTable,originId,...row}:any)=>({id:key,...row})),isDone:result.isDone,nextCursor:result.isDone?null:result.continueCursor,historyStatus:!state?.complete||pending?'indexing':incomplete?'incomplete':'complete'};
}
/** Internal-only bounded maintenance; each chunk atomically persists its cursor.
 * Calling after completion is a no-op; restart rescans without deleting history. */
export async function rebuildActivity(ctx:any,tables:readonly string[],project:(ctx:any,table:string,row:any)=>Promise<void>,restart:boolean){
 let state=await ctx.db.query('itemActivityBuilds').withIndex('by_name',(q:any)=>q.eq('name','v1')).unique();
 if(!state){const id=await ctx.db.insert('itemActivityBuilds',{name:'v1',phase:0,cursor:null,complete:false,processed:0});state=await ctx.db.get(id);}
 if(restart){await ctx.db.patch(state._id,{phase:0,cursor:null,complete:false,processed:0});state={...state,phase:0,cursor:null,complete:false,processed:0};}
 if(state.complete)return {complete:true,processed:state.processed,phase:state.phase};
 const pruning=state.phase===tables.length,table=pruning?'itemActivity':tables[state.phase];const page=await ctx.db.query(table).paginate({numItems:20,cursor:state.cursor,maximumBytesRead:1048576});
 for(const row of page.page){if(pruning){if(!await ctx.db.get(row.originId))await ctx.db.delete(row._id);}else await project(ctx,table,row);}
 const phase=state.phase+(page.isDone?1:0),complete=phase>tables.length,processed=state.processed+page.page.length;
 await ctx.db.patch(state._id,{phase,cursor:page.isDone?null:page.continueCursor,complete,processed});return {complete,processed,phase};
}
