import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const archive=process.argv[2];
if(!archive) throw new Error('Pass verified source archive ZIP path');
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const expected=readFileSync(archive+'.sha256','utf8').split(/\s/)[0];
if(sha(readFileSync(archive))!==expected) throw new Error('Archive checksum mismatch');
execFileSync('unzip',['-t',archive]);
const baseline=mkdtempSync(join(tmpdir(),'cartelites-pdf-'));
execFileSync('unzip',['-q',archive,'-d',baseline]);
const output=resolve('docs/rebuild/pdf-evidence');mkdirSync(output,{recursive:true});
const load=(root:string,p:string)=>import(pathToFileURL(join(root,p)).href);
const evidence=[];
for(const count of [3,10,30,31,32,33]) {
 const files=[];
 for(const [label,root] of [['baseline',baseline],['current',process.cwd()]]) {
  const {createPurchaseReceiptPdf}=await load(root,'packages/domain/src/purchaseReceipt.ts');
  const {brand}=await load(root,'branding/brand.ts');const {legal}=await load(root,'branding/legal.ts');const {receiptLogoData}=await load(root,'branding/receiptLogoData.ts');
  const input={reference:`REBUILD-${count}`,occurredAt:1795000000000,client:{name:'Élodie Test',email:'test@example.test'},signatory:{firstName:'Alex',lastName:'Martin',capacity:'Gérant'},items:Array.from({length:count},(_,i)=>({name:`Carte ${i+1}`,series:'Collection anniversaire',identifier:`${i+1}/106`,language:'fr',condition:'NM',marketValueCents:1000,discountPercent:80,purchasePriceCents:800}))};
  const signature=[[[0.1,0.2],[0.2,0.4],[0.4,0.2],[0.6,0.6],[0.8,0.3]]];
  let pdf;
  if(count===31) {
    const {createConsignmentReceiptPdf}=await load(root,'packages/domain/src/consignmentReceipt.ts');
    pdf=createConsignmentReceiptPdf({...input,items:input.items.slice(0,3).map(x=>({...x,agreedPriceCents:1000,commissionRateBps:2000})),contractRevision:2,contractTerms:{version:'test-v2',text:'Conditions de dépôt de vérification.'},signatures:{company:signature,client:signature,signedAt:1795000000000}},receiptLogoData,{brand,legal});
  } else if(count===32) {
    const {createConsignmentDocumentPdf}=await load(root,'packages/domain/src/consignmentDocument.ts');
    pdf=createConsignmentDocumentPdf({...input,title:'Restitution de dépôt',lines:[{label:'Carte 1',detail:'État NM · restitution'}],totals:['Total : 1 article'],notes:['Contrôle de conservation'],signatures:{company:signature,client:signature,signedAt:1795000000000}},receiptLogoData,{brand,legal});
  } else if(count===33) {
    const {createSaleTicketPdf}=await load(root,'apps/api/src/receipts/saleTicket.ts');const {receiptIdentity}=await load(root,'apps/api/src/receiptIdentity.ts');
    pdf=createSaleTicketPdf({reference:'SALE-VERIFY',occurredAt:1795000000000,lines:[{saleId:'fixture',name:'Display',quantity:2,totalCents:28000,status:'active',paymentStatus:'received',payment:{cashCents:18000,transferCents:10000},vatRegime:'other',origin:'supplier',taxRateBps:2100}]},receiptIdentity);
  } else pdf=createPurchaseReceiptPdf(input,receiptLogoData,{brand,legal});
  const file=join(output,`${label}-${count}.pdf`);writeFileSync(file,pdf,'binary');
  execFileSync('pdftoppm',['-scale-to','1000','-png',file,join(output,`${label}-${count}`)]);
  execFileSync('pdftotext',[file,file+'.txt']); files.push(file);
 }
 const pages=readdirSync(output).filter(p=>p.startsWith(`baseline-${count}-`)&&p.endsWith('.png'));
 const bytesMatch=sha(readFileSync(files[0]))===sha(readFileSync(files[1]));
 const contentMatch=readFileSync(files[0]+'.txt','utf8')===readFileSync(files[1]+'.txt','utf8');
 const renderedPagesMatch=pages.every(p=>sha(readFileSync(join(output,p)))===sha(readFileSync(join(output,p.replace('baseline','current')))));
 evidence.push({fixture:count===31?'signed-consignment':count===32?'signed-return':count===33?'mixed-payment-ticket':`purchase-${count}`,pages:pages.length,bytesMatch,contentMatch,renderedPagesMatch});
 if(!contentMatch||!renderedPagesMatch) throw new Error(`PDF regression: ${count}`);
}
writeFileSync(join(output,'results.json'),JSON.stringify({archiveSHA256:expected,evidence,metadata:'Fixed input timestamps. These renderers emit deterministic bytes; no metadata stripping was needed. This renderer-only script does not check historical R2 originals; separate canonical-document-checks.json records actual archive download verification.'},null,2)+'\n');
console.log(JSON.stringify(evidence));
