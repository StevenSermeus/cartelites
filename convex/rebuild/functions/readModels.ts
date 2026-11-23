import { itemTcg, matchesSeries, seriesOptions, type SeriesItem } from '../../../packages/domain/src/seriesFilter';
import {v} from 'convex/values';
import {query,type QueryCtx} from './_generated/server';
import type {Doc,TableNames} from './_generated/dataModel';
import {actor,timestamp} from './domain';
import {consignmentEventRecord} from './consignmentEvents';
import {itemRecord,purchaseRecord,saleRecord,consignmentRecord,balanceRecord} from './compat';
import {publicShopConfig} from '../../../apps/api/src/generated/publicShopConfig';
const tables={sellers:'contacts',stock:'stockItems',sales:'sales',purchases:'purchases',consignments:'consignments',balances:'contacts',conflicts:'saleConflicts',payments:'depositorPayouts',attachments:'files',events:'auditEvents'} as const;
type Resource=keyof typeof tables;type Row=Record<string,unknown>;
const normalize=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
function resourceOf(value:string):Resource{if(!Object.hasOwn(tables,value))throw new Error('INVALID_RESOURCE');return value as Resource;}
async function enrich(ctx:QueryCtx,resource:Resource,record:unknown):Promise<Row>{
 if(resource==='events')return await consignmentEventRecord(ctx,record as Doc<'auditEvents'>)??{};
 if(resource==='stock')return itemRecord(ctx,record as Doc<'stockItems'>);
 if(resource==='sales')return await saleRecord(ctx,record as Doc<'sales'>)??{};
 if(resource==='purchases')return purchaseRecord(ctx,record as Doc<'purchases'>);
 if(resource==='consignments')return consignmentRecord(ctx,record as Doc<'consignments'>);
 if(resource==='balances')return balanceRecord(ctx,record as Doc<'contacts'>);
 if(resource==='payments'){const p=record as Doc<'depositorPayouts'>;return {...p,sellerId:p.depositorId,sellerName:(await ctx.db.get(p.depositorId))?.name??''};}
 if(resource==='conflicts'){const c=record as Doc<'saleConflicts'>,item=await ctx.db.get(c.stockItemId),product=item?await ctx.db.get(item.productId):null;return {...c,itemId:c.stockItemId,itemName:product?.name??''};}
 return record as Row;
}
const text=v.optional(v.string()),filterArgs={resource:v.string(),size:v.optional(v.number()),cursor:text,search:text,status:text,origin:text,visibility:text,sellerId:text,purchaseId:text,consignmentId:text,itemId:text,from:v.optional(v.number()),to:v.optional(v.number()),paymentStatus:text,productType:text,tcg:v.optional(v.union(v.literal('all'),v.literal('pokemon'),v.literal('riftbound'),v.literal('other'))),series:text,gradingStatus:text,gradingCompany:text,gradingText:text};
export const browse=query({args:filterArgs,handler:async(ctx,args)=>{
 await actor(ctx);const resource=resourceOf(args.resource),size=args.size??25;if(!Number.isInteger(size)||size<1||size>50||(args.search?.length??0)>200||(args.series?.length??0)>300||(args.from!==undefined&&args.to!==undefined&&args.from>args.to))throw new Error('INVALID_PAGINATION');
 if((args.cursor?.length??0)>10000)throw new Error('INVALID_CURSOR');
 for(const value of [args.search,args.status,args.origin,args.visibility,args.sellerId,args.purchaseId,args.consignmentId,args.itemId,args.paymentStatus,args.productType,args.gradingStatus,args.gradingCompany,args.gradingText])if((value?.length??0)>500)throw new Error('INVALID_PAGINATION');
 if(args.from!==undefined)timestamp(args.from);if(args.to!==undefined)timestamp(args.to);
 const {cursor,...criteria}=args,signature=JSON.stringify(criteria);let continuation:string|null=null;
 if(cursor){try{const saved=JSON.parse(cursor);if(saved.signature!==signature||typeof saved.value!=='string')throw new Error();continuation=saved.value;}catch{throw new Error('INVALID_CURSOR');}}
 const options={cursor:continuation,numItems:resource==='sales'?Math.min(size,5):size,maximumRowsRead:250,maximumBytesRead:2_000_000};
 let raw;let rows:Row[];
 if(resource==='stock'&&args.purchaseId){
  const id=ctx.db.normalizeId('purchases',args.purchaseId);if(!id)throw new Error('INVALID_FILTER');
  const purchase=await ctx.db.get(id),contact=purchase?await ctx.db.get(purchase.contactId):null;
  raw=await ctx.db.query('purchaseLines').withIndex('by_purchase',q=>q.eq('purchaseId',id)).filter(q=>q.eq(q.field('removedAt'),undefined)).order('desc').paginate(options);
  rows=(await Promise.all(raw.page.map(async line=>{const item=await ctx.db.get(line.stockItemId);return item?{...await itemRecord(ctx,item),purchaseId:id,purchaseReference:purchase?.reference??'',purchaseOccurredAt:purchase?.occurredAt,sourceStatus:purchase?.status,sellerId:purchase?.contactId,sellerName:contact?.name??'',purchasePriceCents:line.costCents}:null;}))).filter(row=>row!==null);
 }else if(resource==='stock'&&args.consignmentId){
  const id=ctx.db.normalizeId('consignments',args.consignmentId);if(!id)throw new Error('INVALID_FILTER');const dossier=await ctx.db.get(id);
  if(!dossier?.currentRevisionId)return {items:[],nextCursor:null,isDone:true};
  raw=await ctx.db.query('consignmentTerms').withIndex('by_revision_item',q=>q.eq('revisionId',dossier.currentRevisionId!)).order('desc').paginate(options);
  rows=(await Promise.all(raw.page.map(async term=>{const item=await ctx.db.get(term.stockItemId);return item?await itemRecord(ctx,item):null;}))).filter(row=>row!==null);
 }else{
  if(resource==='stock'&&(!args.status||args.status==='available'))raw=await ctx.db.query('stockItems').withIndex('by_status',q=>q.eq('status','available')).order('desc').paginate(options);
  else if(resource==='events')raw=await ctx.db.query('auditEvents').filter(q=>q.or(q.eq(q.field('action'),'consignment.return'),q.eq(q.field('action'),'consignment.terms'),q.eq(q.field('action'),'legacy-import:consignmentEvents'))).order('desc').paginate(options);
  else raw=await ctx.db.query(tables[resource]).order('desc').paginate(options);
  rows=await Promise.all(raw.page.map(row=>enrich(ctx,resource,row)));
 }
 const words=normalize(args.search).trim().split(/\s+/).filter(Boolean);
 const items=rows.filter(row=>{
  if(resource==='stock'&&!args.purchaseId&&!args.consignmentId){
   if(row.sourceStatus!=='active')return false;
   if((!args.status||args.status==='available')&&(row.contractPending||Number(row.quantity)<=0))return false;
  }
  if(resource==='stock'&&((args.tcg&&args.tcg!=='all'&&itemTcg(row as SeriesItem)!==args.tcg)||!matchesSeries(row as SeriesItem,args.series)))return false;
  if(resource==='balances'&&!row.hasDeposits)return false;
  if(resource==='events'&&!row.kind)return false;
  if(args.sellerId&&String(row.sellerId??(resource==='sellers'?row._id:''))!==args.sellerId)return false;
  if(args.itemId&&String(resource==='stock'?row._id:row.itemId)!==args.itemId)return false;
  if(args.purchaseId&&String(row.purchaseId)!==args.purchaseId)return false;
  if(args.consignmentId&&String(row.consignmentId)!==args.consignmentId)return false;
  if(args.origin&&args.origin!=='all'&&!(resource==='sales'&&Array.isArray(row.origins)?row.origins.includes(args.origin):row.origin===args.origin))return false;
  if(args.visibility==='hidden'&&!row.hiddenFromCatalogue||args.visibility==='visible'&&row.hiddenFromCatalogue)return false;
  if(args.productType&&args.productType!=='all'&&row.productType!==args.productType)return false;
  if(args.gradingStatus==='graded'&&!row.gradingCompany||args.gradingStatus==='ungraded'&&!!row.gradingCompany)return false;
  if(args.gradingCompany&&args.gradingCompany!=='all'&&row.gradingCompany!==args.gradingCompany)return false;
  if(args.gradingText&&!normalize([row.gradingGrade,row.gradingCertificate,row.gradingNotes].join(' ')).includes(normalize(args.gradingText)))return false;
  if(args.paymentStatus&&args.paymentStatus!=='all'&&(row.paymentStatus??'unknown')!==args.paymentStatus)return false;
  const status=args.status??(resource==='conflicts'?'open':'all');if(status!=='all'){
   if(resource==='balances'){const value=Number(row.balanceCents);if(status==='due'&&value<=0||status==='settled'&&value!==0||status==='regularization'&&value>=0)return false;}else if(row.status!==status)return false;
  }
  const date=Number(row.occurredAt??row.purchaseOccurredAt??row.createdAt);if((args.from!==undefined||args.to!==undefined)&&!Number.isFinite(date))return false;if(args.from!==undefined&&date<args.from||args.to!==undefined&&date>args.to)return false;
  const haystack=normalize([row._id,row.name,row.email,row.phone,row.address,row.reference,row.sellerName,row.itemName,row.series,row.identifier,row.gradingCertificate,row.purchaseReference,resource==='sales'&&Array.isArray(row.lines)?row.lines.map((line:any)=>[line.description,line.productSnapshot?.set,line.productSnapshot?.identifier,line.productSnapshot?.gradingCertificate].join(' ')).join(' '):''].join(' '));return words.every(word=>haystack.includes(word));
 });return {items,nextCursor:raw.isDone?null:JSON.stringify({signature,value:raw.continueCursor}),isDone:raw.isDone};
}});
export const record=query({args:{resource:v.string(),id:v.string()},handler:async(ctx,args)=>{await actor(ctx);const resource=resourceOf(args.resource),id=ctx.db.normalizeId(tables[resource],args.id);if(!id)return null;const value=await ctx.db.get(id);return value?enrich(ctx,resource,value):null;}});
/** Exact one-snapshot aggregation. Table reads replace per-sale/per-contact fan-out;
 * full-ledger row/byte limits still apply, so this must never be silently capped. */
