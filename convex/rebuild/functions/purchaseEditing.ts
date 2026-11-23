import {mutation} from './itemActivity';
import {v} from 'convex/values';
import {query,type QueryCtx} from './_generated/server';
import type {Id} from './_generated/dataModel';
import {actor,audit,integer,metadata,operation} from './domain';
import {itemRecord} from './compat';
import {canonicalJson} from './migrationReferences';
async function state(ctx:QueryCtx,purchaseId:Id<'purchases'>){
 const purchase=await ctx.db.get(purchaseId);if(!purchase)throw new Error('PURCHASE_NOT_FOUND');
 const lines=(await ctx.db.query('purchaseLines').withIndex('by_purchase',q=>q.eq('purchaseId',purchaseId)).collect()).filter(l=>l.removedAt===undefined);if(lines.length>500)throw new Error('PURCHASE_TOO_LARGE');
 const items=[],lockedIds:Id<'stockItems'>[]=[];
 for(const line of lines){const item=await ctx.db.get(line.stockItemId);if(!item)throw new Error('ITEM_NOT_FOUND');items.push(await itemRecord(ctx,item));
  let locked=item.status!=='available'||!!await ctx.db.query('saleLines').withIndex('by_item',q=>q.eq('stockItemId',item._id)).first();
  const lots=await ctx.db.query('stockLots').withIndex('by_item_fifo',q=>q.eq('stockItemId',item._id)).collect();
  for(const lot of lots){const movements=await ctx.db.query('stockMovements').withIndex('by_lot',q=>q.eq('lotId',lot._id)).collect();for(const movement of movements){const operation=await ctx.db.get(movement.operationId);if(operation&&['gift','display-opening','sale','return'].includes(operation.kind))locked=true;}}
  if(locked)lockedIds.push(item._id);
 }
 return {purchase,lines,items,lockedIds,expectedDigest:canonicalJson([purchase,lines,items])};
}
export const detail=query({args:{purchaseId:v.id('purchases')},handler:async(ctx,args)=>{await actor(ctx);return state(ctx,args.purchaseId);}});
const text=v.optional(v.string());
const line=v.object({itemId:v.optional(v.id('stockItems')),operationId:v.string(),name:v.string(),tcg:text,language:text,condition:text,series:text,identifier:text,catalogueImageUrl:text,catalogueCardId:text,catalogueSetId:text,gradingCompany:text,gradingGrade:text,gradingCertificate:text,gradingNotes:text,marketValueCents:v.number(),discountPercent:v.number(),askingPriceCents:v.optional(v.number())});
export const save=mutation({args:{operationId:v.string(),purchaseId:v.id('purchases'),expectedDigest:v.string(),items:v.array(line),removedIds:v.array(v.id('stockItems'))},handler:async(ctx,args)=>{
 const by=await actor(ctx,true),op=await operation(ctx,by,args.operationId,'purchase-correction',args);if(op.previous)return {itemIds:op.previous.results.map(r=>r.id)};
 const before=await state(ctx,args.purchaseId),purchase=before.purchase;
 if(purchase.type!=='buyback'||purchase.status==='cancelled')throw new Error('PURCHASE_NOT_EDITABLE');
 if(args.expectedDigest!==before.expectedDigest)throw new Error('PURCHASE_CHANGED');if(args.items.length>500||args.removedIds.length>500)throw new Error('PURCHASE_TOO_LARGE');
 const touched=[...args.items.flatMap(i=>i.itemId?[i.itemId]:[]),...args.removedIds];if(new Set(touched).size!==touched.length||new Set(args.items.map(i=>i.operationId)).size!==args.items.length)throw new Error('INVALID_PURCHASE');
 for(const id of touched)if(!before.items.some(i=>i._id===id)||before.lockedIds.includes(id))throw new Error('PURCHASE_ITEM_LOCKED');
 if(before.items.length-args.removedIds.length+args.items.filter(i=>!i.itemId).length<1)throw new Error('INVALID_PURCHASE');
 const now=Date.now(),itemIds:Id<'stockItems'>[]=[];
 const operationId=await ctx.db.insert('stockOperations',{...metadata(by),kind:'acquisition',occurredAt:now,reason:'Purchase correction',source:{table:'purchases',id:purchase._id}});
 for(const input of args.items){
  if(!input.operationId||!input.name.trim()||input.name.length>300||(input.series?.length??0)>300||(input.identifier?.length??0)>100||(input.gradingNotes?.length??0)>500)throw new Error('INVALID_PURCHASE');
  integer(input.marketValueCents,'VALUE');if(!Number.isFinite(input.discountPercent)||input.discountPercent<0||input.discountPercent>100)throw new Error('INVALID_PURCHASE');let cost:number|null=integer(Math.round(input.marketValueCents*input.discountPercent/100),'COST');if(input.askingPriceCents!==undefined)integer(input.askingPriceCents,'PRICE');
  const oldItem=input.itemId?await ctx.db.get(input.itemId):null;
  const sourceLine=oldItem?before.lines.find(l=>l.stockItemId===oldItem._id):undefined;
  // Metadata-only corrections must preserve recorded acquisition cents, including legacy rounding.
  if(sourceLine&&input.marketValueCents===(sourceLine.estimatedValueCents??sourceLine.costCents)&&input.discountPercent===(sourceLine.buybackRateBps===null?100:sourceLine.buybackRateBps/100))cost=sourceLine.costCents;
  const oldProduct=oldItem?await ctx.db.get(oldItem.productId):null;
  const productValues={type:'card' as const,name:input.name.trim(),description:oldProduct?.description??'',publicAttributes:oldProduct?.publicAttributes,privateAttributes:oldProduct?.privateAttributes,variant:oldProduct?.variant,format:oldProduct?.format,packSize:oldProduct?.packSize,tcg:input.tcg,set:input.series,printedIdentifier:input.identifier,language:input.language,catalogue:input.catalogueImageUrl||input.catalogueCardId||input.catalogueSetId?{...oldProduct?.catalogue,imageUrl:input.catalogueImageUrl,provider:'tcgdex',cardId:input.catalogueCardId??oldProduct?.catalogue?.cardId,setId:input.catalogueSetId??oldProduct?.catalogue?.setId}:oldProduct?.catalogue};
  let itemId:Id<'stockItems'>;
  if(oldItem){
   // A shared catalogue description must not mutate other physical objects.
   const productId=await ctx.db.insert('products',{...metadata(by),...productValues});
   itemId=oldItem._id;await ctx.db.patch(itemId,{productId,condition:input.condition,askingPriceCents:input.askingPriceCents??oldItem.askingPriceCents,revision:(oldItem.revision??1)+1,updatedAt:now,updatedBy:by});
   await ctx.db.patch(sourceLine!._id,{costCents:cost,estimatedValueCents:input.marketValueCents,buybackRateBps:Math.round(input.discountPercent*100),updatedAt:now,updatedBy:by,revision:(sourceLine!.revision??1)+1});
   const lots=await ctx.db.query('stockLots').withIndex('by_item_fifo',q=>q.eq('stockItemId',itemId)).collect();if(lots.length!==1)throw new Error('PURCHASE_ITEM_LOCKED');const lot=lots[0],remainingCost=lot.remainingQuantity>0?cost:0;
   await ctx.db.patch(lot._id,{originalCostCents:cost,remainingCostCents:remainingCost,updatedAt:now,updatedBy:by,revision:(lot.revision??1)+1});
   await ctx.db.insert('stockMovements',{...metadata(by),operationId,lotId:lot._id,quantityDelta:0,costDeltaCents:lot.remainingCostCents===null?null:remainingCost===null?null:remainingCost-lot.remainingCostCents});
  }else{
   const productId=await ctx.db.insert('products',{...metadata(by),...productValues}),quantity=purchase.status==='active'?1:0;
   itemId=await ctx.db.insert('stockItems',{...metadata(by),productId,tracking:'individual',condition:input.condition,askingPriceCents:input.askingPriceCents??null,visible:false,status:'available',quantity,origin:'purchase'});
   const purchaseLineId=await ctx.db.insert('purchaseLines',{...metadata(by),purchaseId:purchase._id,stockItemId:itemId,quantity:1,costCents:cost,estimatedValueCents:input.marketValueCents,buybackRateBps:Math.round(input.discountPercent*100),tax:{regime:'margin',rateBps:null}});
   const lotId=await ctx.db.insert('stockLots',{...metadata(by),stockItemId:itemId,source:{kind:'purchase',purchaseId:purchase._id,purchaseLineId},originalQuantity:1,remainingQuantity:quantity,originalCostCents:cost,remainingCostCents:quantity?cost:0,acquiredAt:purchase.occurredAt,taxRateBps:null,openingBalanceOnly:false});
   if(quantity)await ctx.db.insert('stockMovements',{...metadata(by),operationId,lotId,quantityDelta:1,costDeltaCents:cost});
  }
  for(const grading of await ctx.db.query('itemGradings').withIndex('by_item',q=>q.eq('stockItemId',itemId).eq('supersededAt',undefined)).collect())await ctx.db.patch(grading._id,{supersededAt:now});
  if(input.gradingCompany){const name=input.gradingCompany.trim(),normalizedName=name.normalize('NFKC').toLocaleLowerCase('en');if(!name||!input.gradingGrade?.trim())throw new Error('INVALID_GRADING');const company=await ctx.db.query('gradingCompanies').withIndex('by_name',q=>q.eq('normalizedName',normalizedName)).unique();if(company?.archivedAt!==undefined)throw new Error('GRADING_COMPANY_ARCHIVED');const companyId=company?._id??await ctx.db.insert('gradingCompanies',{...metadata(by),name,normalizedName});await ctx.db.insert('itemGradings',{...metadata(by),stockItemId:itemId,companyId,grade:input.gradingGrade.trim(),certificate:input.gradingCertificate,notes:input.gradingNotes});}
  itemIds.push(itemId);
 }
 for(const id of args.removedIds){const item=await ctx.db.get(id),sourceLine=before.lines.find(l=>l.stockItemId===id)!;await ctx.db.patch(sourceLine._id,{removedAt:now,updatedAt:now,updatedBy:by,revision:(sourceLine!.revision??1)+1});await ctx.db.patch(id,{status:'cancelled',quantity:0,updatedAt:now,updatedBy:by,revision:(item?.revision??1)+1});
  for(const lot of await ctx.db.query('stockLots').withIndex('by_item_fifo',q=>q.eq('stockItemId',id)).collect()){await ctx.db.insert('stockMovements',{...metadata(by),operationId,lotId:lot._id,quantityDelta:-lot.remainingQuantity,costDeltaCents:lot.remainingCostCents===null?null:-lot.remainingCostCents});await ctx.db.patch(lot._id,{remainingQuantity:0,remainingCostCents:0});}
 }
 await ctx.db.patch(purchase._id,{updatedAt:now,updatedBy:by,revision:(purchase.revision??1)+1});await op.record(itemIds.map(id=>({table:'stockItems' as const,id})));await audit(ctx,by,{table:'purchases',id:purchase._id},'purchase.corrected',{before:{purchase:before.purchase,lines:before.lines,items:before.items},removedIds:args.removedIds,itemIds});return {itemIds};
}});
