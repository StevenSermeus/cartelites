import test from 'node:test';
import assert from 'node:assert/strict';
import {completeGiftExport,giftDateRange,giftPageQuery} from '../src/data/giftExport';
import {setShopFormatting} from '../src/theme/shopFormatting';
import {documentVersion} from '../src/data/documentVersion';
test('gift export consumes intermediate empty pages before returning the complete dataset',async()=>{
 const cursors:(string|undefined)[]=[];const rows=await completeGiftExport(async cursor=>{cursors.push(cursor);return cursor===undefined?{page:[{_id:'a'}],isDone:false,continueCursor:'p2'}:cursor==='p2'?{page:[],isDone:false,continueCursor:'p3'}:{page:[{_id:'b'}],isDone:true};},()=>{});
 assert.deepEqual(rows,[{_id:'a'},{_id:'b'}]);assert.deepEqual(cursors,[undefined,'p2','p3']);
});
test('incomplete or unstable gift pagination never produces a partial export',async()=>{
 for(const cursor of [null,'same'])await assert.rejects(completeGiftExport(async()=>({page:[],isDone:false,continueCursor:cursor}),()=>{}),/Pagination incomplète/);
 await assert.rejects(completeGiftExport(async cursor=>({page:[{_id:'duplicate'}],isDone:!!cursor,continueCursor:'next'}),()=>{}),/historique a changé/);
 await assert.rejects(completeGiftExport(async()=>({page:[{_id:'a'},{_id:'b'}],isDone:true}),()=>{},1),/10 000/);
 let active=true,reads=0;await assert.rejects(completeGiftExport(async()=>{reads++;active=false;return {page:[],isDone:false,continueCursor:'next'};},()=>{if(!active)throw Error('scope');}),/scope/);assert.equal(reads,1);
});
test('gift date boundaries follow the configured shop calendar, including DST',()=>{
 try {setShopFormatting({currency:'USD',timezone:'America/Los_Angeles'});const q=new URLSearchParams(giftPageQuery('2026-03-29','2026-03-29','page'));
 assert.equal(Number(q.get('from')),Date.UTC(2026,2,29,7));assert.equal(Number(q.get('to')),Date.UTC(2026,2,30,6,59,59,999));assert.equal(q.get('cursor'),'page');
 setShopFormatting({currency:'EUR',timezone:'Europe/Brussels'});const range=giftDateRange('2026-03-29','2026-03-29');assert.equal(range.to!-range.from!+1,23*3600000);
 assert.throws(()=>giftDateRange('','2026-03-29'));assert.throws(()=>giftDateRange('2026-03-30','2026-03-29'));}finally{setShopFormatting(null);}
});
test('document versions use authoritative metadata and never invent legacy ordering',()=>{
 assert.equal(documentVersion(4),'Version 4');for(const value of [undefined,null,0,-1,2.3,'4'])assert.equal(documentVersion(value),'Version non renseignée');
});
