import test from 'node:test';
import assert from 'node:assert/strict';
import {ScrollPositions,ScrollRestoration,sceneScrollKey} from '../src/navigation/scrollPositions';
import {visiblePage} from '../src/data/pagedSnapshot';

test('opening another native scene never changes the saved list offset',()=>{
  const positions=new ScrollPositions();positions.record('history',1234);
  const detailKey=sceneScrollKey('purchaseDetail',0,'purchase-1',null);
  const detail=new ScrollRestoration(positions,detailKey);
  assert.equal(detail.target(),0);detail.record(0,true);detail.restored();detail.record(320,true);
  const list=new ScrollRestoration(positions,'history');assert.equal(list.target(),1234);
  list.record(0,false);assert.equal(positions.read('history'),1234);
  list.restored();list.record(1400,true);assert.equal(positions.read('history'),1400);
  assert.equal(positions.read(detailKey),320);
});
test('layout changes after restoration do not scroll back; wizard steps and records keep separate offsets',()=>{
  const positions=new ScrollPositions(),one=sceneScrollKey('purchase',1,null,null),two=sceneScrollKey('purchase',2,null,null);
  const scene=new ScrollRestoration(positions,one);scene.restored();scene.record(350,true);
  assert.equal(scene.target(),undefined); // keyboard/content layout must not restore stale target 0
  scene.activate(two);assert.equal(scene.target(),0);scene.restored();scene.record(75,true);
  scene.activate(one);assert.equal(scene.target(),350);
  assert.notEqual(sceneScrollKey('saleDetail',0,null,'sale-a'),sceneScrollKey('saleDetail',0,null,'sale-b'));
  positions.clear();scene.activate(one);assert.equal(scene.target(),0);
});
test('retained hidden page keeps its cursor but never leaks into another filter or account scope',()=>{
  const key=JSON.stringify(['session-a','/stock',{search:'Pikachu'}]);
  const page={items:[{_id:'stock-on-page-2'}],nextCursor:'page-3',isDone:false};
  const saved={key,cursor:'page-2',page};
  assert.equal(visiblePage(saved,key,'page-2'),page);
  assert.deepEqual(visiblePage(saved,key,'page-1').items,[]);
  assert.deepEqual(visiblePage(saved,JSON.stringify(['session-b','/stock',{search:'Pikachu'}]),'page-2').items,[]);
  assert.deepEqual(visiblePage(saved,JSON.stringify(['session-a','/stock',{search:'Evoli'}]),'page-2').items,[]);
  assert.equal(visiblePage(saved,key,'page-2').nextCursor,'page-3');
});
