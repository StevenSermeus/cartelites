/** Real local Hono/Convex/S3 document acceptance. Never sends email or touches cloud storage. */
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import sharp from 'sharp';
import {ConvexHttpClient} from 'convex/browser';
import {makeFunctionReference} from 'convex/server';
const api='http://127.0.0.1:3002',convex='http://127.0.0.1:3220';
const signature=[[[0.1,0.2],[0.2,0.6],[0.3,0.2],[0.4,0.6],[0.5,0.2]]];
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
async function main(){
 if(process.env.CONVEX_URL!==convex||process.env.DATA_MODEL!=='canonical'||process.env.R2_ENDPOINT!=='http://127.0.0.1:3490'||process.env.BREVO_API_KEY)throw new Error('Dedicated local canonical API and S3 fixture, no email credentials, required');
 const output=process.argv[2];if(!output)throw new Error('Usage: check-canonical-documents.ts private-output-directory');await mkdir(output,{recursive:true,mode:0o700});
 const backend=new ConvexHttpClient(convex),prefix=`QA Documents ${randomUUID()}`,email=`canonical-${randomUUID()}@example.invalid`,password=randomBytes(24).toString('base64url');
 await backend.action(makeFunctionReference<'action'>('authService:execute'),{secret:process.env.CONVEX_AUTH_SECRET??'',operation:'createAccount',payload:{email,passwordHash:await argon2.hash(password),registrationPolicy:'open'}});
 const login=await fetch(`${api}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json','X-Client-Platform':'ios'},body:JSON.stringify({email,password})});assert.equal(login.status,200);const {accessToken:token}=await login.json() as {accessToken:string};
 const call=async(path:string,method='GET',body?:unknown)=>{const response=await fetch(`${api}/api/v1${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const text=await response.text();if(!response.ok)throw new Error(`${method} ${path}: ${response.status} ${text.slice(0,500)}`);return text?JSON.parse(text):null;};
 const artifacts:Array<{name:string;sha256:string;bytes:number}>=[];
 const pdf=async(path:string,name:string,expected?:string)=>{const data=await call(path),bytes=Buffer.from(data.pdfBase64,'base64');assert.ok(bytes.subarray(0,8).toString().startsWith('%PDF-'));if(expected)assert.equal(hash(bytes),expected);await writeFile(resolve(output,`${name}.pdf`),bytes,{mode:0o600});artifacts.push({name,sha256:hash(bytes),bytes:bytes.length});return bytes;};
 await call('/auth/profile','PATCH',{firstName:'QA',lastName:'Documents',capacity:'Isolated verification',signature});
 const contact=await call('/sellers','POST',{operationId:randomUUID(),name:prefix});const now=Date.now();
 const purchase=await call('/purchases','POST',{operationId:randomUUID(),sellerId:contact.id,occurredAt:now,reference:prefix,items:[{operationId:randomUUID(),name:'QA signed card',tcg:'pokemon',series:'QA',identifier:'001/001',language:'fr',condition:'NM',marketValueCents:2000,discountPercent:50,purchasePriceCents:1000,askingPriceCents:2000,vatRegime:'margin'}]});
 const sign=async(kind:string,targetId:string,name:string)=>{const draft=await call('/receipts/prepare','POST',{kind,targetId});const signed=await call(`/receipts/${draft.id}/sign`,'POST',{company:signature,client:signature,accepted:true});assert.equal(signed.emailStatus,'no_email');const bytes=await pdf(`/receipts/${draft.id}/pdf`,name,signed.sha256);const replay=await call(`/receipts/${draft.id}/sign`,'POST',{company:signature,client:signature,accepted:true});assert.equal(replay.sha256,signed.sha256);assert.deepEqual(Buffer.from((await call(`/receipts/${draft.id}/pdf`)).pdfBase64,'base64'),bytes);return draft.id;};
 await sign('purchase',purchase.purchaseId,'purchase');await call(`/purchases/${purchase.purchaseId}/validate`,'POST',{});
 // Real multipart upload, optimization, thumbnail, explicit cover and private evidence separation.
 const image=await sharp({create:{width:40,height:60,channels:3,background:'#c9ac70'}}).png().toBuffer();
 const upload=async(evidence=false)=>{const form=new FormData();form.append('file',new File([image],'qa.png',{type:'image/png'}));form.append('operationId',randomUUID());form.append('itemId',purchase.itemIds[0]);if(evidence)form.append('purchaseId',purchase.purchaseId);const response=await fetch(`${api}/api/v1/attachments`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form});if(!response.ok)throw new Error(`Upload ${response.status}: ${await response.text()}`);return response.json() as Promise<{id:string}>;};
 const photo=await upload(),evidence=await upload(true);await call('/stock/visibility','POST',{operationId:randomUUID(),itemIds:[purchase.itemIds[0]],hidden:false});
 const publicProduct=await (await fetch(`${api}/api/v1/catalogue/${purchase.itemIds[0]}`)).json() as any;
 assert.equal(publicProduct.photos.length,1);assert.equal(publicProduct.photos[0].id,photo.id);assert.equal(publicProduct.coverPhotoId,photo.id);
 for(const forbidden of ['purchasePriceCents','costCents','sellerId','ownerId','depositorId','profitCents','privateMetadata'])assert.ok(!(forbidden in publicProduct));
 const publicPhoto=await fetch(`${api}/api/v1/catalogue/${purchase.itemIds[0]}/photos/${photo.id}?size=thumbnail`);assert.equal(publicPhoto.status,200);assert.equal(publicPhoto.headers.get('content-type'),'image/webp');assert.ok((await publicPhoto.arrayBuffer()).byteLength>0);
 assert.equal((await fetch(`${api}/api/v1/catalogue/${purchase.itemIds[0]}/photos/${evidence.id}`)).status,404);
 const consignment=await call('/consignments','POST',{operationId:randomUUID(),sellerId:contact.id,reference:`${prefix} Depot`,occurredAt:now,flowVersion:2,contractTerms:{version:'qa-v1',text:'Conditions du dépôt de vérification isolée.'},items:[1,2].map(n=>({operationId:randomUUID(),name:`QA deposit ${n}`,productType:'card',askingPriceCents:3000,commissionRateBps:2000}))});
 await sign('consignment',consignment.consignmentId,'consignment');
 const sale=await call('/sales/bulk','POST',{operationId:randomUUID(),occurredAt:now,items:[{itemId:consignment.itemIds[0],salePriceCents:3000,quantity:1}],paymentStatus:'received',payment:{cashCents:1000,transferCents:2000,receivedAt:now}});
 const ticket=await call('/sale-tickets','POST',{operationId:randomUUID(),saleIds:sale.ids});await pdf(`/sale-tickets/${ticket.id}/pdf`,'sale-ticket');
 await call('/consignments/payments','POST',{operationId:randomUUID(),sellerId:contact.id,amountCents:1000,occurredAt:now,method:'cash',reference:'QA partial payout'});
 const statement=await call('/consignments/documents/statement','POST',{operationId:randomUUID(),sellerId:contact.id});await pdf(`/consignments/documents/${statement.id}/pdf`,'statement');
 const financial=await call(`/consignments/documents?sellerId=${contact.id}`);const payout=financial.find((d:any)=>d.kind==='payment');assert.ok(payout);await pdf(`/consignments/documents/${payout.id}/pdf`,'partial-payout');
 const balances=await call('/consignments/balances');assert.equal(balances.balances.find((b:any)=>b.sellerId===contact.id).balanceCents,1400);
 const returned=await call('/consignments/returns/prepare','POST',{operationId:randomUUID(),consignmentId:consignment.consignmentId,itemIds:[consignment.itemIds[1]],occurredAt:Date.now(),conditionNotes:'État inchangé, remis au déposant.'});
 await sign('consignment_return',returned.id,'return');assert.equal((await call(`/stock/${consignment.itemIds[1]}`)).status,'returned');
 const historicalChecks:Array<{sha256:string;bytes:number}>=[];
 const [sourcePath,objectDirectory]=process.argv.slice(3);if(sourcePath&&objectDirectory){
  const source=JSON.parse(await readFile(sourcePath,'utf8'));const originals=new Map<string,any>((source.signedReceipts??[]).filter((d:any)=>d.objectKey&&d.sha256).map((d:any)=>[d.sha256,d]));
  let cursor:string|undefined;do {const page=await call(`/documents?kind=all${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);for(const document of page.items){if(!document.downloadPath||![...originals.values()].some(d=>d.filename===document.filename))continue;const bytes=Buffer.from((await call(document.downloadPath)).pdfBase64,'base64'),original=originals.get(hash(bytes));assert.ok(original,'Downloaded historical document must match an original digest');const baseline=await readFile(resolve(objectDirectory,original.objectKey));assert.deepEqual(bytes,baseline);historicalChecks.push({sha256:hash(bytes),bytes:bytes.length});originals.delete(hash(bytes));}cursor=page.nextCursor??undefined;}while(cursor);
  assert.equal(originals.size,0,'Every archived original must download unchanged through canonical API');assert.ok(historicalChecks.length>0);
 }
 const report={checkedAt:new Date().toISOString(),api,convex,storage:'Local signed-S3 fixture on 3490; no cloud R2 or email transmission',syntheticPrefix:prefix,checks:{signedPurchase:true,signedConsignment:true,signedReturnConsumesStockOnce:true,signedArchiveReplayExactBytes:true,partialPayoutAndStatement:true,saleTicket:true,realImageUploadAndThumbnail:true,explicitCover:true,privateEvidenceExcluded:true,publicPriceAndPrivateDataBoundary:true},historicalChecks,artifacts};
 await call('/auth/logout','POST',{});await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
