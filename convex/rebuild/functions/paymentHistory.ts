import {v} from 'convex/values';
import {query} from './_generated/server';
import {actor} from './domain';
import {paymentSnapshot,paymentActor,historyCursor,nextHistoryCursor} from '../../shared/paymentHistory';
const snapshot=(row:any,currentStatus?:string)=>row?paymentSnapshot(row,row.collectionStatus??currentStatus??(row.cashCents+row.transferCents>0?'received':'unknown')):paymentSnapshot(null,currentStatus);
export const salePaymentHistory=query({args:{saleId:v.id('sales'),size:v.optional(v.number()),cursor:v.optional(v.string())},handler:async(ctx,args)=>{
 await actor(ctx);const size=args.size??25,saved=historyCursor(args.saleId,size,args.cursor),sale=await ctx.db.get(args.saleId);if(!sale)throw new Error('SALE_NOT_FOUND');if(saved.phase!=='rows')throw new Error('INVALID_CURSOR');
 const latest=await ctx.db.query('salePayments').withIndex('by_sale',q=>q.eq('saleId',sale._id)).order('desc').first();
 const line=await ctx.db.query('saleLines').withIndex('by_sale',q=>q.eq('saleId',sale._id)).first();
 const current=snapshot(latest,line?.paymentStatus),page=await ctx.db.query('salePayments').withIndex('by_sale',q=>q.eq('saleId',sale._id)).order('desc').paginate({numItems:size,cursor:saved.value,maximumRowsRead:100,maximumBytesRead:1_000_000});
 let incomplete=current.collectionStatus==='unknown';
 const items=await Promise.all(page.page.map(async row=>{
  const previous=row.supersedesId?await ctx.db.get(row.supersedesId):null;
  let changedAt:number|null=row.createdAt;
  const mapping=await ctx.db.query('legacyMappings').withIndex('by_new',q=>q.eq('newTable','salePayments').eq('newId',row._id).eq('oldTable','salePaymentEvents')).first();
  const fromSale=await ctx.db.query('legacyMappings').withIndex('by_new',q=>q.eq('newTable','salePayments').eq('newId',row._id).eq('oldTable','sales')).first();
  if(fromSale)changedAt=null;
  if(mapping){const a=await ctx.db.query('legacyMappings').withIndex('by_legacy_record',q=>q.eq('oldTable','salePaymentEvents').eq('oldId',mapping.oldId).eq('newTable','auditEvents')).first();const audit=a?await ctx.db.get(a.newId as any) as any:null;const raw=audit?JSON.parse(audit.changeJson):null;const same=(p:any)=>p&&p.cashCents===row.cashCents&&p.transferCents===row.transferCents&&p.receivedAt===row.occurredAt&&(p.reference??'')===(row.reference??'');changedAt=raw&&same(raw.payment)&&!same(raw.previousPayment)&&typeof raw.createdAt==='number'?raw.createdAt:null;}
  const value=snapshot(row,row._id===latest?._id?line?.paymentStatus:undefined);if(value.collectionStatus==='unknown'||changedAt===null||!row.historyKind||row.historyKind==='revision'&&!previous&&!row.previousCollectionStatus)incomplete=true;
  return {id:row._id,kind:row.historyKind??(row.supersedesId?'revision' as const:'initial' as const),state:row.status==='active'?'current' as const:row.status,...value,changedAt,actorLabel:changedAt===null?null:await paymentActor(ctx,row.createdBy,true),previous:previous?snapshot(previous):row.previousCollectionStatus?paymentSnapshot(null,row.previousCollectionStatus):null};
 }));
 return {items,nextCursor:page.isDone?null:nextHistoryCursor(sale._id,size,page.continueCursor),isDone:page.isDone,saleStatus:sale.status==='confirmed'?'active':'cancelled',current,currentEntryId:latest?._id??null,historyStatus:incomplete?'incomplete':'complete'};
}});
