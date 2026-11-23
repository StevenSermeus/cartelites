import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupSelectedContact,type ContactLookup} from '../src/data/selectedContact';
type Contact={_id:string;name:string};
test('a failed selected-contact read exposes retry feedback without replacing its identity',async()=>{
 const results:ContactLookup<Contact>[]=[];
 await lookupSelectedContact('chosen',async()=>{throw new Error('Connexion interrompue');},()=>true,result=>results.push(result));
 assert.equal(results[0].status,'error');assert.match(results[0].status==='error'?results[0].message:'',/Connexion interrompue/);
 await lookupSelectedContact('chosen',async id=>({_id:id,name:'Contact retrouvé'}),()=>true,result=>results.push(result));
 assert.deepEqual(results[1],{status:'ready',contact:{_id:'chosen',name:'Contact retrouvé'}});
});
test('missing or mismatched contacts require an explicit replacement instead of silently selecting another record',async()=>{
 for(const row of [null,{_id:'other',name:'Autre'}]){
  const results:ContactLookup<Contact>[]=[];
  await lookupSelectedContact('chosen',async()=>row,()=>true,result=>results.push(result));
  assert.equal(results[0].status,'error');
 }
});
test('late contact success and failure cannot overwrite a new selection or account',async()=>{
 for(const fails of [false,true]){
  let current=true,resolve!:(value:Contact|null)=>void,reject!:(reason:Error)=>void;
  const results:ContactLookup<Contact>[]=[];
  const pending=lookupSelectedContact('old',()=>new Promise((res,rej)=>{resolve=res;reject=rej;}),()=>current,result=>results.push(result));
  current=false;if(fails)reject(new Error('old failure'));else resolve({_id:'old',name:'Old account'});
  await pending;assert.deepEqual(results,[]);
 }
});
