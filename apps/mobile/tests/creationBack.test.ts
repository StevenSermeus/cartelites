import test from 'node:test';
import assert from 'node:assert/strict';
import {creationBackTarget} from '../src/navigation/creationBack';
test('supplier and consignment back traverse every prior step before closing',()=>{
 for(const finalStep of [2,3]){
  let step=finalStep;const visited=[];
  for(;;){const target=creationBackTarget(step,false);if(target.kind==='close')break;assert.equal(target.kind,'step');if(target.kind!=='step')throw Error('unexpected');step=target.step;visited.push(step);}
  assert.deepEqual(visited,Array.from({length:finalStep},(_,index)=>finalStep-index-1));
 }
});
test('busy confirmation blocks Back and a committed receipt cannot return to editable input steps',()=>{
 assert.deepEqual(creationBackTarget(2,true),{kind:'blocked'});
 assert.deepEqual(creationBackTarget(2,false,true),{kind:'close'});
 assert.deepEqual(creationBackTarget(0,false),{kind:'close'});
});
