export {salePaymentHistory} from './paymentHistory';
import {mutation} from './itemActivity';
import {shopDay} from './shopCalendar';
import {transaction} from './transaction';
import {v} from 'convex/values';
import {paginationOptsValidator} from 'convex/server';
import {query,internalQuery} from './_generated/server';
import type {Id} from './_generated/dataModel';
import {actor,audit,fifo,integer,metadata,operation} from './domain';
import * as transactions from './transactions';
import {available,itemRecord,purchaseRecord,saleRecord} from './compat';
import {publicCataloguePage,publicProductRecord,publicPhotoObject} from './publicCatalogue';
import {allocateSalePayments,salePaymentValidator,salePaymentStatusValidator,validateSalePayment} from '../../functions/salePayments';
const text=v.optional(v.string());
export const createSeller=mutation({args:{operationId:v.string(),name:v.string(),email:text,phone:text,address:text},handler:(ctx,args)=>transactions.saveContact.run(ctx,{...args,kind:'person'})});
export const updateSeller=mutation({args:{sellerId:v.id('contacts'),name:v.string(),email:text,phone:text,address:text,expectedRevision:v.optional(v.number())},handler:async(ctx,args)=>{
 const by=await actor(ctx,true),prior=await ctx.db.get(args.sellerId);if(!prior)throw new Error('SELLER_NOT_FOUND');if(args.expectedRevision!==undefined&&args.expectedRevision!==prior.revision)throw new Error('REVISION_CONFLICT');
 const {sellerId,expectedRevision,...fields}=args;if(!fields.name.trim())throw new Error('INVALID_SELLER_NAME');await ctx.db.patch(sellerId,{...fields,name:fields.name.trim(),revision:(prior.revision??1)+1,updatedAt:Date.now(),updatedBy:by});await audit(ctx,by,{table:'contacts',id:sellerId},'contact.updated',fields);return sellerId;
}});
const purchaseItem=v.object({operationId:v.string(),name:v.string(),tcg:text,series:text,identifier:text,serialNumber:text,catalogueImageUrl:text,catalogueCardId:text,catalogueSetId:text,language:text,condition:text,gradingCompany:text,gradingGrade:text,gradingCertificate:text,gradingNotes:text,marketValueCents:v.optional(v.number()),discountPercent:v.optional(v.number()),purchasePriceCents:v.number(),askingPriceCents:v.optional(v.number()),vatRegime:v.union(v.literal('margin'),v.literal('other'))});
export const createPurchase=mutation({args:{operationId:v.string(),sellerId:v.id('contacts'),occurredAt:v.number(),reference:v.string(),buyerNote:text,sellerNote:text,items:v.array(purchaseItem)},handler:async(ctx,args)=>{
 const by=await actor(ctx,true),compat=await operation(ctx,by,`${args.operationId}:compat`,'legacy-purchase',args);if(compat.previous)return {purchaseId:compat.previous.results[0].id,itemIds:compat.previous.results.slice(1).map(r=>r.id)};
 if(new Set(args.items.map(i=>i.operationId)).size!==args.items.length)throw new Error('INVALID_ITEM');
 for(const item of args.items)if(item.marketValueCents!==undefined&&item.discountPercent!==undefined&&Math.round(item.marketValueCents*item.discountPercent/100)!==item.purchasePriceCents)throw new Error('INVALID_ITEM');
 const result=await transactions.createPurchase.run(ctx,{operationId:args.operationId,contactId:args.sellerId,type:'buyback',reference:args.reference,occurredAt:args.occurredAt,buyerNote:args.buyerNote,sellerNote:args.sellerNote,lines:args.items.map(item=>({product:{type:'card' as const,name:item.name,tcg:item.tcg,set:item.series,printedIdentifier:item.identifier,language:item.language,catalogue:item.catalogueImageUrl||item.catalogueCardId||item.catalogueSetId?{imageUrl:item.catalogueImageUrl,provider:'tcgdex',cardId:item.catalogueCardId,setId:item.catalogueSetId}:undefined},quantity:1,costCents:item.purchasePriceCents,askingPriceCents:item.askingPriceCents,condition:item.condition,serial:item.serialNumber,estimatedValueCents:item.marketValueCents,buybackRateBps:item.discountPercent===undefined?undefined:Math.round(item.discountPercent*100),tax:{regime:item.vatRegime,rateBps:null}}))});
 for(const [index,input]of args.items.entries())if(input.gradingCompany){
  const name=input.gradingCompany.trim(),normalizedName=name.normalize('NFKC').toLocaleLowerCase('en');if(!name||!input.gradingGrade?.trim())throw new Error('INVALID_GRADING');
  const company=await ctx.db.query('gradingCompanies').withIndex('by_name',q=>q.eq('normalizedName',normalizedName)).unique();if(company?.archivedAt!==undefined)throw new Error('GRADING_COMPANY_ARCHIVED');
  const companyId=company?._id??await ctx.db.insert('gradingCompanies',{...metadata(by),name,normalizedName});
  await ctx.db.insert('itemGradings',{...metadata(by),stockItemId:result.itemIds[index] as Id<'stockItems'>,companyId,grade:input.gradingGrade.trim(),certificate:input.gradingCertificate,notes:input.gradingNotes});
 }
 await compat.record([{table:'purchases',id:result.purchaseId as Id<'purchases'>},...result.itemIds.map(id=>({table:'stockItems' as const,id:id as Id<'stockItems'>}))]);return result;
}});
export const validatePurchase=transactions.validatePurchase;
export const cancelPendingPurchase=mutation({args:{purchaseId:v.id('purchases')},handler:async(ctx,args)=>{const by=await actor(ctx,true),purchase=await ctx.db.get(args.purchaseId);if(!purchase)throw new Error('PURCHASE_NOT_FOUND');if(purchase.status==='active')throw new Error('PURCHASE_ALREADY_ACTIVE');if(purchase.status==='cancelled')return purchase._id;
 const cancellationOperation=await ctx.db.insert('stockOperations',{...metadata(by),kind:'reversal',occurredAt:Date.now(),source:{table:'purchases',id:purchase._id},reason:'Pending purchase cancelled'});
 for(const line of await ctx.db.query('purchaseLines').withIndex('by_purchase',q=>q.eq('purchaseId',purchase._id)).collect()){const item=await ctx.db.get(line.stockItemId);if(item)await ctx.db.patch(item._id,{status:'cancelled',quantity:0});for(const lot of await ctx.db.query('stockLots').withIndex('by_item_fifo',q=>q.eq('stockItemId',line.stockItemId)).collect()){if(lot.remainingQuantity||lot.remainingCostCents)await ctx.db.insert('stockMovements',{...metadata(by),operationId:cancellationOperation,lotId:lot._id,quantityDelta:-lot.remainingQuantity,costDeltaCents:lot.remainingCostCents===null?null:-lot.remainingCostCents});await ctx.db.patch(lot._id,{remainingQuantity:0,remainingCostCents:0});}}
 await ctx.db.patch(purchase._id,{status:'cancelled',updatedBy:by,updatedAt:Date.now(),revision:(purchase.revision??1)+1});await audit(ctx,by,{table:'purchases',id:purchase._id},'purchase.cancelled',{});return purchase._id;
}});
export const updatePurchaseDate=mutation({args:{purchaseId:v.id('purchases'),occurredAt:v.number()},handler:async(ctx,args)=>{const by=await actor(ctx,true),purchase=await ctx.db.get(args.purchaseId);if(!purchase)throw new Error('PURCHASE_NOT_FOUND');if(!Number.isSafeInteger(args.occurredAt))throw new Error('INVALID_DATE');
 for(const line of await ctx.db.query('purchaseLines').withIndex('by_purchase',q=>q.eq('purchaseId',purchase._id)).collect()){
  for(const saleLine of await ctx.db.query('saleLines').withIndex('by_item',q=>q.eq('stockItemId',line.stockItemId)).collect()){const sale=await ctx.db.get(saleLine.saleId);if(sale?.status==='confirmed'&&shopDay(sale.occurredAt)<shopDay(args.occurredAt))throw new Error('PURCHASE_DATE_AFTER_SALE');}
  for(const lot of await ctx.db.query('stockLots').withIndex('by_item_fifo',q=>q.eq('stockItemId',line.stockItemId)).collect())if(lot.source.kind==='purchase'&&lot.source.purchaseId===purchase._id)await ctx.db.patch(lot._id,{acquiredAt:args.occurredAt});
  if(purchase.occurredAt!==args.occurredAt)await audit(ctx,by,{table:'stockItems',id:line.stockItemId},'purchase.date-updated',{purchaseId:purchase._id,before:purchase.occurredAt,after:args.occurredAt});
 }
 await ctx.db.patch(purchase._id,{occurredAt:args.occurredAt,revision:(purchase.revision??1)+1,updatedAt:Date.now(),updatedBy:by});await audit(ctx,by,{table:'purchases',id:purchase._id},'purchase.date-updated',{before:purchase.occurredAt,after:args.occurredAt,itemActivityCaptured:true});return purchase._id;
}});
const saleArgs={operationId:v.string(),itemId:v.id('stockItems'),occurredAt:v.number(),salePriceCents:v.number(),quantity:v.optional(v.number()),customerName:text,paymentStatus:v.optional(salePaymentStatusValidator),payment:v.optional(salePaymentValidator)};
export const createSale=transaction({args:saleArgs,handler:async(ctx,args)=>{
 const by=await actor(ctx,true),compat=await operation(ctx,by,`${args.operationId}:compat`,'legacy-sale',args);
 if(compat.previous){const prior=compat.previous.results[0];return prior.table==='saleConflicts'?{id:prior.id,conflict:true as const}:prior.id;}
 validateSalePayment(args.salePriceCents,args.occurredAt,args.paymentStatus,args.payment);
 const item=await ctx.db.get(args.itemId);if(!item)throw new Error('ITEM_NOT_FOUND');integer(args.quantity??1,'QUANTITY',1);
 if(item.status!=='available'||item.quantity<(args.quantity??1)){
  const id=await ctx.db.insert('saleConflicts',{...metadata(by),stockItemId:item._id,operationKey:args.operationId,reason:'ITEM_UNAVAILABLE',status:'open',attemptedSale:{occurredAt:args.occurredAt,quantity:args.quantity??1,lineTotalCents:args.salePriceCents,customerName:args.customerName}});
  await compat.record([{table:'saleConflicts',id}]);return {id,conflict:true as const};
 }
 const saleId=await transactions.createSale.run(ctx,{operationId:args.operationId,reference:args.operationId,occurredAt:args.occurredAt,customerName:args.customerName,lines:[{stockItemId:args.itemId,quantity:args.quantity??1,lineTotalCents:args.salePriceCents}],payment:{status:args.paymentStatus??'pending',cashCents:args.payment?.cashCents??0,transferCents:args.payment?.transferCents??0,receivedAt:args.payment?.receivedAt,reference:args.payment?.reference}});
 await compat.record([{table:'sales',id:saleId as Id<'sales'>}]);return saleId;
}});
export const createSales=mutation({args:{operationId:v.string(),occurredAt:v.number(),items:v.array(v.object({itemId:v.id('stockItems'),salePriceCents:v.number(),quantity:v.optional(v.number())})),paymentStatus:v.optional(salePaymentStatusValidator),payment:v.optional(salePaymentValidator)},handler:async(ctx,args)=>{
 const by=await actor(ctx,true),batch=await operation(ctx,by,args.operationId,'legacy-sale-batch',args);if(batch.previous)return {ids:batch.previous.results.map(r=>r.id)};
 if(!args.items.length||args.items.length>100||new Set(args.items.map(i=>i.itemId)).size!==args.items.length)throw new Error('INVALID_SALE_BATCH');
 const total=args.items.reduce((n,i)=>integer(n+integer(i.salePriceCents,'PRICE'),'TOTAL'),0);validateSalePayment(total,args.occurredAt,args.paymentStatus,args.payment);
 const payments=args.payment?allocateSalePayments(args.items.map(i=>i.salePriceCents),args.payment):undefined,ids:Id<'sales'>[]=[];
 for(const [index,item]of args.items.entries()){const result=await createSale.run(ctx,{...item,operationId:`${args.operationId}:line:${index}`,occurredAt:args.occurredAt,paymentStatus:args.paymentStatus,payment:payments?.[index]});if(typeof result!=='string')throw new Error('ITEM_UNAVAILABLE');ids.push(result as Id<'sales'>);}
 await batch.record(ids.map(id=>({table:'sales' as const,id})));return {ids};
}});
export const cancelSale=transactions.cancelSale;
export const recordSalePayment=mutation({args:{operationId:v.string(),saleId:v.id('sales'),cashCents:v.number(),transferCents:v.number(),receivedAt:v.number(),reference:text},handler:async(ctx,args)=>transactions.correctPayment.run(ctx,{operationId:args.operationId,saleId:args.saleId,occurredAt:args.receivedAt,payment:{status:'received',cashCents:args.cashCents,transferCents:args.transferCents,reference:args.reference}})});
export const updateAskingPrice=mutation({args:{itemId:v.id('stockItems'),askingPriceCents:v.number()},handler:async(ctx,args)=>{const by=await actor(ctx,true);integer(args.askingPriceCents,'PRICE');const item=await ctx.db.get(args.itemId);if(!item)throw new Error('ITEM_NOT_FOUND');const dto=await itemRecord(ctx,item);if(dto.origin==='consignment'&&args.askingPriceCents<(dto.agreedPriceCents??0))throw new Error('PRICE_BELOW_AGREEMENT');await ctx.db.patch(item._id,{askingPriceCents:args.askingPriceCents,updatedAt:Date.now(),updatedBy:by,revision:(item.revision??1)+1});return item._id;}});
export const setStockVisibility=mutation({args:{operationId:v.string(),itemIds:v.array(v.id('stockItems')),hidden:v.boolean()},handler:async(ctx,args)=>{const by=await actor(ctx,true),op=await operation(ctx,by,args.operationId,'stock-visibility',args);if(op.previous)return {updatedCount:op.previous.results.length};if(args.itemIds.length>500)throw new Error('TOO_MANY_ITEMS');const ids=[...new Set(args.itemIds)];for(const id of ids){const item=await ctx.db.get(id);if(!item)throw new Error('ITEM_NOT_FOUND');await ctx.db.patch(id,{visible:!args.hidden,revision:(item.revision??1)+1,updatedBy:by,updatedAt:Date.now()});}await op.record(ids.map(id=>({table:'stockItems' as const,id})));return {updatedCount:ids.length};}});
export const stock=query({args:{},handler:async ctx=>{await actor(ctx);const rows=await ctx.db.query('stockItems').withIndex('by_status',q=>q.eq('status','available')).collect();return (await Promise.all(rows.map(i=>itemRecord(ctx,i)))).filter(available);}});
export const sellerHistory=query({args:{},handler:async ctx=>{await actor(ctx);return ctx.db.query('contacts').order('asc').collect();}});
export const purchaseHistory=query({args:{},handler:async ctx=>{await actor(ctx);return Promise.all((await ctx.db.query('purchases').withIndex('by_date').order('desc').collect()).map(p=>purchaseRecord(ctx,p)));}});
export const purchaseHistoryPage=query({args:{page:v.number(),size:v.number(),search:v.string(),status:v.union(v.literal('all'),v.literal('pending'),v.literal('active'),v.literal('cancelled')),from:v.optional(v.number()),to:v.optional(v.number())},handler:async(ctx,args)=>{
 await actor(ctx);
 if(!Number.isSafeInteger(args.page)||args.page<1||!Number.isSafeInteger(args.size)||args.size<1||args.size>50||args.search.length>200)throw new Error('INVALID_PAGINATION');
 if((args.from!==undefined&&!Number.isFinite(args.from))||(args.to!==undefined&&!Number.isFinite(args.to))||(args.from!==undefined&&args.to!==undefined&&args.from>args.to))throw new Error('INVALID_DATE_RANGE');
 // Preserve the numbered-page HTTP contract; hydrate only the requested buyback page.
 // Exact counts scan purchase/contact metadata, as the legacy endpoint does.
 const [purchases,contacts]=await Promise.all([ctx.db.query('purchases').withIndex('by_date').order('desc').collect(),ctx.db.query('contacts').collect()]);
 const names=new Map(contacts.map(c=>[c._id,c.name]));
 const fold=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
 const words=fold(args.search.trim()).split(/\s+/).filter(Boolean);
 const matches=purchases.filter(p=>p.type==='buyback'&&(args.status==='all'||p.status===args.status)&&(args.from===undefined||p.occurredAt>=args.from)&&(args.to===undefined||p.occurredAt<=args.to)&&words.every(word=>fold(`${p.reference} ${names.get(p.contactId)??''}`).includes(word))).sort((a,b)=>b.occurredAt-a.occurredAt||b._creationTime-a._creationTime||a._id.localeCompare(b._id));
 const totalPages=Math.max(1,Math.ceil(matches.length/args.size)),page=Math.min(args.page,totalPages);
 const rows=await Promise.all(matches.slice((page-1)*args.size,page*args.size).map(p=>purchaseRecord(ctx,p)));
 return {rows,page,totalPages,totalCount:matches.length};
}});
export const salesHistory=query({args:{},handler:async ctx=>{await actor(ctx);return (await Promise.all((await ctx.db.query('sales').withIndex('by_date').order('desc').collect()).map(s=>saleRecord(ctx,s)))).filter(Boolean);}});
export const openSaleConflicts=query({args:{},handler:async ctx=>{await actor(ctx);return Promise.all((await ctx.db.query('saleConflicts').withIndex('by_status',q=>q.eq('status','open')).collect()).map(async c=>{const item=await ctx.db.get(c.stockItemId),product=item?await ctx.db.get(item.productId):null;return {...c,itemId:c.stockItemId,itemName:product?.name??'',occurredAt:c.attemptedSale?.occurredAt??c.createdAt,salePriceCents:c.attemptedSale?.lineTotalCents??0,customerName:c.attemptedSale?.customerName};}));}});
export const getSaleConflict=query({args:{conflictId:v.id('saleConflicts')},handler:async(ctx,args)=>{await actor(ctx);const c=await ctx.db.get(args.conflictId);return c?{...c,itemId:c.stockItemId,occurredAt:c.attemptedSale?.occurredAt??c.createdAt,salePriceCents:c.attemptedSale?.lineTotalCents??0,customerName:c.attemptedSale?.customerName}:null;}});
export const resolveSaleConflict=mutation({args:{conflictId:v.id('saleConflicts'),resolutionNote:v.string()},handler:async(ctx,args)=>{const by=await actor(ctx,true),conflict=await ctx.db.get(args.conflictId);if(!conflict)throw new Error('CONFLICT_NOT_FOUND');if(!args.resolutionNote.trim())throw new Error('INVALID_RESOLUTION');await ctx.db.patch(conflict._id,{status:'resolved',resolutionNote:args.resolutionNote.trim(),resolvedAt:Date.now(),updatedBy:by,updatedAt:Date.now(),revision:(conflict.revision??1)+1});return conflict._id;}});
export const publicProduct=query({args:{itemId:v.string()},handler:(ctx,args)=>publicProductRecord(ctx,args.itemId)});
export const publicCatalogue=query({args:{language:text,tcg:text,series:text,paginationOpts:paginationOptsValidator,search:v.string(),minPrice:v.optional(v.number()),maxPrice:v.optional(v.number()),gradingStatus:v.string(),gradingCompany:v.string(),gradingGrade:v.string(),sort:text},handler:publicCataloguePage});
export const cataloguePhotoObject=internalQuery({args:{itemId:v.string(),photoId:text},handler:(ctx,args)=>publicPhotoObject(ctx,args.itemId,args.photoId)});
export {createConsignment,consignmentHistory,consignmentBalances,recordConsignmentPayment,returnConsignmentItem,updateConsignmentTerms} from './consignmentOperations';
export {createAttachment,attachmentById,attachmentsForPurchase} from './attachments';
