import {v} from 'convex/values';
import {mutation,query,internalMutation} from './_generated/server';
import {actor,metadata,operation} from './domain';
import {archiveDocument,createDocument,documentDto,freezeIdentity} from './documentStore';
import {saleRecord} from './compat';
import {canonicalJson} from './migrationReferences';
export const prepare=mutation({args:{operationId:v.string(),saleIds:v.array(v.id('sales'))},handler:async(ctx,args)=>{
 const by=await actor(ctx,true),op=await operation(ctx,by,args.operationId,'sale-ticket',args);if(op.previous)return op.previous.results[0].id;
 if(!args.saleIds.length||args.saleIds.length>100||new Set(args.saleIds).size!==args.saleIds.length)throw new Error('INVALID_TICKET');const lines=[];
 for(const id of args.saleIds){const sale=await ctx.db.get(id);if(!sale)throw new Error('SALE_NOT_FOUND');const dto=await saleRecord(ctx,sale);if(!dto)throw new Error('ITEM_NOT_FOUND');lines.push({saleId:id,name:dto.itemName,quantity:dto.quantity,totalCents:dto.salePriceCents,status:dto.status,occurredAt:dto.occurredAt,paymentStatus:dto.paymentStatus??'unknown',payment:dto.payment??null,vatRegime:dto.vatRegime,origin:dto.origin??'purchase',taxRateBps:dto.taxRateBps??null});}
 const id=await createDocument(ctx,by,'sale_ticket',{reference:`VEN-${args.saleIds[0]}`,occurredAt:lines[0].occurredAt,lines},args.saleIds.map(id=>({table:'sales' as const,id})));await op.record([{table:'documents',id}]);return id;
}});
export const list=query({args:{saleId:v.id('sales')},handler:async(ctx,args)=>{await actor(ctx);const links=await ctx.db.query('documentLinks').withIndex('by_target',q=>q.eq('target.table','sales').eq('target.id',args.saleId)).order('desc').take(100),rows=[];for(const link of links){const row=await ctx.db.get(link.documentId);if(row?.kind==='sale_ticket')rows.push(await documentDto(ctx,row));}return rows;}});
export const get=query({args:{id:v.id('documents')},handler:async(ctx,args)=>{await actor(ctx);const row=await ctx.db.get(args.id);if(row?.kind!=='sale_ticket')throw new Error('TICKET_NOT_FOUND');const emails=(await ctx.db.query('emailDeliveries').withIndex('by_document',q=>q.eq('documentId',row._id)).order('desc').take(20)).map(e=>({...e,status:e.state,messageId:e.providerId}));return {...await documentDto(ctx,row),emails};}});
export const identity=internalMutation({args:{id:v.id('documents'),identity:v.any()},handler:async(ctx,args)=>freezeIdentity(ctx,args.id,args.identity)});
export const archive=internalMutation({args:{id:v.id('documents'),objectKey:v.string(),sha256:v.string(),filename:v.string()},handler:async(ctx,{id,...fields})=>{await archiveDocument(ctx,id,fields);}});
export const claimEmail=internalMutation({args:{ticketId:v.id('documents'),operationId:v.string(),recipient:v.string()},handler:async(ctx,args)=>{
 const prior=await ctx.db.query('emailDeliveries').withIndex('by_attempt',q=>q.eq('attemptKey',args.operationId)).unique();if(prior){if(prior.documentId!==args.ticketId||prior.recipient!==args.recipient)throw new Error('IDEMPOTENCY_KEY_REUSED');return {id:prior._id,send:false,status:prior.state};}
 const document=await ctx.db.get(args.ticketId);if(!document||document.kind!=='sale_ticket'||!document.pdfFileId)throw new Error('TICKET_NOT_FOUND');const ticket=await documentDto(ctx,document);
 for(const line of ticket.snapshot.lines){const id=ctx.db.normalizeId('sales',line.saleId),sale=id?await ctx.db.get(id):null,dto=sale?await saleRecord(ctx,sale):null;if(!dto||dto.status!==line.status||(dto.paymentStatus??'unknown')!==line.paymentStatus||canonicalJson(dto.payment??null)!==canonicalJson(line.payment))throw new Error('TICKET_STALE');}
 const id=await ctx.db.insert('emailDeliveries',{...metadata(document.createdBy??'service'),documentId:document._id,recipient:args.recipient,attemptKey:args.operationId,state:'sending',attemptAt:Date.now()});return {id,send:true,status:'sending'};
}});
export const emailResult=internalMutation({args:{id:v.id('emailDeliveries'),status:v.union(v.literal('accepted'),v.literal('failed'),v.literal('unknown')),messageId:v.optional(v.string())},handler:async(ctx,args)=>{const row=await ctx.db.get(args.id);if(!row)throw new Error('TICKET_NOT_FOUND');if(row.state==='accepted')return;await ctx.db.patch(row._id,{state:args.status,providerId:args.messageId});}});
