import {v} from 'convex/values';
import {query} from './_generated/server';
import {requireLiveSession} from './sessionGuard';
import {paymentSnapshot,paymentActor,historyCursor,nextHistoryCursor} from '../shared/paymentHistory';
export const salePaymentHistory=query({args:{saleId:v.id('sales'),size:v.optional(v.number()),cursor:v.optional(v.string())},handler:async(ctx,args)=>{
 await requireLiveSession(ctx);const size=args.size??25,saved=historyCursor(args.saleId,size,args.cursor),sale=await ctx.db.get(args.saleId);if(!sale)throw new Error('SALE_NOT_FOUND');
 const first=await ctx.db.query('salePaymentEvents').withIndex('by_sale',q=>q.eq('saleId',sale._id)).first();
 const latest=await ctx.db.query('salePaymentEvents').withIndex('by_sale',q=>q.eq('saleId',sale._id)).order('desc').first();
 const current=paymentSnapshot(sale.payment,sale.paymentStatus),initial=first?paymentSnapshot(first.previousPayment,first.previousPaymentStatus):current;
 const initialRow={id:`initial:${sale._id}`,kind:'initial' as const,state:first?'superseded' as const:sale.status==='cancelled'?'reversed' as const:'current' as const,...initial,changedAt:first?null:sale.createdAt,actorLabel:first?null:await paymentActor(ctx,sale.ownerId),previous:null};
 const header={saleStatus:sale.status,current,currentEntryId:latest?._id??`initial:${sale._id}`,historyStatus:first||current.collectionStatus==='unknown'?'incomplete' as const:'complete' as const};
 if(saved.phase==='initial')return {...header,items:[initialRow],nextCursor:null,isDone:true};
 const page=await ctx.db.query('salePaymentEvents').withIndex('by_sale',q=>q.eq('saleId',sale._id)).order('desc').paginate({numItems:size,cursor:saved.value,maximumRowsRead:100,maximumBytesRead:1_000_000});
 const items=await Promise.all(page.page.map(async row=>({id:row._id,kind:'revision' as const,state:row._id!==latest?._id?'superseded' as const:sale.status==='cancelled'?'reversed' as const:'current' as const,...paymentSnapshot(row.payment,'received'),changedAt:row.createdAt,actorLabel:await paymentActor(ctx,row.ownerId),previous:paymentSnapshot(row.previousPayment,row.previousPaymentStatus)})));
 if(!first)return {...header,items:[initialRow],nextCursor:null,isDone:true};
 return {...header,items,nextCursor:nextHistoryCursor(sale._id,size,page.isDone?null:page.continueCursor,page.isDone?'initial':'rows'),isDone:false};
}});
