import {v} from 'convex/values';
import {paginationOptsValidator} from 'convex/server';
import {query} from './_generated/server';
import {stockOwner,integer,planConsumption} from './stockLedger';
export const products=query({args:{paginationOpts:paginationOptsValidator},handler:async(ctx,args)=>{
 await stockOwner(ctx);return ctx.db.query('items').filter(q=>q.eq(q.field('origin'),'supplier')).order('desc').paginate(args.paginationOpts);
}});
export const openings=query({args:{paginationOpts:paginationOptsValidator},handler:async(ctx,args)=>{
 await stockOwner(ctx);const page=await ctx.db.query('stockOpenings').order('desc').paginate(args.paginationOpts);
 return {...page,page:await Promise.all(page.page.map(async row=>({...row,itemName:(await ctx.db.get(row.sourceId))?.name??'Article archivé'})))};
}});
export const openPreview=query({args:{itemId:v.id('items'),quantity:v.number(),packSize:v.number(),occurredAt:v.optional(v.number())},handler:async(ctx,args)=>{
 await stockOwner(ctx);integer(args.quantity,1,100000);integer(args.packSize,1,1000);
 const item=await ctx.db.get(args.itemId);if(!item||item.format!=='display') throw new Error('INVALID_DISPLAY');
 const allocations=await planConsumption(ctx,item,args.quantity,args.occurredAt??Date.now());
 const totalCostCents=allocations.reduce((n,a)=>n+a.costCents,0),boosterQuantity=args.quantity*args.packSize;
 const parts=new Map<number,number>();
 for(const a of allocations){const quantity=a.quantity*args.packSize,low=Math.floor(a.costCents/quantity),highCount=a.costCents%quantity;parts.set(low,(parts.get(low)??0)+quantity-highCount);if(highCount)parts.set(low+1,(parts.get(low+1)??0)+highCount);}
 return {...args,boosterQuantity,totalCostCents,allocations,costParts:[...parts].filter(([,quantity])=>quantity>0).sort(([a],[b])=>a-b).map(([unitCostCents,quantity])=>({quantity,unitCostCents}))};
}});
const documentKinds = v.union(v.literal('all'),v.literal('receipt'),v.literal('consignment'),v.literal('ticket'));
export const documents=query({args:{kind:documentKinds,cursor:v.optional(v.string()),search:v.optional(v.string()),status:v.optional(v.string()),from:v.optional(v.number()),to:v.optional(v.number())},handler:async(ctx,args)=>{
 await stockOwner(ctx);
 if ((args.search?.length??0)>200 || (args.from!==undefined&&args.to!==undefined&&args.from>args.to)) throw new Error('INVALID_QUERY');
 let position=0, cursor:string|null=null;
 const criteria={kind:args.kind,search:args.search??'',status:args.status??'all',from:args.from??null,to:args.to??null};
 const signature=JSON.stringify(criteria);
 if(args.cursor){try{const decoded=JSON.parse(args.cursor);if(decoded.signature!==signature||!Number.isInteger(decoded.position)||decoded.position<0||decoded.position>2||typeof decoded.cursor!=='string') throw new Error();position=decoded.position;cursor=decoded.cursor||null;}catch{throw new Error('INVALID_CURSOR');}}
 const kinds=args.kind==='all'?['receipt','consignment','ticket']:[args.kind];const kind=kinds[position];if(!kind)throw new Error('INVALID_CURSOR');
 // One bounded database page per request. Continuations scan every record, including empty filtered pages.
 const table=kind==='receipt'?'signedReceipts':kind==='consignment'?'consignmentDocuments':'saleTickets';
 const page=await ctx.db.query(table).order('desc').paginate({numItems:25,cursor});
 const items=await Promise.all(page.page.map(async row=>{
  const snapshot=row.snapshot as {reference?:string}|null;
  let version:number|undefined;
  if ('targetId' in row) {
   const siblings=await ctx.db.query('signedReceipts').withIndex('by_target',q=>q.eq('kind',row.kind).eq('targetId',row.targetId)).order('asc').take(1000);
   const index=siblings.findIndex(s=>s._id===row._id);if(index>=0)version=index+1;
  }
  const emails = 'anchorId' in row ? (await ctx.db.query('ticketEmails').withIndex('by_ticket',q=>q.eq('ticketId',row._id)).order('desc').take(20)).map(e=>({status:e.status,createdAt:e.createdAt,recipient:e.recipient})) : 'emailAttemptAt' in row && row.emailAttemptAt ? [{status:row.emailStatus??'unknown',createdAt:row.emailAttemptAt,error:row.emailError}] : [];
  return {
   id:row._id,kind,documentKind:'kind' in row?row.kind:'ticket',reference:snapshot?.reference??row._id,version,
   createdAt:row.createdAt,signedAt:'signedAt' in row?row.signedAt:undefined,status:row.objectKey?'archived':('signedAt' in row&&row.signedAt?'signed':'prepared'),
   filename:row.filename,targetId:'targetId' in row?row.targetId:undefined,emailStatus:'emailStatus' in row?row.emailStatus:emails[0]?.status,
   emails,emailHistoryScope:'anchorId' in row?'recent':'latest',
   downloadPath:row.objectKey?(kind==='receipt'?`/receipts/${row._id}/pdf`:kind==='ticket'?`/sale-tickets/${row._id}/pdf`:`/consignments/documents/${row._id}/pdf`):undefined,
   emailPath:row.objectKey&&kind!=='consignment'?(kind==='receipt'?`/receipts/${row._id}/email`:`/sale-tickets/${row._id}/email`):undefined};
 }));
 const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
 const words=normalize(args.search??'').trim().split(/\s+/).filter(Boolean);
 const filtered=items.filter(row=>(!args.status||args.status==='all'||row.status===args.status)&&
  (args.from===undefined||row.createdAt>=args.from)&&(args.to===undefined||row.createdAt<=args.to)&&
  words.every(word=>normalize(`${row.reference} ${row.filename??''} ${row.documentKind}`).includes(word)));
 const isDone=page.isDone&&position===kinds.length-1;
 return {items:filtered,isDone,nextCursor:isDone?null:JSON.stringify({signature,position:page.isDone?position+1:position,cursor:page.isDone?'':page.continueCursor})};
}});