export const dashboardSummary=query({args:{},handler:async ctx=>{
 await actor(ctx);
 const summary={purchaseCents:0,salesCents:0,pendingCents:0,unknownCents:0,cashCents:0,transferCents:0,giftLossCents:0,giftCount:0,unknownGiftCostCount:0,unknownCostCount:0,cashAfterPurchasesCents:0,gains:0,losses:0,commissions:0,consignmentSales:0,net:0,purchaseCount:0,saleCount:0,dueCents:0,regularizationCents:0};
 const byTcg=[{key:'pokemon',label:'Pokémon',stockCount:0,marginCents:0},{key:'riftbound',label:'Riftbound',stockCount:0,marginCents:0},{key:'other',label:'Autres / non renseignés',stockCount:0,marginCents:0}],byOrigin=[{key:'purchase',label:'Achat-revente',stockCount:0,marginCents:0},{key:'consignment',label:'Dépôt-vente',stockCount:0,marginCents:0}];
 const add=(a:number,b:number)=>{const value=a+b;if(!Number.isSafeInteger(value))throw new Error('AMOUNT_OVERFLOW');return value;};
 const days=new Map<string,{key:string;purchases:number;sales:number;gains:number;losses:number}>();
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:publicShopConfig.timezone,year:'numeric',month:'2-digit',day:'2-digit'});
 const bucket=(date:number)=>{const key=formatter.format(date);if(!days.has(key))days.set(key,{key,purchases:0,sales:0,gains:0,losses:0});return days.get(key)!;};
 const [items,products,purchases,purchaseLines,sales,saleLines,payments,stockOperations,contacts,consignments,payouts]=await Promise.all([
  ctx.db.query('stockItems').collect(),ctx.db.query('products').collect(),ctx.db.query('purchases').collect(),ctx.db.query('purchaseLines').collect(),
  ctx.db.query('sales').collect(),ctx.db.query('saleLines').collect(),ctx.db.query('salePayments').collect(),ctx.db.query('stockOperations').collect(),
  ctx.db.query('contacts').collect(),ctx.db.query('consignments').collect(),ctx.db.query('depositorPayouts').collect(),
 ]);
 const productMap=new Map(products.map(p=>[p._id,p])),itemMap=new Map(items.map(item=>[item._id,item]));
 const activePurchases=new Map(purchases.filter(p=>p.status==='active').map(p=>[p._id,p])),confirmedSales=new Map(sales.filter(s=>s.status==='confirmed').map(s=>[s._id,s]));
 const group=(item:Doc<'stockItems'>)=>byTcg.find(g=>g.key===(productMap.get(item.productId)?.tcg??'other'))??byTcg[2];
 for(const item of items)if(item.status==='available'&&item.quantity>0){const tcg=group(item),origin=byOrigin[item.origin==='consignment'?1:0];tcg.stockCount=add(tcg.stockCount,item.quantity);origin.stockCount=add(origin.stockCount,item.quantity);}
 summary.purchaseCount=activePurchases.size;summary.saleCount=confirmedSales.size;
 for(const line of purchaseLines){const purchase=activePurchases.get(line.purchaseId);if(!purchase||line.removedAt!==undefined)continue;
  if(line.costCents===null){summary.unknownCostCount++;continue;}
  summary.purchaseCents=add(summary.purchaseCents,line.costCents);const day=bucket(purchase.occurredAt);day.purchases=add(day.purchases,line.costCents);
 }
 for(const payment of payments)if(payment.status==='active'&&confirmedSales.has(payment.saleId)){summary.cashCents=add(summary.cashCents,payment.cashCents);summary.transferCents=add(summary.transferCents,payment.transferCents);}
 const balances=new Map<string,number>();
 for(const line of saleLines){const sale=confirmedSales.get(line.saleId);if(!sale)continue;
  if(line.paymentStatus==='received'){
   summary.salesCents=add(summary.salesCents,line.lineTotalCents);const day=bucket(sale.occurredAt);day.sales=add(day.sales,line.lineTotalCents);
   // Same eligibility as depositorBalance: only confirmed collected shares, independent of current terms.
   if(line.depositorId)balances.set(line.depositorId,add(balances.get(line.depositorId)??0,line.depositorAmountCents??0));
  }else if(line.paymentStatus==='pending')summary.pendingCents=add(summary.pendingCents,line.lineTotalCents);else summary.unknownCents=add(summary.unknownCents,line.lineTotalCents);
  const item=itemMap.get(line.stockItemId);if(!item)continue;
  const deposit=!!line.depositorId;if(!deposit&&line.costCents===null){summary.unknownCostCount++;continue;}
  const tax=line.taxRegime==='other'&&line.taxRateBps!==null?Number((BigInt(line.lineTotalCents)*BigInt(line.taxRateBps)+BigInt(10000+line.taxRateBps)/2n)/BigInt(10000+line.taxRateBps)):0;
  const margin=deposit?line.commissionCents??0:add(add(line.lineTotalCents,-tax),-line.costCents!);
  if(deposit){summary.commissions=add(summary.commissions,margin);summary.consignmentSales=add(summary.consignmentSales,line.lineTotalCents);}else{summary.gains=add(summary.gains,Math.max(0,margin));summary.losses=add(summary.losses,Math.max(0,-margin));}
  const tcg=group(item),origin=byOrigin[deposit?1:0],day=bucket(sale.occurredAt);tcg.marginCents=add(tcg.marginCents,margin);origin.marginCents=add(origin.marginCents,margin);day.gains=add(day.gains,Math.max(0,margin));day.losses=add(day.losses,Math.max(0,-margin));
 }
 const reversed=new Set(stockOperations.flatMap(op=>op.reversesId?[op.reversesId]:[]));
 for(const gift of stockOperations)if(gift.kind==='gift'&&!reversed.has(gift._id)){
  summary.giftCount++;let cost=gift.costCents??null;
  if(gift.costCents===undefined&&gift.historyComplete!==false){
   const movements=await ctx.db.query('stockMovements').withIndex('by_operation',q=>q.eq('operationId',gift._id)).collect();
   if(movements.length&&!movements.some(m=>m.costDeltaCents===null))cost=-movements.reduce((n,m)=>add(n,m.costDeltaCents!),0);
  }
  if(cost===null){summary.unknownGiftCostCount++;continue;}
  summary.giftLossCents=add(summary.giftLossCents,cost);summary.losses=add(summary.losses,cost);const day=bucket(gift.occurredAt);day.losses=add(day.losses,cost);
 }
 for(const payout of payouts)balances.set(payout.depositorId,add(balances.get(payout.depositorId)??0,-payout.amountCents));
 const depositors=new Set(consignments.map(dossier=>dossier.depositorId));
 for(const contact of contacts)if(depositors.has(contact._id)){const balance=balances.get(contact._id)??0;summary.dueCents=add(summary.dueCents,Math.max(0,balance));summary.regularizationCents=add(summary.regularizationCents,Math.max(0,-balance));}
 summary.cashAfterPurchasesCents=add(summary.salesCents,-summary.purchaseCents);summary.net=add(add(summary.gains,-summary.losses),summary.commissions);
 return {summary,byTcg,byOrigin,days:[...days.values()].filter(d=>Date.parse(d.key)>=Date.now()-366*86400000).sort((a,b)=>a.key.localeCompare(b.key))};
}});

