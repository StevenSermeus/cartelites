/** Legacy HTTP DTOs assembled from canonical records. No legacy shadow tables. */
import type {QueryCtx} from './_generated/server';
import type {Doc} from './_generated/dataModel';
import {depositorBalance} from './domain';
import {consignmentEventsForItem} from './consignmentEvents';
export async function itemRecord(ctx:QueryCtx,item:Doc<'stockItems'>,options:{photos?:boolean}={}){
 const product=await ctx.db.get(item.productId);if(!product)throw new Error('PRODUCT_NOT_FOUND');
 const firstLot=await ctx.db.query('stockLots').withIndex('by_item_fifo',q=>q.eq('stockItemId',item._id)).first();
 const source=firstLot?.source;
 const purchase=source?.kind==='purchase'?await ctx.db.get(source.purchaseId):null;
 const purchaseLine=source?.kind==='purchase'?await ctx.db.get(source.purchaseLineId):null;
 const dossier=source?.kind==='consignment'?await ctx.db.get(source.consignmentId):null;
 const revision=dossier?.currentRevisionId?await ctx.db.get(dossier.currentRevisionId):null;
 const terms=revision?await ctx.db.query('consignmentTerms').withIndex('by_revision_item',q=>q.eq('revisionId',revision._id).eq('stockItemId',item._id)).unique():null;
 const contactId=dossier?.depositorId??purchase?.contactId,contact=contactId?await ctx.db.get(contactId):null;
 const grading=await ctx.db.query('itemGradings').withIndex('by_item',q=>q.eq('stockItemId',item._id).eq('supersededAt',undefined)).first();
 const company=grading?await ctx.db.get(grading.companyId):null;
 const links=options.photos===false?[]:await ctx.db.query('fileLinks').withIndex('by_target',q=>q.eq('target.table','stockItems').eq('target.id',item._id)).collect();
 const photos=[];
 for(const link of links.filter(l=>l.purpose==='photo').sort((a,b)=>Number(b.fileId===item.coverFileId)-Number(a.fileId===item.coverFileId)||a.displayOrder-b.displayOrder)){
  const file=await ctx.db.get(link.fileId);if(file?.uploadState==='complete')photos.push({...file,itemId:item._id});
 }
 return {...item,ownerId:item.createdBy,productType:product.type,productRevision:product.revision??1,publicAttributes:product.publicAttributes,privateAttributes:product.privateAttributes,privateNotes:item.privateNotes,name:product.name,description:product.description,tcg:product.tcg,series:product.set,identifier:product.printedIdentifier,language:product.language,variant:product.variant,format:product.format,packSize:product.packSize,catalogueImageUrl:product.catalogue?.imageUrl,catalogueCardId:product.catalogue?.cardId,catalogueSetId:product.catalogue?.setId,serialNumber:item.serial,coverPhotoId:item.coverFileId,hiddenFromCatalogue:!item.visible,askingPriceCents:item.askingPriceCents??undefined,
  gradingCompany:company?.name,gradingCompanyId:company?._id,gradingGrade:grading?.grade,gradingCertificate:grading?.certificate,gradingNotes:grading?.notes,
  purchaseId:purchase?._id,purchaseReference:purchase?.reference??dossier?.reference??'',purchaseOccurredAt:purchase?.occurredAt??dossier?.occurredAt??firstLot?.acquiredAt??item.createdAt,purchasePriceCents:purchaseLine?.costCents??null,marketValueCents:purchaseLine?.estimatedValueCents??undefined,discountPercent:purchaseLine?.buybackRateBps===null||purchaseLine?.buybackRateBps===undefined?undefined:purchaseLine.buybackRateBps/100,vatRegime:purchaseLine?.tax.regime??(item.origin==='consignment'?'other':'unknown'),taxRateBps:firstLot?.taxRateBps??undefined,
  sellerId:contactId,sellerName:contact?.name??'',consignmentId:dossier?._id,agreedPriceCents:terms?.agreedPriceCents??undefined,commissionRateBps:terms?.commissionRateBps??undefined,contractPending:!!dossier&&revision?.signatureState!=='signed',sourceStatus:purchase?.status??(dossier?'active':item.origin==='supplier'?'active':undefined),photos,hasMorePhotos:false};
}
export async function purchaseRecord(ctx:QueryCtx,purchase:Doc<'purchases'>){
 const contact=await ctx.db.get(purchase.contactId),lines=await ctx.db.query('purchaseLines').withIndex('by_purchase',q=>q.eq('purchaseId',purchase._id)).collect();
 const items=[];for(const line of lines.filter(l=>l.removedAt===undefined)){const item=await ctx.db.get(line.stockItemId);if(item)items.push({...await itemRecord(ctx,item),purchasePriceCents:line.costCents,quantity:line.quantity});}
 return {...purchase,ownerId:purchase.createdBy,sellerId:purchase.contactId,sellerName:contact?.name??'',items,hasMoreItems:false};
}
export async function saleRecord(ctx:QueryCtx,sale:Doc<'sales'>){
 const lines=await ctx.db.query('saleLines').withIndex('by_sale',q=>q.eq('saleId',sale._id)).collect();const line=lines[0];if(!line)return null;
 const item=await ctx.db.get(line.stockItemId),source=item?await itemRecord(ctx,item):null;
 const origins=new Set<string>();for(const saleLine of lines){const physical=saleLine.stockItemId===item?._id?item:await ctx.db.get(saleLine.stockItemId);const origin=saleLine.depositorId?'consignment':physical?.origin;if(origin&&origin!=='legacy-unknown')origins.add(origin);}
 const payments=await ctx.db.query('salePayments').withIndex('by_sale',q=>q.eq('saleId',sale._id)).collect(),payment=payments.find(p=>p.status==='active');
 const allocations=(await Promise.all(lines.map(l=>ctx.db.query('saleAllocations').withIndex('by_sale_line',q=>q.eq('saleLineId',l._id)).collect()))).flat();
 const costCents=lines.some(l=>l.costCents===null)?null:lines.reduce((n,l)=>n+l.costCents!,0);
 return {...source,...sale,origins:[...origins],ownerId:sale.createdBy,status:sale.status==='confirmed'?'active':'cancelled',itemId:line.stockItemId,series:line.productSnapshot?line.productSnapshot.set:source?.series,identifier:line.productSnapshot?line.productSnapshot.identifier:source?.identifier,language:line.productSnapshot?line.productSnapshot.language:source?.language,condition:line.productSnapshot?line.productSnapshot.condition:source?.condition,gradingCompany:line.productSnapshot?line.productSnapshot.gradingCompany:source?.gradingCompany,gradingGrade:line.productSnapshot?line.productSnapshot.gradingGrade:source?.gradingGrade,gradingCertificate:line.productSnapshot?line.productSnapshot.gradingCertificate:source?.gradingCertificate,itemName:lines.length===1?line.description:`${lines.length} articles`,quantity:lines.reduce((n,l)=>n+l.quantity,0),salePriceCents:lines.reduce((n,l)=>n+l.lineTotalCents,0),costCents,purchasePriceCents:costCents,taxRateBps:line.taxRateBps,vatRegime:line.taxRegime,paymentStatus:line.paymentStatus==='unknown'?undefined:line.paymentStatus,payment:payment?{cashCents:payment.cashCents,transferCents:payment.transferCents,receivedAt:payment.occurredAt,reference:payment.reference}:undefined,
  sellerId:line.depositorId??source?.sellerId,commissionCents:line.commissionCents??undefined,depositorAmountCents:line.depositorAmountCents??undefined,allocations:allocations.map(a=>({lotId:a.lotId,quantity:a.quantity,costCents:a.costCents})),lines,payments};
}
export async function consignmentRecord(ctx:QueryCtx,dossier:Doc<'consignments'>){
 const seller=await ctx.db.get(dossier.depositorId),revision=dossier.currentRevisionId?await ctx.db.get(dossier.currentRevisionId):null;
 const terms=revision?await ctx.db.query('consignmentTerms').withIndex('by_revision_item',q=>q.eq('revisionId',revision._id)).collect():[];
 const items=[];for(const term of terms){const item=await ctx.db.get(term.stockItemId);if(item)items.push({...await itemRecord(ctx,item),events:await consignmentEventsForItem(ctx,item._id)});}
 return {...dossier,ownerId:dossier.createdBy,sellerId:dossier.depositorId,sellerName:seller?.name??'',flowVersion:2,contractRevision:revision?.number,contractStatus:revision?.signatureState,contractTerms:revision?{text:revision.contractText,version:revision.contractVersion}:undefined,items,hasMoreItems:false};
}
export async function balanceRecord(ctx:QueryCtx,contact:Doc<'contacts'>){
 const balance=await depositorBalance(ctx,contact._id),hasDeposits=!!await ctx.db.query('consignments').withIndex('by_depositor',q=>q.eq('depositorId',contact._id)).first();
 return {_id:contact._id,sellerId:contact._id,sellerName:contact.name,earnedCents:balance.entitledCents,paidCents:balance.paidCents,balanceCents:balance.balanceCents,hasDeposits};
}
export const available=(item:Awaited<ReturnType<typeof itemRecord>>)=>item.status==='available'&&item.quantity>0&&item.sourceStatus==='active'&&!item.contractPending;
export const publiclyEligible=(item:Awaited<ReturnType<typeof itemRecord>>)=>available(item)&&!item.hiddenFromCatalogue&&item.askingPriceCents!==undefined;
export function publicRecord(item:Awaited<ReturnType<typeof itemRecord>>){return {id:item._id,productType:item.productType,publicAttributes:item.publicAttributes,variant:item.variant,name:item.name,description:item.description,tcg:item.tcg,series:item.series??'',identifier:item.identifier??'',language:item.language,condition:item.condition,gradingCompany:item.gradingCompany,gradingGrade:item.gradingGrade,gradingCertificate:item.gradingCertificate,catalogueImageUrl:item.catalogueImageUrl,...(item.priceVisible===false?{}:{salePriceCents:item.askingPriceCents}),quantity:item.quantity,hasPhoto:item.photos.length>0,coverPhotoId:item.photos[0]?._id,photos:item.photos.map(p=>({id:p._id}))};}
