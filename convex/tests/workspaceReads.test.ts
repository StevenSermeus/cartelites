import { authenticated } from './helpers/session';
import test from 'node:test';
import assert from 'node:assert/strict';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../functions/schema';
const modules={'./functions/workspaceReads.ts':()=>import('../functions/workspaceReads'),'./functions/inventory.ts':()=>import('../functions/inventory'),'./functions/_generated/server.js':()=>import('../functions/_generated/server.js')};
const ref=(name:string)=>makeFunctionReference<'query'>(`workspaceReads:${name}`);
test('workspace reads reject anonymous users and preview preserves exact cost without mutation',async()=>{
 const t=convexTest(schema,modules),u=(await authenticated(t, 'employee'));
 await assert.rejects(()=>t.query(ref('products'),{paginationOpts:{numItems:25,cursor:null}}),/UNAUTHENTICATED/);
 const receipt=await u.mutation(makeFunctionReference<'mutation'>('inventory:receive'),{operationId:'receive',supplier:'Fixture',reference:'R',occurredAt:1000,lines:[{product:{name:'Display',productType:'sealed',format:'display',packSize:3,askingPriceCents:1000,taxRateBps:2100},quantity:2,unitCostCents:101}]}) as {itemIds:string[]};
 const args={itemId:receipt.itemIds[0],quantity:1,packSize:3,occurredAt:2000};
 const preview=await u.query(ref('openPreview'),args) as {totalCostCents:number;costParts:{quantity:number;unitCostCents:number}[]};
 assert.equal(preview.totalCostCents,101);assert.equal(preview.costParts.reduce((n,p)=>n+p.quantity*p.unitCostCents,0),101);
 const before=await t.run(ctx=>ctx.db.query('stockLots').collect());
 await u.query(ref('openPreview'),args);const after=await t.run(ctx=>ctx.db.query('stockLots').collect());assert.deepEqual(before,after);
 await assert.rejects(()=>u.query(ref('openPreview'),{...args,quantity:3}),/ITEM_UNAVAILABLE/);
 await u.mutation(makeFunctionReference<'mutation'>('inventory:openDisplay'),{...args,quantity:2,operationId:'open',product:{name:'Booster',productType:'sealed',format:'booster',askingPriceCents:100,taxRateBps:2100}});
 const products=await u.query(ref('products'),{paginationOpts:{numItems:25,cursor:null}}) as {page:{_id:string;status:string}[]};assert.equal(products.page.find(x=>x._id===args.itemId)?.status,'sold');
 const openings=await u.query(ref('openings'),{paginationOpts:{numItems:25,cursor:null}}) as {page:unknown[]};assert.equal(openings.page.length,1);
});
test('document pagination excludes signatures/snapshots and distinguishes prepared records',async()=>{
 const t=convexTest(schema,modules),u=(await authenticated(t, 'employee'));
 await t.run(ctx=>ctx.db.insert('signedReceipts',{ownerId:'employee',kind:'purchase',targetId:'target',snapshot:{reference:'TEST',private:'secret'},identity:{},createdAt:1000}));
 const result=await u.query(ref('documents'),{kind:'receipt'}) as {items:Record<string,unknown>[]};
 assert.equal(result.items[0].status,'prepared');assert.equal(result.items[0].downloadPath,undefined);assert.equal(result.items[0].snapshot,undefined);
 await assert.rejects(()=>u.query(ref('documents'),{kind:'ticket',cursor:JSON.stringify({kind:'receipt',position:0,cursor:''})}),/INVALID_CURSOR/);
});
test('document versions remain stable and server filters scan subsequent pages without exposing evidence',async()=>{
 const t=convexTest(schema,modules),u=(await authenticated(t, 'employee'));
 await t.run(async ctx=>{
  for(let i=0;i<27;i++)await ctx.db.insert('signedReceipts',{ownerId:'employee',kind:'purchase',targetId:'same-target',snapshot:{reference:i===0?'Cible unique':'Autre document',client:{private:'evidence'}},identity:{secret:'never-return'},createdAt:1000+i, ...(i===0?{objectKey:'original.pdf',sha256:'checksum',emailStatus:'failed',emailAttemptAt:2000,emailError:'provider_error'}:{})});
 });
 type Result={items:{id:string;version:number;reference:string;emails:unknown[];[key:string]:unknown}[];nextCursor:string|null;isDone:boolean};
 const all=await u.query(ref('documents'),{kind:'receipt'}) as Result;
 assert.equal(all.items[0].version,27);
 const first=await u.query(ref('documents'),{kind:'receipt',search:'cible unique',status:'archived',from:500,to:1500}) as Result;
 assert.equal(first.items.length,0);assert.ok(first.nextCursor);
 const second=await u.query(ref('documents'),{kind:'receipt',search:'cible unique',status:'archived',from:500,to:1500,cursor:first.nextCursor}) as Result;
 assert.equal(second.items.length,1);assert.equal(second.items[0].version,1);assert.equal(second.items[0].emails.length,1);
 assert.equal(second.items[0].snapshot,undefined);assert.equal(second.items[0].identity,undefined);assert.equal(second.items[0].objectKey,undefined);assert.equal(second.isDone,true);
 await assert.rejects(()=>u.query(ref('documents'),{kind:'receipt',search:'different',cursor:first.nextCursor}),/INVALID_CURSOR/);
 await assert.rejects(()=>u.query(ref('documents'),{kind:'receipt',from:2,to:1}),/INVALID_QUERY/);
});
