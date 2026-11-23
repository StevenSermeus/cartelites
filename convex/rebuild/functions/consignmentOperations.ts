import {mutation} from './itemActivity';
import {v} from 'convex/values';
import {query,type QueryCtx} from './_generated/server';
import type {Id} from './_generated/dataModel';
import {actor,audit,integer,metadata,operation,timestamp,depositorBalance} from './domain';
import {consignmentRecord,balanceRecord,itemRecord} from './compat';
import {recordPayout} from './transactions';
export function splitConsignmentPrice(price:number,rate:number){integer(price,'PRICE');integer(rate,'COMMISSION');if(rate>10000)throw new Error('INVALID_COMMISSION');const commissionCents=Number((BigInt(price)*BigInt(rate)+5000n)/10000n);return {commissionCents,depositorAmountCents:price-commissionCents};}
export const createConsignment=mutation({
  args: {
    operationId: v.string(),
    sellerId: v.id('contacts'),
    occurredAt: v.number(),
    reference: v.string(),
    notes: v.optional(v.string()),
    flowVersion: v.optional(v.literal(2)),
    contractTerms: v.optional(v.object({ version: v.string(), text: v.string() })),
    dueAt: v.optional(v.number()),
    items: v.array(
      v.object({
        operationId: v.string(),
        name: v.string(),
        productType: v.union(v.literal('card'), v.literal('sealed'), v.literal('other')),
        description: v.optional(v.string()),
        series: v.optional(v.string()),
        identifier: v.optional(v.string()),
        tcg: v.optional(v.union(v.literal('pokemon'), v.literal('riftbound'), v.literal('other'))),
        language: v.optional(v.union(v.literal('fr'), v.literal('en'), v.literal('ja'), v.literal('zh'))),
        condition: v.optional(
          v.union(
            v.literal('M'),
            v.literal('NM'),
            v.literal('EX'),
            v.literal('GD'),
            v.literal('LP'),
            v.literal('PL'),
            v.literal('PO'),
          ),
        ),
        gradingCompany: v.optional(
          v.string(),
        ),
        gradingGrade: v.optional(v.string()),
        gradingCertificate: v.optional(v.string()),
        gradingNotes: v.optional(v.string()),
        askingPriceCents: v.number(),
        commissionRateBps: v.number(),
      }),
    ),
  },
 handler:async(ctx,args)=>{
  const by=await actor(ctx,true),op=await operation(ctx,by,args.operationId,'create-consignment',args);if(op.previous)return {consignmentId:op.previous.results[0].id,itemIds:op.previous.results.slice(1).map(r=>r.id)};
  if(!await ctx.db.get(args.sellerId))throw new Error('SELLER_NOT_FOUND');timestamp(args.occurredAt);if(args.dueAt!==undefined){timestamp(args.dueAt);if(args.dueAt<args.occurredAt)throw new Error('INVALID_DATE');}
  if(!args.reference.trim()||!args.items.length||args.items.length>200||new Set(args.items.map(i=>i.operationId)).size!==args.items.length)throw new Error('INVALID_CONSIGNMENT');
  if(!args.contractTerms?.version.trim()||!args.contractTerms.text.trim()||args.contractTerms.text.length>10000)throw new Error('CONTRACT_TERMS_REQUIRED');
  const consignmentId=await ctx.db.insert('consignments',{...metadata(by),depositorId:args.sellerId,reference:args.reference,occurredAt:args.occurredAt,dueAt:args.dueAt,notes:args.notes,status:'open'});
  const revisionId=await ctx.db.insert('consignmentRevisions',{...metadata(by),consignmentId,number:1,contractText:args.contractTerms.text,contractVersion:args.contractTerms.version,signatureState:'awaiting_signature'});
  await ctx.db.patch(consignmentId,{currentRevisionId:revisionId});const stockOperationId=await ctx.db.insert('stockOperations',{...metadata(by),kind:'acquisition',occurredAt:args.occurredAt,source:{table:'consignments',id:consignmentId}}),itemIds:Id<'stockItems'>[]=[];
  for(const input of args.items){
   if(!input.name.trim()||!input.operationId)throw new Error('INVALID_ITEM');integer(input.askingPriceCents,'PRICE');integer(input.commissionRateBps,'COMMISSION');if(input.commissionRateBps>10000)throw new Error('INVALID_COMMISSION');
   const productId=await ctx.db.insert('products',{...metadata(by),type:input.productType,name:input.name.trim(),description:input.description??'',tcg:input.tcg,set:input.series,printedIdentifier:input.identifier,language:input.language});
   const id=await ctx.db.insert('stockItems',{...metadata(by),productId,tracking:'individual',condition:input.condition,askingPriceCents:input.askingPriceCents,visible:false,status:'available',quantity:1,origin:'consignment'});
   await ctx.db.insert('consignmentTerms',{...metadata(by),revisionId,stockItemId:id,agreedPriceCents:input.askingPriceCents,commissionRateBps:input.commissionRateBps});
   const lotId=await ctx.db.insert('stockLots',{...metadata(by),stockItemId:id,source:{kind:'consignment',consignmentId,depositorId:args.sellerId},originalQuantity:1,remainingQuantity:1,originalCostCents:null,remainingCostCents:null,acquiredAt:args.occurredAt,taxRateBps:null,openingBalanceOnly:false});
   await ctx.db.insert('stockMovements',{...metadata(by),operationId:stockOperationId,lotId,quantityDelta:1,costDeltaCents:null});
   if(input.gradingCompany){const name=input.gradingCompany.trim(),normalizedName=name.normalize('NFKC').toLocaleLowerCase('en');if(!name||!input.gradingGrade?.trim())throw new Error('INVALID_GRADING');const company=await ctx.db.query('gradingCompanies').withIndex('by_name',q=>q.eq('normalizedName',normalizedName)).unique();if(company?.archivedAt!==undefined)throw new Error('GRADING_COMPANY_ARCHIVED');const companyId=company?._id??await ctx.db.insert('gradingCompanies',{...metadata(by),name,normalizedName});await ctx.db.insert('itemGradings',{...metadata(by),stockItemId:id,companyId,grade:input.gradingGrade.trim(),certificate:input.gradingCertificate,notes:input.gradingNotes});}
   itemIds.push(id);
  }
  await op.record([{table:'consignments',id:consignmentId},...itemIds.map(id=>({table:'stockItems' as const,id}))]);await audit(ctx,by,{table:'consignments',id:consignmentId},'consignment.created',{revisionId});return {consignmentId,itemIds};
 }});
