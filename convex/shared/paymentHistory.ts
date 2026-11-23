import type {SalePaymentSnapshot} from '../../packages/domain/src/history';
export function paymentSnapshot(payment:any,status?:string):SalePaymentSnapshot {
 const collectionStatus=status==='received'||status==='pending'||status==='unknown'?status:payment?'received':'unknown';
 return {collectionStatus,cashCents:payment?.cashCents??null,transferCents:payment?.transferCents??null,receivedAt:payment?.receivedAt??payment?.occurredAt??null,reference:payment?.reference??null};
}
export function historyCursor(saleId:string,size:number,cursor?:string){
 if(!Number.isInteger(size)||size<1||size>50||(cursor?.length??0)>10000)throw new Error('INVALID_PAGINATION');
 if(!cursor)return {phase:'rows',value:null as string|null};
 try{const saved=JSON.parse(cursor);if(saved.saleId!==saleId||saved.size!==size||!['rows','initial'].includes(saved.phase)||(saved.value!==null&&typeof saved.value!=='string'))throw new Error();return saved as {phase:string;value:string|null};}catch{throw new Error('INVALID_CURSOR');}
}
export const nextHistoryCursor=(saleId:string,size:number,value:string|null,phase='rows')=>JSON.stringify({saleId,size,value,phase});
export async function paymentActor(ctx:any,id:string|undefined,canonical=false){
 if(!id)return null;let normalized=ctx.db.normalizeId('accounts',id);
 if(!normalized&&canonical){const mapping=await ctx.db.query('legacyMappings').withIndex('by_legacy_record',(q:any)=>q.eq('oldTable','accounts').eq('oldId',id).eq('newTable','accounts')).first();normalized=mapping?ctx.db.normalizeId('accounts',mapping.newId):null;}
 const account=normalized?await ctx.db.get(normalized):null;if(!account)return null;
 return account.signatory?`${account.signatory.firstName} ${account.signatory.lastName}`.trim()||account.email:account.email;
}
