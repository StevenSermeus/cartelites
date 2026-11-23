import test from 'node:test';
import assert from 'node:assert/strict';
import {TicketEmailRecovery, type RecoveryStorage} from '../src/lib/ticketEmailRecovery';
import type {AccountRequest} from '../src/lib/accountScope';
function storage(): RecoveryStorage {const values = new Map<string,string>();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);}};}
const empty = {emails:[]};

test('cross-surface reuse and reload retain original uncertain key, recipient and ticket', async () => {
 const disk=storage(), a=new TicketEmailRecovery(disk,'owner-a'), calls:{path:string;body:string}[]=[];
 const request:AccountRequest=async <T>(path:string,init?:RequestInit)=>{
  if(!init)return empty as T;
  calls.push({path,body:String(init.body)});throw new TypeError('Failed to fetch');
 };
 await assert.rejects(a.send(request,'old-ticket','one@example.test'));
 const original=calls[0];
 // A different surface shares this exact object and cannot replace the unknown destination.
 await a.send(request,'other-ticket','other@example.test');assert.equal(calls.length,1);
 const reloaded=new TicketEmailRecovery(disk,'owner-a');
 assert.equal(reloaded.pending?.uncertain,true);
 await assert.rejects(reloaded.send(request,'old-ticket','changed@example.test'));
 assert.deepEqual(calls[1],original);
 assert.equal(new TicketEmailRecovery(disk,'owner-b').pending,null);
});

test('server unknown in either model is recovered before POST and terminal evidence resolves it without a resend', async () => {
 for(const legacy of [false,true]){
  const store=new TicketEmailRecovery(storage(),'a');let posts=0,state='sending';
  const request:AccountRequest=async <T>(_path:string,init?:RequestInit)=>{
   if(init){posts++;return {status:'unknown'} as T;}
   return {emails:[legacy?{operationId:'original',recipient:'original@example.test',status:state}:{attemptKey:'original',recipient:'original@example.test',state}]} as T;
  };
  await store.send(request,'ticket','new@example.test');
  assert.equal(posts,0);assert.equal(store.pending?.recipient,'original@example.test');
  state='accepted';await store.send(request,'ticket','new@example.test');assert.equal(posts,0);assert.equal(store.attempt.status,'accepted');
 }
});

test('history failure, malformed history, or failed durable write prevent a fresh send', async () => {
 for(const history of [null,{emails:[{}]}]){
  let posts=0;const store=new TicketEmailRecovery(storage(),'a');
  await assert.rejects(store.send(async <T>(_path:string,init?:RequestInit)=>{if(init)posts++;return history as T;},'ticket','qa@example.test'));
  assert.equal(posts,0);
 }
 let posts=0;
 const bad=new TicketEmailRecovery({getItem:()=>null,setItem:()=>{throw new Error('quota');}},'a');
 await assert.rejects(bad.send(async <T>(_path:string,init?:RequestInit)=>{if(init)posts++;return empty as T;},'ticket','qa@example.test'));
 assert.equal(posts,0);
 const broken=new TicketEmailRecovery({getItem:()=>'{',setItem:()=>{}},'a');
 await assert.rejects(broken.send(async <T>()=>{posts++;return empty as T;},'ticket','qa@example.test'));
 assert.equal(posts,0);
});

test('fresh stale rejection requires release, whereas a later stale error preserves prior uncertainty', async () => {
 const disk=storage(),store=new TicketEmailRecovery(disk,'a');let error='TICKET_STALE';
 const request:AccountRequest=async <T>(_path:string,init?:RequestInit)=>{if(init)throw new Error(error);return empty as T;};
 await assert.rejects(store.send(request,'old','qa@example.test'));assert.equal(store.attempt.status,'stale');
 store.releaseStale();assert.equal(new TicketEmailRecovery(disk,'a').pending,null);
 error='NETWORK_ERROR';await assert.rejects(store.send(request,'current','qa@example.test'));
 error='TICKET_STALE';await assert.rejects(store.send(request,'current','qa@example.test'));
 assert.equal(store.attempt.status,'unknown');assert.throws(()=>store.releaseStale());
});

test('known failure needs explicit retry and new identity; no concurrent second surface send', async () => {
 const store=new TicketEmailRecovery(storage(),'a');const ids:string[]=[];let release:()=>void=()=>{};
 const request:AccountRequest=async <T>(_path:string,init?:RequestInit)=>{
  if(!init)return empty as T;
  ids.push(JSON.parse(String(init.body)).operationId);return {status:'failed'} as T;
 };
 await store.send(request,'ticket','qa@example.test');await store.send(request,'ticket','other@example.test');assert.equal(ids.length,1);
 await store.send(request,'ticket','other@example.test',true);assert.equal(ids.length,2);assert.notEqual(ids[0],ids[1]);
 const blocked:AccountRequest=async <T>()=>{await new Promise<void>(r=>{release=r;});return empty as T;};
 const ongoing=store.send(blocked,'ticket','qa@example.test');
 await assert.rejects(store.send(request,'ticket','qa@example.test'),/déjà en cours/);release();await ongoing;
});
