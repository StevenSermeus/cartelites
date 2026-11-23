import {v} from 'convex/values';
import {activityHistorySources,type ActivityHistoryQuery,type ActivityHistoryRow} from '../../packages/domain/src/history';
export const activityHistoryArgs={source:v.string(),size:v.optional(v.number()),cursor:v.optional(v.string()),search:v.optional(v.string()),from:v.optional(v.number()),to:v.optional(v.number()),status:v.optional(v.string()),origin:v.optional(v.string()),paymentStatus:v.optional(v.string()),eventKind:v.optional(v.string())};
const statuses:Record<string,string[]>={purchases:['pending','active','cancelled'],sales:['active','cancelled'],consignments:['pending','open','closed'],payments:['recorded'],events:['recorded'],receipts:['active'],gifts:['active','cancelled'],openings:['active','cancelled']};
const origins:Record<string,string[]>={purchases:['purchase'],sales:['purchase','supplier','consignment'],consignments:['consignment'],payments:['consignment'],events:['consignment'],receipts:['supplier'],gifts:['purchase','supplier'],openings:['supplier']};
export function historyOptions(input:any){
 const args={...input,size:input.size??25,search:input.search??'',status:input.status??'all',origin:input.origin??'all',paymentStatus:input.paymentStatus??'all',eventKind:input.eventKind??'all'};
 if(!activityHistorySources.includes(args.source)||!Number.isInteger(args.size)||args.size<1||args.size>50||args.search.length>200||(args.cursor?.length??0)>10000)throw new Error('INVALID_HISTORY_FILTER');
 for(const n of [args.from,args.to])if(n!==undefined&&(!Number.isSafeInteger(n)||n<0||!Number.isFinite(new Date(n).getTime())))throw new Error('INVALID_HISTORY_FILTER');
 if(args.from!==undefined&&args.to!==undefined&&args.from>args.to)throw new Error('INVALID_HISTORY_FILTER');
 if(args.status!=='all'&&!statuses[args.source].includes(args.status)||args.origin!=='all'&&!origins[args.source].includes(args.origin)||!['all','received','pending','unknown'].includes(args.paymentStatus)||args.paymentStatus!=='all'&&args.source!=='sales'||!['all','return','terms'].includes(args.eventKind)||args.eventKind!=='all'&&args.source!=='events')throw new Error('INVALID_HISTORY_FILTER');
 const {cursor,...criteria}=args,signature=JSON.stringify(criteria);let continuation:string|null=null;
 if(cursor){try{const saved=JSON.parse(cursor);if(saved.signature!==signature||typeof saved.value!=='string')throw new Error();continuation=saved.value;}catch{throw new Error('INVALID_CURSOR');}}
 return {args:args as Required<Pick<ActivityHistoryQuery,'source'|'size'|'search'|'status'|'origin'|'paymentStatus'|'eventKind'>>&ActivityHistoryQuery,signature,options:{cursor:continuation,numItems:args.size,maximumRowsRead:100,maximumBytesRead:1_000_000}};
}
export const normalized=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
export function historyMatches(row:ActivityHistoryRow,args:ReturnType<typeof historyOptions>['args'],extra=''){
 if(args.status!=='all'&&row.status!==args.status||args.origin!=='all'&&!row.origins.includes(args.origin)||args.paymentStatus!=='all'&&row.paymentStatus!==args.paymentStatus||args.eventKind!=='all'&&row.kind!==args.eventKind)return false;
 if(args.from!==undefined&&(row.occurredAt===null||row.occurredAt<args.from)||args.to!==undefined&&(row.occurredAt===null||row.occurredAt>args.to))return false;
 const haystack=normalized([row._id,row.title,row.reference,row.sellerName,row.supplier,row.itemName,row.recipient,row.reason,row.note,row.authorizationNote,row.method,extra].join(' '));return normalized(args.search).split(/\s+/).filter(Boolean).every(word=>haystack.includes(word));
}
export function historyBase(source:ActivityHistoryRow['source'],r:any):ActivityHistoryRow{return {_id:r._id,source,title:r.reference??r.itemName??source,recordedAt:r._creationTime,occurredAt:typeof r.occurredAt==='number'?r.occurredAt:null,amountCents:null,amountStatus:'unknown',status:'recorded',origins:[],detailsIncomplete:false};}
export function sumKnown(values:(number|null|undefined)[]){if(values.some(n=>n==null))return null;const sum=values.reduce<number>((s,n)=>s+n!,0);if(!Number.isSafeInteger(sum))throw new Error('AMOUNT_OVERFLOW');return sum;}
export const knownAmount=(row:ActivityHistoryRow,amount:number|null)=>({...row,amountCents:amount,amountStatus:amount===null?'unknown' as const:'known' as const});
