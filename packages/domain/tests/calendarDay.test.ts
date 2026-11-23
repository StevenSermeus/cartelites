import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarDay,validateSaleAgainstStock,type Item,type Sale} from '../src/index';
const at=(value:string)=>Date.parse(value);
test('business calendar dates use explicit zones across midnight, DST and non-hour offsets',()=>{
 for(const [instant,zone,day] of [
  ['2026-04-01T21:30:00Z','Europe/Brussels','2026-04-01'],['2026-04-01T22:30:00Z','Europe/Brussels','2026-04-02'],
  ['2026-03-28T23:30:00Z','Europe/Brussels','2026-03-29'],['2026-03-29T01:30:00Z','Europe/Brussels','2026-03-29'],['2026-03-29T22:30:00Z','Europe/Brussels','2026-03-30'],
  ['2026-10-25T00:30:00Z','Europe/Brussels','2026-10-25'],['2026-10-25T01:30:00Z','Europe/Brussels','2026-10-25'],['2026-10-25T23:30:00Z','Europe/Brussels','2026-10-26'],
  ['2026-04-02T00:30:00Z','America/Los_Angeles','2026-04-01'],['2026-04-01T10:30:00Z','Pacific/Kiritimati','2026-04-02'],
  ['2026-04-01T18:45:00Z','Asia/Kolkata','2026-04-02'],['2026-04-01T18:20:00Z','Asia/Kathmandu','2026-04-02'],['2026-04-01T22:30:00Z','UTC','2026-04-01'],
 ])assert.equal(calendarDay(at(instant),zone),day,`${instant} ${zone}`);
 for(const value of [NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER])assert.throws(()=>calendarDay(value,'UTC'),/INVALID_DATE/);
 assert.throws(()=>calendarDay(0,''),/INVALID_TIME_ZONE/);assert.throws(()=>calendarDay(0,'Invalid/Zone'),RangeError);
});
test('shared sale validation requires a shop zone and preserves same-day granularity',()=>{
 const item:Item={id:'item',purchaseOccurredAt:at('2026-04-01T22:30:00Z'),name:'Card',vatRegime:'margin',status:'available'},items=new Map([[item.id,item]]);
 const sale:Sale={id:'sale',itemId:item.id,occurredAt:at('2026-04-01T21:30:00Z'),salePriceCents:100,status:'active'};
 assert.deepEqual(validateSaleAgainstStock(sale,items,'Europe/Brussels'),{ok:false,reason:'SALE_BEFORE_PURCHASE'});
 assert.equal(validateSaleAgainstStock(sale,items,'UTC').ok,true);
 item.purchaseOccurredAt=at('2026-04-02T00:30:00Z');sale.occurredAt=at('2026-04-01T22:30:00Z');assert.equal(validateSaleAgainstStock(sale,items,'Europe/Brussels').ok,true);
});
