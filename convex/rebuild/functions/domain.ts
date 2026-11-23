import {shopDay} from './shopCalendar';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
export function integer(value:number,label:string,min=0){if(!Number.isSafeInteger(value)||value<min)throw new Error(`INVALID_${label}`);return value;}
export function total(values:number[],label='TOTAL'){return values.reduce((n,x)=>integer(n+x,label),0);}
export function timestamp(value:number){if(!Number.isSafeInteger(value)||!Number.isFinite(new Date(value).getTime()))throw new Error('INVALID_DATE');return value;}
export function proportion(cost:number,quantity:number,available:number){return Number(BigInt(cost)*BigInt(quantity)/BigInt(available));}
export async function actor(ctx:QueryCtx|MutationCtx,write=false){
 const identity=await ctx.auth.getUserIdentity();if(!identity)throw new Error('UNAUTHENTICATED');
 if(write&&identity.scope==='realtime:read')throw new Error('READ_ONLY_TOKEN');
 const accountId=ctx.db.normalizeId('accounts',identity.subject);
 const account=accountId?await ctx.db.get(accountId):null;
 if(!account||account.disabledAt!==undefined)throw new Error('ACCOUNT_DISABLED');
 if(identity.sv!==account.sessionVersion)throw new Error('INVALID_SESSION');
 const tokenId=identity.sessionJti;
 if(typeof tokenId!=='string')throw new Error('INVALID_SESSION');
 const session=await ctx.db.query('sessions').withIndex('by_token',q=>q.eq('tokenId',tokenId)).unique();
 if(!session||session.accountId!==account._id||session.revokedAt!==undefined||session.expiresAt<=Date.now())throw new Error('INVALID_SESSION');
 const imports=await ctx.db.query('migrationRuns').collect();
 if(imports.some(run=>run.status==='importing'))throw new Error('MIGRATION_IN_PROGRESS');
 return identity.subject;
}
export function metadata(createdBy:string){const now=Date.now();return {createdBy,updatedBy:createdBy,createdAt:now,updatedAt:now,revision:1};}
export async function operation(ctx:MutationCtx,by:string,key:string,kind:string,payload:unknown){
 if(!key.trim()||key.length>200)throw new Error('INVALID_OPERATION_KEY');
 const hash=JSON.stringify(payload);
 const previous=await ctx.db.query('operations').withIndex('by_actor_key',q=>q.eq('actor',by).eq('key',key)).unique();
 if(previous&&(previous.kind!==kind||previous.payloadHash!==hash))throw new Error('IDEMPOTENCY_KEY_REUSED');
 return {previous,record:async(results:Doc<'operations'>['results'])=>ctx.db.insert('operations',{...metadata(by),actor:by,key,kind,payloadHash:hash,results})};
}
export async function audit(ctx:MutationCtx,by:string,record:Doc<'auditEvents'>['record'],action:string,change:unknown){
 await ctx.db.insert('auditEvents',{...metadata(by),actor:by,record,action,occurredAt:Date.now(),changeJson:JSON.stringify(change)});
}
export async function fifo(ctx:QueryCtx|MutationCtx,item:Doc<'stockItems'>,quantity:number,occurredAt?:number){
 integer(quantity,'QUANTITY',1);if(item.status!=='available'||item.quantity<quantity)throw new Error('ITEM_UNAVAILABLE');
 const lots=await ctx.db.query('stockLots').withIndex('by_item_fifo',q=>q.eq('stockItemId',item._id)).collect();
 const allocations:{lot:Doc<'stockLots'>;quantity:number;costCents:number|null}[]=[];let remaining=quantity;
 for(const lot of lots){if(!remaining)break;if(lot.remainingQuantity<=0||(occurredAt!==undefined&&shopDay(lot.acquiredAt)>shopDay(occurredAt)))continue;const take=Math.min(remaining,lot.remainingQuantity);
  const costCents=lot.remainingCostCents===null?null:proportion(lot.remainingCostCents,take,lot.remainingQuantity);
  allocations.push({lot,quantity:take,costCents});remaining-=take;
 }
 if(remaining)throw new Error(occurredAt===undefined?'STOCK_LEDGER_MISMATCH':'ITEM_UNAVAILABLE_AT_DATE');
 return {allocations,costCents:allocations.some(x=>x.costCents===null)?null:total(allocations.map(x=>x.costCents!),'COST')};
}
export async function consume(ctx:MutationCtx,by:string,item:Doc<'stockItems'>,quantity:number,operationId:Id<'stockOperations'>,emptyStatus:Doc<'stockItems'>['status']='sold',occurredAt?:number){
 const plan=await fifo(ctx,item,quantity,occurredAt);
 for(const allocation of plan.allocations){const lot=allocation.lot;
  await ctx.db.patch(lot._id,{remainingQuantity:lot.remainingQuantity-allocation.quantity,remainingCostCents:lot.remainingCostCents===null?null:lot.remainingCostCents-allocation.costCents!,updatedAt:Date.now(),updatedBy:by,revision:(lot.revision??1)+1});
  await ctx.db.insert('stockMovements',{...metadata(by),operationId,lotId:lot._id,quantityDelta:-allocation.quantity,costDeltaCents:allocation.costCents===null?null:-allocation.costCents});
 }
 await ctx.db.patch(item._id,{quantity:item.quantity-quantity,status:item.quantity===quantity?emptyStatus:'available',updatedAt:Date.now(),updatedBy:by,revision:(item.revision??1)+1});
 return plan;
}
export async function depositorBalance(ctx:QueryCtx|MutationCtx,depositorId:Id<'contacts'>,at?:number){
 const lines=await ctx.db.query('saleLines').withIndex('by_depositor',q=>q.eq('depositorId',depositorId)).collect();let entitled=0;
 for(const line of lines)if(line.paymentStatus==='received'&&(await ctx.db.get(line.saleId))?.status==='confirmed'){
  if(at!==undefined){const payment=(await ctx.db.query('salePayments').withIndex('by_sale',q=>q.eq('saleId',line.saleId)).collect()).find(p=>p.status==='active');if(!payment||shopDay(payment.occurredAt)>shopDay(at))continue;}
  entitled+=line.depositorAmountCents??0;
 }
 const payouts=(await ctx.db.query('depositorPayouts').withIndex('by_depositor',q=>q.eq('depositorId',depositorId)).collect()).filter(p=>at===undefined||shopDay(p.occurredAt)<=shopDay(at));
 return {entitledCents:entitled,paidCents:payouts.reduce((n,p)=>n+p.amountCents,0),balanceCents:entitled-payouts.reduce((n,p)=>n+p.amountCents,0)};
}
