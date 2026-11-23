import {readActivity} from '../../shared/itemActivity';
/** Inventory HTTP compatibility backed exclusively by canonical lots and movements. */
import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { query, type QueryCtx, type MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { transaction } from './transaction';
import { actor, audit, consume, integer, metadata, operation, timestamp, total } from './domain';
import { available, itemRecord } from './compat';
import { createPurchase, saveContact } from './transactions';

const text = v.optional(v.string());
export const productFields = {
  tcg: text, name: v.string(), productType: v.union(v.literal('card'), v.literal('sealed'), v.literal('other')),
  format: text, packSize: v.optional(v.number()), series: text, identifier: text, language: text,
  condition: text, gradingCompany: text, gradingGrade: text, gradingCertificate: text,
  askingPriceCents: v.number(), taxRateBps: v.number(),
};
type ProductInput = { name: string; productType: 'card'|'sealed'|'other'; tcg?: string; format?: string; packSize?: number; series?: string; identifier?: string; language?: string; condition?: string; gradingCompany?: string; gradingGrade?: string; gradingCertificate?: string; askingPriceCents: number; taxRateBps: number };
function validateProduct(p: ProductInput) {
  if (!p.name.trim() || p.name.length > 300 || (p.series?.length ?? 0)>300 || (p.identifier?.length ?? 0)>100 || (p.gradingGrade?.length ?? 0)>32 || (p.gradingCertificate?.length ?? 0)>100) throw new Error('INVALID_INVENTORY');
  integer(p.askingPriceCents,'PRICE'); integer(p.taxRateBps,'TAX');
  if(p.taxRateBps>10000 || (p.format && p.productType!=='sealed')) throw new Error('INVALID_INVENTORY');
  if(p.packSize!==undefined){integer(p.packSize,'PACK_SIZE',1);if(p.packSize>1000)throw new Error('INVALID_INVENTORY');}
}
function product(p: ProductInput) { return { type:p.productType, name:p.name.trim(), tcg:p.tcg??'pokemon', format:p.format, packSize:p.packSize, set:p.series, printedIdentifier:p.identifier, language:p.language }; }
async function setGrading(ctx: MutationCtx, by: string, itemId: Id<'stockItems'>, fields: Pick<ProductInput,'gradingCompany'|'gradingGrade'|'gradingCertificate'>) {
  const current=await ctx.db.query('itemGradings').withIndex('by_item',q=>q.eq('stockItemId',itemId).eq('supersededAt',undefined)).collect();
  let company: Doc<'gradingCompanies'>|null=null;
  if(fields.gradingCompany){company=await ctx.db.query('gradingCompanies').withIndex('by_name',q=>q.eq('normalizedName',fields.gradingCompany!.trim().normalize('NFKC').toLocaleLowerCase('en'))).unique();if(!company || (company.archivedAt!==undefined&&!current.some(g=>g.companyId===company!._id)))throw new Error('GRADING_COMPANY_NOT_FOUND');}
  if(current.length===1 && company?._id===current[0].companyId && (fields.gradingGrade??'')===current[0].grade && (fields.gradingCertificate??'')===(current[0].certificate??''))return;
  for(const row of current)await ctx.db.patch(row._id,{supersededAt:Date.now(),updatedAt:Date.now(),updatedBy:by});
  if(company)await ctx.db.insert('itemGradings',{...metadata(by),stockItemId:itemId,companyId:company._id,grade:fields.gradingGrade??'',certificate:fields.gradingCertificate});
}
const changed=(by:string,row:{revision?:number})=>({updatedBy:by,updatedAt:Date.now(),revision:(row.revision??1)+1});
export const updateProduct=transaction({args:{itemId:v.id('stockItems'),expectedRevision:v.optional(v.number()),expectedProductRevision:v.optional(v.number()),variant:text,serialNumber:text,privateNotes:text,publicAttributes:v.optional(v.record(v.string(),v.string())),privateAttributes:v.optional(v.record(v.string(),v.string())),tcg:text,name:v.string(),description:v.string(),series:v.string(),identifier:v.string(),askingPriceCents:v.number(),priceVisible:v.optional(v.boolean()),hiddenFromCatalogue:v.boolean(),language:text,condition:text,gradingCompany:text,gradingGrade:v.string(),gradingCertificate:v.string()},handler:async(ctx,args)=>{
  const by=await actor(ctx,true),item=await ctx.db.get(args.itemId);if(!item)throw new Error('ITEM_NOT_FOUND');
  if(args.expectedRevision!==undefined&&args.expectedRevision!==(item.revision??1))throw new Error('REVISION_CONFLICT');
  for(const attrs of [args.publicAttributes,args.privateAttributes])if(attrs&&(Object.keys(attrs).length>20||Object.entries(attrs).some(([key,value])=>!key.trim()||key.length>60||value.length>500)))throw new Error('INVALID_METADATA');
  if((args.privateNotes?.length??0)>3000||(args.variant?.length??0)>100||(args.serialNumber?.length??0)>100)throw new Error('INVALID_METADATA');
  const p=await ctx.db.get(item.productId);if(!p)throw new Error('PRODUCT_NOT_FOUND');
  if(args.expectedProductRevision!==undefined&&args.expectedProductRevision!==(p.revision??1))throw new Error('REVISION_CONFLICT');
  validateProduct({...args,productType:p.type,taxRateBps:0});if(args.description.length>3000)throw new Error('INVALID_INVENTORY');
  const dto=await itemRecord(ctx,item);if(item.origin==='consignment'&&args.askingPriceCents<(dto.agreedPriceCents??item.askingPriceCents??0))throw new Error('PRICE_BELOW_AGREEMENT');
  await ctx.db.patch(p._id,{publicAttributes:args.publicAttributes??p.publicAttributes,privateAttributes:args.privateAttributes??p.privateAttributes,variant:args.variant??p.variant,name:args.name.trim(),description:args.description,tcg:args.tcg??p.tcg,set:args.series,printedIdentifier:args.identifier,language:args.language,...changed(by,p)});
  await ctx.db.patch(item._id,{serial:args.serialNumber??item.serial,privateNotes:args.privateNotes??item.privateNotes,askingPriceCents:args.askingPriceCents,priceVisible:args.priceVisible??item.priceVisible??true,visible:!args.hiddenFromCatalogue,condition:args.condition,...changed(by,item)});
  await setGrading(ctx,by,item._id,args);await audit(ctx,by,{table:'stockItems',id:item._id},'product.updated',args);return {id:item._id};
}});
export const receive=transaction({args:{operationId:v.string(),supplier:v.string(),reference:v.string(),occurredAt:v.number(),lines:v.array(v.object({itemId:v.optional(v.id('stockItems')),product:v.object(productFields),quantity:v.number(),unitCostCents:v.number()}))},handler:async(ctx,args)=>{
  const by=await actor(ctx,true),op=await operation(ctx,by,args.operationId,'inventory.receive',args);if(op.previous)return {id:op.previous.results[0].id,itemIds:op.previous.results.slice(1).map(r=>r.id)};
  timestamp(args.occurredAt);if(!args.supplier.trim()||args.supplier.length>200||!args.reference.trim()||args.reference.length>200||!args.lines.length||args.lines.length>50)throw new Error('INVALID_INVENTORY');
  for(const line of args.lines){validateProduct(line.product);integer(line.quantity,'QUANTITY',1);if(line.quantity>100000)throw new Error('INVALID_QUANTITY');integer(line.unitCostCents,'COST');integer(line.quantity*line.unitCostCents,'COST');
    if(line.itemId){const item=await ctx.db.get(line.itemId),dto=item?await itemRecord(ctx,item):null;if(!dto||dto.origin!=='supplier'||dto.productType!==line.product.productType||dto.format!==line.product.format||(dto.tcg??'pokemon')!==(line.product.tcg??'pokemon')||dto.taxRateBps!==line.product.taxRateBps)throw new Error('PRODUCT_MISMATCH');}}
  total(args.lines.map(l=>l.quantity*l.unitCostCents),'COST');
  const supplier=await ctx.db.query('contacts').withIndex('by_name',q=>q.eq('name',args.supplier.trim())).filter(q=>q.and(q.eq(q.field('kind'),'company'),q.eq(q.field('archivedAt'),undefined))).first();
  const contactId=supplier?._id??await saveContact.run(ctx,{operationId:`${args.operationId}:supplier`,kind:'company',name:args.supplier.trim()});
  const result=await createPurchase.run(ctx,{operationId:`${args.operationId}:purchase`,contactId:contactId as Id<'contacts'>,type:'supplier',reference:args.reference.trim(),occurredAt:args.occurredAt,lines:args.lines.map(l=>({product:l.itemId?undefined:product(l.product),stockItemId:l.itemId,quantity:l.quantity,costCents:l.quantity*l.unitCostCents,askingPriceCents:l.product.askingPriceCents,condition:l.product.condition,tax:{regime:'other' as const,rateBps:l.product.taxRateBps}}))});
  for(let i=0;i<result.itemIds.length;i++)if(!args.lines[i].itemId)await setGrading(ctx,by,result.itemIds[i] as Id<'stockItems'>,args.lines[i].product);
  await op.record([{table:'purchases',id:result.purchaseId as Id<'purchases'>},...result.itemIds.map(id=>({table:'stockItems' as const,id:id as Id<'stockItems'>}))]);return {id:result.purchaseId,itemIds:result.itemIds};
}});
async function receiptRecord(ctx: QueryCtx,p: Doc<'purchases'>){
  const lines=await ctx.db.query('purchaseLines').withIndex('by_purchase',q=>q.eq('purchaseId',p._id)).collect();
  return {...p,supplier:(await ctx.db.get(p.contactId))?.name??'',itemIds:lines.map(l=>l.stockItemId),totalCostCents:lines.some(l=>l.costCents===null)?null:total(lines.map(l=>l.costCents!))};
}
export async function stockOperationRecord(ctx:QueryCtx,row:Doc<'stockOperations'>){
  const movements=await ctx.db.query('stockMovements').withIndex('by_operation',q=>q.eq('operationId',row._id)).collect();
  const allocations=movements.filter(m=>m.quantityDelta<0).map(m=>({lotId:m.lotId,quantity:-m.quantityDelta,costCents:m.costDeltaCents===null?null:-m.costDeltaCents}));
  const sourceId=row.source?.table==='stockItems'?row.source.id:undefined;
  const item=sourceId?await ctx.db.get(sourceId):null,dto=item?await itemRecord(ctx,item):null;
  const reversal=await ctx.db.query('stockOperations').withIndex('by_reversal',q=>q.eq('reversesId',row._id)).first();
  return {...row,itemId:sourceId,sourceId,targetId:row.targetItemId,quantity:row.quantity??(allocations.length?total(allocations.map(a=>a.quantity)):null),itemName:dto?.name??'Article archivé',purchaseId:dto?.purchaseId,purchaseReference:dto?.purchaseReference,allocations,reversalAvailable:row.historyComplete!==false,costCents:row.costCents!==undefined?row.costCents:row.historyComplete===false||!allocations.length||allocations.some(a=>a.costCents===null)?null:total(allocations.map(a=>a.costCents!)),cancelledAt:reversal?.occurredAt};
}
export const detail=query({args:{itemId:v.id('stockItems')},handler:async(ctx,{itemId})=>{
  await actor(ctx);const item=await ctx.db.get(itemId);if(!item)throw new Error('ITEM_NOT_FOUND');const dto=await itemRecord(ctx,item);
  const lots=await ctx.db.query('stockLots').withIndex('by_item_fifo',q=>q.eq('stockItemId',itemId)).collect();
  const openings=await ctx.db.query('stockOperations').filter(q=>q.and(q.eq(q.field('kind'),'display-opening'),q.eq(q.field('source.id'),itemId))).collect();
  return {item:dto,photos:dto.photos,lots:await Promise.all(lots.map(async l=>{const purchase=l.source.kind==='purchase'?await ctx.db.get(l.source.purchaseId):null;return {...l,itemId:l.stockItemId,receiptId:purchase?._id,openingId:l.source.kind==='opening'?l.source.operationId:undefined,received:l.originalQuantity,remaining:l.remainingQuantity,totalCostCents:l.originalCostCents,remainingCostCents:l.remainingCostCents,occurredAt:l.acquiredAt,receipt:purchase?await receiptRecord(ctx,purchase):null};})),openings:await Promise.all(openings.map(o=>stockOperationRecord(ctx,o)))};
}});
export const receipts=query({args:{paginationOpts:paginationOptsValidator},handler:async(ctx,args)=>{await actor(ctx);const result=await ctx.db.query('purchases').filter(q=>q.eq(q.field('type'),'supplier')).order('desc').paginate(args.paginationOpts);return {...result,page:await Promise.all(result.page.map(p=>receiptRecord(ctx,p)))};}});
export const donate=transaction({args:{operationId:v.string(),itemId:v.id('stockItems'),quantity:v.number(),occurredAt:v.number(),recipient:text,reason:v.string(),note:text},handler:async(ctx,args)=>{
  const by=await actor(ctx,true),op=await operation(ctx,by,args.operationId,'inventory.gift',args);if(op.previous)return op.previous.results[0].id;
  timestamp(args.occurredAt);integer(args.quantity,'QUANTITY',1);if(args.quantity>100000||!args.reason.trim()||args.reason.length>1000||(args.recipient?.length??0)>300||(args.note?.length??0)>3000)throw new Error('INVALID_INVENTORY');
  const item=await ctx.db.get(args.itemId);if(!item||item.origin==='consignment'||!available(await itemRecord(ctx,item)))throw new Error('ITEM_UNAVAILABLE');
  if(item.tracking==='individual'&&args.quantity!==1)throw new Error('INVALID_QUANTITY');
  const id=await ctx.db.insert('stockOperations',{...metadata(by),kind:'gift',occurredAt:args.occurredAt,quantity:args.quantity,reason:args.reason,recipient:args.recipient,note:args.note,source:{table:'stockItems',id:item._id}});
  await consume(ctx,by,item,args.quantity,id,'donated',args.occurredAt);await op.record([{table:'stockOperations',id}]);await audit(ctx,by,{table:'stockItems',id:item._id},'stock.gift',{operationId:id});return id;
}});
export const openDisplay=transaction({args:{operationId:v.string(),itemId:v.id('stockItems'),targetId:v.optional(v.id('stockItems')),product:v.optional(v.object(productFields)),quantity:v.number(),packSize:v.number(),occurredAt:v.number()},handler:async(ctx,args)=>{
  const by=await actor(ctx,true),op=await operation(ctx,by,args.operationId,'inventory.open',args);if(op.previous)return op.previous.results[0].id;
  timestamp(args.occurredAt);integer(args.quantity,'QUANTITY',1);integer(args.packSize,'PACK_SIZE',1);if(args.quantity>10000||args.packSize>1000)throw new Error('INVALID_INVENTORY');
  const source=await ctx.db.get(args.itemId),sourceDto=source?await itemRecord(ctx,source):null;
  if(!source||!sourceDto||source.origin!=='supplier'||sourceDto.format!=='display')throw new Error('INVALID_INVENTORY');
  let targetId=args.targetId;
  if(targetId){const target=await ctx.db.get(targetId),dto=target?await itemRecord(ctx,target):null;if(!dto||dto.origin!=='supplier'||dto.format!=='booster'||dto.tcg!==sourceDto.tcg||dto.taxRateBps!==sourceDto.taxRateBps||targetId===source._id)throw new Error('PRODUCT_MISMATCH');}
  else {const p=args.product;if(!p)throw new Error('INVALID_INVENTORY');validateProduct(p);if(p.productType!=='sealed'||p.format!=='booster'||(p.tcg??'pokemon')!==(sourceDto.tcg??'pokemon')||p.taxRateBps!==sourceDto.taxRateBps)throw new Error('PRODUCT_MISMATCH');
    const productId=await ctx.db.insert('products',{...metadata(by),...product(p),description:'',language:sourceDto.language??p.language});
    targetId=await ctx.db.insert('stockItems',{...metadata(by),productId,tracking:'quantity',askingPriceCents:p.askingPriceCents,visible:false,status:'sold',quantity:0,origin:'supplier',condition:p.condition});}
  const id=await ctx.db.insert('stockOperations',{...metadata(by),kind:'display-opening',occurredAt:args.occurredAt,source:{table:'stockItems',id:source._id},targetItemId:targetId,quantity:args.quantity,packSize:args.packSize});
  const plan=await consume(ctx,by,source,args.quantity,id,'sold',args.occurredAt);
  for(const a of plan.allocations){const lotId=await ctx.db.insert('stockLots',{...metadata(by),stockItemId:targetId,source:{kind:'opening',operationId:id},originalQuantity:a.quantity*args.packSize,remainingQuantity:a.quantity*args.packSize,originalCostCents:a.costCents,remainingCostCents:a.costCents,acquiredAt:args.occurredAt,taxRateBps:a.lot.taxRateBps,openingBalanceOnly:false});await ctx.db.insert('stockMovements',{...metadata(by),operationId:id,lotId,quantityDelta:a.quantity*args.packSize,costDeltaCents:a.costCents});}
  const target=(await ctx.db.get(targetId))!;await ctx.db.patch(targetId,{quantity:integer(target.quantity+args.quantity*args.packSize,'QUANTITY'),status:'available',...changed(by,target)});
  await op.record([{table:'stockOperations',id}]);await audit(ctx,by,{table:'stockItems',id:source._id},'stock.opened',{operationId:id});return id;
}});
export const reverse=transaction({args:{operationId:v.string(),giftId:v.optional(v.id('stockOperations')),openingId:v.optional(v.id('stockOperations'))},handler:async(ctx,args)=>{
  const by=await actor(ctx,true),op=await operation(ctx,by,args.operationId,'inventory.reverse',args);if(op.previous)return;
  if(!!args.giftId===!!args.openingId)throw new Error('INVALID_INVENTORY');const source=await ctx.db.get((args.giftId??args.openingId)!);
  if(!source||source.kind!==(args.giftId?'gift':'display-opening'))throw new Error('OPERATION_NOT_FOUND');
  if(source.historyComplete===false)throw new Error('HISTORICAL_ALLOCATIONS_REQUIRE_RECONCILIATION');
  const prior=await ctx.db.query('stockOperations').withIndex('by_reversal',q=>q.eq('reversesId',source._id)).first();
  if(prior){await op.record([{table:'stockOperations',id:prior._id}]);return;}
  const movements=await ctx.db.query('stockMovements').withIndex('by_operation',q=>q.eq('operationId',source._id)).collect();if(!movements.length)throw new Error('MOVEMENT_LEDGER_MISSING');
  const reversalId=await ctx.db.insert('stockOperations',{...metadata(by),kind:'reversal',occurredAt:Date.now(),source:source.source,reversesId:source._id});
  const deltas=new Map<Id<'stockItems'>,number>();
  // Reverse exact movements. Opening outputs must be wholly untouched before their source can be restored.
  for(const m of movements){const lot=await ctx.db.get(m.lotId);if(!lot)throw new Error('LOT_NOT_FOUND');
    if(m.quantityDelta>0&&(lot.remainingQuantity!==lot.originalQuantity||lot.remainingCostCents!==lot.originalCostCents))throw new Error('OPENING_ALREADY_USED');
    const quantity=integer(lot.remainingQuantity-m.quantityDelta,'QUANTITY');if(quantity>lot.originalQuantity)throw new Error('LOT_OVERFLOW');
    const cost=lot.remainingCostCents===null||m.costDeltaCents===null?null:integer(lot.remainingCostCents-m.costDeltaCents,'COST');if(cost!==null&&lot.originalCostCents!==null&&cost>lot.originalCostCents)throw new Error('LOT_COST_OVERFLOW');
    await ctx.db.patch(lot._id,{remainingQuantity:quantity,remainingCostCents:cost,...changed(by,lot)});await ctx.db.insert('stockMovements',{...metadata(by),operationId:reversalId,lotId:lot._id,quantityDelta:-m.quantityDelta,costDeltaCents:m.costDeltaCents===null?null:-m.costDeltaCents});deltas.set(lot.stockItemId,(deltas.get(lot.stockItemId)??0)-m.quantityDelta);
  }
  for(const [id,delta] of deltas){const item=await ctx.db.get(id);if(!item)throw new Error('ITEM_NOT_FOUND');const quantity=integer(item.quantity+delta,'QUANTITY');await ctx.db.patch(id,{quantity,status:quantity?'available':'sold',...changed(by,item)});}
  await op.record([{table:'stockOperations',id:reversalId}]);await audit(ctx,by,{table:'stockOperations',id:source._id},'stock.reversed',{});
}});
export const gifts=query({args:{from:v.number(),to:v.number(),paginationOpts:paginationOptsValidator},handler:async(ctx,args)=>{
  await actor(ctx);timestamp(args.from);timestamp(args.to);if(args.from>args.to)throw new Error('INVALID_DATE');
  const result=await ctx.db.query('stockOperations').withIndex('by_date',q=>q.gte('occurredAt',args.from).lte('occurredAt',args.to)).filter(q=>q.eq(q.field('kind'),'gift')).order('desc').paginate(args.paginationOpts);
  return {...result,page:await Promise.all(result.page.map(async row=>{const dto=await stockOperationRecord(ctx,row);return {...dto,lotSources:await Promise.all(dto.allocations.map(async a=>{const l=await ctx.db.get(a.lotId),p=l?.source.kind==='purchase'?await ctx.db.get(l.source.purchaseId):null;return {...a,reference:p?.reference,supplier:p?(await ctx.db.get(p.contactId))?.name:undefined};}))};}))};
}});
export const photo=transaction({args:{itemId:v.id('stockItems'),attachmentId:v.id('files'),action:v.union(v.literal('cover'),v.literal('remove'))},handler:async(ctx,args)=>{
  const by=await actor(ctx,true),item=await ctx.db.get(args.itemId),file=await ctx.db.get(args.attachmentId);
  const links=await ctx.db.query('fileLinks').withIndex('by_target',q=>q.eq('target.table','stockItems').eq('target.id',args.itemId)).collect();
  const photos=links.filter(l=>l.fileId===args.attachmentId&&l.purpose==='photo');if(!item||!file||!photos.length||!file.contentType.startsWith('image/'))throw new Error('INVALID_ATTACHMENT');
  if(args.action==='cover')await ctx.db.patch(item._id,{coverFileId:file._id,...changed(by,item)});
  else {for(const link of photos)await ctx.db.delete(link._id);if(item.coverFileId===file._id)await ctx.db.patch(item._id,{coverFileId:undefined,...changed(by,item)});}
  // Files can also be immutable evidence in historical signed documents. Unlink only; GC is a separate audited operation.
  return {objectKey:file.objectKey,deleteObject:false};
}});
export const evidence=query({args:{receiptId:v.optional(v.id('purchases')),giftId:v.optional(v.id('stockOperations'))},handler:async(ctx,args)=>{
  await actor(ctx);if(!!args.receiptId===!!args.giftId)throw new Error('INVALID_INVENTORY');const target=args.receiptId?{table:'purchases' as const,id:args.receiptId}:{table:'stockOperations' as const,id:args.giftId!};
  const links=await ctx.db.query('fileLinks').withIndex('by_target',q=>q.eq('target.table',target.table).eq('target.id',target.id)).collect();const files=await Promise.all(links.filter(l=>l.purpose==='evidence').map(l=>ctx.db.get(l.fileId)));return files.filter(f=>f?.uploadState==='complete');
}});

export const activity=query({args:{itemId:v.id('stockItems'),size:v.number(),cursor:v.union(v.string(),v.null())},handler:async(ctx,args)=>{await actor(ctx);if(!await ctx.db.get(args.itemId))throw new Error('ITEM_NOT_FOUND');return readActivity(ctx,args.itemId,args.size,args.cursor);}});
