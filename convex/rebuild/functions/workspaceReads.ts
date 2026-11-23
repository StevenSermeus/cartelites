import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { query } from './_generated/server';
import { actor, fifo, integer, timestamp } from './domain';
import { itemRecord } from './compat';
import { stockOperationRecord } from './inventory';
function boundedPage(options:{numItems:number;cursor:string|null}){
 if(!Number.isInteger(options.numItems)||options.numItems<1||options.numItems>50)throw new Error('INVALID_PAGINATION');
 if((options.cursor?.length??0)>10000)throw new Error('INVALID_CURSOR');
 return {numItems:options.numItems,cursor:options.cursor,maximumRowsRead:250,maximumBytesRead:2_000_000};
}
export const products=query({args:{paginationOpts:paginationOptsValidator},handler:async(ctx,args)=>{
  await actor(ctx);const page=await ctx.db.query('stockItems').filter(q=>q.eq(q.field('origin'),'supplier')).order('desc').paginate(boundedPage(args.paginationOpts));
  return {...page,page:await Promise.all(page.page.map(item=>itemRecord(ctx,item)))};
}});
export const openings=query({args:{paginationOpts:paginationOptsValidator},handler:async(ctx,args)=>{
  await actor(ctx);const page=await ctx.db.query('stockOperations').filter(q=>q.eq(q.field('kind'),'display-opening')).order('desc').paginate(boundedPage(args.paginationOpts));
  return {...page,page:await Promise.all(page.page.map(row=>stockOperationRecord(ctx,row)))};
}});
export const openPreview=query({args:{itemId:v.id('stockItems'),quantity:v.number(),packSize:v.number(),occurredAt:v.optional(v.number())},handler:async(ctx,args)=>{
  await actor(ctx);integer(args.quantity,'QUANTITY',1);integer(args.packSize,'PACK_SIZE',1);if(args.quantity>10000||args.packSize>1000)throw new Error('INVALID_INVENTORY');
  const item=await ctx.db.get(args.itemId),product=item?await ctx.db.get(item.productId):null;if(!item||item.origin!=='supplier'||product?.format!=='display')throw new Error('INVALID_DISPLAY');
  const occurredAt=args.occurredAt??Date.now();timestamp(occurredAt);const plan=await fifo(ctx,item,args.quantity,occurredAt),boosterQuantity=integer(args.quantity*args.packSize,'QUANTITY');
  const parts=new Map<number,number>();
  for(const a of plan.allocations){if(a.costCents===null)continue;const quantity=a.quantity*args.packSize,low=Math.floor(a.costCents/quantity),highCount=a.costCents%quantity;parts.set(low,(parts.get(low)??0)+quantity-highCount);if(highCount)parts.set(low+1,(parts.get(low+1)??0)+highCount);}
  const costParts=[...parts].filter(([,quantity])=>quantity>0).sort(([a],[b])=>a-b).map(([unitCostCents,quantity])=>({quantity,unitCostCents}));
  return {...args,boosterQuantity,totalCostCents:plan.costCents,allocations:plan.allocations.map(a=>({lotId:a.lot._id,quantity:a.quantity,costCents:a.costCents})),costParts};
}});
const kinds=v.union(v.literal('all'),v.literal('receipt'),v.literal('consignment'),v.literal('ticket'));
export const documents=query({args:{kind:kinds,cursor:v.optional(v.string()),search:v.optional(v.string()),status:v.optional(v.string()),from:v.optional(v.number()),to:v.optional(v.number())},handler:async(ctx,args)=>{
  await actor(ctx);if((args.search?.length??0)>200||(args.from!==undefined&&args.to!==undefined&&args.from>args.to))throw new Error('INVALID_QUERY');
  if(args.from!==undefined)timestamp(args.from);if(args.to!==undefined)timestamp(args.to);
  if((args.cursor?.length??0)>10000)throw new Error('INVALID_CURSOR');
  const signature=JSON.stringify({kind:args.kind,search:args.search??'',status:args.status??'all',from:args.from??null,to:args.to??null});let cursor:string|null=null;
  if(args.cursor){try{const parsed=JSON.parse(args.cursor);if(parsed.signature!==signature||typeof parsed.cursor!=='string')throw new Error();cursor=parsed.cursor;}catch{throw new Error('INVALID_CURSOR');}}
  const result=await ctx.db.query('documents').withIndex('by_date',q=>args.from!==undefined?(args.to!==undefined?q.gte('createdAt',args.from).lte('createdAt',args.to):q.gte('createdAt',args.from)):args.to!==undefined?q.lte('createdAt',args.to):q)
   .filter(q=>q.and(args.kind==='all'?q.eq(1,1):args.kind==='ticket'?q.eq(q.field('kind'),'sale_ticket'):args.kind==='consignment'?q.or(q.eq(q.field('kind'),'statement'),q.eq(q.field('kind'),'payment')):q.or(q.eq(q.field('kind'),'purchase'),q.eq(q.field('kind'),'consignment'),q.eq(q.field('kind'),'consignment_return')),!args.status||args.status==='all'?q.eq(1,1):q.eq(q.field('status'),args.status)))
   .order('desc').paginate({numItems:25,cursor,maximumRowsRead:250,maximumBytesRead:2_000_000});
  const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr'),words=normalize(args.search??'').trim().split(/\s+/).filter(Boolean);
  const items=[];
  for(const doc of result.page){
    const kind=doc.kind==='sale_ticket'?'ticket':doc.kind==='statement'||doc.kind==='payment'?'consignment':'receipt';
    if(args.kind!=='all'&&kind!==args.kind)continue;if(args.status&&args.status!=='all'&&doc.status!==args.status)continue;
    if((args.from!==undefined&&doc.createdAt<args.from)||(args.to!==undefined&&doc.createdAt>args.to))continue;
    const file=doc.pdfFileId?await ctx.db.get(doc.pdfFileId):null;let reference=String(doc._id);
    // Only a human reference crosses this boundary; snapshots contain signatures and private business evidence.
    try { const snapshot=JSON.parse(doc.inputSnapshot.json);if(typeof snapshot.reference==='string')reference=snapshot.reference; } catch {}
    if(!words.every(word=>normalize(`${reference} ${file?.filename??''} ${doc.kind}`).includes(word)))continue;
    const firstLink=await ctx.db.query('documentLinks').withIndex('by_document',q=>q.eq('documentId',doc._id)).first();
    const emails=await ctx.db.query('emailDeliveries').withIndex('by_document',q=>q.eq('documentId',doc._id)).order('desc').take(20);
    const archived=file?.uploadState==='complete';const base=kind==='ticket'?'/sale-tickets':kind==='consignment'?'/consignments/documents':'/receipts';
    items.push({id:doc._id,kind,documentKind:doc.kind,reference,version:doc.version,createdAt:doc.createdAt,signedAt:doc.signedAt,status:doc.status,filename:file?.filename,targetId:firstLink?.target.id,emailStatus:emails[0]?.state,emails:emails.map(e=>({status:e.state,createdAt:e.attemptAt,recipient:e.recipient,error:e.error})),emailHistoryScope:'recent',downloadPath:archived?`${base}/${doc._id}/pdf`:undefined,emailPath:archived&&kind!=='consignment'?`${base}/${doc._id}/email`:undefined});
  }
  return {items,isDone:result.isDone,nextCursor:result.isDone?null:JSON.stringify({signature,cursor:result.continueCursor})};
}});
