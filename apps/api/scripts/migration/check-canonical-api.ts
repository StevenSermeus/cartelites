/** End-to-end Hono + canonical Convex acceptance. Creates only prefixed QA records. */
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import {ConvexHttpClient,ConvexClient} from 'convex/browser';
import {makeFunctionReference} from 'convex/server';
import {assertIsolatedTarget} from './import-convex.js';
export async function checkCanonicalApi(apiUrl:string,convexUrl:string,output:string){
 const api=new URL(apiUrl);if(api.origin!=='http://127.0.0.1:3002')throw new Error('Dedicated API3002 required');assertIsolatedTarget(convexUrl);
 const backend=new ConvexHttpClient(convexUrl),prefix=`QA API ${randomUUID()}`,email=`canonical-${randomUUID()}@example.invalid`,password=randomBytes(24).toString('base64url');
 await backend.action(makeFunctionReference<'action'>('authService:execute'),{secret:process.env.CONVEX_AUTH_SECRET??'',operation:'createAccount',payload:{email,passwordHash:await argon2.hash(password),registrationPolicy:'open'}});
 const login=await fetch(`${apiUrl}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json','X-Client-Platform':'ios'},body:JSON.stringify({email,password})});assert.equal(login.status,200);
 const session=await login.json() as {accessToken:string};assert.ok(session.accessToken);let token=session.accessToken;
 const call=async(path:string,method='GET',body?:unknown)=>{const response=await fetch(`${apiUrl}/api/v1${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const text=await response.text();if(!response.ok)throw new Error(`${method} ${path}: ${response.status} ${text.slice(0,300)}`);return text?JSON.parse(text):null;};
 const endpoints=['/stock?size=10','/sellers?size=10','/sales?size=10','/purchases?size=10','/dashboard/summary','/grading-companies'];for(const path of endpoints)await call(path);
 const contact=await call('/sellers','POST',{operationId:randomUUID(),name:prefix});
 const now=Date.now(),purchase=await call('/purchases','POST',{operationId:randomUUID(),sellerId:contact.id,occurredAt:now,reference:prefix,items:[{operationId:randomUUID(),name:`${prefix} Carte`,tcg:'pokemon',series:'QA',identifier:'001/001',language:'fr',condition:'NM',marketValueCents:200,discountPercent:50,purchasePriceCents:100,askingPriceCents:200,vatRegime:'margin'}]});
 await call(`/purchases/${purchase.purchaseId}/validate`,'POST',{});
 const batch=await call('/sales/bulk','POST',{operationId:randomUUID(),occurredAt:now,items:[{itemId:purchase.itemIds[0],salePriceCents:200,quantity:1}],paymentStatus:'received',payment:{cashCents:100,transferCents:100,receivedAt:now}});assert.equal(batch.ids.length,1);
 const sale=await call(`/sales/${batch.ids[0]}`);assert.equal(sale.salePriceCents,200);assert.equal(sale.purchasePriceCents,100);
 await call('/sales/cancel','POST',{operationId:randomUUID(),saleId:batch.ids[0]});
 const restored=await call(`/stock/${purchase.itemIds[0]}`);assert.equal(restored.status,'available');assert.equal(restored.quantity,1);
 const realtime=await call('/auth/realtime');const live=new ConvexHttpClient(convexUrl);live.setAuth(realtime.token);
 await live.query(makeFunctionReference<'query'>('readModels:browse'),{resource:'stock',size:10,search:''});
 await assert.rejects(()=>live.mutation(makeFunctionReference<'mutation'>('operations:createSeller'),{operationId:randomUUID(),name:'MUST NOT EXIST'}),/READ_ONLY_TOKEN/);
 const socket=new ConvexClient(convexUrl,{webSocketConstructor:WebSocket});socket.setAuth(async()=>realtime.token);
 const updates:any[]=[],errors:Error[]=[];const unsubscribe=socket.onUpdate(makeFunctionReference<'query'>('readModels:record'),{resource:'sellers',id:contact.id},value=>updates.push(value),error=>errors.push(error));
 const until=async(predicate:()=>boolean)=>{const started=Date.now();while(!predicate()){if(Date.now()-started>10000)throw new Error('Realtime transition timed out');await new Promise(resolve=>setTimeout(resolve,20));}};
 try {await until(()=>updates.length>0);assert.equal(updates.at(-1).name,prefix);
 await call(`/sellers/${contact.id}`,'PATCH',{name:`${prefix} updated`});await until(()=>updates.some(row=>row.name===`${prefix} updated`));
 await call('/auth/logout','POST',{});await until(()=>errors.some(error=>error.message.includes('INVALID_SESSION')));
 }finally{unsubscribe();await socket.close();}

 await assert.rejects(()=>live.query(makeFunctionReference<'query'>('readModels:browse'),{resource:'stock',size:10,search:''}),/INVALID_SESSION/);
 const revoked=await fetch(`${apiUrl}/api/v1/stock`,{headers:{Authorization:`Bearer ${token}`}});assert.equal(revoked.status,401);
 const report={checkedAt:new Date().toISOString(),api:apiUrl,convex:convexUrl,syntheticPrefix:prefix,checks:{loginCreatesPersistentSession:true,legacyDtoReadRoutes:endpoints.length,contactCreation:true,buybackPendingValidation:true,mixedPaymentBulkSale:true,saleCancellationRestoresStock:true,realtimeReadToken:true,realtimeMutationRejected:true,logoutRevokesApiAndRealtime:true,webSocketPushReflectsMutation:true,webSocketRevokedSubscriptionDenied:true},media:'Storage uses a separate local signed-S3 fixture; no cloud media write performed.'};
 await writeFile(output,JSON.stringify(report,null,2),{mode:0o600});return report;
}
async function main(){const [api,convex,output]=process.argv.slice(2);if(!output)throw new Error('Usage: check-canonical-api.ts http://127.0.0.1:3002 http://127.0.0.1:3220 private-report.json');console.log(JSON.stringify(await checkCanonicalApi(api,convex,output),null,2));}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
