import test from 'node:test';
import assert from 'node:assert/strict';
import {shareScopedFile,type ShareIO} from '../src/data/scopedShare';
test('scope changes at async boundaries prevent file disclosure and clean only the owned directory',async()=>{
 for(const boundary of ['available','create','write']){
  let active=true;const events:string[]=[];const scope={assertActive(){if(!active)throw Error('account changed');}};
  const step=async(name:string)=>{events.push(name);if(name===boundary)active=false;};
  const io:ShareIO={available:async()=>{await step('available');return true;},create:()=>step('create'),write:()=>step('write'),share:()=>step('share'),remove:async path=>{events.push('remove:'+path);}};
  await assert.rejects(shareScopedFile(scope,'cache/unique/','signed-original.pdf','exact bytes',io),/account changed/);
  assert.ok(!events.includes('share'));assert.equal(events.includes('remove:cache/unique/'),boundary!=='available');
 }
});
test('concurrent versions share unchanged bytes and basename in independent temporary directories',async()=>{
 const files=new Map<string,string>(),shared:string[]=[],removed:string[]=[];
 const io:ShareIO={available:async()=>true,create:async()=>{},write:async(path,body)=>{files.set(path,body);},share:async path=>{shared.push(files.get(path)!);},remove:async path=>{removed.push(path);}};
 await Promise.all(['first','second'].map(version=>shareScopedFile({assertActive(){}},`cache/${version}/`,'same.pdf',version,io)));
 assert.deepEqual(shared.sort(),['first','second']);assert.deepEqual([...files.keys()].sort(),['cache/first/same.pdf','cache/second/same.pdf']);assert.deepEqual(removed.sort(),['cache/first/','cache/second/']);
});
