import test from 'node:test';
import assert from 'node:assert/strict';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../functions/schema';
import {authenticated} from './helpers/session';
const modules={'./functions/exportReads.ts':()=>import('../functions/exportReads'),'./functions/_generated/server.js':()=>import('../functions/_generated/server.js')};
const ref=makeFunctionReference<'query'>('exportReads:page');
test('legacy exports page child rows without truncating large dossiers and retain unknown costs/collection semantics',async()=>{
 const t=convexTest(schema,modules),user=await authenticated(t,'exports');
 const ids=await t.run(async ctx=>{
  const seller=await ctx.db.insert('sellers',{ownerId:'exports',operationId:'seller',operationDigest:'seller',name:'Legacy seller',createdAt:1});
  const purchase=await ctx.db.insert('purchases',{ownerId:'exports',operationId:'purchase',operationDigest:'x',sellerId:seller,reference:'P',occurredAt:1,status:'active',createdAt:1});
  const dossier=await ctx.db.insert('consignments',{ownerId:'exports',operationId:'dossier',operationDigest:'d',sellerId:seller,reference:'D',occurredAt:1,createdAt:1});
  const items=[];for(let i=0;i<60;i++)items.push(await ctx.db.insert('items',{ownerId:'exports',operationId:`i${i}`,purchaseId:purchase,purchaseOccurredAt:1,name:`Card${i}`,vatRegime:'margin',status:'available',createdAt:1}));
  const deposit=await ctx.db.insert('items',{ownerId:'exports',operationId:'deposit',consignmentId:dossier,origin:'consignment',purchaseOccurredAt:1,name:'Deposit',vatRegime:'other',status:'sold',createdAt:1});
  await ctx.db.insert('sales',{ownerId:'exports',operationId:'sale',operationDigest:'s',itemId:deposit,sellerId:seller,origin:'consignment',occurredAt:2,salePriceCents:100,depositorAmountCents:80,commissionCents:20,status:'active',createdAt:2});
  return {items};
 });
 let cursor:string|undefined,rows:any[]=[];do{const p=await user.query(ref,{resource:'purchases',size:25,cursor});rows.push(...p.items);cursor=p.nextCursor??undefined;}while(cursor);
 assert.equal(rows.length,60);assert.equal(new Set(rows.map(r=>r.exportRowId)).size,60);assert.ok(rows.every(r=>r.items.length===1&&r.items[0].purchasePriceCents===null));
 const sales=await user.query(ref,{resource:'sales'});assert.equal((sales.items[0] as any).balanceEligible,true);assert.equal((sales.items[0] as any).costCents,null);
 const contacts=await user.query(ref,{resource:'contacts'});assert.equal((contacts.items[0] as any).hasDeposits,true);
 const stock=await user.query(ref,{resource:'stock'});assert.equal(stock.items.length,25);assert.ok(!JSON.stringify(stock).includes('photos'));
 await assert.rejects(()=>t.query(ref,{resource:'sales'}),/UNAUTHENTICATED/);await assert.rejects(()=>user.query(ref,{resource:'stock',size:26}),/INVALID_PAGINATION/);
});
