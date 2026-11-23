import assert from 'node:assert/strict';
import test from 'node:test';
import {createDetailStore} from '../src/navigation/NativeDetail';
test('native nested dossier registration keeps parent content and closing child leaves parent intact',()=>{
 const store=createDetailStore();
 store.set({id:'deposit',title:'Dépôt',children:'parent draft',onClose:()=>{}});
 store.set({id:'item',title:'Article',children:'child draft',onClose:()=>{}});
 store.remove('item');
 assert.equal(store.get('deposit')?.children,'parent draft');
 assert.equal(store.get('item'),null);
});
test('subscriber re-registration during notification does not cause an update loop',()=>{
 const store=createDetailStore();let calls=0;
 let stop=()=>{};
 const listener=()=>{calls++;stop();stop=store.subscribe(listener);};
 stop=store.subscribe(listener);
 store.set({id:'d',title:'D',children:null,onClose:()=>{}});
 assert.equal(calls,1);stop();
});
