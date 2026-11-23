import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConvexClient } from 'convex/browser';
import { browseArgs, createRealtime, RealtimeAuthError } from '../src/index';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function harness() {
  const updates = new Set<(value: unknown) => void>();
  let closed = 0;
  const socket = {
    onUpdate(_name: unknown, _args: unknown, callback: (value: unknown) => void) {
      updates.add(callback); return () => updates.delete(callback);
    },
    close: async () => { closed++; },
    setAuth() {},
  };
  return { socket: socket as unknown as ConvexClient, updates, closed: () => closed };
}
test('multiple views share a socket and receive successive pushed values without HTTP reloads', async () => {
  const h = harness(); let connections = 0;
  const live = createRealtime(async () => { connections++; return { url: 'https://example.convex.cloud' }; }, () => h.socket);
  const a: unknown[] = [], b: unknown[] = [];
  const stopA = live.subscribe('readModels:browse', { resource: 'stock' }, v => a.push(v), assert.fail);
  const stopB = live.subscribe('readModels:browse', { resource: 'stock' }, v => b.push(v), assert.fail);
  await tick();
  for (const update of h.updates) update({ price: 100 });
  for (const update of h.updates) update({ price: 200 });
  assert.deepEqual(a, [{ price: 100 }, { price: 200 }]); assert.deepEqual(a, b);
  assert.equal(connections, 1);
  stopA(); assert.equal(h.closed(), 0);
  stopB(); assert.equal(h.closed(), 1); assert.equal(h.updates.size, 0);
});
test('unmount or instance change during credential loading never opens a stale socket', async () => {
  let resolve!: (config: { url: string }) => void; let opened = 0;
  const live = createRealtime(() => new Promise(r => { resolve = r; }), () => { opened++; return harness().socket; });
  const stop = live.subscribe('readModels:browse', {}, () => assert.fail('Unexpected update'), assert.fail);
  stop(); resolve({ url: 'https://old.convex.cloud' }); await tick();
  assert.equal(opened, 0);
});
test('reset removes listeners and clears protected results through error callbacks', async () => {
  const h = harness(); let failures = 0;
  const live = createRealtime(async () => ({ url: 'https://example.convex.cloud' }), () => h.socket);
  live.subscribe('readModels:browse', {}, () => assert.fail('Unexpected update'), () => failures++);
  await tick(); live.reset();
  assert.equal(failures, 1); assert.equal(h.updates.size, 0); assert.equal(h.closed(), 1);
});
test('browse arguments preserve filters, coerce HTTP numeric values and omit undefined', () => {
  assert.deepEqual(browseArgs('/stock', { size: '10', from: '12', cursor: undefined, visibility: 'hidden' }),
    { resource: 'stock', size: 10, search: '', from: 12, visibility: 'hidden' });
  assert.throws(() => browseArgs('/unknown', {}));
});
test('credential loading can retry after a temporary API failure', async () => {
  const h = harness(); let attempts = 0; let failures = 0;
  const live = createRealtime(async () => {
    if (++attempts === 1) throw new Error('offline');
    return { url: 'https://example.convex.cloud' };
  }, () => h.socket);
  const stopA = live.subscribe('readModels:browse', {}, () => {}, () => failures++);
  await tick();
  const stopB = live.subscribe('readModels:browse', {}, () => {}, assert.fail);
  await tick(); assert.equal(attempts, 2); assert.equal(failures, 1); assert.equal(h.updates.size, 2);
  stopA(); stopB();
});
test('credentials refresh from the API and cannot cross instance boundaries', async () => {
  const h = harness(); let fetchToken!: () => Promise<string | null | undefined>;
  let requests = 0; let errors = 0;
  h.socket.setAuth = (fetcher) => { fetchToken = () => fetcher({ forceRefreshToken: true }); };
  const live = createRealtime(async () => ({ url: ++requests < 3 ? 'https://one.convex.cloud' : 'https://two.convex.cloud', token: `token-${requests}` }), () => h.socket);
  const stop = live.subscribe('readModels:browse', {}, () => {}, () => errors++);
  await tick();
  assert.equal(await fetchToken(), 'token-1');
  assert.equal(await fetchToken(), 'token-2');
  assert.equal(await fetchToken(), null); assert.equal(errors, 1);
  stop();
});

