import test from 'node:test';
import assert from 'node:assert/strict';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../functions/schema';
import {authenticated} from './helpers/session';
const modules={
 './functions/operations.ts':()=>import('../functions/operations'),'./functions/inventory.ts':()=>import('../functions/inventory'),
 './functions/consignmentOperations.ts':()=>import('../functions/consignmentOperations'),'./functions/consignmentDocuments.ts':()=>import('../functions/consignmentDocuments'),
 './functions/_generated/server.js':()=>import('../functions/_generated/server.js'),
};
const m=(name:string)=>makeFunctionReference<'mutation'>(name),at=(value:string)=>Date.parse(value);
const previousDay=at('2026-04-01T21:30:00Z'),sameDayEarly=at('2026-04-01T22:30:00Z'),sameDayLate=at('2026-04-02T00:30:00Z');
async function setup(){const t=convexTest(schema,modules),user=await authenticated(t,'calendar'),sellerId=await user.mutation(m('operations:createSeller'),{operationId:'seller',name:'Seller'});return {t,user,sellerId};}
test('legacy sale/payment/purchase correction uses shop calendar without changing recorded instants',async()=>{
 const {t,user,sellerId}=await setup(),receipt=await user.mutation(m('operations:createPurchase'),{operationId:'receipt',sellerId,reference:'R',occurredAt:sameDayEarly,items:[{operationId:'line',name:'Card',purchasePriceCents:101,askingPriceCents:200,vatRegime:'margin'}]});await user.mutation(m('operations:validatePurchase'),{purchaseId:receipt.purchaseId});
 const saleArgs={operationId:'sale',itemId:receipt.itemIds[0],occurredAt:previousDay,salePriceCents:200};await assert.rejects(()=>user.mutation(m('operations:createSale'),saleArgs),/SALE_BEFORE_PURCHASE/);
 const saleId=await user.mutation(m('operations:createSale'),{...saleArgs,occurredAt:sameDayLate,paymentStatus:'received',payment:{cashCents:80,transferCents:120,receivedAt:sameDayEarly}});assert.equal((await t.run(ctx=>ctx.db.get(saleId)))!.payment!.receivedAt,sameDayEarly);
 await assert.rejects(()=>user.mutation(m('operations:recordSalePayment'),{operationId:'bad-payment',saleId,cashCents:100,transferCents:100,receivedAt:previousDay}),/INVALID_SALE_PAYMENT_DATE/);
 await user.mutation(m('operations:recordSalePayment'),{operationId:'payment',saleId,cashCents:100,transferCents:100,receivedAt:sameDayEarly});
 await user.mutation(m('operations:updatePurchaseDate'),{purchaseId:receipt.purchaseId,occurredAt:at('2026-04-02T20:00:00Z')});
 await assert.rejects(()=>user.mutation(m('operations:updatePurchaseDate'),{purchaseId:receipt.purchaseId,occurredAt:at('2026-04-02T22:30:00Z')}),/PURCHASE_DATE_AFTER_SALE/);
});
test('legacy FIFO gifts and display opening preserve same-shop-day allowance and exact costs',async()=>{
 const {t,user}=await setup(),product={name:'Display',productType:'sealed',format:'display',askingPriceCents:2000,taxRateBps:2100};
 const received=await user.mutation(m('inventory:receive'),{operationId:'receive',supplier:'Supplier',reference:'R',occurredAt:sameDayLate,lines:[{product,quantity:3,unitCostCents:101}]});const itemId=received.itemIds[0];
 const gift={operationId:'gift',itemId,quantity:1,occurredAt:previousDay,reason:'QA'};await assert.rejects(()=>user.mutation(m('inventory:donate'),gift),/INVALID_DATE/);
 await user.mutation(m('inventory:donate'),{...gift,occurredAt:sameDayEarly});
 const openingId=await user.mutation(m('inventory:openDisplay'),{operationId:'open',itemId,product:{...product,name:'Booster',format:'booster'},quantity:1,packSize:36,occurredAt:sameDayEarly});
 const opening=await t.run(ctx=>ctx.db.get(openingId));const output=await t.run(ctx=>ctx.db.query('stockLots').withIndex('by_item',q=>q.eq('itemId',opening!.targetId)).first());assert.equal(output!.remaining,36);assert.equal(output!.remainingCostCents,101);assert.equal((await t.run(ctx=>ctx.db.get(itemId)))!.quantity,1);
});
test('legacy payout and both return flows enforce shop days and preserve balance',async()=>{
 const {t,user,sellerId}=await setup(),deposit=await user.mutation(m('consignmentOperations:createConsignment'),{operationId:'deposit',sellerId,reference:'D',occurredAt:sameDayLate,items:[0,1,2].map(i=>({operationId:`line-${i}`,name:`Card ${i}`,productType:'card',askingPriceCents:1000,commissionRateBps:3000}))});
 const saleId=await user.mutation(m('operations:createSale'),{operationId:'sale',itemId:deposit.itemIds[0],occurredAt:sameDayLate,salePriceCents:1000,paymentStatus:'received',payment:{cashCents:1000,transferCents:0,receivedAt:sameDayLate}});
 const payout={operationId:'payout',sellerId,amountCents:300,occurredAt:previousDay,method:'cash'};await assert.rejects(()=>user.mutation(m('consignmentOperations:recordConsignmentPayment'),payout),/INVALID_PAYMENT_DATE/);
 await user.mutation(m('consignmentOperations:recordConsignmentPayment'),{...payout,occurredAt:sameDayEarly});
 await assert.rejects(()=>user.mutation(m('consignmentOperations:recordConsignmentPayment'),{...payout,operationId:'excess',amountCents:401,occurredAt:sameDayLate}),/PAYMENT_EXCEEDS_BALANCE/);
 await user.mutation(m('operations:recordSalePayment'),{operationId:'collection-date',saleId,receivedAt:sameDayEarly,cashCents:1000,transferCents:0});
 await assert.rejects(()=>user.mutation(m('consignmentOperations:recordConsignmentPayment'),{...payout,operationId:'prior-local-day',amountCents:100}),/INVALID_PAYMENT_DATE/);
 const returns={operationId:'return',itemId:deposit.itemIds[1],occurredAt:previousDay};await assert.rejects(()=>user.mutation(m('consignmentOperations:returnConsignmentItem'),returns),/INVALID_RETURN_DATE/);await user.mutation(m('consignmentOperations:returnConsignmentItem'),{...returns,occurredAt:sameDayEarly});
 const prepare={operationId:'prepare',consignmentId:deposit.consignmentId,itemIds:[deposit.itemIds[2]],occurredAt:previousDay,conditionNotes:'OK'};await assert.rejects(()=>user.mutation(m('consignmentDocuments:prepareReturn'),prepare),/INVALID_RETURN_DATE/);assert.ok(await user.mutation(m('consignmentDocuments:prepareReturn'),{...prepare,occurredAt:sameDayEarly}));
 assert.equal((await t.run(ctx=>ctx.db.query('consignmentPayments').collect())).length,1);
});
