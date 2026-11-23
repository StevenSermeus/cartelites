import test from 'node:test';
import assert from 'node:assert/strict';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../functions/schema';
import {page} from '../functions/exportReads';
import {apportionedCents,apportionedPayment} from '../../shared/exportPages';
const modules={'./functions/exportReads.ts':()=>import('../functions/exportReads'),'./functions/saleTickets.ts':()=>import('../functions/saleTickets'),'./functions/_generated/server.js':()=>import('../functions/_generated/server.js')};
const ref=makeFunctionReference<'query'>('exportReads:page');
async function fixture(count=2){
 const t=convexTest(schema,modules);
 const ids=await t.run(async ctx=>{
  const a=await ctx.db.insert('accounts',{email:'exports@example.invalid',passwordHash:'fixture',sessionVersion:0,createdAt:1});await ctx.db.insert('sessions',{accountId:a,tokenId:'export',expiresAt:Date.now()+600000,lastActivityAt:Date.now(),createdAt:1});
  const seller=await ctx.db.insert('contacts',{name:'Depositor',kind:'person',createdAt:1});await ctx.db.insert('contacts',{name:'No dossier',kind:'person',createdAt:1});
  const dossier=await ctx.db.insert('consignments',{depositorId:seller,reference:'D',occurredAt:1,status:'open',createdAt:1});
  const product=await ctx.db.insert('products',{name:'Current renamed card',description:'',type:'card',createdAt:1});
  const stock=await ctx.db.insert('stockItems',{productId:product,origin:'supplier',status:'available',quantity:2,tracking:'quantity',visible:false,askingPriceCents:100,createdAt:1});
  const purchase=await ctx.db.insert('purchases',{contactId:seller,type:'supplier',reference:'P',occurredAt:1,status:'active',createdAt:1});
  const purchaseLine=await ctx.db.insert('purchaseLines',{purchaseId:purchase,stockItemId:stock,quantity:2,costCents:101,estimatedValueCents:null,buybackRateBps:null,tax:{regime:'margin',rateBps:null},createdAt:1});
  await ctx.db.insert('stockLots',{stockItemId:stock,source:{kind:'purchase',purchaseId:purchase,purchaseLineId:purchaseLine},originalQuantity:2,remainingQuantity:2,originalCostCents:101,remainingCostCents:101,acquiredAt:1,taxRateBps:null,openingBalanceOnly:false,createdAt:1});
  const sales=[];for(let i=0;i<count;i++){const sale=await ctx.db.insert('sales',{reference:`S${i}`,occurredAt:2,status:'confirmed',createdAt:2});sales.push(sale);await ctx.db.insert('saleLines',{saleId:sale,stockItemId:stock,quantity:1,lineTotalCents:100,costCents:i===0?null:50,description:'Frozen card',productSnapshot:{name:'Frozen card',set:'Original set'},depositorId:i===0?seller:undefined,taxRateBps:null,taxRegime:'margin',commissionCents:i===0?30:null,depositorAmountCents:i===0?70:null,paymentStatus:'received',createdAt:2});await ctx.db.insert('salePayments',{saleId:sale,cashCents:51,transferCents:49,occurredAt:3,status:'active',createdAt:3});}
  return {a,seller,dossier,stock,sales};
 });const identity={subject:ids.a,sv:0,sessionJti:'export'},user=t.withIdentity(identity);return {t,user,ids,identity};
}
test('canonical export pages preserve every row at 2000-sale volume without full-history hydration',async context=>{
 const {t,identity}=await fixture(2000);let cursor:string|undefined,rows=0,maxReads=0,pages=0;
 do{
  const result=await t.run(async ctx=>{let reads=0;const chain=(value:any):any=>new Proxy(value,{get(target,key){const fn=target[key];return typeof fn!=='function'?fn:(...args:any[])=>{if(['collect','take','first','unique','paginate'].includes(String(key))){reads++;return fn.apply(target,args);}return chain(fn.apply(target,args));};}});
   const db=new Proxy(ctx.db,{get(target,key){if(key==='get')return (...args:any[])=>{reads++;return (target.get as any)(...args);};if(key==='query')return(...args:any[])=>chain((target.query as any)(...args));const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;}});
   return {value:await (page as any)._handler({...ctx,db,auth:{getUserIdentity:async()=>identity}},{resource:'sales',size:25,cursor}),reads};});
  rows+=result.value.items.length;pages++;maxReads=Math.max(maxReads,result.reads);cursor=result.value.nextCursor??undefined;
 }while(cursor);
 assert.equal(rows,2000);assert.equal(pages,80);assert.ok(maxReads<500);context.diagnostic(JSON.stringify({sales:rows,pages,maxReadsPerPage:maxReads,priorUnpagedReads:16004}));
});
test('mixed-origin sale export uses each frozen line and exact current payment shares across pages',async()=>{
 const {t,user,ids}=await fixture();await t.run(async ctx=>{const [first,second]=await ctx.db.query('saleLines').collect();await ctx.db.patch(second._id,{saleId:first.saleId});const p=await ctx.db.query('salePayments').withIndex('by_sale',q=>q.eq('saleId',first.saleId)).first();await ctx.db.patch(p!._id,{cashCents:101,transferCents:99});});
 const first=await user.query(ref,{resource:'sales',size:1}),second=await user.query(ref,{resource:'sales',size:1,cursor:first.nextCursor!}),rows=[...first.items,...second.items] as any[];
 assert.deepEqual(rows.map(r=>r.origin),['consignment','supplier']);assert.deepEqual(rows.map(r=>r.salePriceCents),[100,100]);assert.equal(rows.reduce((n,r)=>n+r.payment.cashCents,0),101);assert.equal(rows.reduce((n,r)=>n+r.payment.transferCents,0),99);assert.equal(rows[0].costCents,null);assert.equal(rows[0].itemName,'Frozen card');assert.equal(rows[0].series,'Original set');assert.equal(rows.filter(r=>r.balanceEligible).reduce((n,r)=>n+r.depositorAmountCents,0),70);
 assert.ok(rows.every(r=>r.payment.cashCents+r.payment.transferCents===r.salePriceCents));
 await t.run(ctx=>ctx.db.patch(ids.sales[0],{status:'cancelled'}));const cancelled=await user.query(ref,{resource:'sales'});assert.ok(cancelled.items.every((r:any)=>r.balanceEligible===false));
 const contacts=await user.query(ref,{resource:'contacts'});assert.deepEqual(contacts.items.map((c:any)=>c.hasDeposits),[true,false]);
 const purchases=await user.query(ref,{resource:'purchases'});assert.equal((purchases.items[0] as any).items.length,1);assert.equal((purchases.items[0] as any).items[0].purchasePriceCents,101);
 const lots=await user.query(ref,{resource:'stockLots'});assert.equal((lots.items[0] as any).remainingCostCents,101);
 await assert.rejects(()=>user.query(ref,{resource:'stock',cursor:first.nextCursor!}),/INVALID_CURSOR/);await assert.rejects(()=>user.query(ref,{resource:'sales',size:26}),/INVALID_PAGINATION/);await assert.rejects(()=>t.query(ref,{resource:'sales'}),/UNAUTHENTICATED/);
 assert.deepEqual(apportionedCents([100,100],3),[1,2]);assert.deepEqual(apportionedCents([0,0],0),[0,0]);assert.throws(()=>apportionedCents([0],1),/INCONSISTENT_EXPORT_PAYMENT/);
 assert.deepEqual(apportionedPayment([100,100],101,99),{cash:[50,51],transfer:[50,49]});
 const partial=apportionedPayment([1,3,7],2,3);assert.equal(partial.cash.reduce((a,b)=>a+b,0),2);assert.equal(partial.transfer.reduce((a,b)=>a+b,0),3);assert.ok([...partial.cash,...partial.transfer].every(n=>n>=0));assert.deepEqual(partial.cash.map((n,i)=>n+partial.transfer[i]),apportionedCents([1,3,7],5));
});
test('canonical stale ticket claim inserts nothing and unknown prior delivery cannot resend after sale changes',async()=>{
 const {t,user,ids}=await fixture(1),m=(name:string)=>makeFunctionReference<'mutation'>(`saleTickets:${name}`);
 const id=await user.mutation(m('prepare'),{operationId:'ticket',saleIds:ids.sales});await t.mutation(m('archive'),{id,objectKey:'fixture.pdf',sha256:'a'.repeat(64),filename:'fixture.pdf'});
 const first=await t.mutation(m('claimEmail'),{ticketId:id,operationId:'claim',recipient:'test@example.invalid'});assert.equal(first.send,true);await t.mutation(m('emailResult'),{id:first.id,status:'unknown'});
 await t.run(ctx=>ctx.db.patch(ids.sales[0],{status:'cancelled'}));
 const replay=await t.mutation(m('claimEmail'),{ticketId:id,operationId:'claim',recipient:'test@example.invalid'});assert.equal(replay.send,false);assert.equal(replay.status,'unknown');
 await assert.rejects(()=>t.mutation(m('claimEmail'),{ticketId:id,operationId:'new',recipient:'test@example.invalid'}),/TICKET_STALE/);assert.equal((await t.run(ctx=>ctx.db.query('emailDeliveries').collect())).length,1);
});
