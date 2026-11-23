import {v} from 'convex/values';
export const exportResources=['purchases','sales','stock','stockLots','consignments','payments','contacts'] as const;
export type ExportResource=typeof exportResources[number];
export const exportArgs={resource:v.string(),size:v.optional(v.number()),cursor:v.optional(v.string())};
export function exportOptions(args:{resource:string;size?:number;cursor?:string}){
 if(!exportResources.includes(args.resource as ExportResource))throw new Error('INVALID_EXPORT_RESOURCE');
 const size=args.size??25;if(!Number.isInteger(size)||size<1||size>25)throw new Error('INVALID_PAGINATION');
 if((args.cursor?.length??0)>10000)throw new Error('INVALID_CURSOR');
 let cursor:string|null=null;
 if(args.cursor){try{const value=JSON.parse(args.cursor);if(value.resource!==args.resource||typeof value.value!=='string')throw new Error();cursor=value.value;}catch{throw new Error('INVALID_CURSOR');}}
 return {resource:args.resource as ExportResource,options:{numItems:size,cursor,maximumRowsRead:250,maximumBytesRead:1_000_000}};
}
export function exportResult(resource:string,page:{isDone:boolean;continueCursor:string},items:unknown[]){return {items,isDone:page.isDone,nextCursor:page.isDone?null:JSON.stringify({resource,value:page.continueCursor}),consistency:'reading-interval' as const};}
/** Cumulative apportionment preserves the actual collected amount, including historical partial payments. */
export function apportionedCents(weights:number[],amount:number){
 if(!Number.isSafeInteger(amount)||amount<0||weights.some(n=>!Number.isSafeInteger(n)||n<0))throw new Error('INVALID_EXPORT_AMOUNT');
 const total=weights.reduce((n,w)=>n+BigInt(w),0n);if(total===0n){if(amount!==0)throw new Error('INCONSISTENT_EXPORT_PAYMENT');return weights.map(()=>0);}
 let cumulative=0n,previous=0n;return weights.map(weight=>{cumulative+=BigInt(weight);const next=cumulative*BigInt(amount)/total,result=Number(next-previous);previous=next;return result;});
}
export function apportionedPayment(weights:number[],cashCents:number,transferCents:number){
 const total=cashCents+transferCents;if(!Number.isSafeInteger(total)||cashCents<0||transferCents<0)throw new Error('INVALID_EXPORT_AMOUNT');
 const collected=apportionedCents(weights,total),cash=apportionedCents(collected,cashCents);
 return {cash,transfer:collected.map((amount,index)=>amount-cash[index])};
}
