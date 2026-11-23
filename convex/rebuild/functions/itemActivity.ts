import {mutation as baseMutation,internalMutation as baseInternalMutation} from './_generated/server';
import {v} from 'convex/values';
import {putActivity,withActivity,rebuildActivity,refreshActivity} from '../../shared/itemActivity';
const tables=['stockMovements','stockOperations','auditEvents','stockLots'] as const;
function kind(op:any,original:any){
 if(op.kind==='reversal')return original?.kind==='gift'?'gift-reversal':original?.kind==='display-opening'?'opening-reversal':op.source?.table==='sales'?'sale-cancellation':'purchase-correction';
 return op.kind==='display-opening'?'opening':op.kind==='return'?'consignment-return':op.reason==='Purchase correction'?'purchase-correction':op.kind;
}
export const projectActivity=(ctx:any,table:string,row:any):Promise<void>=>refreshActivity(ctx,table,row,projectSource);
async function projectSource(ctx:any,table:string,r:any):Promise<void>{
 if(table==='stockMovements'){
  const lot=await ctx.db.get(r.lotId),op=await ctx.db.get(r.operationId);if(!lot||!op)throw new Error('ACTIVITY_SOURCE_MISSING');
  const original=op.reversesId?await ctx.db.get(op.reversesId):null;
  let occurredAt:number|null=op.kind==='acquisition'&&op.reason!=='Purchase correction'?lot.acquiredAt:op.occurredAt;
  let missingDateCorrection=false;
  if(op.kind==='acquisition'&&op.reason!=='Purchase correction'&&lot.source.kind==='purchase'){
   const first=await ctx.db.query('auditEvents').withIndex('by_record_action',(q:any)=>q.eq('record.table','purchases').eq('record.id',lot.source.purchaseId).eq('action','purchase.date-updated')).first();
   missingDateCorrection=!!first&&!JSON.parse(first.changeJson).itemActivityCaptured;
  }
  if(op.kind==='reversal'&&op.source?.table==='sales'&&op.occurredAtKnown!==true){
   const mapping=await ctx.db.query('legacyMappings').withIndex('by_new',(q:any)=>q.eq('newTable','stockOperations').eq('newId',op._id).eq('oldTable','sales')).first();
   if(mapping?.oldTable==='sales'){
    const auditMapping=await ctx.db.query('legacyMappings').withIndex('by_legacy_record',(q:any)=>q.eq('oldTable','sales').eq('oldId',mapping.oldId).eq('newTable','auditEvents')).first();
    const audit=auditMapping?await ctx.db.get(auditMapping.newId):null;
    const raw=audit?JSON.parse(audit.changeJson):null;
    occurredAt=typeof raw?.cancelledAt==='number'?raw.cancelledAt:null;
   }
  }
  const source=op.source??original?.source;
  const record=source&&['purchases','sales','consignments'].includes(source.table)?await ctx.db.get(source.id):null;
  const opening=op.kind==='display-opening'?op:original?.kind==='display-opening'?original:null;
  await putActivity(ctx,{key:`stockMovements:${r._id}`,itemId:lot.stockItemId,lotId:lot._id,kind:kind(op,original),quantityDelta:r.quantityDelta,occurredAt,source:{type:source?.table??'stockOperations',id:source?.id??op._id},reference:record?.reference,counterpartItemId:opening?(lot.stockItemId===opening.targetItemId?opening.source?.id:opening.targetItemId):undefined,reversesId:op.reversesId,incomplete:missingDateCorrection||occurredAt===null||op.kind==='opening-balance'||op.historyComplete===false||original?.historyComplete===false});
 }else if(table==='stockLots'){
  // Exactly one acquisition effect is emitted for a newly acquired canonical lot.
  // A date correction changes presentation, never the immutable movement or its quantity.
  const effect=await ctx.db.query('itemActivity').withIndex('by_lot_kind',(q:any)=>q.eq('lotId',r._id).eq('kind','acquisition')).first();
  if(effect&&effect.occurredAt!==r.acquiredAt)await ctx.db.patch(effect._id,{occurredAt:r.acquiredAt});
 }else if(table==='stockOperations'&&r.historyComplete===false){
  // Known ledger movements remain separate. This marker is explicitly NOT a
  // guessed delta, even where a source declared a quantity without allocations.
  for(const itemId of [r.source?.table==='stockItems'?r.source.id:null,r.targetItemId].filter(Boolean))await putActivity(ctx,{key:`stockOperations:${r._id}:${itemId}:incomplete`,itemId,kind:kind(r,null),occurredAt:r.occurredAt,quantityDelta:null,source:{type:'stockOperations',id:r._id},incomplete:true});
 }else if(table==='auditEvents'&&(r.action==='consignment.terms'||r.legacyTable==='consignmentEvents')&&r.record?.table==='stockItems'){
  const raw=JSON.parse(r.changeJson);if(r.legacyTable&&raw.kind!=='terms')return;
  await putActivity(ctx,{key:`auditEvents:${r._id}`,itemId:r.record.id,kind:'consignment-terms',occurredAt:r.legacyTable?(typeof raw.occurredAt==='number'?raw.occurredAt:null):r.occurredAt,quantityDelta:0,source:{type:'auditEvents',id:r._id}});
 }else if(table==='auditEvents'&&r.action==='purchase.date-updated'&&r.record?.table==='stockItems'){
  const raw=JSON.parse(r.changeJson);
  await putActivity(ctx,{key:`auditEvents:${r._id}`,itemId:r.record.id,kind:'purchase-correction',occurredAt:r.occurredAt,quantityDelta:0,source:{type:'purchases',id:raw.purchaseId}});
 }
}
export const mutation=((definition:any)=>baseMutation(withActivity(definition,tables,projectActivity))) as typeof baseMutation;
export const internalMutation=((definition:any)=>baseInternalMutation(withActivity(definition,tables,projectActivity))) as typeof baseInternalMutation;
export const rebuild=baseInternalMutation({args:{restart:v.optional(v.boolean())},handler:async(ctx,args)=>{if(await ctx.db.query('migrationRuns').filter(q=>q.eq(q.field('status'),'importing')).first())throw new Error('MIGRATION_IN_PROGRESS');return rebuildActivity(ctx,tables.filter(t=>t!=='stockLots'),projectActivity,args.restart??false);}});
