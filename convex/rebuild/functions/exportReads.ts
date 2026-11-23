import {query,type QueryCtx} from './_generated/server';
import type {Doc} from './_generated/dataModel';
import {actor} from './domain';
import {available,itemRecord} from './compat';
import {exportArgs,exportOptions,exportResult,apportionedPayment} from '../../shared/exportPages';

const flatItem=(ctx:QueryCtx,item:Doc<'stockItems'>)=>itemRecord(ctx,item,{photos:false});
export const page=query({args:exportArgs,handler:async(ctx,args)=>{
 await actor(ctx);const {resource,options}=exportOptions(args);
 if(resource==='stockLots'){
  const raw=await ctx.db.query('stockLots').paginate(options);
  return exportResult(resource,raw,raw.page.map(l=>({_id:l._id,itemId:l.stockItemId,remainingQuantity:l.remainingQuantity,remainingCostCents:l.remainingCostCents})));
 }
 if(resource==='contacts'){
  const raw=await ctx.db.query('contacts').paginate(options),rows=[];
  for(const c of raw.page)rows.push({_id:c._id,name:c.name,email:c.email,phone:c.phone,address:c.address,hasDeposits:!!await ctx.db.query('consignments').withIndex('by_depositor',q=>q.eq('depositorId',c._id)).first()});
  return exportResult(resource,raw,rows);
 }
 if(resource==='payments'){
  const raw=await ctx.db.query('depositorPayouts').paginate(options),rows=[];
  for(const p of raw.page)rows.push({...p,sellerId:p.depositorId,sellerName:(await ctx.db.get(p.depositorId))?.name??''});
  return exportResult(resource,raw,rows);
 }
 if(resource==='stock'){
  const raw=await ctx.db.query('stockItems').withIndex('by_status',q=>q.eq('status','available')).paginate(options),rows=[];
  for(const item of raw.page){const dto=await flatItem(ctx,item);if(available(dto))rows.push(dto);}
  return exportResult(resource,raw,rows);
 }
 if(resource==='purchases'){
  const raw=await ctx.db.query('purchaseLines').paginate(options),rows=[];
  for(const line of raw.page){if(line.removedAt!==undefined)continue;const purchase=await ctx.db.get(line.purchaseId),item=await ctx.db.get(line.stockItemId);if(!purchase||!item)throw new Error('EXPORT_REFERENCE_MISSING');
   const contact=await ctx.db.get(purchase.contactId);rows.push({...purchase,exportRowId:line._id,sellerId:purchase.contactId,sellerName:contact?.name??'',items:[{...await flatItem(ctx,item),purchasePriceCents:line.costCents,quantity:line.quantity,marketValueCents:line.estimatedValueCents,discountPercent:line.buybackRateBps===null?null:line.buybackRateBps/100,vatRegime:line.tax.regime}]});
  }return exportResult(resource,raw,rows);
 }
 if(resource==='consignments'){
  const raw=await ctx.db.query('consignmentTerms').paginate(options),rows=[];
  for(const term of raw.page){const revision=await ctx.db.get(term.revisionId),dossier=revision?await ctx.db.get(revision.consignmentId):null;if(!dossier||dossier.currentRevisionId!==term.revisionId)continue;const item=await ctx.db.get(term.stockItemId);if(!item)throw new Error('EXPORT_REFERENCE_MISSING');
   rows.push({...dossier,exportRowId:term._id,sellerId:dossier.depositorId,sellerName:(await ctx.db.get(dossier.depositorId))?.name??'',items:[{...await flatItem(ctx,item),agreedPriceCents:term.agreedPriceCents,commissionRateBps:term.commissionRateBps}]});
  }return exportResult(resource,raw,rows);
 }
 // Page physical sale lines, never entire baskets or their allocation/photo histories.
 const raw=await ctx.db.query('saleLines').paginate(options),rows=[];
 const groups=new Map<string,{sale:Doc<'sales'>;lines:Doc<'saleLines'>[];payment:Doc<'salePayments'>|null;cash:number[];transfer:number[]}>();
 for(const line of raw.page){
  let group=groups.get(line.saleId);if(!group){const sale=await ctx.db.get(line.saleId);if(!sale)throw new Error('EXPORT_REFERENCE_MISSING');const lines=await ctx.db.query('saleLines').withIndex('by_sale',q=>q.eq('saleId',sale._id)).take(201);if(lines.length>200)throw new Error('EXPORT_SALE_TOO_LARGE');
   const payment=await ctx.db.query('salePayments').withIndex('by_sale',q=>q.eq('saleId',sale._id)).filter(q=>q.eq(q.field('status'),'active')).first(),weights=lines.map(l=>l.lineTotalCents);
   group={sale,lines,payment,...apportionedPayment(weights,payment?.cashCents??0,payment?.transferCents??0)};groups.set(line.saleId,group);
  }
  const item=await ctx.db.get(line.stockItemId);if(!item)throw new Error('EXPORT_REFERENCE_MISSING');const source=await flatItem(ctx,item),index=group.lines.findIndex(l=>l._id===line._id);if(index<0)throw new Error('EXPORT_REFERENCE_MISSING');
  const term=line.consignmentRevisionId?await ctx.db.query('consignmentTerms').withIndex('by_revision_item',q=>q.eq('revisionId',line.consignmentRevisionId!).eq('stockItemId',line.stockItemId)).unique():null;
  const snapshot=line.productSnapshot,status=group.sale.status==='confirmed'?'active':'cancelled',origin=line.depositorId?'consignment':item.origin;
  rows.push({...source,...group.sale,_id:group.sale._id,saleId:group.sale._id,exportRowId:line._id,itemId:item._id,itemName:line.description,origin,status,quantity:line.quantity,salePriceCents:line.lineTotalCents,costCents:line.costCents,purchasePriceCents:line.costCents,vatRegime:line.taxRegime,taxRateBps:line.taxRateBps,
   ...(snapshot?{series:snapshot.set,identifier:snapshot.identifier,language:snapshot.language,condition:snapshot.condition,gradingCompany:snapshot.gradingCompany,gradingGrade:snapshot.gradingGrade,gradingCertificate:snapshot.gradingCertificate}:{}),
   sellerId:line.depositorId??source.sellerId,sellerName:line.depositorId?(await ctx.db.get(line.depositorId))?.name??'':source.sellerName,commissionRateBps:term?.commissionRateBps??null,commissionCents:line.commissionCents,depositorAmountCents:line.depositorAmountCents,paymentStatus:line.paymentStatus,balanceEligible:status==='active'&&!!line.depositorId&&line.paymentStatus==='received',
   payment:group.payment?{cashCents:group.cash[index],transferCents:group.transfer[index],receivedAt:group.payment.occurredAt,reference:group.payment.reference}:undefined});
 }
 return exportResult(resource,raw,rows);
}});
