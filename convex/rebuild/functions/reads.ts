import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { query, type QueryCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { actor } from './domain';
async function itemDto(ctx:QueryCtx,item:Doc<'stockItems'>,publicOnly=false){
 const product=await ctx.db.get(item.productId);if(!product)return null;
 const current=(await ctx.db.query('itemGradings').withIndex('by_item',q=>q.eq('stockItemId',item._id).eq('supersededAt',undefined)).collect())[0];
 const company=current?await ctx.db.get(current.companyId):null;
 const links=await ctx.db.query('fileLinks').withIndex('by_target',q=>q.eq('target.table','stockItems').eq('target.id',item._id)).collect();
 const photoLinks=links.filter(l=>l.purpose==='photo').sort((a,b)=>a.displayOrder-b.displayOrder);
 const photos=[];
 for(const link of photoLinks){const file=await ctx.db.get(link.fileId);if(file?.uploadState==='complete'&&file.contentType.startsWith('image/'))photos.push({id:file._id,filename:file.filename,contentType:file.contentType,cover:file._id===item.coverFileId});}
 const publicData={_id:item._id,name:product.name,description:product.description,productType:product.type,tcg:product.tcg,series:product.set,identifier:product.printedIdentifier,language:product.language,variant:product.variant,format:product.format,packSize:product.packSize,catalogueImageUrl:product.catalogue?.imageUrl,condition:item.condition,gradingCompany:company?.name,gradingGrade:current?.grade,gradingCertificate:current?.certificate,askingPriceCents:item.askingPriceCents,quantity:item.quantity,status:item.status,photos};
 if(publicOnly)return publicData;
 const lots=await ctx.db.query('stockLots').withIndex('by_item_fifo',q=>q.eq('stockItemId',item._id)).collect();
 return {...publicData,productId:product._id,revision:item.revision,origin:item.origin,hiddenFromCatalogue:!item.visible,serialNumber:item.serial,gradingNotes:current?.notes,privateNotes:item.privateNotes,lots};
}
export const stock=query({args:{paginationOpts:paginationOptsValidator,status:v.optional(v.union(v.literal('available'),v.literal('sold'),v.literal('cancelled'),v.literal('returned'),v.literal('donated')))},handler:async(ctx,args)=>{
 await actor(ctx);const page=await ctx.db.query('stockItems').withIndex('by_status',q=>q.eq('status',args.status??'available')).order('desc').paginate(args.paginationOpts);
 return {...page,page:(await Promise.all(page.page.map(item=>itemDto(ctx,item)))).filter(Boolean)};
}});
export const product=query({args:{itemId:v.id('stockItems')},handler:async(ctx,args)=>{await actor(ctx);const item=await ctx.db.get(args.itemId);return item?itemDto(ctx,item):null;}});
export const catalogue=query({args:{paginationOpts:paginationOptsValidator},handler:async(ctx,args)=>{
 // Public reads are suppressed during import, just like authenticated operations.
 if((await ctx.db.query('migrationRuns').collect()).some(r=>r.status==='importing'))return {page:[],isDone:true,continueCursor:''};
 const page=await ctx.db.query('stockItems').withIndex('by_public',q=>q.eq('visible',true).eq('status','available')).filter(q=>q.gt(q.field('quantity'),0)).paginate(args.paginationOpts);
 const eligible=[];
 for(const item of page.page){
  const lots=await ctx.db.query('stockLots').withIndex('by_item_fifo',q=>q.eq('stockItemId',item._id)).collect();let allowed=true;
  for(const lot of lots.filter(l=>l.remainingQuantity>0)){
   if(lot.source.kind==='purchase'&&(await ctx.db.get(lot.source.purchaseId))?.status!=='active')allowed=false;
   if(lot.source.kind==='consignment'){const dossier=await ctx.db.get(lot.source.consignmentId),revision=dossier?.currentRevisionId?await ctx.db.get(dossier.currentRevisionId):null;if(revision?.signatureState!=='signed')allowed=false;}
  }
  if(allowed)eligible.push(await itemDto(ctx,item,true));
 }
 return {...page,page:eligible.filter(Boolean)};
}});
export const documents=query({args:{paginationOpts:paginationOptsValidator},handler:async(ctx,args)=>{
 await actor(ctx);const page=await ctx.db.query('documents').withIndex('by_date').order('desc').paginate(args.paginationOpts);
 return {...page,page:await Promise.all(page.page.map(async d=>{const file=d.pdfFileId?await ctx.db.get(d.pdfFileId):null;return {id:d._id,kind:d.kind,version:d.version,status:d.status,createdAt:d.createdAt,signedAt:d.signedAt,file:file?{id:file._id,filename:file.filename,contentType:file.contentType}:null,links:await ctx.db.query('documentLinks').withIndex('by_document',q=>q.eq('documentId',d._id)).collect(),deliveries:await ctx.db.query('emailDeliveries').withIndex('by_document',q=>q.eq('documentId',d._id)).collect()};}))};
}});
export const sale=query({args:{saleId:v.id('sales')},handler:async(ctx,args)=>{
 await actor(ctx);const sale=await ctx.db.get(args.saleId);if(!sale)return null;
 const lines=await ctx.db.query('saleLines').withIndex('by_sale',q=>q.eq('saleId',sale._id)).collect();
 return {...sale,lines:await Promise.all(lines.map(async line=>({...line,allocations:await ctx.db.query('saleAllocations').withIndex('by_sale_line',q=>q.eq('saleLineId',line._id)).collect()}))),payments:await ctx.db.query('salePayments').withIndex('by_sale',q=>q.eq('saleId',sale._id)).collect()};
}});
