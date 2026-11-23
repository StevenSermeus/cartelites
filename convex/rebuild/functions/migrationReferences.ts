/** Reference paths in the offline v2 contract. Opaque snapshots are deliberately excluded. */
export const referenceFields: Record<string, Record<string, string>> = {
 sessions:{accountId:'accounts'}, passwordResetTokens:{accountId:'accounts'},
 stockItems:{productId:'products',coverFileId:'files'}, itemGradings:{stockItemId:'stockItems',companyId:'gradingCompanies'},
 purchases:{contactId:'contacts'}, purchaseLines:{purchaseId:'purchases',stockItemId:'stockItems'}, stockLots:{stockItemId:'stockItems'},
 consignments:{depositorId:'contacts',currentRevisionId:'consignmentRevisions'}, consignmentRevisions:{consignmentId:'consignments'},
 consignmentTerms:{revisionId:'consignmentRevisions',stockItemId:'stockItems'}, consignmentReturns:{consignmentId:'consignments'},
 consignmentReturnLines:{returnId:'consignmentReturns',lotId:'stockLots'}, depositorPayouts:{depositorId:'contacts',reversalId:'depositorPayouts'},
 saleLines:{saleId:'sales',stockItemId:'stockItems',consignmentRevisionId:'consignmentRevisions',depositorId:'contacts'},
 saleAllocations:{saleLineId:'saleLines',lotId:'stockLots'}, salePayments:{saleId:'sales',supersedesId:'salePayments'},
 saleConflicts:{stockItemId:'stockItems'}, stockOperations:{reversesId:'stockOperations',targetItemId:'stockItems'}, stockMovements:{operationId:'stockOperations',lotId:'stockLots'},
 fileLinks:{fileId:'files'}, documents:{pdfFileId:'files'}, documentLinks:{documentId:'documents'},
 documentSignatures:{documentId:'documents'}, emailDeliveries:{documentId:'documents'},
};
type Row = Record<string, any>;
export function references(table:string, row:Row, includeDeferred=false):{table:string;id:string;path:string[]}[] {
 const result:{table:string;id:string;path:string[]}[]=[];
 const add=(target:string,value:unknown,path:string[])=>{if(typeof value==='string')result.push({table:target,id:value,path});};
 for(const [field,target]of Object.entries(referenceFields[table]??{})) {
  if(table==='consignments'&&field==='currentRevisionId'&&!includeDeferred)continue;
  add(target,row[field],[field]);
 }
 if(table==='stockLots') {
  const source=row.source;
  if(source.kind==='purchase'){add('purchases',source.purchaseId,['source','purchaseId']);add('purchaseLines',source.purchaseLineId,['source','purchaseLineId']);}
  if(source.kind==='consignment'){add('consignments',source.consignmentId,['source','consignmentId']);add('contacts',source.depositorId,['source','depositorId']);}
  if(source.kind==='opening')add('stockOperations',source.operationId,['source','operationId']);
 }
 for(const key of ['target','source','record'])if(row[key]?.table&&typeof row[key]?.id==='string')add(row[key].table,row[key].id,[key,'id']);
 if(table==='operations')row.results.forEach((ref:Row,i:number)=>add(ref.table,ref.id,['results',String(i),'id']));
 if(table==='legacyMappings')add(row.newTable,row.newId,['newId']);
 return result;
}
export function rewriteReference(row:Row,path:string[],id:string) {let target=row;for(const part of path.slice(0,-1))target=target[part];target[path[path.length-1]]=id;}
export function canonicalJson(value:unknown):string {
 const sorted=(input:unknown):unknown=>Array.isArray(input)?input.map(sorted):input&&typeof input==='object'?Object.fromEntries(Object.entries(input).sort(([a],[b])=>a.localeCompare(b)).map(([key,val])=>[key,sorted(val)])):input;
 return JSON.stringify(sorted(value));
}
