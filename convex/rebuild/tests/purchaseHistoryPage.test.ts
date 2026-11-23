import test from 'node:test';
import assert from 'node:assert/strict';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../functions/schema';
const modules={'./functions/operations.ts':()=>import('../functions/operations'),'./functions/_generated/server.js':()=>import('../functions/_generated/server.js')};
const reference=makeFunctionReference<'query'>('operations:purchaseHistoryPage');
const base={page:1,size:3,search:'',status:'all'};
test('canonical buyback history matches numbered HTTP contract, filters before pagination and excludes supplier receipts',async()=>{
 const t=convexTest(schema,modules);
 await assert.rejects(t.query(reference,base),/UNAUTHENTICATED/);
 const account=await t.run(async ctx=>{
  const id=await ctx.db.insert('accounts',{email:'history@example.invalid',passwordHash:'test',sessionVersion:0,createdAt:1});
  await ctx.db.insert('sessions',{accountId:id,tokenId:'history',lastActivityAt:1,expiresAt:Date.now()+60000,createdAt:1});
  const contactId=await ctx.db.insert('contacts',{kind:'person',name:'Élodie Martin',createdAt:1});
  for(let i=0;i<13;i++)await ctx.db.insert('purchases',{contactId,type:'buyback',reference:`R-${String(i).padStart(2,'0')}`,occurredAt:1000+i,status:i%2?'active':'pending',createdAt:1});
  await ctx.db.insert('purchases',{contactId,type:'supplier',reference:'R-SUPPLIER',occurredAt:2000,status:'active',createdAt:1});
  return id;
 });
 const user=t.withIdentity({subject:account,sv:0,sessionJti:'history'});
 const first=await user.query(reference,base);assert.equal(first.totalCount,13);assert.equal(first.totalPages,5);assert.equal(first.rows.length,3);assert.equal(first.rows[0].reference,'R-12');
 const second=await user.query(reference,{...base,page:2});assert.equal(second.rows[0].reference,'R-09');assert.equal(new Set([...first.rows,...second.rows].map((r:any)=>r._id)).size,6);
 const filtered=await user.query(reference,{...base,status:'active',search:'elodie',from:1003,to:1009});assert.equal(filtered.totalCount,4);assert.deepEqual(filtered.rows.map((r:any)=>r.reference),['R-09','R-07','R-05']);
 const exact=await user.query(reference,{...base,search:'R-04 martin'});assert.equal(exact.totalCount,1);
 const absent=await user.query(reference,{...base,search:'absent',page:99});assert.equal(absent.page,1);assert.deepEqual(absent.rows,[]);
 const last=await user.query(reference,{...base,page:99});assert.equal(last.page,5);assert.equal(last.rows.length,1);
 for(const patch of [{page:0},{page:1.5},{size:51},{from:20,to:10}])await assert.rejects(user.query(reference,{...base,...patch}));
});
