import {query,type QueryCtx} from './_generated/server';
import type {Doc} from './_generated/dataModel';
import {requireLiveSession} from './sessionGuard';
import {exportArgs,exportOptions,exportResult} from '../shared/exportPages';
async function flatItem(ctx:QueryCtx,item:Doc<'items'>){
 const source=item.consignmentId?await ctx.db.get(item.consignmentId):item.purchaseId?await ctx.db.get(item.purchaseId):null;
 const seller=source?await ctx.db.get(source.sellerId):null;
 return {...item,origin:item.origin??'purchase',productType:item.productType??'card',purchasePriceCents:item.purchasePriceCents??null,purchaseReference:source?.reference??'',sellerId:source?.sellerId,sellerName:seller?.name??'',sourceStatus:item.origin==='supplier'||item.consignmentId&&source?'active':source&&'status'in source?source.status:undefined,contractPending:!!(source&&'flowVersion'in source&&source.flowVersion===2&&source.contractStatus!=='signed')};
}
export const page=query({args:exportArgs,handler:async(ctx,args)=>{
 await requireLiveSession(ctx);const {resource,options}=exportOptions(args);
 if(resource==='stockLots'){
  const raw=await ctx.db.query('stockLots').paginate(options);return exportResult(resource,raw,raw.page.map(l=>({_id:l._id,itemId:l.itemId,remainingQuantity:l.remaining,remainingCostCents:l.remainingCostCents})));
 }
 if(resource==='contacts'){
  const raw=await ctx.db.query('sellers').paginate(options),rows=[];
  for(const c of raw.page)rows.push({_id:c._id,name:c.name,email:c.email,phone:c.phone,address:c.address,hasDeposits:!!await ctx.db.query('consignments').withIndex('by_seller',q=>q.eq('sellerId',c._id)).first()});return exportResult(resource,raw,rows);
 }
 if(resource==='payments'){
  const raw=await ctx.db.query('consignmentPayments').paginate(options),rows=[];for(const p of raw.page)rows.push({...p,sellerName:(await ctx.db.get(p.sellerId))?.name??''});return exportResult(resource,raw,rows);
 }
 if(resource==='sales'){
  const raw=await ctx.db.query('sales').paginate(options),rows=[];
  for(const sale of raw.page){const item=await ctx.db.get(sale.itemId),source=item?await flatItem(ctx,item):null,origin=sale.origin??source?.origin??'purchase';
   rows.push({...source,...sale,exportRowId:sale._id,saleId:sale._id,itemName:sale.itemName??item?.name??'Article archivé',origin,purchasePriceCents:sale.costCents??item?.purchasePriceCents??null,costCents:sale.costCents??item?.purchasePriceCents??null,vatRegime:sale.vatRegime??item?.vatRegime,taxRateBps:sale.taxRateBps??item?.taxRateBps,sellerId:sale.sellerId??source?.sellerId,sellerName:sale.sellerId?(await ctx.db.get(sale.sellerId))?.name??'':source?.sellerName??'',commissionRateBps:sale.commissionRateBps??null,commissionCents:sale.commissionCents??null,depositorAmountCents:sale.depositorAmountCents??null,balanceEligible:origin==='consignment'&&sale.status==='active'&&sale.paymentStatus!=='pending'});
  }return exportResult(resource,raw,rows);
 }
 const raw=await ctx.db.query('items').paginate(options),rows=[];
 for(const item of raw.page){
  if(resource==='stock'){if(item.status!=='available')continue;const dto=await flatItem(ctx,item);if(dto.sourceStatus==='active'&&!dto.contractPending)rows.push(dto);}
  else if(resource==='purchases'&&item.purchaseId){const purchase=await ctx.db.get(item.purchaseId);if(!purchase)throw new Error('EXPORT_REFERENCE_MISSING');rows.push({...purchase,exportRowId:item._id,sellerName:(await ctx.db.get(purchase.sellerId))?.name??'',items:[await flatItem(ctx,item)]});}
  else if(resource==='consignments'&&item.consignmentId){const dossier=await ctx.db.get(item.consignmentId);if(!dossier)throw new Error('EXPORT_REFERENCE_MISSING');rows.push({...dossier,exportRowId:item._id,sellerName:(await ctx.db.get(dossier.sellerId))?.name??'',items:[await flatItem(ctx,item)]});}
 }
 return exportResult(resource,raw,rows);
}});
