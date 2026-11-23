import test from 'node:test';
import assert from 'node:assert/strict';
import {convexTest} from 'convex-test';
import schema from '../functions/schema';
import {dashboardSummary} from '../functions/readModels';
import {balanceRecord,itemRecord} from '../functions/compat';
const modules={'./functions/readModels.ts':()=>import('../functions/readModels'),'./functions/_generated/server.js':()=>import('../functions/_generated/server.js')};
function measured(ctx:any,tables:Map<string,string>){
 const counts:Record<string,{queries:number;documents:number;jsonBytes:number}>={};
 const record=(table:string,result:any)=>{const count=counts[table]??={queries:0,documents:0,jsonBytes:0};count.queries++;const docs=Array.isArray(result)?result:result===null?[]:[result];count.documents+=docs.length;count.jsonBytes+=docs.reduce((n:number,row:any)=>n+Buffer.byteLength(JSON.stringify(row)),0);return result;};
 const wrap=(chain:any,table:string):any=>new Proxy(chain,{get(target,key){const value=target[key];if(typeof value!=='function')return value;return (...args:any[])=>{const next=value.apply(target,args);return ['collect','first','unique','take'].includes(String(key))?Promise.resolve(next).then(result=>record(table,result)):wrap(next,table);};}});
 return {counts,ctx:{...ctx,db:new Proxy(ctx.db,{get(target,key){if(key==='query')return(table:string)=>wrap(target.query(table),table);if(key==='get')return async(id:string)=>record(tables.get(id)??'other',await target.get(id));const value=target[key];return typeof value==='function'?value.bind(target):value;}})}};
}
async function fixture(sales=2000,purchases=500,depositors=100){
 const t=convexTest(schema,modules),tables=new Map<string,string>(),date=Date.now()-86400000;
 const data=await t.run(async ctx=>{
  const insert=async(table:any,value:any)=>{const id=await ctx.db.insert(table,value);tables.set(id,table);return id;};
  const account=await insert('accounts',{email:'capacity@example.invalid',passwordHash:'test',sessionVersion:0,createdAt:date});await insert('sessions',{accountId:account,tokenId:'capacity',lastActivityAt:date,expiresAt:Date.now()+60000,createdAt:date});
  const contact=await insert('contacts',{kind:'company',name:'Supplier',createdAt:date}),product=await insert('products',{type:'card',tcg:'pokemon',name:'Card',description:'',createdAt:date});
  const supplierItems=[];for(let i=0;i<purchases;i++){
   const item=await insert('stockItems',{productId:product,tracking:'quantity',askingPriceCents:200,visible:false,status:'available',quantity:7,origin:'supplier',createdAt:date});supplierItems.push(item);
   const purchase=await insert('purchases',{contactId:contact,type:'supplier',reference:`P${i}`,occurredAt:date,status:'active',createdAt:date});await insert('purchaseLines',{purchaseId:purchase,stockItemId:item,quantity:10,costCents:1000,estimatedValueCents:null,buybackRateBps:null,tax:{regime:'margin',rateBps:null},createdAt:date});await insert('stockOperations',{kind:'acquisition',occurredAt:date,createdAt:date});
  }
  const people=[];for(let i=0;i<depositors;i++){const depositor=await insert('contacts',{kind:'person',name:`Depositor${i}`,createdAt:date});people.push(depositor);await insert('consignments',{depositorId:depositor,reference:`D${i}`,occurredAt:date,status:'open',createdAt:date});await insert('depositorPayouts',{depositorId:depositor,amountCents:100,method:'cash',occurredAt:date,createdAt:date});}
  const saleIds=[];for(let i=0;i<sales;i++){
   const deposit=i%4===0,depositor=people[i%depositors];const item=deposit?await insert('stockItems',{productId:product,tracking:'individual',askingPriceCents:200,visible:false,status:'sold',quantity:0,origin:'consignment',createdAt:date}):supplierItems[i%purchases];
   const sale=await insert('sales',{reference:`S${i}`,occurredAt:date,status:'confirmed',createdAt:date});saleIds.push(sale);
   await insert('saleLines',{saleId:sale,stockItemId:item,quantity:1,lineTotalCents:200,costCents:deposit?null:100,description:'Card',taxRateBps:null,taxRegime:'margin',...(deposit?{depositorId:depositor}:{}),commissionCents:deposit?60:null,depositorAmountCents:deposit?140:null,paymentStatus:'received',createdAt:date});
   await insert('salePayments',{saleId:sale,occurredAt:date,cashCents:200,transferCents:0,status:'superseded',createdAt:date});await insert('salePayments',{saleId:sale,occurredAt:date,cashCents:120,transferCents:80,status:'active',createdAt:date});await insert('stockOperations',{kind:'sale',occurredAt:date,createdAt:date});
  }
  return {account,contact,people,saleIds,supplierItems,product};
 });
 const run=async(fn:any)=>t.run(ctx=>fn({...ctx,auth:{getUserIdentity:async()=>({subject:data.account,sv:0,sessionJti:'capacity'})}}));
 return {t,tables,data,run,date};
}
test('dashboard large-history query stays within a fixed number of index ranges and preserves all financial totals',async context=>{
 const {tables,run}=await fixture();const result=await run(async(ctx:any)=>{const read=measured(ctx,tables);return {value:await (dashboardSummary as any)._handler(read.ctx,{}),counts:read.counts};});
 const totals=Object.values(result.counts).reduce((all:any,row:any)=>({queries:all.queries+row.queries,documents:all.documents+row.documents,jsonBytes:all.jsonBytes+row.jsonBytes}),{queries:0,documents:0,jsonBytes:0});
 assert.equal(result.value.summary.salesCents,400000);assert.equal(result.value.summary.purchaseCents,500000);assert.equal(result.value.summary.cashCents,240000);assert.equal(result.value.summary.transferCents,160000);assert.equal(result.value.summary.commissions,30000);assert.equal(result.value.summary.gains,150000);assert.equal(result.value.summary.net,180000);assert.equal(result.value.summary.saleCount,2000);assert.equal(result.value.summary.purchaseCount,500);
 // Only 25 of 100 depositors own these sale lines: retain negative regularizations separately.
 assert.equal(result.value.summary.dueCents,67500);assert.equal(result.value.summary.regularizationCents,7500);
 assert.ok(totals.queries<=14);assert.ok(totals.documents<32000);context.diagnostic(JSON.stringify({scenario:{sales:2000,purchases:500,depositors:100,twoPaymentVersionsPerSale:true},...totals,counts:result.counts}));
});
test('dashboard balances equal authoritative contact balances across cancellation, pending and unknown collection states',async()=>{
 const {t,run,data}=await fixture(20,5,4);
 await t.run(async ctx=>{
  await ctx.db.patch(data.saleIds[0],{status:'cancelled'});
  const pending=await ctx.db.query('saleLines').withIndex('by_sale',q=>q.eq('saleId',data.saleIds[4])).first();await ctx.db.patch(pending!._id,{paymentStatus:'pending'});
  const unknown=await ctx.db.query('saleLines').withIndex('by_sale',q=>q.eq('saleId',data.saleIds[8])).first();await ctx.db.patch(unknown!._id,{paymentStatus:'unknown'});
  const unknownCost=await ctx.db.query('saleLines').withIndex('by_sale',q=>q.eq('saleId',data.saleIds[1])).first();await ctx.db.patch(unknownCost!._id,{costCents:null});
  const gift=await ctx.db.insert('stockOperations',{kind:'gift',costCents:75,occurredAt:Date.now(),createdAt:Date.now(),historyComplete:false});await ctx.db.insert('stockOperations',{kind:'reversal',reversesId:gift,occurredAt:Date.now(),createdAt:Date.now()});
  await ctx.db.insert('stockOperations',{kind:'gift',costCents:25,occurredAt:Date.now(),createdAt:Date.now(),historyComplete:false});await ctx.db.insert('stockOperations',{kind:'gift',occurredAt:Date.now(),createdAt:Date.now(),historyComplete:false});
 });
 const actual=await run((ctx:any)=>(dashboardSummary as any)._handler(ctx,{}));
 const expected=await run(async(ctx:any)=>Promise.all(data.people.map(async(id:string)=>balanceRecord(ctx,(await ctx.db.get(id))!))));
 assert.equal(actual.summary.dueCents,expected.reduce((n:number,b:any)=>n+Math.max(0,b.balanceCents),0));assert.equal(actual.summary.regularizationCents,expected.reduce((n:number,b:any)=>n+Math.max(0,-b.balanceCents),0));
 assert.equal(actual.summary.pendingCents,200);assert.equal(actual.summary.unknownCents,200);assert.equal(actual.summary.giftLossCents,25);assert.equal(actual.summary.giftCount,2);assert.equal(actual.summary.unknownGiftCostCount,1);assert.equal(actual.summary.unknownCostCount,1);
});
test('staff history hydrates only first FIFO provenance and current grading, not every historic lot',async()=>{
 const {t,tables,run,data,date}=await fixture(0,1,1),itemId=data.supplierItems[0];
 await t.run(async ctx=>{
  const line=await ctx.db.query('purchaseLines').first();
  for(let i=0;i<2000;i++){const id=await ctx.db.insert('stockLots',{stockItemId:itemId,source:{kind:'purchase',purchaseId:line!.purchaseId,purchaseLineId:line!._id},originalQuantity:1,remainingQuantity:0,originalCostCents:101,remainingCostCents:0,acquiredAt:date+i,taxRateBps:null,openingBalanceOnly:false,createdAt:date+i});tables.set(id,'stockLots');}
  const companyId=await ctx.db.insert('gradingCompanies',{name:'PSA',normalizedName:'psa',createdAt:date});tables.set(companyId,'gradingCompanies');
  for(let i=0;i<20;i++)await ctx.db.insert('itemGradings',{stockItemId:itemId,companyId,grade:'9',supersededAt:date+i,createdAt:date+i});
  await ctx.db.insert('itemGradings',{stockItemId:itemId,companyId,grade:'9.5',createdAt:date+21});
 });
 const result=await run(async(ctx:any)=>{const read=measured(ctx,tables);return {item:await itemRecord(read.ctx,(await ctx.db.get(itemId))!),counts:read.counts};});
 assert.equal(result.counts.stockLots.documents,1);assert.equal(result.counts.itemGradings.documents,1);assert.equal(result.item.purchaseOccurredAt,date);assert.equal(result.item.purchasePriceCents,1000);assert.equal(result.item.gradingGrade,'9.5');
});
test('dashboard fails explicitly on unsafe aggregate amounts instead of returning rounded totals',async()=>{
 const {t,run}=await fixture(0,2,1);await t.run(async ctx=>{for(const line of await ctx.db.query('purchaseLines').collect())await ctx.db.patch(line._id,{costCents:Number.MAX_SAFE_INTEGER});});
 await assert.rejects(()=>run((ctx:any)=>(dashboardSummary as any)._handler(ctx,{})),/AMOUNT_OVERFLOW/);
});
