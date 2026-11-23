import type {MutationCtx,QueryCtx} from './_generated/server';
import type {Doc,Id} from './_generated/dataModel';
import {metadata} from './domain';
import {canonicalJson} from './migrationReferences';
export const consent='Je confirme avoir lu le document et accepte son contenu ainsi que la signature électronique et la remise d’une copie numérique.';
export const clean=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
export async function account(ctx:QueryCtx|MutationCtx,id:string){const key=ctx.db.normalizeId('accounts',id),row=key?await ctx.db.get(key):null;if(!row||row.disabledAt!==undefined)throw new Error('ACCOUNT_NOT_FOUND');return row;}
export async function createDocument(ctx:MutationCtx,by:string,kind:Doc<'documents'>['kind'],snapshot:unknown,targets:Doc<'documentLinks'>['target'][],identity:unknown=null){
 const siblings=targets[0]?await ctx.db.query('documentLinks').withIndex('by_target',q=>q.eq('target.table',targets[0].table).eq('target.id',targets[0].id)).collect():[];
 let version=0;for(const sibling of siblings){const doc=await ctx.db.get(sibling.documentId);if(doc?.kind===kind)version=Math.max(version,doc.version);}
 const renderer=kind==='purchase'?'purchaseReceipt':kind==='consignment'?'consignmentReceipt':kind==='sale_ticket'?'saleTicket':'consignmentDocument';
 const id=await ctx.db.insert('documents',{...metadata(by),kind,version:version+1,status:'prepared',inputSnapshot:{renderer,legacyFormat:'v1',json:JSON.stringify(clean(snapshot))},shopSnapshotJson:JSON.stringify(clean(identity)),rendererVersion:'legacy-preserved',expiresAt:['purchase','consignment','consignment_return'].includes(kind)?Date.now()+30*60000:undefined});
 for(const target of targets)await ctx.db.insert('documentLinks',{...metadata(by),documentId:id,target});return id;
}
export async function documentDto(ctx:QueryCtx|MutationCtx,row:Doc<'documents'>){
 const file=row.pdfFileId?await ctx.db.get(row.pdfFileId):null,links=await ctx.db.query('documentLinks').withIndex('by_document',q=>q.eq('documentId',row._id)).collect();
 const signatures=await ctx.db.query('documentSignatures').withIndex('by_document',q=>q.eq('documentId',row._id)).collect();
 const deliveries=await ctx.db.query('emailDeliveries').withIndex('by_document',q=>q.eq('documentId',row._id)).order('desc').collect(),latest=deliveries[0];
 const target=links.find(l=>['purchases','consignments','consignmentReturns'].includes(l.target.table))?.target;
 return {...row,ownerId:row.createdBy,targetId:target?.id,sellerId:links.find(l=>l.target.table==='contacts')?.target.id,anchorId:links.find(l=>l.target.table==='sales')?.target.id,saleIds:links.filter(l=>l.target.table==='sales').map(l=>l.target.id),snapshot:JSON.parse(row.inputSnapshot.json),identity:JSON.parse(row.shopSnapshotJson),objectKey:file?.objectKey,sha256:file?.sha256,filename:file?.filename,companySignature:signatures.find(s=>s.role==='company')?.strokes,clientSignature:signatures.find(s=>s.role==='client')?.strokes,consent:signatures[0]?.consent,emailStatus:['no_email','not_configured'].includes(latest?.error??'')?latest!.error:latest?.state??'pending',emailAttempt:latest?.attemptKey,emailAttemptAt:latest?.attemptAt,emailError:latest?.error,emailHttpStatus:latest?.httpStatus,messageId:latest?.providerId};
}
export async function archiveDocument(ctx:MutationCtx,id:Id<'documents'>,data:{objectKey:string;sha256:string;filename:string}){
 const document=await ctx.db.get(id);if(!document)throw new Error('DOCUMENT_NOT_FOUND');
 if(document.pdfFileId){const file=await ctx.db.get(document.pdfFileId);if(!file||file.objectKey!==data.objectKey||file.sha256!==data.sha256||file.filename!==data.filename)throw new Error('ARCHIVE_IMMUTABLE');return document;}
 if(!data.objectKey||!/^([a-f0-9]{64})$/i.test(data.sha256)||!data.filename)throw new Error('INVALID_ARCHIVE');
 const fileId=await ctx.db.insert('files',{...metadata(document.createdBy??'service'),...data,contentType:'application/pdf',size:null,uploadState:'complete'});
 await ctx.db.insert('fileLinks',{...metadata(document.createdBy??'service'),fileId,target:{table:'documents',id},purpose:'document',displayOrder:0});await ctx.db.patch(id,{pdfFileId:fileId,status:'archived'});return (await ctx.db.get(id))!;
}
export async function freezeIdentity(ctx:MutationCtx,id:Id<'documents'>,identity:unknown){const document=await ctx.db.get(id);if(!document)throw new Error('DOCUMENT_NOT_FOUND');if(document.shopSnapshotJson==='null')await ctx.db.patch(id,{shopSnapshotJson:JSON.stringify(clean(identity))});return documentDto(ctx,(await ctx.db.get(id))!);}
export async function claimDelivery(ctx:MutationCtx,id:Id<'documents'>,attempt:string,recipient:string|undefined,retry:boolean){
 const document=await ctx.db.get(id);if(!document?.pdfFileId)throw new Error('NOT_ARCHIVED');
 const existing=await ctx.db.query('emailDeliveries').withIndex('by_attempt',q=>q.eq('attemptKey',attempt)).unique();if(existing)return false;
 const latest=await ctx.db.query('emailDeliveries').withIndex('by_document',q=>q.eq('documentId',id)).order('desc').first();
 if(latest&&(!retry||Date.now()-latest.attemptAt<60000))return false;
 await ctx.db.insert('emailDeliveries',{...metadata(document.createdBy??'service'),documentId:id,recipient,attemptKey:attempt,state:'sending',attemptAt:Date.now()});return true;
}
export async function completeDelivery(ctx:MutationCtx,id:Id<'documents'>,attempt:string,state:Doc<'emailDeliveries'>['state'],providerId?:string,error?:string,httpStatus?:number){
 const delivery=await ctx.db.query('emailDeliveries').withIndex('by_attempt',q=>q.eq('attemptKey',attempt)).unique();if(!delivery||delivery.documentId!==id||delivery.state!=='sending')return;
 await ctx.db.patch(delivery._id,{state,providerId,error,httpStatus});
}
