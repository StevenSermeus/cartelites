import {internalMutation} from './itemActivity';
import {v} from 'convex/values';
import {internalQuery,type QueryCtx,type MutationCtx} from './_generated/server';
import type {Id} from './_generated/dataModel';
import {validSignature} from '../../../packages/domain/src/signature';
import {account,archiveDocument,claimDelivery,clean,completeDelivery,consent,createDocument,documentDto} from './documentStore';
import {purchaseRecord,consignmentRecord,itemRecord} from './compat';
import {canonicalJson} from './migrationReferences';
import {consume,metadata,audit} from './domain';
const kind=v.union(v.literal('purchase'),v.literal('consignment'),v.literal('consignment_return')),signature=v.array(v.array(v.array(v.number())));
async function snapshot(ctx:QueryCtx|MutationCtx,ownerId:string,type:'purchase'|'consignment'|'consignment_return',targetId:string){
 const owner=await account(ctx,ownerId),signatory=owner.signatory;if(!signatory?.firstName||!signatory.lastName||!signatory.capacity)throw new Error('SIGNATORY_REQUIRED');
 const signatoryDto={firstName:signatory.firstName,lastName:signatory.lastName,capacity:signatory.capacity};
 if(type==='consignment_return'){
  const id=ctx.db.normalizeId('consignmentReturns',targetId),operation=id?await ctx.db.get(id):null;if(!operation||operation.completedAt!==undefined)throw new Error('RETURN_ALREADY_COMPLETED');const dossier=await ctx.db.get(operation.consignmentId);if(!dossier)throw new Error('RECEIPT_TARGET_INVALID');const client=await ctx.db.get(dossier.depositorId);if(!client)throw new Error('CLIENT_NOT_FOUND');
  const lines=await ctx.db.query('consignmentReturnLines').withIndex('by_return',q=>q.eq('returnId',operation._id)).collect(),items=[];
  for(const line of lines){const lot=await ctx.db.get(line.lotId),item=lot?await ctx.db.get(lot.stockItemId):null;if(!lot||lot.source.kind!=='consignment'||lot.source.consignmentId!==dossier._id||lot.remainingQuantity<line.quantity||!item||item.status!=='available'||item.quantity<line.quantity)throw new Error('ITEM_UNAVAILABLE');items.push(await itemRecord(ctx,item));}
  return clean({reference:`RET-${dossier.reference}-${operation._id}`,occurredAt:operation.occurredAt,client:{name:client.name,email:client.email,phone:client.phone,address:client.address},signatory:signatoryDto,title:'Bon de restitution',signatureRequired:true,items:items.map(i=>({name:i.name})),lines:items.map(i=>({label:i.name,detail:[i._id,i.series,i.identifier,i.condition,i.gradingCompany,i.gradingGrade,i.gradingCertificate].filter(Boolean).join(' / ')})),totals:[],notes:[`Dépôt : ${dossier.reference}`,`État à la remise : ${operation.conditionNotes}`,'Le déposant accuse réception des articles listés. Cette restitution ne constitue ni une vente ni un reversement.']});
 }
 const purchaseId=type==='purchase'?ctx.db.normalizeId('purchases',targetId):null,consignmentId=type==='consignment'?ctx.db.normalizeId('consignments',targetId):null;
 const purchase=purchaseId?await ctx.db.get(purchaseId):null,dossier=consignmentId?await ctx.db.get(consignmentId):null;
 if(type==='purchase'?!purchase||purchase.status==='cancelled':!dossier)throw new Error('RECEIPT_TARGET_INVALID');
 const clientId=purchase?.contactId??dossier!.depositorId,client=await ctx.db.get(clientId);if(!client)throw new Error('CLIENT_NOT_FOUND');
 const row=purchase?await purchaseRecord(ctx,purchase):await consignmentRecord(ctx,dossier!),items=row.items;if(!items.length||items.length>1000)throw new Error('RECEIPT_ITEMS_LIMIT');
 if(purchase&&items.some(i=>i.purchasePriceCents===null))throw new Error('PURCHASE_COST_UNKNOWN');
 return clean({reference:row.reference,occurredAt:row.occurredAt,...(purchase?{status:purchase.status,buyerNote:purchase.buyerNote,sellerNote:purchase.sellerNote}:{notes:dossier!.notes,dueAt:dossier!.dueAt,contractTerms:'contractTerms'in row?row.contractTerms:undefined,contractRevision:'contractRevision'in row?row.contractRevision:undefined}),client:{name:client.name,email:client.email,phone:client.phone,address:client.address},signatory:signatoryDto,items:items.sort((a,b)=>a._id.localeCompare(b._id)).map(i=>({name:i.name,productType:i.productType,description:i.description,series:i.series??'',identifier:i.identifier??'',language:i.language,condition:i.condition,gradingCompany:i.gradingCompany,gradingGrade:i.gradingGrade,gradingCertificate:i.gradingCertificate,gradingNotes:i.gradingNotes,...(type==='purchase'?{purchasePriceCents:i.purchasePriceCents,marketValueCents:i.marketValueCents??i.purchasePriceCents,discountPercent:i.discountPercent??100}:{askingPriceCents:i.agreedPriceCents??i.askingPriceCents,commissionRateBps:i.commissionRateBps})}))});
}
export const prepare=internalMutation({args:{ownerId:v.string(),kind,targetId:v.string(),identity:v.any()},handler:async(ctx,args)=>{
 const content=await snapshot(ctx,args.ownerId,args.kind,args.targetId),targetTable=args.kind==='purchase'?'purchases':args.kind==='consignment'?'consignments':'consignmentReturns';
 const id=ctx.db.normalizeId(targetTable,args.targetId)!;
 const documentId=await createDocument(ctx,args.ownerId,args.kind,content,[{table:targetTable,id} as Parameters<typeof createDocument>[4][number]],args.identity);
 if(args.kind==='consignment'){const dossier=await ctx.db.get(id as Id<'consignments'>);if(dossier?.currentRevisionId)await ctx.db.insert('documentLinks',{...metadata(args.ownerId),documentId,target:{table:'consignmentRevisions',id:dossier.currentRevisionId}});}
 return {id:documentId,snapshot:content,consent};
}});
export const get=internalQuery({args:{ownerId:v.string(),id:v.id('documents')},handler:async(ctx,args)=>{await account(ctx,args.ownerId);const row=await ctx.db.get(args.id);if(!row||!['purchase','consignment','consignment_return'].includes(row.kind)||(row.signedAt===undefined&&row.createdBy!==args.ownerId))throw new Error('RECEIPT_NOT_FOUND');return documentDto(ctx,row);}});
export const list=internalQuery({args:{ownerId:v.string(),kind,targetId:v.string()},handler:async(ctx,args)=>{
 await account(ctx,args.ownerId);const table=args.kind==='purchase'?'purchases':args.kind==='consignment'?'consignments':'consignmentReturns',id=ctx.db.normalizeId(table,args.targetId);if(!id)return [];
 const links=await ctx.db.query('documentLinks').withIndex('by_target',q=>q.eq('target.table',table).eq('target.id',id)).collect(),rows=[];
 for(const link of links){const doc=await ctx.db.get(link.documentId);if(!doc||doc.kind!==args.kind||doc.signedAt===undefined)continue;const row=await documentDto(ctx,doc);rows.push({id:row._id,version:row.version,signedAt:row.signedAt,archived:!!row.objectKey,emailStatus:row.snapshot.client?.email?row.emailStatus:'no_email',recipient:row.snapshot.client?.email??'',emailError:row.emailError,emailHttpStatus:row.emailHttpStatus,messageId:row.messageId,sha256:row.sha256});}return rows;
}});
export const sign=internalMutation({args:{ownerId:v.string(),id:v.id('documents'),company:signature,client:signature,accepted:v.literal(true)},handler:async(ctx,args)=>{
 await account(ctx,args.ownerId);const row=await ctx.db.get(args.id);if(!row||row.createdBy!==args.ownerId||!['purchase','consignment','consignment_return'].includes(row.kind))throw new Error('RECEIPT_NOT_FOUND');
 if(!validSignature(args.company)||!validSignature(args.client))throw new Error('INVALID_SIGNATURE');const dto=await documentDto(ctx,row);
 if(row.signedAt!==undefined){if(canonicalJson([dto.companySignature,dto.clientSignature])!==canonicalJson([args.company,args.client]))throw new Error('ALREADY_SIGNED');return dto;}
 if((row.expiresAt??row.createdAt+30*60000)<=Date.now())throw new Error('RECEIPT_EXPIRED');
 if(canonicalJson(await snapshot(ctx,args.ownerId,row.kind as 'purchase'|'consignment'|'consignment_return',dto.targetId!))!==canonicalJson(dto.snapshot))throw new Error('RECEIPT_CHANGED');
 const signedAt=Date.now();
 if(row.kind==='consignment_return'){
  const operation=await ctx.db.get(dto.targetId as Id<'consignmentReturns'>);if(!operation||operation.completedAt!==undefined)throw new Error('RETURN_ALREADY_COMPLETED');
  const stockOperationId=await ctx.db.insert('stockOperations',{...metadata(args.ownerId),kind:'return',occurredAt:operation.occurredAt,source:{table:'consignmentReturns',id:operation._id},reason:operation.conditionNotes});
  for(const line of await ctx.db.query('consignmentReturnLines').withIndex('by_return',q=>q.eq('returnId',operation._id)).collect()){const lot=await ctx.db.get(line.lotId),item=lot?await ctx.db.get(lot.stockItemId):null;if(!item)throw new Error('ITEM_UNAVAILABLE');await consume(ctx,args.ownerId,item,line.quantity,stockOperationId,'returned',operation.occurredAt);await audit(ctx,args.ownerId,{table:'stockItems',id:item._id},'consignment.return',{returnId:operation._id,documentId:row._id});}
  await ctx.db.patch(operation._id,{completedAt:signedAt});
 }
 for(const [role,strokes,identity]of [['company',args.company,{signatory:dto.snapshot.signatory,shop:dto.identity}],['client',args.client,dto.snapshot.client]] as const)await ctx.db.insert('documentSignatures',{...metadata(args.ownerId),documentId:row._id,role,identityJson:JSON.stringify(clean(identity)),strokes,consent,signedAt});
 await ctx.db.patch(row._id,{signedAt,status:'signed'});return documentDto(ctx,(await ctx.db.get(row._id))!);
}});
export const archive=internalMutation({args:{id:v.id('documents'),objectKey:v.string(),sha256:v.string(),filename:v.string()},handler:async(ctx,{id,...fields})=>{
 const row=await ctx.db.get(id);if(row?.signedAt===undefined)throw new Error('NOT_SIGNED');await archiveDocument(ctx,id,fields);
 if(row.kind==='consignment'){
  const links=await ctx.db.query('documentLinks').withIndex('by_document',q=>q.eq('documentId',id)).collect(),revisionId=links.find(l=>l.target.table==='consignmentRevisions')?.target.id;
  if(revisionId){const revision=await ctx.db.get(revisionId as Id<'consignmentRevisions'>),dossier=revision?await ctx.db.get(revision.consignmentId):null;if(revision&&dossier?.currentRevisionId===revision._id)await ctx.db.patch(revision._id,{signatureState:'signed'});}
 }
}});
export const claimEmail=internalMutation({args:{id:v.id('documents'),attempt:v.string(),retry:v.boolean()},handler:async(ctx,args)=>{const row=await ctx.db.get(args.id);if(!row)throw new Error('RECEIPT_NOT_FOUND');const snapshot=JSON.parse(row.inputSnapshot.json);return claimDelivery(ctx,row._id,args.attempt,snapshot.client?.email,args.retry);}});
export const emailResult=internalMutation({args:{id:v.id('documents'),attempt:v.string(),status:v.string(),messageId:v.optional(v.string()),error:v.optional(v.string()),httpStatus:v.optional(v.number())},handler:async(ctx,args)=>{
 if(!['accepted','failed','sending','unknown','no_email','not_configured'].includes(args.status))throw new Error('INVALID_EMAIL_STATE');const status=args.status==='no_email'||args.status==='not_configured'?'failed':args.status as 'accepted'|'failed'|'sending'|'unknown';await completeDelivery(ctx,args.id,args.attempt,status,args.messageId,args.error??(args.status==='no_email'||args.status==='not_configured'?args.status:undefined),args.httpStatus);
}});
