/** Offline, deterministic rehearsal. Never connects to Convex or R2. */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
type Row = Record<string, unknown> & { _id: string };
export type Export = Record<string, Row[]>;
const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const mapping = {sellers:'contacts',items:'stockItems',purchases:'purchases',sales:'saleLines',stockLots:'stockLots',consignments:'consignments',attachments:'files',signedReceipts:'documents',saleTickets:'documents',consignmentDocuments:'documents',consignmentPayments:'depositorPayouts'} as const;
export function rehearse(source: Export) {
  const mappings: {oldTable:string;oldId:string;newTable:string;newId:string}[]=[];
  const warnings:string[]=[], errors:string[]=[];
  const tables:Record<string,Row[]>={};
  const sourceCounts:Record<string,number>={};
  const lookup = new Map<string,Row>();
  for (const [table, rows] of Object.entries(source)) {
    if (!Array.isArray(rows)) throw new Error(`Invalid export table: ${table}`);
    sourceCounts[table]=rows.length;
    const seen=new Set<string>();
    for(const row of rows) {
      if (!row._id || seen.has(row._id)) throw new Error(`Missing or duplicate ID: ${table}/${row._id}`);
      seen.add(row._id);lookup.set(`${table}/${row._id}`,row);
      const target=mapping[table as keyof typeof mapping] ?? `legacy:${table}`;
      const id=`${target}:${hash([table,row._id]).slice(0,32)}`;
      mappings.push({oldTable:table,oldId:row._id,newTable:target,newId:id});
      // Full source retained so no unmapped fields, signatures or snapshots disappear.
      (tables[target]??=[]).push({_id:id,legacyTable:table,legacyId:row._id,source:row});
    }
    if (!(table in mapping)) warnings.push(`${table}: preserved unchanged in legacy envelope; normalized adapter pending`);
  }
  for(const lot of source.stockLots??[]) {
    for(const key of ['received','remaining','totalCostCents','remainingCostCents']) if(!Number.isSafeInteger(lot[key]) || Number(lot[key])<0) errors.push(`stockLots/${lot._id}: invalid ${key}`);
    if(Number(lot.remaining)>Number(lot.received)||Number(lot.remainingCostCents)>Number(lot.totalCostCents)) errors.push(`stockLots/${lot._id}: balance exceeds origin`);
    if(!lookup.has(`items/${lot.itemId}`)) errors.push(`stockLots/${lot._id}: dangling item ${lot.itemId}`);
  }
  for(const sale of source.sales??[]) {
    if(!lookup.has(`items/${sale.itemId}`)) errors.push(`sales/${sale._id}: dangling item ${sale.itemId}`);
    if(!Number.isSafeInteger(sale.salePriceCents)||Number(sale.salePriceCents)<0) errors.push(`sales/${sale._id}: invalid total`);
    const payment=sale.payment as {cashCents:number;transferCents:number}|undefined;
    if(payment && payment.cashCents+payment.transferCents!==sale.salePriceCents) errors.push(`sales/${sale._id}: payment does not reconcile`);
    if(!sale.paymentStatus) warnings.push(`sales/${sale._id}: legacy unknown payment status preserved`);
    for(const allocation of (sale.allocations??[]) as {lotId:string;quantity:number;costCents:number}[]) if(!lookup.has(`stockLots/${allocation.lotId}`)) errors.push(`sales/${sale._id}: dangling allocation ${allocation.lotId}`);
  }
  for(const attachment of source.attachments??[]) for(const [field,table] of [['itemId','items'],['purchaseId','purchases'],['supplierReceiptId','supplierReceipts'],['giftId','stockGifts']]) if(attachment[field]&&!lookup.has(`${table}/${attachment[field]}`)) errors.push(`attachments/${attachment._id}: dangling ${field}`);
  const sum=(table:string,field:string,filter=(r:Row)=>true)=>(source[table]??[]).filter(filter).reduce((total,row)=>total+(typeof row[field]==='number'?row[field] as number:0),0);
  const active=(r:Row)=>r.status==='active';
  const reconciliation={stockRemaining:sum('stockLots','remaining'),stockRemainingCostCents:sum('stockLots','remainingCostCents'),purchaseCostCents:sum('items','purchasePriceCents'),activeSalesCents:sum('sales','salePriceCents',active),depositorEntitlementCents:sum('sales','depositorAmountCents',r=>active(r)&&r.paymentStatus==='received'),depositorPayoutCents:sum('consignmentPayments','amountCents'),documents:(source.signedReceipts?.length??0)+(source.saleTickets?.length??0)+(source.consignmentDocuments?.length??0),media:source.attachments?.length??0};
  const objectReferences=Object.entries(source).flatMap(([table,rows])=>rows.filter(r=>typeof r.objectKey==='string').map(r=>({table,id:r._id,objectKey:r.objectKey as string,sha256:r.sha256 as string|undefined})));
  return {version:1,sourceDigest:hash(source),mappings,tables,sourceCounts,reconciliation,objectReferences,warnings,errors,cutoverReady:false};
}
export async function verifyObjects(references:{objectKey:string;sha256?:string}[],directory:string) {
  const results=[];
  for(const ref of references) {
    const file=resolve(directory,ref.objectKey), rel=relative(resolve(directory),file);
    if(rel.startsWith('..')||rel==='') throw new Error(`Unsafe object key: ${ref.objectKey}`);
    try { const resolved=await realpath(file), root=await realpath(directory); const actualRelative=relative(root,resolved); if(actualRelative.startsWith('..')||actualRelative==='') throw new Error('Object symlink escapes backup directory'); const bytes=await readFile(resolved); const actual=createHash('sha256').update(bytes).digest('hex');results.push({...ref,actual,size:bytes.length,status:ref.sha256 ? (actual===ref.sha256?'verified':'mismatch') : 'unverified-no-baseline'}); }
    catch {results.push({...ref,status:'missing'});}
  }
  return results;
}
async function main() {
  const [input,out,objects]=process.argv.slice(2);
  if(!input||!out) throw new Error('Usage: tsx scripts/migration/rehearse.ts export.json output-directory [copied-object-directory]');
  const source=JSON.parse(await readFile(input,'utf8')) as Export;
  const result=rehearse(source);await mkdir(out,{recursive:true});
  // Stable full output makes reruns idempotent; no server writes or additive imports.
  await writeFile(resolve(out,'rehearsal.json'),JSON.stringify(result,null,2));
  if(objects) {
    const checks=await verifyObjects(result.objectReferences,objects);
    await writeFile(resolve(out,'objects.json'),JSON.stringify(checks,null,2));
    if(checks.some(check=>check.status==='missing'||check.status==='mismatch')) process.exitCode=1;
  }
  console.log(JSON.stringify({digest:result.sourceDigest,counts:result.sourceCounts,reconciliation:result.reconciliation,errors:result.errors.length,warnings:result.warnings.length,cutoverReady:false},null,2));
  if(result.errors.length) process.exitCode=1;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) main().catch(error=>{console.error(error.message);process.exitCode=1;});
