import test from 'node:test';
import assert from 'node:assert/strict';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../functions/schema';
const modules={
 './functions/auth.ts':()=>import('../functions/auth'),'./functions/operations.ts':()=>import('../functions/operations'),
 './functions/transactions.ts':()=>import('../functions/transactions'),'./functions/inventory.ts':()=>import('../functions/inventory'),
 './functions/consignmentOperations.ts':()=>import('../functions/consignmentOperations'),'./functions/consignmentDocuments.ts':()=>import('../functions/consignmentDocuments'),
 './functions/workspaceReads.ts':()=>import('../functions/workspaceReads'),'./functions/_generated/server.js':()=>import('../functions/_generated/server.js'),
};
const m=(name:string)=>makeFunctionReference<'mutation'>(name),q=(name:string)=>makeFunctionReference<'query'>(name),at=(value:string)=>Date.parse(value);
async function setup(){const t=convexTest(schema,modules),accountId=await t.run(ctx=>ctx.db.insert('accounts',{email:'calendar@example.invalid',passwordHash:'test',sessionVersion:0,createdAt:1}));await t.mutation(m('auth:startSession'),{id:accountId,jti:'calendar',sessionVersion:0,expiresAt:Date.now()+60000,now:Date.now()});const user=t.withIdentity({subject:accountId,sv:0,sessionJti:'calendar'}),contactId=await user.mutation(m('transactions:saveContact'),{operationId:'contact',kind:'company',name:'Calendar supplier'});return {t,user,contactId};}
const previousDay=at('2026-04-01T21:30:00Z'),sameDayEarly=at('2026-04-01T22:30:00Z'),sameDayLate=at('2026-04-02T00:30:00Z');
test('canonical sale/payment/purchase correction compare shop days, preserving mixed payments and stock',async()=>{
 const {t,user,contactId}=await setup();const receipt=await user.mutation(m('transactions:createPurchase'),{operationId:'receipt',contactId,type:'supplier',reference:'R',occurredAt:sameDayEarly,lines:[{product:{type:'card',name:'Card'},quantity:1,costCents:101,askingPriceCents:200,tax:{regime:'other',rateBps:2100}}]});
 const saleArgs={operationId:'sale',reference:'S',occurredAt:previousDay,lines:[{stockItemId:receipt.itemIds[0],quantity:1,lineTotalCents:200}],payment:{status:'pending',cashCents:0,transferCents:0}};
 await assert.rejects(()=>user.mutation(m('transactions:createSale'),saleArgs),/SALE_BEFORE_PURCHASE/);assert.equal((await t.run(ctx=>ctx.db.query('sales').collect())).length,0);
 const saleId=await user.mutation(m('transactions:createSale'),{...saleArgs,occurredAt:sameDayLate,payment:{status:'received',cashCents:80,transferCents:120,receivedAt:sameDayEarly}});
 const payment={status:'received',cashCents:100,transferCents:100};await assert.rejects(()=>user.mutation(m('transactions:correctPayment'),{operationId:'bad-payment',saleId,occurredAt:previousDay,payment}),/PAYMENT_BEFORE_SALE/);
 await user.mutation(m('transactions:correctPayment'),{operationId:'payment',saleId,occurredAt:sameDayEarly,payment});
 await user.mutation(m('operations:updatePurchaseDate'),{purchaseId:receipt.purchaseId,occurredAt:at('2026-04-02T20:00:00Z')});
 await assert.rejects(()=>user.mutation(m('operations:updatePurchaseDate'),{purchaseId:receipt.purchaseId,occurredAt:at('2026-04-02T22:30:00Z')}),/PURCHASE_DATE_AFTER_SALE/);
 await user.mutation(m('transactions:cancelSale'),{operationId:'cancel',saleId});const lot=await t.run(ctx=>ctx.db.query('stockLots').first());assert.equal(lot!.remainingCostCents,101);assert.equal(lot!.remainingQuantity,1);
});
test('canonical FIFO gift/opening accepts earlier instants on same shop day and rejects prior shop day',async()=>{
 const {t,user}=await setup(),display={name:'Display',productType:'sealed',format:'display',askingPriceCents:2000,taxRateBps:2100};
 const receipt=await user.mutation(m('inventory:receive'),{operationId:'receive',supplier:'Supplier',reference:'R',occurredAt:sameDayLate,lines:[{product:display,quantity:3,unitCostCents:101}]});const itemId=receipt.itemIds[0];
 const gift={operationId:'gift',itemId,quantity:1,occurredAt:previousDay,reason:'QA'};await assert.rejects(()=>user.mutation(m('inventory:donate'),gift),/ITEM_UNAVAILABLE_AT_DATE/);
 await user.mutation(m('inventory:donate'),{...gift,occurredAt:sameDayEarly});
 const opening={operationId:'open',itemId,product:{...display,name:'Booster',format:'booster'},quantity:1,packSize:36,occurredAt:sameDayEarly};
 const preview=await user.query(q('workspaceReads:openPreview'),{itemId,quantity:1,packSize:36,occurredAt:sameDayEarly});assert.equal(preview.totalCostCents,101);
 const openingId=await user.mutation(m('inventory:openDisplay'),opening);assert.equal(await user.mutation(m('inventory:openDisplay'),opening),openingId);
 const output=await t.run(async ctx=>(await ctx.db.query('stockLots').collect()).find(l=>l.source.kind==='opening'));assert.equal(output!.remainingQuantity,36);assert.equal(output!.remainingCostCents,101);
 assert.equal((await t.run(ctx=>ctx.db.get(itemId)))!.quantity,1);
});
test('canonical payout availability and consignment return preparation use shop days',async()=>{
 const {t,user,contactId}=await setup();const created=await user.mutation(m('consignmentOperations:createConsignment'),{operationId:'consign',sellerId:contactId,occurredAt:sameDayLate,reference:'D',contractTerms:{version:'v1',text:'Terms'},items:[0,1].map(i=>({operationId:`item-${i}`,name:`Card ${i}`,productType:'card',askingPriceCents:1000,commissionRateBps:3000}))});
 await t.run(async ctx=>{const dossier=await ctx.db.get(created.consignmentId);await ctx.db.patch(dossier!.currentRevisionId!,{signatureState:'signed'});});
 const saleId=await user.mutation(m('transactions:createSale'),{operationId:'sale',reference:'S',occurredAt:sameDayLate,lines:[{stockItemId:created.itemIds[0],quantity:1,lineTotalCents:1000}],payment:{status:'received',cashCents:1000,transferCents:0,receivedAt:sameDayLate}});
 const payout={operationId:'pay',depositorId:contactId,amountCents:300,occurredAt:previousDay,method:'cash'};await assert.rejects(()=>user.mutation(m('transactions:recordPayout'),payout),/INVALID_PAYMENT_DATE/);
 const paymentId=await user.mutation(m('transactions:recordPayout'),{...payout,occurredAt:sameDayEarly});assert.equal(await user.mutation(m('transactions:recordPayout'),{...payout,occurredAt:sameDayEarly}),paymentId);
 await assert.rejects(()=>user.mutation(m('transactions:recordPayout'),{...payout,operationId:'excess',amountCents:401,occurredAt:sameDayLate}),/PAYMENT_EXCEEDS_BALANCE/);
 await user.mutation(m('transactions:correctPayment'),{operationId:'collection-date',saleId,occurredAt:sameDayEarly,payment:{status:'received',cashCents:1000,transferCents:0}});
 await assert.rejects(()=>user.mutation(m('transactions:recordPayout'),{...payout,operationId:'prior-local-day',amountCents:100}),/INVALID_PAYMENT_DATE/);
 const returns={operationId:'return',consignmentId:created.consignmentId,itemIds:[created.itemIds[1]],occurredAt:previousDay,conditionNotes:'OK'};
 await assert.rejects(()=>user.mutation(m('consignmentDocuments:prepareReturn'),returns),/INVALID_RETURN_DATE/);
 const returnId=await user.mutation(m('consignmentDocuments:prepareReturn'),{...returns,occurredAt:sameDayEarly});assert.ok(returnId);
 assert.equal((await t.run(ctx=>ctx.db.query('depositorPayouts').collect())).length,1);assert.equal((await user.query(q('transactions:balance'),{depositorId:contactId})).balanceCents,400);
});