export const stockSeries=query({args:{tcg:v.optional(v.string()),includeUnavailable:v.optional(v.boolean())},handler:async(ctx,args)=>{
 await actor(ctx);
 if(args.tcg&&!['all','pokemon','riftbound','other'].includes(args.tcg))throw new Error('INVALID_FILTER');
 if(args.includeUnavailable){const products=await ctx.db.query('products').collect();return seriesOptions(products.map(product=>({tcg:product.tcg,productType:product.type,series:product.set})),args.tcg);}
 const documents=new Map<string,Promise<unknown>>();
 const get=<T extends TableNames>(id:import('./_generated/dataModel').Id<T>):Promise<Doc<T>|null>=>{let value=documents.get(id);if(!value){value=ctx.db.get(id);documents.set(id,value);}return value as Promise<Doc<T>|null>;};
 const rows:SeriesItem[]=[];
 for await(const item of ctx.db.query('stockItems').withIndex('by_status',q=>q.eq('status','available'))){
  if(item.quantity<=0)continue;
  const lot=await ctx.db.query('stockLots').withIndex('by_item_fifo',q=>q.eq('stockItemId',item._id)).first();
  if(lot?.source.kind==='purchase'){
   const purchase=await get(lot.source.purchaseId),line=await get(lot.source.purchaseLineId);
   if(purchase?.status!=='active'||!line||line.removedAt!==undefined)continue;
  }else if(lot?.source.kind==='consignment'){
   const dossier=await get(lot.source.consignmentId),revision=dossier?.currentRevisionId?await get(dossier.currentRevisionId):null;
   if(!dossier||revision?.signatureState!=='signed')continue;
  }else if(item.origin!=='supplier')continue;
  const product=await get(item.productId);
  if(product)rows.push({tcg:product.tcg,productType:product.type,series:product.set});
 }
 return seriesOptions(rows,args.tcg);
}});
