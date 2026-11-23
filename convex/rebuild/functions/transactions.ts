import {shopDay} from './shopCalendar';
import { snapshotPayment } from './consignmentDocuments';
import { v } from 'convex/values';
import { transaction } from './transaction';
import { query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { actor, audit, consume, depositorBalance, fifo, integer, metadata, operation, timestamp, total } from './domain';
import { tax } from './schema';
const optionalText=v.optional(v.string());
const product=v.object({publicAttributes:v.optional(v.record(v.string(),v.string())),privateAttributes:v.optional(v.record(v.string(),v.string())),type:v.union(v.literal('card'),v.literal('sealed'),v.literal('other')),name:v.string(),description:v.optional(v.string()),tcg:optionalText,set:optionalText,printedIdentifier:optionalText,language:optionalText,variant:optionalText,format:optionalText,packSize:v.optional(v.number()),catalogue:v.optional(v.object({imageUrl:optionalText,provider:optionalText,cardId:optionalText,setId:optionalText}))});
const payment=v.object({status:v.union(v.literal('received'),v.literal('pending')),cashCents:v.number(),transferCents:v.number(),receivedAt:v.optional(v.number()),reference:optionalText});

export const saveContact=transaction({args:{operationId:v.string(),contactId:v.optional(v.id('contacts')),expectedRevision:v.optional(v.number()),kind:v.union(v.literal('person'),v.literal('company')),name:v.string(),email:optionalText,phone:optionalText,address:optionalText,companyNumber:optionalText,vatNumber:optionalText},handler:async(ctx,args)=>{
 const by=await actor(ctx,true),op=await operation(ctx,by,args.operationId,'save-contact',args);if(op.previous)return op.previous.results[0].id;
 const name=args.name.trim();if(!name)throw new Error('INVALID_CONTACT');
 const {operationId,contactId,expectedRevision,...fields}=args;
 let id:Id<'contacts'>;
 if(contactId){const prior=await ctx.db.get(contactId);if(!prior)throw new Error('CONTACT_NOT_FOUND');if(expectedRevision!==prior.revision)throw new Error('REVISION_CONFLICT');await ctx.db.patch(contactId,{...fields,name,updatedAt:Date.now(),updatedBy:by,revision:(prior.revision??1)+1});id=contactId;}
 else id=await ctx.db.insert('contacts',{...metadata(by),...fields,name});
 await op.record([{table:'contacts',id}]);await audit(ctx,by,{table:'contacts',id},'contact.saved',{name});return id;
}});
export const createPurchase=transaction({args:{operationId:v.string(),contactId:v.id('contacts'),type:v.union(v.literal('buyback'),v.literal('supplier')),reference:v.string(),occurredAt:v.number(),buyerNote:optionalText,sellerNote:optionalText,lines:v.array(v.object({product:v.optional(product),stockItemId:v.optional(v.id('stockItems')),quantity:v.number(),costCents:v.number(),askingPriceCents:v.optional(v.number()),condition:optionalText,serial:optionalText,estimatedValueCents:v.optional(v.number()),buybackRateBps:v.optional(v.number()),tax}))},handler:async(ctx,args)=>{
 const by=await actor(ctx,true),op=await operation(ctx,by,args.operationId,'create-purchase',args);
 if(op.previous)return {purchaseId:op.previous.results[0].id,itemIds:op.previous.results.slice(1).map(r=>r.id)};
 const contact=await ctx.db.get(args.contactId);if(!contact||contact.archivedAt!==undefined)throw new Error('CONTACT_NOT_FOUND');
 timestamp(args.occurredAt);if(!args.lines.length||args.lines.length>200)throw new Error('INVALID_LINES');
 const status=args.type==='supplier'?'active':'pending';
 const purchaseId=await ctx.db.insert('purchases',{...metadata(by),contactId:args.contactId,type:args.type,reference:args.reference,occurredAt:args.occurredAt,status,buyerNote:args.buyerNote,sellerNote:args.sellerNote});
 const stockOperationId=status==='active'?await ctx.db.insert('stockOperations',{...metadata(by),kind:'acquisition',occurredAt:args.occurredAt,source:{table:'purchases',id:purchaseId}}):null;
 const itemIds:Id<'stockItems'>[]=[];
 for(const line of args.lines){
  integer(line.quantity,'QUANTITY',1);integer(line.costCents,'COST');if(args.type==='buyback'&&line.quantity!==1)throw new Error('INDIVIDUAL_QUANTITY_REQUIRED');
  if(line.askingPriceCents!==undefined)integer(line.askingPriceCents,'PRICE');
  if(line.estimatedValueCents!==undefined)integer(line.estimatedValueCents,'VALUE');
  if(line.buybackRateBps!==undefined){integer(line.buybackRateBps,'RATE');if(line.buybackRateBps>10000)throw new Error('INVALID_RATE');}
  if(line.tax.rateBps!==null){integer(line.tax.rateBps,'TAX');if(line.tax.rateBps>10000)throw new Error('INVALID_TAX');}
  if((!!line.product)===(!!line.stockItemId))throw new Error('EXACTLY_ONE_PRODUCT_REQUIRED');
  let itemId:Id<'stockItems'>;
  if(line.stockItemId){
   const item=await ctx.db.get(line.stockItemId);if(!item||item.origin!=='supplier'||item.tracking!=='quantity'||args.type!=='supplier')throw new Error('INCOMPATIBLE_STOCK_ITEM');
   itemId=item._id;await ctx.db.patch(itemId,{quantity:integer(item.quantity+line.quantity,'QUANTITY'),status:'available',revision:(item.revision??1)+1,updatedAt:Date.now(),updatedBy:by});
  }else{
   const input=line.product!;if(!input.name.trim())throw new Error('INVALID_PRODUCT_NAME');if(input.packSize!==undefined)integer(input.packSize,'PACK_SIZE',1);
   const productId=await ctx.db.insert('products',{...metadata(by),...input,name:input.name.trim(),description:input.description??''});
   itemId=await ctx.db.insert('stockItems',{...metadata(by),productId,tracking:args.type==='supplier'?'quantity':'individual',condition:line.condition,serial:line.serial,askingPriceCents:line.askingPriceCents??null,visible:false,status:'available',quantity:status==='active'?line.quantity:0,origin:args.type==='supplier'?'supplier':'purchase'});
  }
  const purchaseLineId=await ctx.db.insert('purchaseLines',{...metadata(by),purchaseId,stockItemId:itemId,quantity:line.quantity,costCents:line.costCents,estimatedValueCents:line.estimatedValueCents??null,buybackRateBps:line.buybackRateBps??null,tax:line.tax});
  const lotId=await ctx.db.insert('stockLots',{...metadata(by),stockItemId:itemId,source:{kind:'purchase',purchaseId,purchaseLineId},originalQuantity:line.quantity,remainingQuantity:status==='active'?line.quantity:0,originalCostCents:line.costCents,remainingCostCents:status==='active'?line.costCents:0,acquiredAt:args.occurredAt,taxRateBps:line.tax.rateBps,openingBalanceOnly:false});
  if(stockOperationId)await ctx.db.insert('stockMovements',{...metadata(by),operationId:stockOperationId,lotId,quantityDelta:line.quantity,costDeltaCents:line.costCents});
  itemIds.push(itemId);
 }
 await op.record([{table:'purchases',id:purchaseId},...itemIds.map(id=>({table:'stockItems' as const,id}))]);await audit(ctx,by,{table:'purchases',id:purchaseId},'purchase.created',{status});return {purchaseId,itemIds};
}});
export const validatePurchase=transaction({args:{purchaseId:v.id('purchases')},handler:async(ctx,args)=>{
 const by=await actor(ctx,true),purchase=await ctx.db.get(args.purchaseId);if(!purchase)throw new Error('PURCHASE_NOT_FOUND');if(purchase.status==='active')return purchase._id;if(purchase.status==='cancelled')throw new Error('PURCHASE_CANCELLED');
 const lines=await ctx.db.query('purchaseLines').withIndex('by_purchase',q=>q.eq('purchaseId',purchase._id)).collect();
 const operationId=await ctx.db.insert('stockOperations',{...metadata(by),kind:'acquisition',occurredAt:purchase.occurredAt,source:{table:'purchases',id:purchase._id}});
 for(const line of lines.filter(l=>l.removedAt===undefined)){const item=await ctx.db.get(line.stockItemId);if(!item||(item.quantity!==0&&item.quantity!==line.quantity))throw new Error('PENDING_STOCK_CHANGED');
  const lots=await ctx.db.query('stockLots').withIndex('by_item_fifo',q=>q.eq('stockItemId',item._id)).collect();
  for(const lot of lots){if(lot.source.kind!=='purchase'||lot.source.purchaseId!==purchase._id)continue;if(lot.remainingQuantity!==0&&lot.remainingQuantity!==lot.originalQuantity)throw new Error('PENDING_STOCK_CHANGED');const quantityDelta=lot.originalQuantity-lot.remainingQuantity,costDeltaCents=lot.originalCostCents===null||lot.remainingCostCents===null?null:lot.originalCostCents-lot.remainingCostCents;await ctx.db.patch(lot._id,{remainingQuantity:lot.originalQuantity,remainingCostCents:lot.originalCostCents});if(quantityDelta||costDeltaCents)await ctx.db.insert('stockMovements',{...metadata(by),operationId,lotId:lot._id,quantityDelta,costDeltaCents});}
  await ctx.db.patch(item._id,{quantity:line.quantity,status:'available',revision:(item.revision??1)+1,updatedAt:Date.now(),updatedBy:by});
 }
 await ctx.db.patch(purchase._id,{status:'active',revision:(purchase.revision??1)+1,updatedAt:Date.now(),updatedBy:by});await audit(ctx,by,{table:'purchases',id:purchase._id},'purchase.validated',{});return purchase._id;
}});
export const createSale=transaction({args:{operationId:v.string(),reference:v.string(),occurredAt:v.number(),customerName:optionalText,lines:v.array(v.object({stockItemId:v.id('stockItems'),quantity:v.number(),lineTotalCents:v.number()})),payment},handler:async(ctx,args)=>{
 const by=await actor(ctx,true),op=await operation(ctx,by,args.operationId,'create-sale',args);if(op.previous)return op.previous.results[0].id;
 timestamp(args.occurredAt);if(!args.lines.length||args.lines.length>200||new Set(args.lines.map(l=>l.stockItemId)).size!==args.lines.length)throw new Error('INVALID_LINES');
 const sum=total(args.lines.map(l=>integer(l.lineTotalCents,'PRICE')));integer(args.payment.cashCents,'PAYMENT');integer(args.payment.transferCents,'PAYMENT');
 if(args.payment.status==='received'?total([args.payment.cashCents,args.payment.transferCents])!==sum:args.payment.cashCents!==0||args.payment.transferCents!==0)throw new Error('PAYMENT_TOTAL_MISMATCH');
 const receivedAt=args.payment.receivedAt??args.occurredAt;timestamp(receivedAt);if(shopDay(receivedAt)<shopDay(args.occurredAt))throw new Error('PAYMENT_BEFORE_SALE');
 const saleId=await ctx.db.insert('sales',{...metadata(by),reference:args.reference,occurredAt:args.occurredAt,customerName:args.customerName,status:'confirmed'});
 const stockOperationId=await ctx.db.insert('stockOperations',{...metadata(by),kind:'sale',occurredAt:args.occurredAt,source:{table:'sales',id:saleId}});
 for(const line of args.lines){
  const item=await ctx.db.get(line.stockItemId);if(!item)throw new Error('ITEM_NOT_FOUND');const product=await ctx.db.get(item.productId);if(!product)throw new Error('PRODUCT_NOT_FOUND');
  const preview=await fifo(ctx,item,line.quantity);if(preview.allocations.some(a=>shopDay(a.lot.acquiredAt)>shopDay(args.occurredAt)))throw new Error('SALE_BEFORE_PURCHASE');
  const taxRegimes=new Set<'margin'|'other'|'unknown'>();
  for(const allocation of preview.allocations){
   const source=allocation.lot.source;
   if(source.kind==='purchase'){const purchase=await ctx.db.get(source.purchaseId),purchaseLine=await ctx.db.get(source.purchaseLineId);if(purchase?.status!=='active')throw new Error('PURCHASE_NOT_ACTIVE');taxRegimes.add(purchaseLine?.tax.regime??'unknown');}
   else taxRegimes.add(source.kind==='legacy-unknown'?'unknown':'other');
  }
  if(taxRegimes.size!==1)throw new Error('MIXED_TAX_LOTS_REQUIRE_SEPARATE_ITEM');
  const taxRegime=[...taxRegimes][0];
  const taxRates=new Set(preview.allocations.map(a=>a.lot.taxRateBps));if(taxRates.size!==1)throw new Error('MIXED_TAX_LOTS_REQUIRE_SEPARATE_ITEM');
  let consignmentRevisionId:Id<'consignmentRevisions'>|undefined,depositorId:Id<'contacts'>|undefined,commissionCents:number|null=null,depositorAmountCents:number|null=null;
  if(item.origin==='consignment'){
   const sources=preview.allocations.map(a=>a.lot.source);const source=sources[0];if(source.kind!=='consignment'||sources.some(s=>s.kind!=='consignment'||s.consignmentId!==source.consignmentId))throw new Error('OWNERSHIP_MISMATCH');
   const dossier=await ctx.db.get(source.consignmentId),revision=dossier?.currentRevisionId?await ctx.db.get(dossier.currentRevisionId):null;
   if(!revision||revision.signatureState!=='signed')throw new Error('CONSIGNMENT_SIGNATURE_REQUIRED');
   const terms=await ctx.db.query('consignmentTerms').withIndex('by_revision_item',q=>q.eq('revisionId',revision._id).eq('stockItemId',item._id)).unique();
   if(!terms||terms.commissionRateBps===null||terms.agreedPriceCents===null)throw new Error('CONSIGNMENT_TERMS_UNKNOWN');
   if(BigInt(line.lineTotalCents)<BigInt(terms.agreedPriceCents)*BigInt(line.quantity))throw new Error('PRICE_BELOW_AGREEMENT');
   commissionCents=Number((BigInt(line.lineTotalCents)*BigInt(terms.commissionRateBps)+5000n)/10000n);depositorAmountCents=line.lineTotalCents-commissionCents;consignmentRevisionId=revision._id;depositorId=source.depositorId;
  }
  const plan=await consume(ctx,by,item,line.quantity,stockOperationId);
  const grading=(await ctx.db.query('itemGradings').withIndex('by_item',q=>q.eq('stockItemId',item._id).eq('supersededAt',undefined)).collect())[0],company=grading?await ctx.db.get(grading.companyId):null;
  const saleLineId=await ctx.db.insert('saleLines',{...metadata(by),productSnapshot:{name:product.name,set:product.set,identifier:product.printedIdentifier,language:product.language,condition:item.condition,gradingCompany:company?.name,gradingGrade:grading?.grade,gradingCertificate:grading?.certificate},saleId,stockItemId:item._id,quantity:line.quantity,lineTotalCents:line.lineTotalCents,costCents:plan.costCents,description:product.name,taxRateBps:preview.allocations[0].lot.taxRateBps,taxRegime,consignmentRevisionId,depositorId,commissionCents,depositorAmountCents,paymentStatus:args.payment.status});
  for(const allocation of plan.allocations)await ctx.db.insert('saleAllocations',{...metadata(by),saleLineId,lotId:allocation.lot._id,quantity:allocation.quantity,costCents:allocation.costCents,restored:false});
 }
 if(args.payment.status==='received')await ctx.db.insert('salePayments',{...metadata(by),saleId,collectionStatus:'received',historyKind:'initial',occurredAt:receivedAt,cashCents:args.payment.cashCents,transferCents:args.payment.transferCents,reference:args.payment.reference,status:'active'});
 await op.record([{table:'sales',id:saleId}]);await audit(ctx,by,{table:'sales',id:saleId},'sale.confirmed',{totalCents:sum});return saleId;
}});
export const correctPayment=transaction({args:{operationId:v.string(),saleId:v.id('sales'),occurredAt:v.number(),payment},handler:async(ctx,args)=>{
 const by=await actor(ctx,true),op=await operation(ctx,by,args.operationId,'correct-payment',args);if(op.previous)return args.saleId;
 const sale=await ctx.db.get(args.saleId);if(!sale||sale.status!=='confirmed')throw new Error('SALE_NOT_ACTIVE');timestamp(args.occurredAt);if(shopDay(args.occurredAt)<shopDay(sale.occurredAt))throw new Error('PAYMENT_BEFORE_SALE');
 const lines=await ctx.db.query('saleLines').withIndex('by_sale',q=>q.eq('saleId',sale._id)).collect();const sum=total(lines.map(l=>l.lineTotalCents));integer(args.payment.cashCents,'PAYMENT');integer(args.payment.transferCents,'PAYMENT');
 if(args.payment.status==='received'?total([args.payment.cashCents,args.payment.transferCents])!==sum:args.payment.cashCents!==0||args.payment.transferCents!==0)throw new Error('PAYMENT_TOTAL_MISMATCH');
 const old=(await ctx.db.query('salePayments').withIndex('by_sale',q=>q.eq('saleId',sale._id)).collect()).filter(p=>p.status==='active');if(old.length>1)throw new Error('PAYMENT_LEDGER_MISMATCH');
 for(const p of old)await ctx.db.patch(p._id,{status:'superseded'});
 await ctx.db.insert('salePayments',{...metadata(by),saleId:sale._id,collectionStatus:args.payment.status,previousCollectionStatus:lines.every(l=>l.paymentStatus===lines[0]?.paymentStatus)?lines[0]?.paymentStatus:'unknown',historyKind:'revision',occurredAt:args.occurredAt,cashCents:args.payment.cashCents,transferCents:args.payment.transferCents,reference:args.payment.reference,supersedesId:old[0]?._id,status:'active'});
 for(const line of lines)await ctx.db.patch(line._id,{paymentStatus:args.payment.status});await op.record([{table:'sales',id:sale._id}]);await audit(ctx,by,{table:'sales',id:sale._id},'payment.corrected',args.payment);return sale._id;
}});
export const cancelSale=transaction({args:{operationId:v.string(),saleId:v.id('sales')},handler:async(ctx,args)=>{
 const by=await actor(ctx,true),op=await operation(ctx,by,args.operationId,'cancel-sale',args);if(op.previous)return args.saleId;
 const sale=await ctx.db.get(args.saleId);if(!sale)throw new Error('SALE_NOT_FOUND');
 if(sale.status==='confirmed'){
  const source=(await ctx.db.query('stockOperations').collect()).find(o=>o.kind==='sale'&&o.source?.table==='sales'&&o.source.id===sale._id);
  const reversalId=await ctx.db.insert('stockOperations',{...metadata(by),kind:'reversal',occurredAt:Date.now(),source:{table:'sales',id:sale._id},reversesId:source?._id});
  for(const line of await ctx.db.query('saleLines').withIndex('by_sale',q=>q.eq('saleId',sale._id)).collect()){
   const allocations=await ctx.db.query('saleAllocations').withIndex('by_sale_line',q=>q.eq('saleLineId',line._id)).collect();
   if(allocations.reduce((n,a)=>n+a.quantity,0)!==line.quantity)throw new Error('ALLOCATION_LEDGER_MISMATCH');
   for(const allocation of allocations){if(allocation.restored)throw new Error('ALLOCATION_ALREADY_RESTORED');const lot=await ctx.db.get(allocation.lotId);if(!lot)throw new Error('LOT_NOT_FOUND');
    if(lot.remainingQuantity+allocation.quantity>lot.originalQuantity)throw new Error('LOT_OVERFLOW');
    await ctx.db.patch(lot._id,{remainingQuantity:lot.remainingQuantity+allocation.quantity,remainingCostCents:lot.remainingCostCents===null||allocation.costCents===null?null:integer(lot.remainingCostCents+allocation.costCents,'COST')});
    await ctx.db.patch(allocation._id,{restored:true});await ctx.db.insert('stockMovements',{...metadata(by),operationId:reversalId,lotId:lot._id,quantityDelta:allocation.quantity,costDeltaCents:allocation.costCents});
   }
   const item=await ctx.db.get(line.stockItemId);if(!item)throw new Error('ITEM_NOT_FOUND');await ctx.db.patch(item._id,{quantity:integer(item.quantity+line.quantity,'QUANTITY'),status:'available',revision:(item.revision??1)+1,updatedAt:Date.now(),updatedBy:by});
  }
  for(const p of await ctx.db.query('salePayments').withIndex('by_sale',q=>q.eq('saleId',sale._id)).collect())if(p.status==='active')await ctx.db.patch(p._id,{status:'reversed'});
  await ctx.db.patch(sale._id,{status:'cancelled',revision:(sale.revision??1)+1,updatedAt:Date.now(),updatedBy:by});
 }
 await op.record([{table:'sales',id:sale._id}]);await audit(ctx,by,{table:'sales',id:sale._id},'sale.cancelled',{});return sale._id;
}});
export const recordPayout=transaction({args:{operationId:v.string(),depositorId:v.id('contacts'),amountCents:v.number(),occurredAt:v.number(),method:v.string(),reference:optionalText},handler:async(ctx,args)=>{
 const by=await actor(ctx,true),op=await operation(ctx,by,args.operationId,'record-payout',args);if(op.previous)return op.previous.results[0].id;
 integer(args.amountCents,'PAYOUT',1);timestamp(args.occurredAt);if(!await ctx.db.get(args.depositorId))throw new Error('CONTACT_NOT_FOUND');const balance=await depositorBalance(ctx,args.depositorId);if(args.amountCents>balance.balanceCents)throw new Error('PAYMENT_EXCEEDS_BALANCE');if(!args.method.trim())throw new Error('INVALID_PAYMENT');if(args.amountCents>(await depositorBalance(ctx,args.depositorId,args.occurredAt)).balanceCents)throw new Error('INVALID_PAYMENT_DATE');
 const id=await ctx.db.insert('depositorPayouts',{...metadata(by),depositorId:args.depositorId,amountCents:args.amountCents,occurredAt:args.occurredAt,method:args.method,reference:args.reference});await snapshotPayment(ctx,id);await op.record([{table:'depositorPayouts',id}]);await audit(ctx,by,{table:'depositorPayouts',id},'payout.recorded',{amountCents:args.amountCents});return id;
}});
export const balance=query({args:{depositorId:v.id('contacts')},handler:async(ctx,args)=>{await actor(ctx);return depositorBalance(ctx,args.depositorId);}});
