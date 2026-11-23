import assert from 'node:assert/strict';
import test from 'node:test';
import {shopDay,shopDayTimestamp,shopDayAtTime} from '../src/data/shopCalendar';
import {dateFilters} from '../src/data/dateFilters';
import {buildSaleSettlement,paymentDay} from '../src/data/salePayment';
import {setShopFormatting} from '../src/theme/shopFormatting';

test('the selected shop controls today and entered payment days across the date line',()=>{
 try {
  const now=Date.UTC(2026,0,2,1);
  setShopFormatting({currency:'USD',timezone:'America/Los_Angeles'});
  assert.equal(shopDay(now),'2026-01-01');
  assert.equal(paymentDay(now),'2026-01-01');
  setShopFormatting({currency:'NZD',timezone:'Pacific/Kiritimati'});
  assert.equal(shopDay(now),'2026-01-02');
  const payment=buildSaleSettlement({mode:'cash',cash:'',transfer:'',date:'2026-01-02',reference:''},1250).payment!;
  assert.equal(payment.receivedAt,Date.UTC(2026,0,1,22));
  assert.equal(shopDay(payment.receivedAt),'2026-01-02');
 } finally {setShopFormatting(null);}
});
test('history filters include 23-hour and 25-hour shop days at DST transitions',()=>{
 try {
  setShopFormatting({currency:'EUR',timezone:'Europe/Brussels'});
  const spring=dateFilters('2026-03-29','2026-03-29');
  assert.equal(spring.error,'');
  assert.equal(spring.from,Date.UTC(2026,2,28,23));
  assert.equal(spring.to! - spring.from! + 1,23*3600000);
  const autumn=dateFilters('2026-10-25','2026-10-25');
  assert.equal(autumn.to! - autumn.from! + 1,25*3600000);
 } finally {setShopFormatting(null);}
});
test('shop date corrections preserve shop clock time and reject nonexistent times',()=>{
 try {
  setShopFormatting({currency:'EUR',timezone:'Europe/Brussels'});
  assert.equal(shopDayAtTime('2026-06-02',Date.UTC(2026,0,2,13,25,40,123)),Date.UTC(2026,5,2,12,25,40,123));
  assert.equal(shopDayTimestamp('2026-03-29',2,30),undefined);
  assert.equal(shopDayTimestamp('2026-02-30'),undefined);
  assert.equal(shopDayTimestamp('2024-02-29'),Date.UTC(2024,1,29,11));
  assert.equal(shopDayTimestamp('2011-12-30',12,0,0,0,'Pacific/Apia'),undefined);
 } finally {setShopFormatting(null);}
});
