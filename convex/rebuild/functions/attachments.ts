import {v} from 'convex/values';
import {mutation,query} from './_generated/server';
import type {Doc} from './_generated/dataModel';
import {actor,integer,metadata,operation} from './domain';
export const createAttachment=mutation({args:{operationId:v.optional(v.string()),supplierReceiptId:v.optional(v.id('purchases')),giftId:v.optional(v.id('stockOperations')),purchaseId:v.optional(v.id('purchases')),itemId:v.optional(v.id('stockItems')),objectKey:v.string(),filename:v.string(),contentType:v.string(),size:v.number()},handler:async(ctx,args)=>{
 const by=await actor(ctx,true),op=args.operationId?await operation(ctx,by,args.operationId,'attachment-upload',args):null;if(op?.previous)return op.previous.results[0].id;
 if(!args.purchaseId&&!args.itemId&&!args.supplierReceiptId&&!args.giftId)throw new Error('ATTACHMENT_TARGET_REQUIRED');
 if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(args.contentType))throw new Error('INVALID_ATTACHMENT');integer(args.size,'SIZE',1);if(args.size>Number(process.env.ATTACHMENT_MAX_BYTES??10485760))throw new Error('INVALID_ATTACHMENT');
 const publicPhoto=!!args.itemId&&!args.purchaseId&&!args.supplierReceiptId&&!args.giftId&&args.contentType.startsWith('image/');
 const prefix=args.itemId&&args.contentType.startsWith('image/')?`cards/${by}/`:`attachments/${by}/`,suffix=args.objectKey.slice(prefix.length);if(!args.objectKey.startsWith(prefix)||!suffix||suffix.includes('/')||suffix==='.'||suffix==='..')throw new Error('INVALID_ATTACHMENT');
 const targets:Doc<'fileLinks'>['target'][]=[];
 if(args.purchaseId){const purchase=await ctx.db.get(args.purchaseId);if(!purchase)throw new Error('PURCHASE_NOT_FOUND');targets.push({table:'purchases',id:purchase._id});}
 if(args.supplierReceiptId){const purchase=await ctx.db.get(args.supplierReceiptId);if(purchase?.type!=='supplier')throw new Error('RECEIPT_NOT_FOUND');targets.push({table:'purchases',id:purchase._id});}
 if(args.giftId){const gift=await ctx.db.get(args.giftId);if(gift?.kind!=='gift')throw new Error('GIFT_NOT_FOUND');targets.push({table:'stockOperations',id:gift._id});}
 const item=args.itemId?await ctx.db.get(args.itemId):null;
 if(args.itemId){if(!item)throw new Error('ITEM_NOT_FOUND');if(args.purchaseId){const lines=await ctx.db.query('purchaseLines').withIndex('by_purchase',q=>q.eq('purchaseId',args.purchaseId!)).collect();if(!lines.some(l=>l.stockItemId===item._id))throw new Error('ATTACHMENT_TARGET_MISMATCH');}
  if(publicPhoto){const links=await ctx.db.query('fileLinks').withIndex('by_target',q=>q.eq('target.table','stockItems').eq('target.id',item._id)).collect();if(links.filter(l=>l.purpose==='photo').length>=6)throw new Error('INVALID_ATTACHMENT');}targets.push({table:'stockItems',id:item._id});
 }
 if(await ctx.db.query('files').withIndex('by_object_key',q=>q.eq('objectKey',args.objectKey)).unique())throw new Error('OBJECT_KEY_EXISTS');
 const id=await ctx.db.insert('files',{...metadata(by),objectKey:args.objectKey,filename:args.filename,contentType:args.contentType,size:args.size,thumbnailKey:args.contentType.startsWith('image/')?`${args.objectKey}.thumb.webp`:undefined,uploadState:'complete'});
 for(const target of targets)await ctx.db.insert('fileLinks',{...metadata(by),fileId:id,target,purpose:publicPhoto?'photo':'evidence',displayOrder:0});
 if(publicPhoto&&item&&!item.coverFileId)await ctx.db.patch(item._id,{coverFileId:id});
 await op?.record([{table:'files',id}]);return id;
}});
export const attachmentById=query({args:{attachmentId:v.id('files')},handler:async(ctx,args)=>{await actor(ctx);const file=await ctx.db.get(args.attachmentId);if(!file||file.uploadState!=='complete')throw new Error('ATTACHMENT_NOT_FOUND');return file;}});
export const attachmentsForPurchase=query({args:{purchaseId:v.id('purchases')},handler:async(ctx,args)=>{await actor(ctx);if(!await ctx.db.get(args.purchaseId))throw new Error('PURCHASE_NOT_FOUND');const links=await ctx.db.query('fileLinks').withIndex('by_target',q=>q.eq('target.table','purchases').eq('target.id',args.purchaseId)).collect(),rows=[];for(const link of links){const file=await ctx.db.get(link.fileId);if(file?.uploadState==='complete')rows.push({...file,purchaseId:args.purchaseId});}return rows;}});
