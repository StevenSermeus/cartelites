import { seriesOptions } from '../../../packages/domain/src/seriesFilter';
import test from 'node:test';
import assert from 'node:assert/strict';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../functions/schema';
import {itemRecord,publicRecord,publiclyEligible} from '../functions/compat';
import {publicCataloguePage,type CatalogueArgs} from '../functions/publicCatalogue';
const modules={'./functions/operations.ts':()=>import('../functions/operations'),'./functions/_generated/server.js':()=>import('../functions/_generated/server.js')};
const query=(name:string)=>makeFunctionReference<'query'>(name);
const base:CatalogueArgs={search:'',gradingStatus:'all',gradingCompany:'',gradingGrade:'',paginationOpts:{numItems:12,cursor:null},sort:'recent'};
/** Counts returned documents/database operations, not wall time or provider billing.
 * Filters may scan more rows than they return; the FIFO first() reduction is indexed.
 */
function counted(ctx:any,tables:Map<string,string>){
 const counts:Record<string,{calls:number;documents:number}>={};
 const record=(table:string,value:any)=>{const count=counts[table]??={calls:0,documents:0};count.calls++;count.documents+=Array.isArray(value)?value.length:value===null?0:1;return value;};
 const wrap=(chain:any,table:string):any=>new Proxy(chain,{get(target,key){const value=target[key];if(typeof value!=='function')return value;return (...args:any[])=>{const next=value.apply(target,args);return ['collect','first','unique','take'].includes(String(key))?Promise.resolve(next).then(value=>record(table,value)):wrap(next,table);};}});
 const db=new Proxy(ctx.db,{get(target,key){if(key==='query')return (table:string)=>wrap(target.query(table),table);if(key==='get')return async(id:string)=>record(tables.get(id)??'unknown',await target.get(id));const value=target[key];return typeof value==='function'?value.bind(target):value;}});
 return {ctx:{...ctx,db},counts};
}
async function largeFixture(count=400,lots=30){
 const t=convexTest(schema,modules),tables=new Map<string,string>();
 const ids=await t.run(async ctx=>{
  const insert=async(table:any,row:any)=>{const id=await ctx.db.insert(table,row);tables.set(id,table);return id;};
  const contactId=await insert('contacts',{kind:'company',name:'PRIVATE supplier',address:'PRIVATE address',createdAt:1});
  const purchaseId=await insert('purchases',{contactId,type:'supplier',reference:'PRIVATE receipt',occurredAt:1,status:'active',buyerNote:'PRIVATE note',createdAt:1});
  const companies=await Promise.all(['PSA','CGC'].map(name=>insert('gradingCompanies',{name,normalizedName:name.toLowerCase(),createdAt:1})));
  const products=await Promise.all(Array.from({length:5},(_,i)=>insert('products',{name:`Carte ${i}`,description:`Description ${i}`,type:'card',tcg:i%2?'riftbound':'pokemon',set:`Set ${i}`,printedIdentifier:`${i}/100`,language:i%2?'en':'fr',publicAttributes:{finish:'Holo'},privateAttributes:{evidence:'PRIVATE product evidence'},createdAt:1})));
  const evidence=await insert('files',{objectKey:'PRIVATE-evidence',filename:'private.pdf',contentType:'application/pdf',size:10,uploadState:'complete',createdAt:1});
  const items=[];
  for(let i=0;i<count;i++){
   const item=await insert('stockItems',{productId:products[i%5],tracking:'quantity',askingPriceCents:100+i,visible:true,status:'available',quantity:1,origin:'supplier',condition:'NM',privateNotes:'PRIVATE stock note',createdAt:1000+i});items.push(item);
   const line=await insert('purchaseLines',{purchaseId,stockItemId:item,quantity:1,costCents:13,estimatedValueCents:100,buybackRateBps:1000,tax:{regime:'other',rateBps:2100},createdAt:1});
   for(let j=0;j<lots;j++)await insert('stockLots',{stockItemId:item,source:{kind:'purchase',purchaseId,purchaseLineId:line},originalQuantity:1,remainingQuantity:j===lots-1?1:0,originalCostCents:13,remainingCostCents:j===lots-1?13:0,acquiredAt:1+j,taxRateBps:2100,openingBalanceOnly:false,createdAt:1+j});
   if(i%3!==0)await insert('itemGradings',{stockItemId:item,companyId:companies[i%2],grade:i%2?'9.5':'Authentic',certificate:`CERT-${i}`,notes:'PRIVATE grading note',createdAt:1});
   for(let j=0;j<2;j++){
    const file=await insert('files',{objectKey:`public/${i}/${j}.jpg`,filename:`${i}-${j}.jpg`,contentType:'image/jpeg',size:10,uploadState:'complete',createdAt:1});
    await insert('fileLinks',{fileId:file,target:{table:'stockItems',id:item},purpose:'photo',displayOrder:j,createdAt:1});
    if(j===1)await ctx.db.patch(item,{coverFileId:file});
   }
   for(let j=0;j<10;j++)await insert('fileLinks',{fileId:evidence,target:{table:'stockItems',id:item},purpose:'evidence',displayOrder:j,createdAt:1});
  }
  return {items,purchaseId,contactId,evidence};
 });return {t,tables,ids};
}
async function legacyCatalogue(ctx:any,args:CatalogueArgs){
 const stock=await ctx.db.query('stockItems').withIndex('by_public',(q:any)=>q.eq('visible',true).eq('status','available')).collect();
 const dates=new Map(stock.map((item:any)=>[item._id,item.createdAt]));
 const rows=(await Promise.all(stock.map((item:any)=>itemRecord(ctx,item)))).filter(publiclyEligible).map(publicRecord);
 const gradingCompanies=[...new Set(rows.flatMap(row=>row.gradingCompany?[row.gradingCompany]:[]))].sort((a,b)=>a.localeCompare(b,'fr')),languages=[...new Set(rows.flatMap(row=>row.language?[row.language]:[]))].sort();
 const search=args.search.trim().toLocaleLowerCase();const filtered=rows.filter(item=>(!args.language||item.language===args.language)&&(!args.tcg||args.tcg==='all'||item.tcg===args.tcg)&&(!search||[item.name,item.description,item.series,item.identifier,item.gradingCompany,item.gradingGrade].join(' ').toLocaleLowerCase().includes(search))&&(args.minPrice===undefined||item.salePriceCents!>=args.minPrice)&&(args.maxPrice===undefined||item.salePriceCents!<=args.maxPrice)&&(args.gradingStatus!=='graded'||!!item.gradingCompany)&&(args.gradingStatus!=='ungraded'||!item.gradingCompany)&&(!args.gradingCompany||item.gradingCompany===args.gradingCompany)&&(!args.gradingGrade||(item.gradingGrade??'').toLocaleLowerCase().includes(args.gradingGrade.toLocaleLowerCase())));
 filtered.sort((a,b)=>(args.sort==='name'?a.name.localeCompare(b.name,'fr',{numeric:true}):args.sort==='price-asc'?a.salePriceCents!-b.salePriceCents!:args.sort==='price-desc'?b.salePriceCents!-a.salePriceCents!:Number(dates.get(b.id))-Number(dates.get(a.id)))||a.id.localeCompare(b.id));
 const offset=Number(args.paginationOpts.cursor??0),page=filtered.slice(offset,offset+args.paginationOpts.numItems);return {page,gradingCompanies,languages,series:seriesOptions(rows,args.tcg),totalCount:filtered.length,continueCursor:String(offset+page.length),isDone:offset+page.length>=filtered.length};
}
test('400-item catalogue reads first provenance only and page galleries, with exact global result parity',async context=>{
 const {t,tables}=await largeFixture();
 const baseline=await t.run(async ctx=>{const measured=counted(ctx,tables);return {result:await legacyCatalogue(measured.ctx,base),counts:measured.counts};});
 const current=await t.run(async ctx=>{const measured=counted(ctx,tables);return {result:await publicCataloguePage(measured.ctx,base),counts:measured.counts};});
 assert.deepEqual(current.result,baseline.result);assert.equal(current.result.totalCount,400);
 assert.equal(current.counts.stockLots.documents,400);assert.equal(baseline.counts.stockLots.documents,400); // Staff DTO now independently uses first provenance too.
 assert.equal(current.counts.files.documents,24);assert.equal(baseline.counts.files.documents,800);
 for(const table of ['contacts','purchaseLines','consignmentTerms'])assert.equal(current.counts[table],undefined);
 assert.equal(current.counts.products.documents,5);assert.equal(current.counts.purchases.documents,1);
 const total=(counts:typeof current.counts)=>Object.values(counts).reduce((n,count)=>n+count.documents,0);
 assert.ok(total(current.counts)<total(baseline.counts)/5);
 context.diagnostic(JSON.stringify({items:400,lotsPerItem:30,pageSize:12,metric:'returned documents (filtered scans may read more)',baseline:baseline.counts,current:current.counts,baselineDocuments:total(baseline.counts),currentDocuments:total(current.counts)}));
 const smaller=await largeFixture(20,3);
 for(const args of [{...base,language:'fr',gradingStatus:'graded',minPrice:250,maxPrice:450,sort:'price-asc'},{...base,tcg:'riftbound',search:'Carte',sort:'name',paginationOpts:{numItems:7,cursor:'7'}},{...base,gradingCompany:'PSA',gradingGrade:'Authentic',sort:'price-desc'},{...base,search:'no-match'}]){
  const expected=await smaller.t.run(ctx=>legacyCatalogue(ctx,args)),actual=await smaller.t.query(query('operations:publicCatalogue'),args);assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)));
 }
});
test('public source eligibility, full gallery, cover, pending uploads and private evidence remain protected',async()=>{
 const {t,ids}=await largeFixture(4,3),id=ids.items[0];
 const detail=await t.query(query('operations:publicProduct'),{itemId:id});assert.equal(detail.photos.length,2);assert.equal(detail.coverPhotoId,detail.photos[0].id);
 assert.ok(!JSON.stringify(detail).includes('PRIVATE'));
 const photo=await t.query(query('operations:cataloguePhotoObject'),{itemId:id});assert.equal(photo.objectKey,'public/0/1.jpg');
 assert.equal(await t.query(query('operations:cataloguePhotoObject'),{itemId:id,photoId:ids.evidence}),null);
 const other=await t.query(query('operations:publicProduct'),{itemId:ids.items[1]});assert.equal(await t.query(query('operations:cataloguePhotoObject'),{itemId:id,photoId:other.photos[0].id}),null);
 await t.run(ctx=>ctx.db.patch(detail.coverPhotoId,{uploadState:'pending'}));assert.equal((await t.query(query('operations:publicProduct'),{itemId:id})).photos.length,1);
 await t.run(ctx=>ctx.db.patch(ids.purchaseId,{status:'pending'}));assert.equal(await t.query(query('operations:publicProduct'),{itemId:id}),null);assert.equal(await t.query(query('operations:cataloguePhotoObject'),{itemId:id}),null);assert.equal((await t.query(query('operations:publicCatalogue'),base)).totalCount,0);
 await t.run(ctx=>ctx.db.patch(ids.purchaseId,{status:'active'}));
 const dossier=await t.run(async ctx=>{const dossier=await ctx.db.insert('consignments',{depositorId:ids.contactId,reference:'PRIVATE dossier',occurredAt:1,status:'open',createdAt:1});const revision=await ctx.db.insert('consignmentRevisions',{consignmentId:dossier,number:1,contractText:'PRIVATE contract',contractVersion:'v1',signatureState:'awaiting_signature',createdAt:1});await ctx.db.patch(dossier,{currentRevisionId:revision});await ctx.db.patch(id,{origin:'consignment'});const lot=await ctx.db.query('stockLots').withIndex('by_item_fifo',q=>q.eq('stockItemId',id)).first();await ctx.db.patch(lot!._id,{source:{kind:'consignment',consignmentId:dossier,depositorId:ids.contactId}});return {dossier,revision};});
 assert.equal(await t.query(query('operations:publicProduct'),{itemId:id}),null);
 await t.run(ctx=>ctx.db.patch(dossier.revision,{signatureState:'signed'}));assert.ok(await t.query(query('operations:publicProduct'),{itemId:id}));
 await t.run(ctx=>ctx.db.insert('migrationRuns',{batch:'in-progress',sourceDigest:'source',planDigest:'plan',status:'importing',countsJson:'{}',totalsJson:'{}',createdAt:1}));
 assert.equal(await t.query(query('operations:publicProduct'),{itemId:id}),null);assert.equal(await t.query(query('operations:cataloguePhotoObject'),{itemId:id}),null);assert.equal((await t.query(query('operations:publicCatalogue'),base)).totalCount,0);
});
test('anonymous catalogue page sizes and query inputs are bounded without truncating global totals',async()=>{
 const t=convexTest(schema,modules);
 for(const numItems of [0,49,100000,1.5])await assert.rejects(()=>t.query(query('operations:publicCatalogue'),{...base,paginationOpts:{numItems,cursor:null}}),/INVALID_PAGINATION/);
 for(const cursor of ['-1','wat','1e2','0x10',' ','0'.repeat(1000)])await assert.rejects(()=>t.query(query('operations:publicCatalogue'),{...base,paginationOpts:{numItems:12,cursor}}),/INVALID_CURSOR/);
 await assert.rejects(()=>t.query(query('operations:publicCatalogue'),{...base,minPrice:400,maxPrice:100}),/INVALID_PRICE/);
 for(const fields of [{search:'a'.repeat(201)},{language:'a'.repeat(21)},{gradingCompany:'a'.repeat(101)},{gradingGrade:'a'.repeat(101)},{tcg:'unknown'},{gradingStatus:'unknown'}])await assert.rejects(()=>t.query(query('operations:publicCatalogue'),{...base,...fields}),/INVALID_QUERY/);
 await assert.rejects(()=>t.query(query('operations:publicCatalogue'),{...base,sort:'unknown'}),/INVALID_SORT/);
});
