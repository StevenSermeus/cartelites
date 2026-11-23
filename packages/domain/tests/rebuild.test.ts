import test from 'node:test';
import assert from 'node:assert/strict';
import {createTcgdexSearch,parseCollectorQuery} from '../src/tcgdexSearch';
import {resolveTheme} from '../src/shopTheme';
test('both appearances validate and unreadable overrides fail',()=>{
 assert.ok(resolveTheme({},'light')); assert.ok(resolveTheme({},'dark'));
 assert.throws(()=>resolveTheme({primary:'#ffffff',primaryForeground:'#ffffff'}),/primary/);
 assert.throws(()=>resolveTheme({primary:'red'}),/primary/);
});
test('collector syntax retains full fractions and promo identities',()=>{
 assert.deepEqual(parseCollectorQuery('Pikachu 060/106'),{kind:'fraction',number:'060',total:106,name:'PIKACHU'});
 assert.equal(parseCollectorQuery('XY95').kind,'prefix'); assert.equal(parseCollectorQuery('SVP001').kind,'prefix');
 assert.equal(parseCollectorQuery('001/XY-P').kind,'series'); assert.equal(parseCollectorQuery('Black Star 12').kind,'black-star');
 assert.equal(parseCollectorQuery('001/YX-P').kind,'typo');
});
const sets=[{id:'a',name:'A',cardCount:{official:106}},{id:'b',name:'B',cardCount:{official:106}},{id:'c',name:'C',cardCount:{official:100,total:106}}];
function fixture(){const paths:string[]=[]; const search=createTcgdexSearch((async(url: string|URL|Request)=>{
 const path=String(url);paths.push(path);const key=path.split('/fr/')[1];
 const value=key==='sets'?sets:key?.startsWith('sets/')?{...sets.find(s=>key==='sets/'+s.id),cards:[{id:key+'-60',name:'Pikachu',localId:'60'},{id:key+'-160',name:'Other',localId:'160'}]}:[{id:'a-060',localId:'060',name:'Pikachu'}];
 return new Response(JSON.stringify(value),{status:200});}) as typeof fetch);return {search,paths};}
test('exact fractions preserve set ambiguity and reject total-including-secret matches',async()=>{
 const {search,paths}=fixture();const result=await search({query:'060/106',language:'fr'});
 assert.equal(result.cards.length,2); assert.deepEqual(result.cards.map(c=>c.setId),['a','b']);assert.equal(result.hasMore,false);
 await search({query:'60/106',language:'fr'});assert.equal(paths.length,3);
});
test('promo series never silently switches language',async()=>{const {search,paths}=fixture();const r=await search({query:'001/XY-P',language:'fr'});assert.equal(r.status,'unsupported');assert.ok(paths.every(p=>p.includes('/fr/')));});
test('provider pagination is explicit',async()=>{const {search,paths}=fixture();const r=await search({query:'Pika',language:'fr',page:2,pageSize:1});assert.equal(r.hasMore,true);assert.ok(paths.at(-1)?.includes('pagination%3Apage=2'));});
test('provider failure differs from empty result',async()=>{const search=createTcgdexSearch((async()=>new Response('',{status:503})) as typeof fetch);assert.equal((await search({query:'60',language:'fr'})).status,'unavailable');});
test('contrasting shop palettes retain semantic roles in both appearances',()=>{
 const light=resolveTheme({primary:'#35217a',primaryForeground:'#ffffff',primaryHover:'#28175d',accent:'#35217a',accentForeground:'#ffffff',actionTint:'#35217a',ring:'#35217a',selected:'#eee9ff',selectedForeground:'#35217a'},'light');
 const dark=resolveTheme({primary:'#c7b7ff',primaryForeground:'#1b1035',primaryHover:'#d8ccff',accent:'#c7b7ff',accentForeground:'#1b1035',actionTint:'#c7b7ff',ring:'#c7b7ff',selected:'#30204e',selectedForeground:'#e2d8ff'},'dark');
 assert.equal(light.primary,'#35217a');assert.equal(dark.primary,'#c7b7ff');
});
test('SVP exact result preserves printed promo prefix',async()=>{
 const search=createTcgdexSearch((async(url:string|URL|Request)=>new Response(JSON.stringify(String(url).endsWith('/sets')?[{id:'svp',name:'Promos'}]:{id:'svp',name:'Promos',cards:[{id:'svp-001',localId:'001',name:'Sprigatito'}]}))) as typeof fetch);
 const r=await search({query:'SVP001',language:'en'});assert.equal(r.cards[0].printedNumber,'SVP001');
});
