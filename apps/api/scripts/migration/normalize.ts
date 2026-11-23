import { createHash } from 'node:crypto';
import { emptyTables, validateTables, type Table, type Tables, type Data, type Json } from './model.js';
import type { Export } from './rehearse.js';
type Row=Export[string][number];
export const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const mappedId=(table:Table,legacyTable:string,legacyId:string,suffix='')=>`${table}:${digest([legacyTable,legacyId,suffix]).slice(0,32)}`;
const text=(v:unknown)=>typeof v==='string'?v:undefined;
const number=(v:unknown)=>typeof v==='number'?v:undefined;
const money=(v:unknown)=>number(v)??null;
const asJson=(v:unknown):Json=>JSON.parse(JSON.stringify(v??null));
const date=(r:Row)=>number(r.createdAt)??number(r._creationTime)??number(r.occurredAt)??0;
const meta=(r:Row)=>({createdAt:date(r),createdBy:text(r.ownerId),updatedAt:number(r.updatedAt),updatedBy:text(r.updatedBy),revision:1});
const strings=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[];
export function normalize(source:Export) {
 const tables=emptyTables(), warnings:string[]=[],errors:string[]=[];
 const sourceDigest=digest(source), batch=`offline-v2:${sourceDigest}`;
 const rows=(t:string)=>source[t]??[];
 const indexes=new Map<string,Map<string,Row>>();
 for(const [table,values]of Object.entries(source)) {const index=new Map<string,Row>();for(const row of values){if(!row._id||index.has(row._id))throw new Error(`Duplicate/missing legacy ID in ${table}`);index.set(row._id,row);}indexes.set(table,index);}
 const find=(t:string,id:unknown)=>typeof id==='string'?indexes.get(t)?.get(id):undefined;
 const id=(table:Table,old:string,value:unknown,suffix='')=>mappedId(table,old,String(value),suffix);
 const add=<T extends Table>(table:T,row:Data<T>)=>{(tables[table] as Data<T>[]).push(row);return row.id;};
 const map=(oldTable:string,oldId:string,newTable:Table,newId:string)=>{
  if(tables.legacyMappings.some(m=>m.oldTable===oldTable&&m.oldId===oldId&&m.newTable===newTable&&m.newId===newId))return;
  add('legacyMappings',{id:id('legacyMappings',oldTable,oldId,`${newTable}/${newId}`),createdAt:0,oldTable,oldId,newTable,newId,batch});
 };
 const mapped=<T extends Table>(table:T,old:string,row:Row,data:Omit<Data<T>,'id'|'createdAt'>,suffix='')=>{
  const nextId=id(table,old,row._id,suffix);add(table,{...meta(row),...data,id:nextId} as Data<T>);map(old,row._id,table,nextId);return nextId;
 };
 const ref=(table:'accounts'|'contacts'|'products'|'stockItems'|'purchases'|'stockLots'|'consignments'|'consignmentReturns'|'sales'|'saleLines'|'stockOperations'|'documents'|'files',legacy:string,value:unknown)=>({table,id:id(table,legacy,value)});
 const itemLot=(itemId:unknown)=>id('stockLots','items',itemId);
 const itemSourcePurchase=(r:Row)=>r.purchaseId??r.removedPurchaseId;
 for(const r of rows('accounts'))mapped('accounts','accounts',r,{email:String(r.email),passwordHash:String(r.passwordHash),sessionVersion:number(r.sessionVersion)??0,signatory:r.signatory===undefined?undefined:asJson(r.signatory)});
 for(const r of rows('passwordResetTokens'))mapped('passwordResetTokens','passwordResetTokens',r,{accountId:id('accounts','accounts',r.accountId),tokenHash:String(r.tokenHash),expiresAt:Number(r.expiresAt),consumedAt:number(r.consumedAt)});
 for(const r of rows('loginAttempts'))mapped('loginAttempts','loginAttempts',r,{identifierHash:String(r.emailHash),windowStartedAt:Number(r.windowStartedAt),count:Number(r.attempts)});
 if(rows('revokedSessions').length)warnings.push('Stateless revoked JWTs retained in legacy vault; session rows cannot be reconstructed from revocation records. Preserve signing/session-version transition policy.');
 for(const r of rows('sellers'))mapped('contacts','sellers',r,{kind:'person',name:String(r.name),email:text(r.email),phone:text(r.phone),address:text(r.address)});
 const companyIds=new Map<string,string>();
 for(const r of rows('gradingCompanies')) {
  const name=String(r.name),key=name.normalize('NFKC').toLocaleLowerCase('en');
  if(companyIds.has(key)){errors.push('Duplicate normalized grading company in source');continue;}
  const next=mapped('gradingCompanies','gradingCompanies',r,{name,normalizedName:key,abbreviation:text(r.abbreviation),website:text(r.website),archivedAt:number(r.archivedAt)});companyIds.set(key,next);
 }
 for(const r of rows('items'))if(text(r.gradingCompany)){
  const name=String(r.gradingCompany).trim(),key=name.normalize('NFKC').toLocaleLowerCase('en');
  if(!companyIds.has(key))companyIds.set(key,add('gradingCompanies',{id:id('gradingCompanies','legacy-grading-name',key),createdAt:0,revision:1,name,normalizedName:key}));
 }
 for(const r of rows('purchases'))mapped('purchases','purchases',r,{contactId:id('contacts','sellers',r.sellerId),type:'buyback',reference:String(r.reference),occurredAt:Number(r.occurredAt),status:r.status as 'active'|'pending'|'cancelled',buyerNote:text(r.buyerNote),sellerNote:text(r.sellerNote)});
 for(const r of rows('supplierReceipts')) {
  const supplierId=add('contacts',{id:id('contacts','supplierReceipts',r._id),createdAt:date(r),createdBy:text(r.ownerId),kind:'company',name:String(r.supplier)});map('supplierReceipts',r._id,'contacts',supplierId);
  mapped('purchases','supplierReceipts',r,{contactId:supplierId,type:'supplier',reference:String(r.reference),occurredAt:Number(r.occurredAt),status:'active'});
 }
 const revisionId=(r:Row)=>id('consignmentRevisions','consignments',r._id,String(number(r.contractRevision)??1));
 for(const r of rows('consignments')) {
  mapped('consignments','consignments',r,{depositorId:id('contacts','sellers',r.sellerId),reference:String(r.reference),notes:text(r.notes),occurredAt:Number(r.occurredAt),dueAt:number(r.dueAt),status:'open',currentRevisionId:revisionId(r)});
  const terms=r.contractTerms as {text?:string;version?:string}|undefined;
  const rev=add('consignmentRevisions',{...meta(r),id:revisionId(r),consignmentId:id('consignments','consignments',r._id),number:number(r.contractRevision)??1,contractText:terms?.text??'',contractVersion:terms?.version??'legacy-unknown',signatureState:r.contractStatus==='signed'?'signed':r.contractStatus==='awaiting_signature'?'awaiting_signature':'legacy-unknown'});map('consignments',r._id,'consignmentRevisions',rev);
  if(!r.contractTerms)warnings.push('Legacy consignment lacks frozen agreement terms; original documents remain authoritative.');
 }
 const tax=(r:Row)=>({regime:(r.vatRegime==='margin'?'margin':r.vatRegime==='other'?'other':'unknown') as 'margin'|'other'|'unknown',rateBps:number(r.taxRateBps)??null});
 for(const r of rows('items')) {
  const origin=r.consignmentId?'consignment':r.origin==='supplier'?'supplier':itemSourcePurchase(r)?'purchase':'legacy-unknown';
  mapped('products','items',r,{publicAttributes:r.publicAttributes as Record<string,string>|undefined,privateAttributes:r.privateAttributes as Record<string,string>|undefined,type:r.productType==='sealed'?'sealed':r.productType==='other'?'other':'card',tcg:text(r.tcg),name:String(r.name),description:text(r.description)??'',set:text(r.series),printedIdentifier:text(r.identifier),language:text(r.language),variant:text(r.variant),format:text(r.format),packSize:number(r.packSize),catalogue:r.catalogueImageUrl||r.catalogueCardId?{imageUrl:text(r.catalogueImageUrl),provider:r.catalogueCardId?'tcgdex':undefined,cardId:text(r.catalogueCardId),setId:text(r.catalogueSetId)}:undefined});
  const quantity=r.status==='available'?(number(r.quantity)??1):0;
  mapped('stockItems','items',r,{productId:id('products','items',r._id),tracking:origin==='supplier'?'quantity':'individual',condition:text(r.condition),serial:text(r.serialNumber),askingPriceCents:money(r.askingPriceCents),priceVisible:r.priceVisible!==false,visible:r.hiddenFromCatalogue!==true,coverFileId:r.coverPhotoId?id('files','attachments',r.coverPhotoId):undefined,status:r.status as Data<'stockItems'>['status'],quantity,origin,privateNotes:text(r.privateNotes)??text(r.gradingNotes)});
  if(r.gradingCompany)mapped('itemGradings','items',r,{stockItemId:id('stockItems','items',r._id),companyId:companyIds.get(String(r.gradingCompany).trim().normalize('NFKC').toLocaleLowerCase('en'))!,grade:text(r.gradingGrade)??'',certificate:text(r.gradingCertificate),notes:text(r.gradingNotes)});
  const purchase=itemSourcePurchase(r);
  if(purchase)mapped('purchaseLines','items',r,{removedAt:r.removedPurchaseId?number(r.removedAt)??date(r):undefined,purchaseId:id('purchases','purchases',purchase),stockItemId:id('stockItems','items',r._id),quantity:1,costCents:money(r.purchasePriceCents),estimatedValueCents:money(r.marketValueCents),buybackRateBps:r.discountPercent===undefined?null:Math.round(Number(r.discountPercent)*100),tax:tax(r)});
  const consignment=find('consignments',r.consignmentId);
  if(consignment)mapped('consignmentTerms','items',r,{revisionId:revisionId(consignment),stockItemId:id('stockItems','items',r._id),agreedPriceCents:money(r.agreedPriceCents),commissionRateBps:number(r.commissionRateBps)??null});
  if(origin!=='supplier') {
   const source:Data<'stockLots'>['source']=consignment?{kind:'consignment',consignmentId:id('consignments','consignments',consignment._id),depositorId:id('contacts','sellers',consignment.sellerId)}:purchase?{kind:'purchase',purchaseId:id('purchases','purchases',purchase),purchaseLineId:id('purchaseLines','items',r._id)}:{kind:'legacy-unknown',legacyItemId:r._id};
   mapped('stockLots','items',r,{stockItemId:id('stockItems','items',r._id),source,originalQuantity:1,remainingQuantity:quantity,originalCostCents:money(r.purchasePriceCents),remainingCostCents:quantity?money(r.purchasePriceCents):0,acquiredAt:Number(r.purchaseOccurredAt),taxRateBps:number(r.taxRateBps)??null,openingBalanceOnly:true});
  }
 }
 for(const r of rows('stockLots')) {
  const item=find('items',r.itemId);
  let source:Data<'stockLots'>['source']={kind:'legacy-unknown',legacyItemId:String(r.itemId)};
  if(r.openingId)source={kind:'opening',operationId:id('stockOperations','stockOpenings',r.openingId)};
  else if(r.receiptId){
   const line=mapped('purchaseLines','stockLots',r,{purchaseId:id('purchases','supplierReceipts',r.receiptId),stockItemId:id('stockItems','items',r.itemId),quantity:Number(r.received),costCents:money(r.totalCostCents),estimatedValueCents:null,buybackRateBps:null,tax:tax(item??r)});
   source={kind:'purchase',purchaseId:id('purchases','supplierReceipts',r.receiptId),purchaseLineId:line};
  }
  mapped('stockLots','stockLots',r,{stockItemId:id('stockItems','items',r.itemId),source,originalQuantity:Number(r.received),remainingQuantity:Number(r.remaining),originalCostCents:money(r.totalCostCents),remainingCostCents:money(r.remainingCostCents),acquiredAt:Number(r.occurredAt),taxRateBps:number(r.taxRateBps)??null,openingBalanceOnly:true});
 }
 for(const r of rows('consignmentReturns')) {
  mapped('consignmentReturns','consignmentReturns',r,{consignmentId:id('consignments','consignments',r.consignmentId),occurredAt:Number(r.occurredAt),conditionNotes:text(r.conditionNotes)??'',completedAt:number(r.completedAt)});
  strings(r.itemIds).forEach((item,i)=>mapped('consignmentReturnLines','consignmentReturns',r,{returnId:id('consignmentReturns','consignmentReturns',r._id),lotId:itemLot(item),quantity:1},String(i)));
 }
 // Legacy returns predate grouped return records. Preserve each independently.
 for(const r of rows('consignmentEvents').filter(r=>r.kind==='return')) {
  const item=find('items',r.itemId);if(!item?.consignmentId){errors.push('Legacy return has no consignment source');continue;}
  const grouped=rows('consignmentReturns').some(v=>strings(v.itemIds).includes(String(r.itemId))&&v.occurredAt===r.occurredAt);
  if(grouped)continue;
  const returnId=mapped('consignmentReturns','consignmentEvents',r,{consignmentId:id('consignments','consignments',item.consignmentId),occurredAt:Number(r.occurredAt),conditionNotes:'',completedAt:Number(r.occurredAt)});
  mapped('consignmentReturnLines','consignmentEvents',r,{returnId,lotId:itemLot(r.itemId),quantity:1});
 }
 for(const r of rows('consignmentPayments'))mapped('depositorPayouts','consignmentPayments',r,{depositorId:id('contacts','sellers',r.sellerId),amountCents:Number(r.amountCents),method:String(r.method),occurredAt:Number(r.occurredAt),reference:text(r.reference)});
 for(const r of rows('sales')) {
  const item=find('items',r.itemId),consignment=find('consignments',r.consignmentId);
  const saleId=mapped('sales','sales',r,{reference:text(r.reference)??`legacy:${r._id}`,occurredAt:Number(r.occurredAt),customerName:text(r.customerName),status:r.status==='cancelled'?'cancelled':'confirmed'});
  mapped('saleLines','sales',r,{saleId,stockItemId:id('stockItems','items',r.itemId),quantity:number(r.quantity)??1,lineTotalCents:Number(r.salePriceCents),costCents:money(r.costCents??item?.purchasePriceCents),description:text(r.itemName)??text(item?.name)??'',taxRateBps:number(r.taxRateBps)??null,taxRegime:r.vatRegime==='margin'?'margin':r.vatRegime==='other'?'other':'unknown',consignmentRevisionId:consignment?revisionId(consignment):undefined,depositorId:r.sellerId?id('contacts','sellers',r.sellerId):undefined,commissionCents:money(r.commissionCents),depositorAmountCents:money(r.depositorAmountCents),paymentStatus:r.paymentStatus==='received'?'received':r.paymentStatus==='pending'?'pending':'unknown'});
  if(consignment)warnings.push('Legacy sale lacks explicit agreement revision snapshot; mapped current revision and retained original frozen economics. Review historical agreement association.');
  const allocations=(Array.isArray(r.allocations)?r.allocations:[]) as {lotId:string;quantity:number;costCents:number}[];
  if(allocations.length)allocations.forEach((a,i)=>mapped('saleAllocations','sales',r,{saleLineId:id('saleLines','sales',r._id),lotId:id('stockLots','stockLots',a.lotId),quantity:a.quantity,costCents:a.costCents,restored:r.status==='cancelled'},String(i)));
  else if(item&&item.origin!=='supplier')mapped('saleAllocations','sales',r,{saleLineId:id('saleLines','sales',r._id),lotId:itemLot(r.itemId),quantity:number(r.quantity)??1,costCents:money(r.costCents??item.purchasePriceCents),restored:r.status==='cancelled'});
  else errors.push('Supplier sale lacks exact lot allocations; manual reconciliation required');
  const events=rows('salePaymentEvents').filter(v=>v.saleId===r._id).sort((a,b)=>date(a)-date(b)||a._id.localeCompare(b._id));
  let previous:string|undefined;
  const payment=(p:unknown,origin:Row,oldTable:string,suffix:string,status:Data<'salePayments'>['status'])=>{
   if(!p||typeof p!=='object')return;
   const v=p as {cashCents:number;transferCents:number;receivedAt:number;reference?:string};
   previous=mapped('salePayments',oldTable,origin,{saleId,occurredAt:v.receivedAt,cashCents:v.cashCents,transferCents:v.transferCents,reference:v.reference,supersedesId:previous,status},suffix);
  };
  if(events[0]?.previousPayment)payment(events[0].previousPayment,events[0],'salePaymentEvents','before','superseded');
  events.forEach((e,i)=>payment(e.payment,e,'salePaymentEvents','after',i===events.length-1&&r.status!=='cancelled'?'active':i===events.length-1?'reversed':'superseded'));
  if(!events.length)payment(r.payment,r,'sales','current',r.status==='cancelled'?'reversed':'active');
  else if(digest(events[events.length-1].payment)!==digest(r.payment))errors.push('Sale current payment differs from final payment correction');
 }
 for(const r of rows('saleConflicts'))mapped('saleConflicts','saleConflicts',r,{stockItemId:id('stockItems','items',r.itemId),operationKey:String(r.operationId),reason:'legacy-sale-conflict',status:r.status==='resolved'?'resolved':'open',resolutionNote:text(r.resolutionNote),resolvedAt:number(r.resolvedAt)});
 // Sale allocations and completed returns must contribute to the same historical
 // ledger as openings: an opened booster already sold cannot become a negative initial balance.
 for(const r of rows('sales')) {
  const saleId=id('sales','sales',r._id),lineId=id('saleLines','sales',r._id),allocations=tables.saleAllocations.filter(a=>a.saleLineId===lineId);
  const operationId=mapped('stockOperations','sales',r,{kind:'sale',occurredAt:Number(r.occurredAt),source:{table:'sales',id:saleId}},'stock');
  for(let i=0;i<allocations.length;i++){const a=allocations[i];mapped('stockMovements','sales',r,{operationId,lotId:a.lotId,quantityDelta:-a.quantity,costDeltaCents:a.costCents===null?null:-a.costCents},`stock:${i}`);}
  if(r.status==='cancelled'){
   const applied=rows('saleCancellations').filter(c=>c.saleId===r._id&&c.applied===true);
   if(applied.length>1)errors.push(`Multiple applied cancellation bindings for legacy sale ${r._id}`);
   const knownCancellation=number(r.cancelledAt)??number(applied[0]?.createdAt);
   const reversalId=mapped('stockOperations','sales',r,{kind:'reversal',occurredAt:knownCancellation??date(r),occurredAtKnown:applied.length&&knownCancellation!==undefined?true:undefined,source:{table:'sales',id:saleId},reversesId:operationId},'stock-reversal');
   for(let i=0;i<allocations.length;i++){const a=allocations[i];mapped('stockMovements','sales',r,{operationId:reversalId,lotId:a.lotId,quantityDelta:a.quantity,costDeltaCents:a.costCents},`stock-reversal:${i}`);}
  }
 }
 for(const returned of tables.consignmentReturns.filter(r=>r.completedAt!==undefined)){
  const operationId=add('stockOperations',{id:id('stockOperations','normalized-return',returned.id),createdAt:returned.createdAt,kind:'return',occurredAt:returned.occurredAt,source:{table:'consignmentReturns',id:returned.id}});
  for(const line of tables.consignmentReturnLines.filter(l=>l.returnId===returned.id)){const lot=tables.stockLots.find(l=>l.id===line.lotId);if(!lot)continue;const cost=lot.originalCostCents===null?null:Number(BigInt(lot.originalCostCents)*BigInt(line.quantity)/BigInt(lot.originalQuantity));add('stockMovements',{id:id('stockMovements','normalized-return-line',line.id),createdAt:returned.createdAt,operationId,lotId:line.lotId,quantityDelta:-line.quantity,costDeltaCents:cost===null?null:-cost});}
 }
 // Preserve exact historical allocations where legacy records provide them. Opening
 // balance movements below exclude their net effect, so importing history never doubles stock.
 for(const [old,kind]of [['stockGifts','gift'],['stockOpenings','display-opening']] as const)for(const r of rows(old)) {
  const item=find('items',r.itemId??r.sourceId),quantity=number(r.quantity)??(kind==='gift'&&item?.origin!=='supplier'?1:undefined);
  const allocations=(Array.isArray(r.allocations)?r.allocations:[]) as {lotId:string;quantity:number;costCents?:number|null}[];
  const inputs=allocations.map(a=>({lotId:id('stockLots','stockLots',a.lotId),quantityDelta:-a.quantity,costDeltaCents:a.costCents==null?null:-a.costCents}));
  if(!inputs.length&&kind==='gift'&&item&&item.origin!=='supplier')inputs.push({lotId:itemLot(item._id),quantityDelta:-1,costDeltaCents:r.costCents===undefined?(item.purchasePriceCents===undefined?null:-Number(item.purchasePriceCents)):r.costCents===null?null:-Number(r.costCents)});
  const outputs=kind==='display-opening'?rows('stockLots').filter(l=>l.openingId===r._id).map(l=>({lotId:id('stockLots','stockLots',l._id),quantityDelta:Number(l.received),costDeltaCents:money(l.totalCostCents)})):[];
  const packSize=number(r.packSize),complete=quantity!==undefined&&inputs.reduce((n,m)=>n-m.quantityDelta,0)===quantity&&(kind==='gift'||(packSize!==undefined&&outputs.reduce((n,m)=>n+m.quantityDelta,0)===quantity*packSize));
  const operationId=mapped('stockOperations',old,r,{kind,occurredAt:Number(r.occurredAt),costCents:r.costCents===undefined?undefined:money(r.costCents),quantity,packSize,targetItemId:r.targetId?id('stockItems','items',r.targetId):undefined,note:text(r.note),historyComplete:complete,reason:text(r.reason),recipient:text(r.recipient),source:ref('stockItems','items',r.itemId??r.sourceId)});
  if(!complete)warnings.push(`Historical ${old}/${r._id} has incomplete exact allocation history; known values retained, reversal blocked pending reconciliation.`);
  const movements=[...inputs,...outputs];
  for(let i=0;i<movements.length;i++)mapped('stockMovements',old,r,{operationId,...movements[i]},`movement:${i}`);
  if(r.cancelledAt){const reversalId=mapped('stockOperations',old,r,{kind:'reversal',occurredAt:Number(r.cancelledAt),reversesId:operationId},'reversal');
   for(let i=0;i<movements.length;i++){const m=movements[i];mapped('stockMovements',old,r,{operationId:reversalId,lotId:m.lotId,quantityDelta:-m.quantityDelta,costDeltaCents:m.costDeltaCents===null?null:-m.costDeltaCents},`reversal-movement:${i}`);}}
 }
 for(const lot of tables.stockLots) {
  const historical=tables.stockMovements.filter(m=>m.lotId===lot.id),quantity=lot.remainingQuantity-historical.reduce((n,m)=>n+m.quantityDelta,0);
  const cost=lot.remainingCostCents===null||historical.some(m=>m.costDeltaCents===null)?null:lot.remainingCostCents-historical.reduce((n,m)=>n+m.costDeltaCents!,0);
  if(quantity<0||quantity>lot.originalQuantity||cost!==null&&(cost<0||lot.originalCostCents!==null&&cost>lot.originalCostCents))errors.push('Historical movements disagree with remaining lot balance');
  const operationId=add('stockOperations',{id:id('stockOperations','normalized-lot',lot.id),createdAt:lot.createdAt,kind:'opening-balance',occurredAt:lot.acquiredAt,reason:'Imported remaining balance; earlier legacy operations preserved separately',source:{table:'stockLots',id:lot.id}});
  add('stockMovements',{id:id('stockMovements','normalized-lot',lot.id),createdAt:lot.createdAt,operationId,lotId:lot.id,quantityDelta:quantity,costDeltaCents:cost});
 }
 for(const r of rows('attachments')) {
  const fileId=mapped('files','attachments',r,{objectKey:String(r.objectKey),filename:String(r.filename),contentType:String(r.contentType),size:number(r.size)??null,sha256:text(r.sha256),uploadState:'complete'});
  for(const [field,table,old,purpose]of [['itemId','stockItems','items','photo'],['purchaseId','purchases','purchases','evidence'],['supplierReceiptId','purchases','supplierReceipts','evidence'],['giftId','stockOperations','stockGifts','evidence']] as const)if(r[field])mapped('fileLinks','attachments',r,{fileId,target:ref(table,old,r[field]),purpose:r.purchaseId||r.supplierReceiptId||r.giftId?'evidence':purpose,displayOrder:0},field);
 }
 for(const old of ['signedReceipts','saleTickets','consignmentDocuments'])for(const r of rows(old)) {
  const kind:Data<'documents'>['kind']=old==='saleTickets'?'sale_ticket':r.kind as Data<'documents'>['kind'];
  let pdfFileId:string|undefined;
  if(r.objectKey)pdfFileId=mapped('files',old,r,{objectKey:String(r.objectKey),filename:text(r.filename)??'archived.pdf',contentType:'application/pdf',size:null,sha256:text(r.sha256),uploadState:'complete'});
  const renderer=kind==='purchase'?'purchaseReceipt':kind==='sale_ticket'?'saleTicket':kind==='statement'||kind==='payment'||kind==='consignment_return'?'consignmentDocument':'consignmentReceipt';
  const version=old==='signedReceipts'?rows(old).filter(v=>v.kind===r.kind&&v.targetId===r.targetId&&(date(v)<date(r)||date(v)===date(r)&&v._id<=r._id)).length:1;
  const documentId=mapped('documents',old,r,{kind,version,status:r.objectKey?'archived':r.signedAt?'signed':'prepared',inputSnapshot:{renderer,legacyFormat:'v1',value:asJson(r.snapshot)},shopSnapshot:asJson(r.identity),rendererVersion:'legacy-preserved',pdfFileId,signedAt:number(r.signedAt)});
  if(pdfFileId)mapped('fileLinks',old,r,{fileId:pdfFileId,target:{table:'documents',id:documentId},purpose:'document',displayOrder:0});
  if(old==='signedReceipts') {
   const table=kind==='purchase'?'purchases':kind==='consignment_return'?'consignmentReturns':'consignments';
   mapped('documentLinks',old,r,{documentId,target:ref(table,table,r.targetId)});
  }else if(old==='saleTickets')strings(r.saleIds).forEach((sale,i)=>mapped('documentLinks',old,r,{documentId,target:ref('sales','sales',sale)},String(i)));
  else mapped('documentLinks',old,r,{documentId,target:ref('contacts','sellers',r.sellerId)});
  for(const [field,role]of [['companySignature','company'],['clientSignature','client']] as const)if(r[field])mapped('documentSignatures',old,r,{documentId,role,identity:role==='company'?asJson({signatory:(r.snapshot as Record<string,unknown>|undefined)?.signatory??null,shop:r.identity??null}):asJson((r.snapshot as Record<string,unknown>|undefined)?.client??(r.snapshot as Record<string,unknown>|undefined)?.seller??null),strokes:asJson(r[field]),consent:text(r.consent)??'',signedAt:number(r.signedAt)??date(r)},field);
  if(r.emailStatus)mapped('emailDeliveries',old,r,{documentId,attemptKey:text(r.emailAttempt)??`legacy:${r._id}`,providerId:text(r.messageId),state:r.emailStatus==='accepted'?'accepted':r.emailStatus==='failed'?'failed':r.emailStatus==='sending'?'sending':'unknown',error:text(r.emailError),attemptAt:number(r.emailAttemptAt)??date(r)});
 }
 for(const r of rows('ticketEmails'))mapped('emailDeliveries','ticketEmails',r,{documentId:id('documents','saleTickets',r.ticketId),recipient:text(r.recipient),attemptKey:String(r.operationId),providerId:text(r.messageId),state:r.status as Data<'emailDeliveries'>['state'],attemptAt:date(r)});
 // Cancellation requests bind to existing sales; they must not create another sale or stock reversal.
 for(const r of rows('saleCancellations')) {
  if(!find('sales',r.saleId)){errors.push(`Cancellation binding ${r._id} references a missing legacy sale`);continue;}
  map('saleCancellations',r._id,'sales',id('sales','sales',r.saleId));
 }
 if(rows('saleCancellations').length)warnings.push('Legacy cancellation request bindings and digests are retained in the private audit and operations records with mapped sale results. Old actor IDs/request payloads are audit evidence, not replay-compatible requests after canonical IDs change.');
 // Every original record remains in the private vault. Audits point at that exact source, never discard legacy fields.
 for(const [old,values]of Object.entries(source))for(const r of values) {
  if(['itemActivity','itemActivityBuilds','itemActivityJobs'].includes(old)){warnings.push('Disposable item activity projection retained only in the private legacy vault; rebuild its index from restored business records after import.');continue;}
  const targets=tables.legacyMappings.filter(m=>m.oldTable===old&&m.oldId===r._id);
  const accepted=['accounts','contacts','products','stockItems','purchases','stockLots','consignments','consignmentReturns','sales','saleLines','stockOperations','documents','files'];
  const result=targets.filter(t=>accepted.includes(t.newTable)).map(t=>({table:t.newTable,id:t.newId})) as Data<'operations'>['results'];
  const auditTarget=old==='consignmentEvents'&&r.itemId?ref('stockItems','items',r.itemId):result[0];
  mapped('auditEvents',old,r,{actor:text(r.ownerId),record:auditTarget,action:`legacy-import:${old}`,occurredAt:date(r),legacyTable:old,legacyId:r._id,change:asJson(r)});
  if(r.operationId && r.operationDigest)mapped('operations',old,r,{actor:text(r.ownerId)??'legacy-unknown',key:String(r.operationId),kind:old,payloadHash:String(r.operationDigest),results:result});
 }
 validateTables(tables);
 // Validate every normalized relation, including links embedded in discriminated source unions.
 const all=new Set(Object.values(tables).flat().map(r=>r.id));
 function refs(value:unknown,key='') {if(typeof value==='string'&&/^(?:accounts|contacts|products|stockItems|purchases|purchaseLines|stockLots|consignments|consignmentRevisions|consignmentReturns|sales|saleLines|stockOperations|documents|files|gradingCompanies|salePayments):[a-f0-9]{32}$/.test(value)&&!all.has(value))errors.push(`Dangling normalized reference (${key})`);else if(Array.isArray(value))value.forEach(v=>refs(v,key));else if(value&&typeof value==='object')for(const [k,v]of Object.entries(value))if(!['change','value','shopSnapshot','strokes','identity','oldId'].includes(k))refs(v,k);}
 refs(tables);
 for(const item of tables.stockItems) {
  const remaining=tables.stockLots.filter(l=>l.stockItemId===item.id).reduce((s,l)=>s+l.remainingQuantity,0);
  if(remaining!==item.quantity)errors.push('Stock item quantity differs from remaining lot balances');
 }
 for(const lot of tables.stockLots)if(lot.remainingQuantity>lot.originalQuantity||lot.originalCostCents!==null&&lot.remainingCostCents!==null&&lot.remainingCostCents>lot.originalCostCents)errors.push('Lot remaining balance exceeds original');
 const sum=<T extends Table>(table:T,field:keyof Data<T>,filter=(r:Data<T>)=>true)=>(tables[table] as Data<T>[]).filter(filter).reduce((total,r)=>total+(typeof r[field]==='number'?r[field] as number:0),0);
 const active=new Set(tables.sales.filter(r=>r.status==='confirmed').map(r=>r.id));
 const reconciliation={stockQuantity:sum('stockItems','quantity'),lotRemainingQuantity:sum('stockLots','remainingQuantity'),knownPurchaseCostCents:sum('purchaseLines','costCents'),unknownPurchaseCosts:tables.purchaseLines.filter(l=>l.costCents===null).length,knownLotRemainingCostCents:sum('stockLots','remainingCostCents'),unknownLotCosts:tables.stockLots.filter(l=>l.remainingCostCents===null).length,activeSalesCents:sum('saleLines','lineTotalCents',r=>active.has(r.saleId)),activePaymentCents:sum('salePayments','cashCents',r=>r.status==='active')+sum('salePayments','transferCents',r=>r.status==='active'),collectedDepositorEntitlementCents:sum('saleLines','depositorAmountCents',r=>active.has(r.saleId)&&r.paymentStatus==='received'),payoutsCents:sum('depositorPayouts','amountCents'),documents:tables.documents.length,files:tables.files.length,signatures:tables.documentSignatures.length};
 const legacySum=(table:string,field:string,predicate=(r:Row)=>true)=>rows(table).filter(predicate).reduce((total,r)=>total+(number(r[field])??0),0);
 const comparisons={
  physicalQuantity:{before:rows('items').reduce((n,r)=>n+(r.status==='available'?(number(r.quantity)??1):0),0),after:reconciliation.stockQuantity},
  purchaseCostCents:{before:legacySum('items','purchasePriceCents',r=>!!itemSourcePurchase(r))+legacySum('supplierReceipts','totalCostCents'),after:reconciliation.knownPurchaseCostCents},
  activeSalesCents:{before:legacySum('sales','salePriceCents',r=>r.status==='active'),after:reconciliation.activeSalesCents},
  payoutsCents:{before:legacySum('consignmentPayments','amountCents'),after:reconciliation.payoutsCents},
  collectedDepositorEntitlementCents:{before:legacySum('sales','depositorAmountCents',r=>r.status==='active'&&r.paymentStatus==='received'),after:reconciliation.collectedDepositorEntitlementCents},
  documents:{before:rows('signedReceipts').length+rows('saleTickets').length+rows('consignmentDocuments').length,after:reconciliation.documents},
  signatures:{before:rows('signedReceipts').reduce((n,r)=>n+Number(!!r.companySignature)+Number(!!r.clientSignature),0),after:reconciliation.signatures},
  objectReferences:{before:['attachments','signedReceipts','saleTickets','consignmentDocuments'].reduce((n,t)=>n+rows(t).filter(r=>!!r.objectKey).length,0),after:reconciliation.files},
 };
 for(const [name,value]of Object.entries(comparisons))if(value.before!==value.after)errors.push(`Reconciliation mismatch: ${name}`);
 for(const line of tables.saleLines) {
  const allocations=tables.saleAllocations.filter(a=>a.saleLineId===line.id);
  if(allocations.reduce((n,a)=>n+a.quantity,0)!==line.quantity)errors.push('Sale allocation quantity mismatch');
  if(line.costCents!==null&&allocations.every(a=>a.costCents!==null)&&allocations.reduce((n,a)=>n+a.costCents!,0)!==line.costCents)errors.push('Sale allocation cost mismatch');
 }
 for(const sale of tables.sales) {
  const lineTotal=tables.saleLines.filter(l=>l.saleId===sale.id).reduce((n,l)=>n+l.lineTotalCents,0);
  for(const payment of tables.salePayments.filter(p=>p.saleId===sale.id))if(payment.cashCents+payment.transferCents!==lineTotal)errors.push('Sale payment total mismatch');
 }
 warnings.push('Known gift/opening allocations are imported as exact movements; adjusted opening balances reconcile remaining lots. Missing historical operations remain explicitly reported in the source vault.');
 if(rows('saleBatches').length)warnings.push('Legacy sales remain individually cancellable normalized sales; original basket membership retained in source audit records and document links.');
 const transformed=new Set(tables.legacyMappings.filter(m=>m.newTable!=='auditEvents'&&m.newTable!=='operations').map(m=>m.oldTable));
 const unmappedTables=Object.entries(source).filter(([t,v])=>v.length&&!transformed.has(t)).map(([t])=>t);
 return {formatVersion:2 as const,sourceDigest,batch,tables,legacyVault:source,reconciliation,comparisons,unmappedTables,warnings:[...new Set(warnings)],errors:[...new Set(errors)],cutoverReady:false as const};
}
export type NormalizedMigration=ReturnType<typeof normalize>;
