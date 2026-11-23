/** Disposable projection maintenance; deliberately restricted to explicit loopback targets. */
import {ConvexHttpClient} from 'convex/browser';
import {makeFunctionReference} from 'convex/server';
const [target,...flags]=process.argv.slice(2);
if(!target)throw new Error('Usage: rebuild-item-activity.ts http://127.0.0.1:PORT [--restart]');
const url=new URL(target);
if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||!url.port||url.pathname!=='/'||url.username||url.password||url.search||url.hash)throw new Error('EXPLICIT_LOOPBACK_TARGET_REQUIRED');
if(process.env.CONVEX_SELF_HOSTED_URL?.replace(/\/$/,'')!==target.replace(/\/$/,'')||!process.env.CONVEX_SELF_HOSTED_ADMIN_KEY)throw new Error('MATCHING_PRIVATE_SELF_HOSTED_CREDENTIALS_REQUIRED');
const client=new ConvexHttpClient(target);
(client as unknown as {setAdminAuth(key:string):void}).setAdminAuth(process.env.CONVEX_SELF_HOSTED_ADMIN_KEY);
let state=await client.mutation(makeFunctionReference<'mutation'>('itemActivity:rebuild'),{restart:flags.includes('--restart')});
for(let chunks=1;!state.complete;chunks++){
 if(chunks%25===0)console.log(JSON.stringify({target,chunks,...state}));
 state=await client.mutation(makeFunctionReference<'mutation'>('itemActivity:rebuild'),{});
}
console.log(JSON.stringify({target,...state}));