function authenticatedHarness() {
  const h=harness();let fetchToken!:()=>Promise<string|null|undefined>,authChanged!:(authenticated:boolean)=>void;
  h.socket.setAuth=(fetcher,onChange)=>{fetchToken=()=>fetcher({forceRefreshToken:true});authChanged=onChange!;};
  return {...h,fetchToken:()=>fetchToken(),authChanged:(value:boolean)=>authChanged(value)};
}
test('established credential503 discards the unauthenticated socket and retrying one view rebinds every mounted query',async()=>{
 const sockets:ReturnType<typeof authenticatedHarness>[]=[];let requests=0;
 const live=createRealtime(async()=>{requests++;if(requests===2)throw new Error('Connexion temps réel indisponible.');return {url:'https://one.convex.cloud',token:`token-${requests}`};},()=>{const h=authenticatedHarness();sockets.push(h);return h.socket;},{retryDelayMs:1000});
 const a:unknown[]=[],b:unknown[]=[],c:unknown[]=[],failures:Error[]=[];
 const stopA=live.subscribe('a',{},v=>a.push(v),e=>failures.push(e)),stopB=live.subscribe('b',{},v=>b.push(v),e=>failures.push(e));await tick();
 const staleUpdates=[...sockets[0].updates];assert.equal(await sockets[0].fetchToken(),'token-1');assert.equal(await sockets[0].fetchToken(),null);
 sockets[0].authChanged(false);assert.equal(failures.length,2);assert.ok(failures.every(e=>!(e instanceof RealtimeAuthError)));assert.equal(sockets[0].closed(),1);
 for(const callback of staleUpdates)callback('stale');assert.deepEqual(a,[]);assert.deepEqual(b,[]);
 const stopC=live.subscribe('c',{},v=>c.push(v),e=>failures.push(e));await tick();assert.equal(requests,3);assert.equal(sockets.length,2);assert.equal(sockets[1].updates.size,3);assert.equal(await sockets[1].fetchToken(),'token-3');
 for(const callback of sockets[1].updates)callback('recovered');assert.deepEqual(a,['recovered']);assert.deepEqual(b,a);assert.deepEqual(c,a);
 stopA();stopB();stopC();
});
test('transient established auth refresh retries automatically with mounted views and last unmount cancels pending retries',async()=>{
 const sockets:ReturnType<typeof authenticatedHarness>[]=[];let requests=0;
 const live=createRealtime(async()=>{if(++requests===2)throw new Error('503');return {url:'https://one.convex.cloud',token:'token'};},()=>{const h=authenticatedHarness();sockets.push(h);return h.socket;},{retryDelayMs:1,maxRetries:2});
 const stopA=live.subscribe('a',{},()=>{},()=>{}),stopB=live.subscribe('b',{},()=>{},()=>{});await tick();await sockets[0].fetchToken();await sockets[0].fetchToken();await tick();await tick();assert.equal(sockets.length,2);assert.equal(sockets[1].updates.size,2);stopA();stopB();
 let attempts=0;const failed=createRealtime(async()=>{attempts++;throw new Error('offline');},()=>harness().socket,{retryDelayMs:5,maxRetries:2});const stop=failed.subscribe('a',{},()=>{},()=>{});await tick();stop();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(attempts,1);
});
test('real auth denial stays blocked and never becomes a transient reconnect loop',async()=>{
 const h=authenticatedHarness();let requests=0;const failures:Error[]=[];
 const live=createRealtime(async()=>{if(++requests>1)throw new RealtimeAuthError(401);return {url:'https://one.convex.cloud',token:'token'};},()=>h.socket,{retryDelayMs:1,maxRetries:2});
 const stopA=live.subscribe('a',{},()=>{},e=>failures.push(e));await tick();await h.fetchToken();await h.fetchToken();h.authChanged(false);await new Promise(resolve=>setTimeout(resolve,10));
 const stopB=live.subscribe('b',{},()=>{},e=>failures.push(e));await tick();assert.equal(requests,2);assert.ok(failures.every(e=>e instanceof RealtimeAuthError));assert.equal(h.updates.size,0);stopA();stopB();
});
test('reset during an in-flight refresh discards old credentials and callbacks while a new instance connects',async()=>{
 const sockets:ReturnType<typeof authenticatedHarness>[]=[];let requests=0,resolve!:(value:{url:string;token:string})=>void;
 const live=createRealtime(()=>{requests++;if(requests===2)return new Promise(r=>{resolve=r;});return Promise.resolve({url:requests===1?'https://old.convex.cloud':'https://new.convex.cloud',token:'token'});},()=>{const h=authenticatedHarness();sockets.push(h);return h.socket;});
 const old:unknown[]=[],fresh:unknown[]=[];live.subscribe('a',{},v=>old.push(v),()=>{});await tick();await sockets[0].fetchToken();const stale=[...sockets[0].updates],refresh=sockets[0].fetchToken();live.reset();
 const stop=live.subscribe('new',{},v=>fresh.push(v),assert.fail);await tick();resolve({url:'https://old.convex.cloud',token:'stale'});assert.equal(await refresh,null);sockets[0].authChanged(false);for(const callback of stale)callback('old');for(const callback of sockets[1].updates)callback('new');assert.deepEqual(old,[]);assert.deepEqual(fresh,['new']);assert.equal(sockets[1].closed(),0);stop();
});
