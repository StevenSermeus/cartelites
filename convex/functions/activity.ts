import {query} from './_generated/server';
import {requireLiveSession} from './sessionGuard';
import {activityHistoryArgs,historyOptions,historyMatches,historyBase,knownAmount,sumKnown} from '../shared/activityHistory';
import type {ActivityHistoryRow,ActivityHistorySource} from '../../packages/domain/src/history';
const tables={purchases:'purchases',sales:'sales',consignments:'consignments',payments:'consignmentPayments',events:'consignmentEvents',receipts:'supplierReceipts',gifts:'stockGifts',openings:'stockOpenings'} as const;
async function project(ctx:any,source:ActivityHistorySource,r:any):Promise<ActivityHistoryRow>{
 let row=historyBase(source,r);
 if(source==='purchases'||source==='consignments'){
  const seller=await ctx.db.get(r.sellerId);row={...row,reference:r.reference,sellerId:r.sellerId,sellerName:seller?.name,title:r.reference||seller?.name||'Dossier',origins:[source==='purchases'?'purchase':'consignment'],status:source==='purchases'?r.status:r.flowVersion===2&&r.contractStatus!=='signed'?'pending':'open',consignmentId:source==='consignments'?r._id:undefined,purchaseId:source==='purchases'?r._id:undefined};
  if(source==='purchases'){const items=await ctx.db.query('items').withIndex('by_purchase',(q:any)=>q.eq('purchaseId',r._id)).take(201);if(items.length>200)row={...row,amountStatus:'detail-required',detailsIncomplete:true};else row=knownAmount(row,sumKnown(items.map((i:any)=>i.purchasePriceCents)));}
 }else if(source==='sales'){
  const item=await ctx.db.get(r.itemId),origin=r.origin??item?.origin??(item?.consignmentId?'consignment':'purchase');row=knownAmount({...row,title:r.itemName??item?.name??'Article archivé',itemName:r.itemName??item?.name,itemId:r.itemId,status:r.status,origins:[origin],quantity:r.quantity??1,paymentStatus:r.paymentStatus??'unknown',consignmentId:r.consignmentId,purchaseId:item?.purchaseId},r.salePriceCents);
 }else if(source==='payments'){
  const seller=await ctx.db.get(r.sellerId);row=knownAmount({...row,title:seller?.name??'Versement',sellerId:r.sellerId,sellerName:seller?.name,reference:r.reference,method:r.method,origins:['consignment']},r.amountCents);
 }else if(source==='events'){
  const item=await ctx.db.get(r.itemId),dossier=item?.consignmentId?await ctx.db.get(item.consignmentId):null,seller=dossier?await ctx.db.get(dossier.sellerId):null;
  row={...row,title:item?.name??'Article archivé',itemId:r.itemId,itemName:item?.name,consignmentId:dossier?._id,reference:dossier?.reference,sellerId:dossier?.sellerId,sellerName:seller?.name,kind:r.kind,authorizationNote:r.authorizationNote,origins:['consignment']};
 }else if(source==='receipts')row=knownAmount({...row,title:r.reference||r.supplier,supplier:r.supplier,reference:r.reference,status:'active',origins:['supplier']},r.totalCostCents);
 else if(source==='gifts'){
  const item=await ctx.db.get(r.itemId);row=knownAmount({...row,title:r.itemName??item?.name??'Article archivé',itemName:r.itemName??item?.name,itemId:r.itemId,purchaseId:r.purchaseId,quantity:r.quantity,recipient:r.recipient,reason:r.reason,note:r.note,cancelledAt:r.cancelledAt,status:r.cancelledAt!==undefined?'cancelled':'active',origins:[item?.origin==='supplier'?'supplier':'purchase']},r.costCents??null);
 }else{
  const item=await ctx.db.get(r.sourceId);row=knownAmount({...row,title:item?.name??'Article archivé',itemName:item?.name,itemId:r.sourceId,quantity:r.quantity,packSize:r.packSize,status:r.cancelledAt!==undefined?'cancelled':'active',cancelledAt:r.cancelledAt,origins:['supplier']},sumKnown(r.allocations.map((a:any)=>a.costCents)));
 }
 return row;
}
export const browse=query({args:activityHistoryArgs,handler:async(ctx,input)=>{
 await requireLiveSession(ctx);const {args,signature,options}=historyOptions(input),page=await ctx.db.query(tables[args.source]).order('desc').paginate(options);
 const items=[];for(const r of page.page){const row=await project(ctx,args.source,r);if(historyMatches(row,args))items.push(row);}
 return {items,isDone:page.isDone,nextCursor:page.isDone?null:JSON.stringify({signature,value:page.continueCursor}),order:'recorded-desc' as const};
}});
