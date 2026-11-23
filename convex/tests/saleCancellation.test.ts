import test from 'node:test';
import assert from 'node:assert/strict';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../functions/schema';
import {authenticated} from './helpers/session';
const modules={'./functions/operations.ts':()=>import('../functions/operations'),'./functions/inventory.ts':()=>import('../functions/inventory'),'./functions/_generated/server.js':()=>import('../functions/_generated/server.js')};
const m=(name:string)=>makeFunctionReference<'mutation'>(name);
async function setup(){
 const t=convexTest(schema,modules),user=await authenticated(t,'sale-owner');
 const received=await user.mutation(m('inventory:receive'),{operationId:'receipt',supplier:'QA',reference:'R',occurredAt:1000,lines:[{product:{name:'Booster',productType:'sealed',format:'booster',askingPriceCents:200,taxRateBps:2100},quantity:5,unitCostCents:101}]});
 const itemId=received.itemIds[0],saleA=await user.mutation(m('operations:createSale'),{operationId:'sale-A',itemId,occurredAt:2000,salePriceCents:400,quantity:2}),saleB=await user.mutation(m('operations:createSale'),{operationId:'sale-B',itemId,occurredAt:2000,salePriceCents:200,quantity:1});
 return {t,user,itemId,saleA,saleB};
}
test('each cancellation key remains permanently bound through distinct repeat requests and lost-response retries',async()=>{
 const {t,user,itemId,saleA,saleB}=await setup();
 for(const operationId of ['cancel-first','cancel-repeat'])assert.equal(await user.mutation(m('operations:cancelSale'),{operationId,saleId:saleA}),saleA);
 for(const operationId of ['cancel-first','cancel-repeat']){
  await assert.rejects(()=>user.mutation(m('operations:cancelSale'),{operationId,saleId:saleB}),/IDEMPOTENCY_KEY_REUSED/);
  assert.equal(await user.mutation(m('operations:cancelSale'),{operationId,saleId:saleA}),saleA);
 }
 const item=await t.run(ctx=>ctx.db.get(itemId)),lot=await t.run(ctx=>ctx.db.query('stockLots').first());assert.equal(item!.quantity,4);assert.equal(lot!.remaining,4);assert.equal(lot!.remainingCostCents,404);
 const first=await t.run(ctx=>ctx.db.get(saleA));assert.equal(first!.cancelOperationId,'cancel-first');assert.equal((await t.run(ctx=>ctx.db.get(saleB)))!.status,'active');assert.equal((await t.run(ctx=>ctx.db.query('saleCancellations').collect())).length,2);
});
test('shared-shop colleague cancellation keys bind to the acting account, not the sale creator',async()=>{
 const {t,itemId,saleA,saleB}=await setup(),colleague=await authenticated(t,'colleague');
 assert.equal(await colleague.mutation(m('operations:cancelSale'),{operationId:'colleague-cancel',saleId:saleA}),saleA);
 await assert.rejects(()=>colleague.mutation(m('operations:cancelSale'),{operationId:'colleague-cancel',saleId:saleB}),/IDEMPOTENCY_KEY_REUSED/);
 assert.equal(await colleague.mutation(m('operations:cancelSale'),{operationId:'colleague-cancel',saleId:saleA}),saleA);
 assert.equal((await t.run(ctx=>ctx.db.get(itemId)))!.quantity,4);const binding=await t.run(ctx=>ctx.db.query('saleCancellations').first());assert.equal(binding!.ownerId,colleague.accountId);
});
test('existing single-field historical bindings are preserved and lazily retained',async()=>{
 const {t,user,itemId,saleA,saleB}=await setup(),request={operationId:'historical-cancel',saleId:saleA};
 await user.mutation(m('operations:cancelSale'),request);
 await t.run(async ctx=>{for(const row of await ctx.db.query('saleCancellations').collect())await ctx.db.delete(row._id);});
 await assert.rejects(()=>user.mutation(m('operations:cancelSale'),{...request,saleId:saleB}),/IDEMPOTENCY_KEY_REUSED/);
 assert.equal(await user.mutation(m('operations:cancelSale'),request),saleA);assert.equal((await t.run(ctx=>ctx.db.get(itemId)))!.quantity,4);
 assert.equal((await t.run(ctx=>ctx.db.query('saleCancellations').collect())).length,1);
});
test('concurrent distinct cancellations restore FIFO allocations once and failed cancellation claims no key',async()=>{
 const {t,user,itemId,saleA}=await setup();
 assert.deepEqual(await Promise.all(['first','second'].map(operationId=>user.mutation(m('operations:cancelSale'),{operationId,saleId:saleA}))),[saleA,saleA]);
 assert.equal((await t.run(ctx=>ctx.db.get(itemId)))!.quantity,4);assert.equal((await t.run(ctx=>ctx.db.query('stockLots').first()))!.remainingCostCents,404);
 const keys=await t.run(ctx=>ctx.db.query('saleCancellations').collect());assert.equal(keys.length,2);
 await assert.rejects(()=>user.mutation(m('operations:cancelSale'),{operationId:'',saleId:saleA}),/INVALID_OPERATION_KEY/);assert.equal((await t.run(ctx=>ctx.db.query('saleCancellations').collect())).length,2);
});
