import {makeFunctionReference} from 'convex/server';
import {mutation as baseMutation,internalMutation as baseInternalMutation} from './_generated/server';
import {v} from 'convex/values';
import {putActivity,withActivity,rebuildActivity,refreshActivity} from '../shared/itemActivity';
const tables=['items','stockLots','sales','stockGifts','stockOpenings','consignmentEvents','saleCancellations','purchases'] as const;
export const projectActivity=(ctx:any,table:string,row:any):Promise<void>=>refreshActivity(ctx,table,row,projectSource);
async function projectSource(ctx:any,table:string,r:any):Promise<void>{
 const put=(suffix:string,itemId:string,kind:string,quantityDelta:number|null,occurredAt:number|null,extra:any={})=>putActivity(ctx,{key:`${table}:${r._id}:${suffix}`,itemId,kind,quantityDelta,occurredAt,source:{type:table,id:r._id},...extra});
 if(table==='items'){
  if(r.origin==='supplier')return;
  const purchaseId=r.purchaseId??r.removedPurchaseId,p=purchaseId?await ctx.db.get(purchaseId):null;
  const consignment=r.consignmentId?await ctx.db.get(r.consignmentId):null;
  if(p?.status==='pending')return; // No acquisition has occurred yet.
  await put('acquisition',r._id,'acquisition',consignment||p?.status==='active'?1:null,r.purchaseOccurredAt,{source:consignment?{type:'consignments',id:consignment._id}:p?{type:'purchases',id:p._id}:{type:'items',id:r._id},reference:consignment?.reference??p?.reference,incomplete:!consignment&&p?.status!=='active'});
  if(r.removedPurchaseId)await put('removed',r._id,'purchase-correction',-1,null,{source:{type:'purchases',id:r.removedPurchaseId},incomplete:true});
 }else if(table==='purchases'){
  // Purchase edits/validation touch a bounded basket; source items retain the effect key.
  const items=await ctx.db.query('items').withIndex('by_purchase',(q:any)=>q.eq('purchaseId',r._id)).take(51);
  if(items.length<=50){for(const item of items)await projectActivity(ctx,'items',item);}
  else {
   const existing=await ctx.db.query('itemActivityJobs').withIndex('by_source',(q:any)=>q.eq('sourceId',r._id)).unique();
   const jobId=existing?._id??await ctx.db.insert('itemActivityJobs',{sourceId:r._id,cursor:null,pending:true});
   if(existing)await ctx.db.patch(existing._id,{cursor:null,pending:true});
   await ctx.scheduler.runAfter(0,makeFunctionReference<'mutation'>('itemActivity:refreshPurchase'),{jobId});
  }
 }else if(table==='stockLots'){
  if(r.openingId)return;
  const receipt=r.receiptId?await ctx.db.get(r.receiptId):null;
  await put('received',r.itemId,receipt?'acquisition':'opening-balance',r.received,r.occurredAt,{lotId:r._id,source:receipt?{type:'supplierReceipts',id:receipt._id}:{type:table,id:r._id},reference:receipt?.reference,incomplete:!receipt});
 }else if(table==='sales'){
  await put('sale',r.itemId,'sale',-(r.quantity??1),r.occurredAt);
  if(r.status==='cancelled'){
   const applied=await ctx.db.query('saleCancellations').withIndex('by_sale_applied',(q:any)=>q.eq('saleId',r._id).eq('applied',true)).first();
   await put('cancel',r.itemId,'sale-cancellation',r.quantity??1,applied?.createdAt??null,{reversesId:`sales:${r._id}:sale`});
  }
 }else if(table==='saleCancellations'){
  const sale=await ctx.db.get(r.saleId);if(sale)await projectActivity(ctx,'sales',sale);
 }else if(table==='stockGifts'){
  await put('gift',r.itemId,'gift',-r.quantity,r.occurredAt);
  if(r.cancelledAt!==undefined)await put('reverse',r.itemId,'gift-reversal',r.quantity,r.cancelledAt,{reversesId:`stockGifts:${r._id}:gift`});
 }else if(table==='stockOpenings'){
  await put('source',r.sourceId,'opening',-r.quantity,r.occurredAt,{counterpartItemId:r.targetId});
  await put('target',r.targetId,'opening',r.quantity*r.packSize,r.occurredAt,{counterpartItemId:r.sourceId});
  if(r.cancelledAt!==undefined){
   await put('reverse-source',r.sourceId,'opening-reversal',r.quantity,r.cancelledAt,{counterpartItemId:r.targetId,reversesId:`stockOpenings:${r._id}:source`});
   await put('reverse-target',r.targetId,'opening-reversal',-r.quantity*r.packSize,r.cancelledAt,{counterpartItemId:r.sourceId,reversesId:`stockOpenings:${r._id}:target`});
  }
 }else if(table==='consignmentEvents')await put('event',r.itemId,r.kind==='return'?'consignment-return':'consignment-terms',r.kind==='return'?-1:0,r.occurredAt);
}
export const mutation=((definition:any)=>baseMutation(withActivity(definition,tables,projectActivity))) as typeof baseMutation;
export const internalMutation=((definition:any)=>baseInternalMutation(withActivity(definition,tables,projectActivity))) as typeof baseInternalMutation;
// Maintenance is never public: invoke with explicit self-hosted admin credentials.
export const rebuild=baseInternalMutation({args:{restart:v.optional(v.boolean())},handler:(ctx,args)=>rebuildActivity(ctx,tables.filter(t=>t!=='purchases'),projectActivity,args.restart??false)});

export const refreshPurchase=baseInternalMutation({args:{jobId:v.id('itemActivityJobs')},handler:async(ctx,args)=>{
 const job=await ctx.db.get(args.jobId);if(!job?.pending)return;
 const id=ctx.db.normalizeId('purchases',job.sourceId);if(!id)throw new Error('INVALID_ACTIVITY_SOURCE');
 const page=await ctx.db.query('items').withIndex('by_purchase',q=>q.eq('purchaseId',id)).paginate({numItems:50,cursor:job.cursor,maximumBytesRead:1048576});
 for(const item of page.page)await projectActivity(ctx,'items',item);
 await ctx.db.patch(job._id,{cursor:page.isDone?null:page.continueCursor,pending:!page.isDone});
 if(!page.isDone)await ctx.scheduler.runAfter(0,makeFunctionReference<'mutation'>('itemActivity:refreshPurchase'),args);
}});