export const consignmentHistory=query({args:{},handler:async ctx=>{await actor(ctx);return Promise.all((await ctx.db.query('consignments').withIndex('by_date').order('desc').collect()).map(d=>consignmentRecord(ctx,d)));}});
export async function readBalances(ctx:QueryCtx){
 const balances=[];for(const contact of await ctx.db.query('contacts').collect()){const row=await balanceRecord(ctx,contact);if(row.hasDeposits)balances.push(row);}
 const payments=await Promise.all((await ctx.db.query('depositorPayouts').collect()).sort((a,b)=>b.occurredAt-a.occurredAt).map(async p=>({...p,sellerId:p.depositorId,sellerName:(await ctx.db.get(p.depositorId))?.name??''})));return {balances,payments};
}
export const consignmentBalances=query({args:{},handler:async ctx=>{await actor(ctx);return readBalances(ctx);}});
export const recordConsignmentPayment=mutation({args:{operationId:v.string(),sellerId:v.id('contacts'),amountCents:v.number(),occurredAt:v.number(),method:v.string(),reference:v.optional(v.string())},handler:async(ctx,args)=>recordPayout.run(ctx,{operationId:args.operationId,depositorId:args.sellerId,amountCents:args.amountCents,occurredAt:args.occurredAt,method:args.method,reference:args.reference})});
export const returnConsignmentItem=mutation({args:{operationId:v.string(),itemId:v.id('stockItems'),occurredAt:v.number()},handler:async(ctx,args)=>{await actor(ctx,true);const item=await ctx.db.get(args.itemId);if(item?.origin!=='consignment')throw new Error('CONSIGNMENT_ITEM_NOT_FOUND');throw new Error('RETURN_SIGNATURE_REQUIRED');}});
export const updateConsignmentTerms=mutation({args:{operationId:v.string(),itemId:v.id('stockItems'),askingPriceCents:v.number(),commissionRateBps:v.number(),authorizationNote:v.string()},handler:async(ctx,args)=>{
 const by=await actor(ctx,true),op=await operation(ctx,by,args.operationId,'consignment-terms',args);if(op.previous)return args.itemId;
 const item=await ctx.db.get(args.itemId);if(!item||item.origin!=='consignment')throw new Error('CONSIGNMENT_ITEM_NOT_FOUND');if(item.status!=='available'||item.quantity<1)throw new Error('ITEM_UNAVAILABLE');integer(args.askingPriceCents,'PRICE');integer(args.commissionRateBps,'COMMISSION');if(args.commissionRateBps>10000)throw new Error('INVALID_COMMISSION');if(!args.authorizationNote.trim())throw new Error('AUTHORIZATION_REQUIRED');
 const lot=await ctx.db.query('stockLots').withIndex('by_item_fifo',q=>q.eq('stockItemId',item._id)).first();if(lot?.source.kind!=='consignment')throw new Error('CONSIGNMENT_ITEM_NOT_FOUND');const dossier=await ctx.db.get(lot.source.consignmentId),prior=dossier?.currentRevisionId?await ctx.db.get(dossier.currentRevisionId):null;if(!dossier||!prior)throw new Error('CONSIGNMENT_NOT_FOUND');
 const revisionId=await ctx.db.insert('consignmentRevisions',{...metadata(by),consignmentId:dossier._id,number:prior.number+1,contractText:prior.contractText,contractVersion:prior.contractVersion,signatureState:'awaiting_signature',authorizationNote:args.authorizationNote.trim()});
 for(const terms of await ctx.db.query('consignmentTerms').withIndex('by_revision_item',q=>q.eq('revisionId',prior._id)).collect())await ctx.db.insert('consignmentTerms',{...metadata(by),revisionId,stockItemId:terms.stockItemId,agreedPriceCents:terms.stockItemId===item._id?args.askingPriceCents:terms.agreedPriceCents,commissionRateBps:terms.stockItemId===item._id?args.commissionRateBps:terms.commissionRateBps});
 await ctx.db.patch(dossier._id,{currentRevisionId:revisionId,revision:(dossier.revision??1)+1,updatedAt:Date.now(),updatedBy:by});await ctx.db.patch(item._id,{askingPriceCents:args.askingPriceCents,revision:(item.revision??1)+1,updatedAt:Date.now(),updatedBy:by});await op.record([{table:'stockItems',id:item._id}]);await audit(ctx,by,{table:'stockItems',id:item._id},'consignment.terms',{previousRevisionId:prior._id,revisionId,...args});return item._id;
}});
