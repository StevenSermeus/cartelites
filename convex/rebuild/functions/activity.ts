import {query} from './_generated/server';
import {actor} from './domain';
import {activityHistoryArgs,historyOptions,historyMatches,historyBase,knownAmount,sumKnown} from '../../shared/activityHistory';
import type {ActivityHistoryRow,ActivityHistorySource,HistoryOrigin} from '../../../packages/domain/src/history';
const tables={purchases:'purchases',sales:'sales',consignments:'consignments',payments:'depositorPayouts',events:'auditEvents',receipts:'purchases',gifts:'stockOperations',openings:'stockOperations'} as const;
async function project(ctx:any,source:ActivityHistorySource,r:any):Promise<{row:ActivityHistoryRow;search:string}|null>{
 let row=historyBase(source,r),search='';
 if(source==='purchases'||source==='receipts'){
  const contact=await ctx.db.get(r.contactId);row={...row,title:r.reference||contact?.name||'Acquisition',reference:r.reference,status:r.status,origins:[source==='purchases'?'purchase':'supplier'],purchaseId:r._id,sellerId:r.contactId,sellerName:source==='purchases'?contact?.name:undefined,supplier:source==='receipts'?contact?.name:undefined};
  const lines=await ctx.db.query('purchaseLines').withIndex('by_purchase',(q:any)=>q.eq('purchaseId',r._id)).filter((q:any)=>q.eq(q.field('removedAt'),undefined)).take(201);
  row=lines.length>200?{...row,amountStatus:'detail-required',detailsIncomplete:true}:knownAmount(row,sumKnown(lines.map((l:any)=>l.costCents)));
 }else if(source==='sales'){
  const lines=await ctx.db.query('saleLines').withIndex('by_sale',(q:any)=>q.eq('saleId',r._id)).take(201);
  if(lines.length>200)throw new Error('HISTORY_SALE_TOO_LARGE'); // Existing creation contract is <=200 lines; do not silently miss origins/search.
  const origins=new Set<HistoryOrigin>();for(const line of lines){const item=await ctx.db.get(line.stockItemId);const origin=line.depositorId?'consignment':item?.origin;if(['purchase','supplier','consignment'].includes(origin))origins.add(origin);}
  search=lines.map((l:any)=>[l.description,l.productSnapshot?.set,l.productSnapshot?.identifier,l.productSnapshot?.gradingCertificate].join(' ')).join(' ');
  const states=new Set(lines.map((l:any)=>l.paymentStatus));row=knownAmount({...row,title:lines.length===1?lines[0].description:`${lines.length} articles`,reference:r.reference,itemName:lines.length===1?lines[0].description:undefined,itemId:lines.length===1?lines[0].stockItemId:undefined,quantity:sumKnown(lines.map((l:any)=>l.quantity)),origins:[...origins],status:r.status==='confirmed'?'active':'cancelled',paymentStatus:states.size===1?lines[0]?.paymentStatus??'unknown':'unknown'},sumKnown(lines.map((l:any)=>l.lineTotalCents)));
 }else if(source==='consignments'){
  const contact=await ctx.db.get(r.depositorId),revision=r.currentRevisionId?await ctx.db.get(r.currentRevisionId):null;
  row={...row,title:r.reference||contact?.name||'Dépôt',reference:r.reference,sellerId:r.depositorId,sellerName:contact?.name,consignmentId:r._id,origins:['consignment'],status:r.status==='closed'?'closed':revision?.signatureState==='awaiting_signature'?'pending':'open'};
 }else if(source==='payments'){
  const seller=await ctx.db.get(r.depositorId);row=knownAmount({...row,title:seller?.name??'Versement',reference:r.reference,sellerId:r.depositorId,sellerName:seller?.name,method:r.method,origins:['consignment']},r.amountCents);
 }else if(source==='events'){
  const raw=JSON.parse(r.changeJson),kind=r.action==='consignment.return'?'return':r.action==='consignment.terms'?'terms':raw.kind;if(!['return','terms'].includes(kind)||r.record?.table!=='stockItems')return null;
  const item=await ctx.db.get(r.record.id),product=item?await ctx.db.get(item.productId):null,lot=item?await ctx.db.query('stockLots').withIndex('by_item_fifo',(q:any)=>q.eq('stockItemId',item._id)).first():null;
  const dossier=lot?.source.kind==='consignment'?await ctx.db.get(lot.source.consignmentId):null,seller=dossier?await ctx.db.get(dossier.depositorId):null;
  const returnId=kind==='return'&&typeof raw.returnId==='string'?ctx.db.normalizeId('consignmentReturns',raw.returnId):null,returned=returnId?await ctx.db.get(returnId):null;
  row={...row,title:product?.name??'Article archivé',itemName:product?.name,itemId:item?._id,consignmentId:dossier?._id,reference:dossier?.reference,sellerId:dossier?.depositorId,sellerName:seller?.name,origins:['consignment'],kind,authorizationNote:raw.authorizationNote,occurredAt:returned?.occurredAt??(typeof raw.occurredAt==='number'?raw.occurredAt:r.action==='legacy-import:consignmentEvents'?null:r.occurredAt)};
 }else{
  const itemId=r.source?.table==='stockItems'?r.source.id:undefined,item=itemId?await ctx.db.get(itemId):null,product=item?await ctx.db.get(item.productId):null;
  const reversal=await ctx.db.query('stockOperations').withIndex('by_reversal',(q:any)=>q.eq('reversesId',r._id)).first();
  row={...row,title:product?.name??'Article archivé',itemName:product?.name,itemId,quantity:r.quantity??null,packSize:r.packSize,recipient:r.recipient,reason:r.reason,note:r.note,origins:[source==='openings'||item?.origin==='supplier'?'supplier':'purchase'],status:reversal?'cancelled':'active',cancelledAt:reversal?.occurredAt};
  if(r.costCents!==undefined)row=knownAmount(row,r.costCents);
  else if(r.historyComplete!==false){const movements=await ctx.db.query('stockMovements').withIndex('by_operation',(q:any)=>q.eq('operationId',r._id)).take(201);if(movements.length>200)row={...row,detailsIncomplete:true,amountStatus:'detail-required'};else row=knownAmount(row,movements.length?sumKnown(movements.filter((m:any)=>m.quantityDelta<0).map((m:any)=>m.costDeltaCents===null?null:-m.costDeltaCents)):null);}
 }
 return {row,search};
}
export const browse=query({args:activityHistoryArgs,handler:async(ctx,input)=>{
 await actor(ctx);const {args,signature,options}=historyOptions(input);let source=ctx.db.query(tables[args.source]);
 const filtered=args.source==='purchases'?source.filter(q=>q.eq(q.field('type'),'buyback')):args.source==='receipts'?source.filter(q=>q.eq(q.field('type'),'supplier')):args.source==='gifts'||args.source==='openings'?source.filter(q=>q.eq(q.field('kind'),args.source==='gifts'?'gift':'display-opening')):args.source==='events'?source.filter(q=>q.or(q.eq(q.field('action'),'consignment.return'),q.eq(q.field('action'),'consignment.terms'),q.eq(q.field('action'),'legacy-import:consignmentEvents'))):source;
 const page=await filtered.order('desc').paginate({...options,numItems:args.source==='sales'?Math.min(options.numItems,10):options.numItems}),items=[];for(const r of page.page){const value=await project(ctx,args.source,r);if(value&&historyMatches(value.row,args,value.search))items.push(value.row);}
 return {items,isDone:page.isDone,nextCursor:page.isDone?null:JSON.stringify({signature,value:page.continueCursor}),order:'recorded-desc' as const};
}});
