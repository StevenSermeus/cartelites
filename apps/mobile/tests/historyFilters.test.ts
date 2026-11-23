import assert from 'node:assert/strict';
import test from 'node:test';
import {emptyHistoryFilters,historyFilterQuery,salesHistoryQuery,historyQueryString,activityFilterOptions,changeHistorySource,activityRowStatus} from '../src/data/historyFilters';
import {setShopFormatting} from '../src/theme/shopFormatting';

test('sale history search, origin, collection and status filters use the server contract',()=>{
 const filters={...emptyHistoryFilters(),search:'  QA foil ',origin:'supplier' as const,paymentStatus:'pending' as const,status:'cancelled' as const};
 assert.deepEqual(historyFilterQuery(filters).params,{search:'QA foil',origin:'supplier',paymentStatus:'pending',status:'cancelled',eventKind:'all',from:undefined,to:undefined});
 const query=new URLSearchParams(historyQueryString(filters,'page&2'));
 assert.equal('eventKind' in salesHistoryQuery(filters).params!,false);
 assert.equal(query.get('cursor'),'page&2');assert.equal(query.get('search'),'QA foil');assert.equal(query.has('eventKind'),false);
});
test('invalid or reversed date filters refuse a broad unfiltered request',()=>{
 for(const filters of [{...emptyHistoryFilters(),from:'2026-02-30'},{...emptyHistoryFilters(),from:'2026-11-24',to:'2026-11-23'}]){
  assert.equal(historyFilterQuery(filters).params,null);assert.throws(()=>historyQueryString(filters));
 }
});
test('date filters cover the complete shop day across DST',()=>{
 try{setShopFormatting({currency:'EUR',timezone:'Europe/Brussels'});
 const params=historyFilterQuery({...emptyHistoryFilters(),from:'2026-10-25',to:'2026-10-25'}).params!;
 assert.equal(params.to!-params.from!+1,25*3600000);
 }finally{setShopFormatting(null);}
});
test('source changes retain common filters and remove incompatible status and origin filters',()=>{
 const filters={...emptyHistoryFilters(),search:'QA',from:'2026-01-01',status:'cancelled' as const,origin:'supplier' as const,paymentStatus:'received' as const};
 assert.deepEqual(changeHistorySource(filters),{...emptyHistoryFilters(),search:'QA',from:'2026-01-01'});
 assert.deepEqual(activityFilterOptions('all'),{statuses:[]});
 assert.deepEqual(activityFilterOptions('gifts').origins,['purchase','supplier']);
 assert.deepEqual(activityFilterOptions('consignments').statuses,['pending','open','closed']);
 assert.equal(activityFilterOptions('events').events,true);
});

test('cancelled unpaid sales are never labelled as outstanding collection',()=>{
 assert.equal(activityRowStatus({status:'cancelled',paymentStatus:'pending'}),'Annulé');
 assert.equal(activityRowStatus({status:'active',paymentStatus:'pending'}),'À encaisser');
});
