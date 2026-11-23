import test from 'node:test';
import assert from 'node:assert/strict';
import { readExportPages, exportBalances, exportDate } from '../src/lib/exportPages';

test('workbook civil dates use shop timezone and never fabricate unknown dates', () => {
 assert.equal(exportDate(Date.parse('2026-11-22T23:30:00Z'),'Europe/Brussels'),'2026-11-23');
 assert.equal(exportDate(Date.parse('2026-03-29T01:30:00Z'),'America/Los_Angeles'),'2026-03-28');
 assert.equal(exportDate(null,'Europe/Brussels'),'');
 assert.equal(exportDate(undefined,'Europe/Brussels'),'');
 assert.equal(exportDate(0,'Europe/Brussels'),'1970-01-01');
});

test('export reads through empty intermediate pages with encoded cursors', async () => {
 const paths: string[] = [];
 const pages = [{items:[1],isDone:false,nextCursor:'a+/='},{items:[],isDone:false,nextCursor:'b'}, {items:[2],isDone:true,nextCursor:null}];
 const rows = await readExportPages(async <T>(path:string)=>{paths.push(path);return pages.shift() as T;}, 'sales');
 assert.deepEqual(rows,[1,2]);
 assert.equal(new URL(paths[1], 'https://test.invalid').searchParams.get('cursor'),'a+/=');
});

test('export balances use eligible frozen lines, preserve partial payouts, unknowns and zero-history depositors', () => {
 const contacts = ['a','b','c'].map(_id=>({_id,name:_id,hasDeposits:true}));
 const sales = [
  {sellerId:'a',balanceEligible:true,depositorAmountCents:203},
  {sellerId:'a',balanceEligible:false,depositorAmountCents:999},
  {sellerId:'b',balanceEligible:true,depositorAmountCents:null},
  {sellerId:'b',balanceEligible:true,depositorAmountCents:10},
 ];
 const balances=exportBalances(contacts,sales,[{sellerId:'a',amountCents:100},{sellerId:'a',amountCents:12}]);
 assert.deepEqual(balances.map(b=>[b.earnedCents,b.paidCents,b.balanceCents]),[[203,112,91],[null,0,null],[0,0,0]]);
 assert.throws(()=>exportBalances([],sales,[]),/DEPOSITOR_MISSING/);
});

test('export fails instead of returning a partial workbook when reads fail or cursors cannot advance', async () => {
 for (const nextCursor of [null, '', 'same']) {
  let count=0;
  await assert.rejects(readExportPages(async <T>()=>({items:[1],isDone:false,nextCursor:count++===0?'same':nextCursor}) as T,'stock'), /INCOMPLETE_PAGINATION/);
 }
 let count=0;
 await assert.rejects(readExportPages(async <T>()=>{
   if(count++)throw new Error('NETWORK_UNAVAILABLE');
   return {items:[1],isDone:false,nextCursor:'next'} as T;
 },'stock'), /NETWORK_UNAVAILABLE/);
});
