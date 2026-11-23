import test from 'node:test';
import assert from 'node:assert/strict';
import {scopedJson} from '../src/data/scopedResponse';

test('old 401 cannot clear a new account after delayed JSON decoding',async()=>{
  let active=true,cleared=false,resolve!:(value:unknown)=>void;
  const owner={assertActive(){if(!active)throw new Error('stale scope');}};
  const pending=scopedJson<{error:string}>({json:()=>new Promise(done=>{resolve=done;})},owner).then(payload=>{if(payload.error==='INVALID_SESSION')cleared=true;});
  active=false;resolve({error:'INVALID_SESSION'});
  await assert.rejects(pending,/stale scope/);assert.equal(cleared,false);
});
test('late successful read/upload JSON cannot publish into a new session',async()=>{
  let active=true,published=false,resolve!:(value:unknown)=>void;
  const pending=scopedJson({json:()=>new Promise(done=>{resolve=done;})},{assertActive(){if(!active)throw new Error('stale scope');}}).then(()=>{published=true;});
  active=false;resolve({id:'old-account-upload'});await assert.rejects(pending,/stale scope/);assert.equal(published,false);
});
test('malformed error JSON fallback also respects scope; current response stays usable',async()=>{
  const response={json:async()=>{throw new SyntaxError('invalid');}};
  await assert.rejects(scopedJson(response,{assertActive(){throw new Error('stale scope');}},{}),/stale scope/);
  assert.deepEqual(await scopedJson(response,{assertActive(){}},{}),{});
  assert.deepEqual(await scopedJson({json:async()=>({id:'current'})},{assertActive(){}}),{id:'current'});
});
