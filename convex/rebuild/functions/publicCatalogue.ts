import { itemTcg, matchesSeries, seriesOptions } from '../../../packages/domain/src/seriesFilter';
/** Public catalogue projection. Never hydrate acquisition lines, contacts, terms or evidence.
 * Exact global facets/totals still require the eligible stock set; galleries are loaded only
 * after filtering/sorting/paging. Query-local caches share product/source/company reads.
 */
import type {PaginationOptions} from 'convex/server';
import type {QueryCtx} from './_generated/server';
import type {Doc,Id,TableNames} from './_generated/dataModel';

export type CatalogueArgs={language?:string;tcg?:string;series?:string;paginationOpts:PaginationOptions;search:string;minPrice?:number;maxPrice?:number;gradingStatus:string;gradingCompany:string;gradingGrade:string;sort?:string};
export async function catalogueImporting(ctx:QueryCtx){return !!await ctx.db.query('migrationRuns').filter(q=>q.eq(q.field('status'),'importing')).first();}
export function createPublicReader(ctx:QueryCtx){
 const documents=new Map<string,Promise<unknown>>();
 function get<T extends TableNames>(id:Id<T>):Promise<Doc<T>|null>{let value=documents.get(id);if(!value){value=ctx.db.get(id);documents.set(id,value);}return value as Promise<Doc<T>|null>;}
 async function eligible(item:Doc<'stockItems'>){
  if(!item.visible||item.status!=='available'||item.quantity<=0||item.askingPriceCents===null)return false;
  // The oldest source is the same provenance used by the staff DTO, without loading every FIFO lot.
  const lot=await ctx.db.query('stockLots').withIndex('by_item_fifo',q=>q.eq('stockItemId',item._id)).first();
  if(lot?.source.kind==='purchase')return (await get(lot.source.purchaseId))?.status==='active';
  if(lot?.source.kind==='consignment'){
   const dossier=await get(lot.source.consignmentId),revision=dossier?.currentRevisionId?await get(dossier.currentRevisionId):null;
   return !!dossier&&revision?.signatureState==='signed';
  }
  return item.origin==='supplier'; // Includes received/opened supplier stock without a purchase source.
 }
 async function candidate(item:Doc<'stockItems'>){
  if(!await eligible(item))return null;
  const product=await get(item.productId);if(!product)return null;
  const grading=await ctx.db.query('itemGradings').withIndex('by_item',q=>q.eq('stockItemId',item._id).eq('supersededAt',undefined)).first();
  const company=grading?await get(grading.companyId):null;
  // Keep this explicit allowlist independent of the private staff compatibility DTO.
  const row={id:item._id,productType:product.type,publicAttributes:product.publicAttributes,variant:product.variant,name:product.name,description:product.description,tcg:product.tcg,series:product.set??'',identifier:product.printedIdentifier??'',language:product.language,condition:item.condition,gradingCompany:company?.name,gradingGrade:grading?.grade,gradingCertificate:grading?.certificate,catalogueImageUrl:product.catalogue?.imageUrl,...(item.priceVisible===false?{}:{salePriceCents:item.askingPriceCents!}),quantity:item.quantity};
  return {item,createdAt:item.createdAt??item._creationTime,row};
 }
 async function photos(item:Doc<'stockItems'>){
  const links=await ctx.db.query('fileLinks').withIndex('by_target',q=>q.eq('target.table','stockItems').eq('target.id',item._id)).filter(q=>q.eq(q.field('purpose'),'photo')).collect();
  links.sort((a,b)=>Number(b.fileId===item.coverFileId)-Number(a.fileId===item.coverFileId)||a.displayOrder-b.displayOrder);
  const files=await Promise.all(links.map(link=>get(link.fileId)));return files.filter((file):file is Doc<'files'>=>file!==null&&file.uploadState==='complete');
 }
 async function withPhotos(value:NonNullable<Awaited<ReturnType<typeof candidate>>>){
  const files=await photos(value.item);return {...value.row,hasPhoto:files.length>0,coverPhotoId:files[0]?._id,photos:files.map(file=>({id:file._id}))};
 }
 return {get,eligible,candidate,photos,withPhotos};
}
export async function publicProductRecord(ctx:QueryCtx,itemId:string){
 if(await catalogueImporting(ctx))return null;
 const id=ctx.db.normalizeId('stockItems',itemId),item=id?await ctx.db.get(id):null;if(!item)return null;
 const reader=createPublicReader(ctx),candidate=await reader.candidate(item);return candidate?reader.withPhotos(candidate):null;
}
export async function publicPhotoObject(ctx:QueryCtx,itemId:string,photoId?:string){
 if(await catalogueImporting(ctx))return null;
 const id=ctx.db.normalizeId('stockItems',itemId),item=id?await ctx.db.get(id):null;if(!item)return null;
 const reader=createPublicReader(ctx);if(!await reader.eligible(item)||!await reader.get(item.productId))return null;
 let file:Doc<'files'>|null;
 if(photoId){
  const fileId=ctx.db.normalizeId('files',photoId);if(!fileId)return null;
  const link=await ctx.db.query('fileLinks').withIndex('by_file',q=>q.eq('fileId',fileId)).filter(q=>q.and(q.eq(q.field('target.table'),'stockItems'),q.eq(q.field('target.id'),item._id),q.eq(q.field('purpose'),'photo'))).first();
  file=link?await reader.get(fileId):null;
 }else file=(await reader.photos(item))[0]??null;
 return file?.uploadState==='complete'&&['image/jpeg','image/png','image/webp'].includes(file.contentType)?{objectKey:file.objectKey,contentType:file.contentType}:null;
}
export async function publicCataloguePage(ctx:QueryCtx,args:CatalogueArgs){
 const size=args.paginationOpts.numItems,offset=Number(args.paginationOpts.cursor??0);
 if(!Number.isInteger(size)||size<1||size>48)throw new Error('INVALID_PAGINATION');
 if((args.paginationOpts.cursor?.length??0)>20||(args.paginationOpts.cursor!==null&&!/^\d+$/.test(args.paginationOpts.cursor))||!Number.isSafeInteger(offset)||offset<0)throw new Error('INVALID_CURSOR');
 if(args.search.length>200||(args.series?.length??0)>300||(args.language?.length??0)>20||args.gradingCompany.length>100||args.gradingGrade.length>100)throw new Error('INVALID_QUERY');
 if(args.tcg&&!['all','pokemon','riftbound','other'].includes(args.tcg)||!['all','graded','ungraded'].includes(args.gradingStatus))throw new Error('INVALID_QUERY');
 if(args.sort&&!['recent','name','price-asc','price-desc'].includes(args.sort))throw new Error('INVALID_SORT');
 for(const price of [args.minPrice,args.maxPrice])if(price!==undefined&&(!Number.isSafeInteger(price)||price<0))throw new Error('INVALID_PRICE');
 if(args.minPrice!==undefined&&args.maxPrice!==undefined&&args.minPrice>args.maxPrice)throw new Error('INVALID_PRICE');
 if(await catalogueImporting(ctx))return {page:[],totalCount:0,isDone:true,continueCursor:'0',gradingCompanies:[],languages:[],series:[]};
 const stock=await ctx.db.query('stockItems').withIndex('by_public',q=>q.eq('visible',true).eq('status','available')).collect(),reader=createPublicReader(ctx);
 const candidates=(await Promise.all(stock.map(item=>reader.candidate(item)))).filter(value=>value!==null);
 const series=seriesOptions(candidates.map(({row})=>row),args.tcg);
 const gradingCompanies=[...new Set(candidates.flatMap(({row})=>row.gradingCompany?[row.gradingCompany]:[]))].sort((a,b)=>a.localeCompare(b,'fr'));
 const languages=[...new Set(candidates.flatMap(({row})=>row.language?[row.language]:[]))].sort();
 const search=args.search.trim().toLocaleLowerCase();
 const filtered=candidates.filter(({row:item})=>(matchesSeries(item,args.series))&&(!args.language||item.language===args.language)&&(!args.tcg||args.tcg==='all'||itemTcg(item)===args.tcg)&&(!search||[item.name,item.description,item.series,item.identifier,item.gradingCompany,item.gradingGrade].join(' ').toLocaleLowerCase().includes(search))&&(args.minPrice===undefined||item.salePriceCents===undefined||item.salePriceCents>=args.minPrice)&&(args.maxPrice===undefined||item.salePriceCents===undefined||item.salePriceCents<=args.maxPrice)&&(args.gradingStatus!=='graded'||!!item.gradingCompany)&&(args.gradingStatus!=='ungraded'||!item.gradingCompany)&&(!args.gradingCompany||item.gradingCompany===args.gradingCompany)&&(!args.gradingGrade||(item.gradingGrade??'').toLocaleLowerCase().includes(args.gradingGrade.toLocaleLowerCase())));
 filtered.sort((a,b)=>(args.sort==='name'?a.row.name.localeCompare(b.row.name,'fr',{numeric:true}):args.sort==='price-asc'?(a.row.salePriceCents??Number.MAX_SAFE_INTEGER)-(b.row.salePriceCents??Number.MAX_SAFE_INTEGER):args.sort==='price-desc'?(b.row.salePriceCents??-1)-(a.row.salePriceCents??-1):b.createdAt-a.createdAt)||a.row.id.localeCompare(b.row.id));
 const page=await Promise.all(filtered.slice(offset,offset+size).map(value=>reader.withPhotos(value)));
 return {page,gradingCompanies,languages,series,totalCount:filtered.length,continueCursor:String(offset+page.length),isDone:offset+page.length>=filtered.length};
}
