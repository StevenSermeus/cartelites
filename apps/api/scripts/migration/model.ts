import { z } from 'zod';

const id=z.string().min(1), time=z.number().finite(), cents=z.number().int().safe(), qty=z.number().int().nonnegative().safe();
const optionalText=z.string().optional();
const base={id,createdAt:time,createdBy:optionalText,updatedAt:time.optional(),updatedBy:optionalText,revision:z.number().int().positive().optional()};
export type Json = null | boolean | number | string | Json[] | {[key:string]:Json};
export const json:z.ZodType<Json>=z.lazy(()=>z.union([z.null(),z.boolean(),z.number().finite(),z.string(),z.array(json),z.record(json)]));
export const reference=z.object({table:z.enum(['accounts','contacts','products','stockItems','purchases','purchaseLines','stockLots','consignments','consignmentRevisions','consignmentReturns','depositorPayouts','sales','saleLines','stockOperations','documents','files']),id}).strict();
const source=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('purchase'),purchaseId:id,purchaseLineId:id}),
 z.object({kind:z.literal('consignment'),consignmentId:id,depositorId:id}),
 z.object({kind:z.literal('opening'),operationId:id}),
 z.object({kind:z.literal('legacy-unknown'),legacyItemId:id})
]);
const record=<T extends z.ZodRawShape>(shape:T)=>z.object({...base,...shape}).strict();
export const schemas={
 accounts:record({email:z.string(),passwordHash:z.string(),sessionVersion:z.number().int(),signatory:json.optional(),disabledAt:time.optional()}),
 sessions:record({accountId:id,expiresAt:time,lastActivityAt:time,revokedAt:time.optional()}),
 passwordResetTokens:record({accountId:id,tokenHash:z.string(),expiresAt:time,consumedAt:time.optional()}),
 loginAttempts:record({identifierHash:z.string(),windowStartedAt:time,count:qty}),
 contacts:record({kind:z.enum(['person','company']),name:z.string(),email:optionalText,phone:optionalText,address:optionalText,archivedAt:time.optional()}),
 gradingCompanies:record({name:z.string(),normalizedName:z.string(),abbreviation:optionalText,website:optionalText,archivedAt:time.optional()}),
 products:record({publicAttributes:z.record(z.string()).optional(),privateAttributes:z.record(z.string()).optional(),type:z.enum(['card','sealed','other']),tcg:optionalText,name:z.string(),description:z.string(),set:optionalText,printedIdentifier:optionalText,language:optionalText,variant:optionalText,format:optionalText,packSize:qty.optional(),catalogue:z.object({imageUrl:optionalText,provider:optionalText,cardId:optionalText,setId:optionalText}).strict().optional()}),
 stockItems:record({productId:id,tracking:z.enum(['individual','quantity']),condition:optionalText,serial:optionalText,askingPriceCents:cents.nullable(),priceVisible:z.boolean().optional(),visible:z.boolean(),coverFileId:id.optional(),status:z.enum(['available','sold','cancelled','returned','donated']),quantity:qty,origin:z.enum(['purchase','supplier','consignment','legacy-unknown']),privateNotes:optionalText}),
 itemGradings:record({stockItemId:id,companyId:id,grade:z.string(),certificate:optionalText,notes:optionalText,supersededAt:time.optional()}),
 purchases:record({contactId:id,type:z.enum(['buyback','supplier']),reference:z.string(),occurredAt:time,status:z.enum(['pending','active','cancelled']),buyerNote:optionalText,sellerNote:optionalText}),
 purchaseLines:record({removedAt:time.optional(),purchaseId:id,stockItemId:id,quantity:qty,costCents:cents.nullable(),estimatedValueCents:cents.nullable(),buybackRateBps:z.number().int().min(0).max(10000).nullable(),tax:z.object({regime:z.enum(['margin','other','unknown']),rateBps:z.number().int().min(0).max(10000).nullable()}).strict()}),
 stockLots:record({stockItemId:id,source,originalQuantity:qty,remainingQuantity:qty,originalCostCents:cents.nullable(),remainingCostCents:cents.nullable(),acquiredAt:time,taxRateBps:z.number().int().min(0).max(10000).nullable(),openingBalanceOnly:z.boolean()}),
 consignments:record({depositorId:id,reference:z.string(),notes:optionalText,occurredAt:time,dueAt:time.optional(),status:z.enum(['open','closed']),currentRevisionId:id}),
 consignmentRevisions:record({consignmentId:id,number:z.number().int().positive(),contractText:z.string(),contractVersion:z.string(),signatureState:z.enum(['signed','awaiting_signature','legacy-unknown']),authorizationNote:optionalText}),
 consignmentTerms:record({revisionId:id,stockItemId:id,agreedPriceCents:cents.nullable(),commissionRateBps:z.number().int().min(0).max(10000).nullable()}),
 consignmentReturns:record({consignmentId:id,occurredAt:time,conditionNotes:z.string(),completedAt:time.optional()}),
 consignmentReturnLines:record({returnId:id,lotId:id,quantity:qty}),
 depositorPayouts:record({depositorId:id,amountCents:cents,method:z.string(),occurredAt:time,reference:optionalText,reversalId:id.optional()}),
 sales:record({reference:z.string(),occurredAt:time,customerName:optionalText,status:z.enum(['confirmed','cancelled'])}),
 saleLines:record({saleId:id,stockItemId:id,quantity:qty,lineTotalCents:cents,costCents:cents.nullable(),description:z.string(),taxRateBps:z.number().int().min(0).max(10000).nullable(),taxRegime:z.enum(['margin','other','unknown']),consignmentRevisionId:id.optional(),depositorId:id.optional(),commissionCents:cents.nullable(),depositorAmountCents:cents.nullable(),paymentStatus:z.enum(['received','pending','unknown'])}),
 saleAllocations:record({saleLineId:id,lotId:id,quantity:qty,costCents:cents.nullable(),restored:z.boolean()}),
 salePayments:record({saleId:id,occurredAt:time,cashCents:cents,transferCents:cents,reference:optionalText,supersedesId:id.optional(),status:z.enum(['active','superseded','reversed'])}),
 saleConflicts:record({stockItemId:id,operationKey:z.string(),reason:z.string(),status:z.enum(['open','resolved']),resolutionNote:optionalText,resolvedAt:time.optional()}),
 stockOperations:record({occurredAtKnown:z.boolean().optional(),costCents:cents.nullable().optional(),quantity:qty.optional(),packSize:qty.optional(),targetItemId:id.optional(),note:optionalText,historyComplete:z.boolean().optional(),kind:z.enum(['acquisition','sale','gift','display-opening','return','reversal','opening-balance']),occurredAt:time,reason:optionalText,recipient:optionalText,source:reference.optional(),reversesId:id.optional()}),
 stockMovements:record({operationId:id,lotId:id,quantityDelta:z.number().int().safe(),costDeltaCents:cents.nullable()}),
 files:record({objectKey:z.string(),filename:z.string(),contentType:z.string(),size:qty.nullable(),sha256:optionalText,thumbnailKey:optionalText,uploadState:z.enum(['complete','pending'])}),
 fileLinks:record({fileId:id,target:reference,purpose:z.enum(['photo','evidence','document','signature']),displayOrder:qty}),
 documents:record({kind:z.enum(['purchase','consignment','consignment_return','sale_ticket','statement','payment']),version:z.number().int().positive(),status:z.enum(['prepared','signed','archived']),inputSnapshot:z.object({renderer:z.enum(['purchaseReceipt','consignmentReceipt','consignmentDocument','saleTicket']),legacyFormat:z.literal('v1'),value:json}).strict(),shopSnapshot:json,rendererVersion:z.literal('legacy-preserved'),pdfFileId:id.optional(),expiresAt:time.optional(),signedAt:time.optional()}),
 documentLinks:record({documentId:id,target:reference}),
 documentSignatures:record({documentId:id,role:z.enum(['company','client']),identity:json,strokes:json,consent:z.string(),signedAt:time}),
 emailDeliveries:record({documentId:id,recipient:optionalText,attemptKey:z.string(),providerId:optionalText,state:z.enum(['accepted','failed','sending','unknown']),error:optionalText,attemptAt:time}),
 auditEvents:record({actor:optionalText,record:reference.optional(),action:z.string(),occurredAt:time,legacyTable:z.string(),legacyId:id,change:json}),
 operations:record({actor:z.string(),key:z.string(),kind:z.string(),payloadHash:z.string(),results:z.array(reference)}),
 legacyMappings:record({oldTable:z.string(),oldId:id,newTable:z.string(),newId:id,batch:z.string()})
} as const;
export type Table=keyof typeof schemas;
export type Data<T extends Table> = z.infer<(typeof schemas)[T]>;
export type Tables = {[K in Table]: Data<K>[]};
export function emptyTables():Tables {return Object.fromEntries(Object.keys(schemas).map(k=>[k,[]])) as unknown as Tables;}
export function validateTables(tables:Tables) { for(const key of Object.keys(schemas) as Table[]) {const seen=new Set<string>();for(const row of tables[key]) {schemas[key].parse(row);if(seen.has(row.id))throw new Error(`Duplicate normalized ID in ${key}`);seen.add(row.id);}} }
