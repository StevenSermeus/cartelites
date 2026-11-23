import assert from 'node:assert/strict';
import test from 'node:test';
import {attributeRows,attributesRecord,unchangedMetadata} from '../src/data/productAttributes';
test('public and private records round trip independently and retain intentional empty values',()=>{
 const publicRecord={'Finition':'Holo','Édition':''},privateRecord={'Provenance':'QA interne'};
 assert.deepEqual(attributesRecord(attributeRows(publicRecord)),publicRecord);
 assert.deepEqual(attributesRecord(attributeRows(privateRecord)),privateRecord);
 assert.deepEqual(attributesRecord([{id:'blank',name:'',value:''}]),{});
});
test('photo revision refresh allows only unchanged metadata and ignores attribute key ordering',()=>{
 const original={name:'QA',askingPriceCents:1500,revision:1,productRevision:2,coverPhotoId:'a',publicAttributes:{Finition:'Holo',Édition:'FR'},privateNotes:'interne'};
 const photoOnly={...original,revision:2,productRevision:3,coverPhotoId:'b',publicAttributes:{Édition:'FR',Finition:'Holo'}};
 assert.equal(unchangedMetadata(original,photoOnly),true);
 for(const change of [{name:'Autre'},{askingPriceCents:0},{privateNotes:'modifié'},{publicAttributes:{Finition:'Reverse'}},{hiddenFromCatalogue:true},{variant:'Promo'},{serialNumber:'123'}])assert.equal(unchangedMetadata(original,{...photoOnly,...change}),false);
});
test('metadata rejects duplicate normalized keys and incomplete or oversized properties',()=>{
 assert.throws(()=>attributesRecord([{id:'a',name:'Type',value:'A'},{id:'b',name:' Type ',value:'B'}]),/plusieurs fois/);
 assert.throws(()=>attributesRecord([{id:'a',name:' ',value:'private'}]),/nom/);
 assert.throws(()=>attributesRecord([{id:'a',name:'Note',value:'x'.repeat(501)}]),/500/);
 assert.throws(()=>attributesRecord(Array.from({length:21},(_,id)=>({id:String(id),name:String(id),value:'v'}))),/20/);
});
