/** Read-only provider adapter. No mirrored catalogue and no implicit language fallback. */
export type SearchCard = { id: string; localId: string; name: string; image?: string; setId: string; setName: string; language: string; printedNumber: string; provider: 'tcgdex' };
export type SearchResult = { cards: SearchCard[]; message: string; hasMore: boolean; page: number; status: 'ok'|'empty'|'unsupported'|'unavailable'; suggestion?: string };
type Card = { id: string; localId: string; name: string; image?: string };
type SetInfo = {id:string; name:string; cardCount?: {official:number}; cards?: Card[]};
const normalize = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const numberKey = (s:string) => normalize(s).replace(/\s/g,'').replace(/\d+/g,d=>String(Number(d)));
const prefixSets: Record<string,string> = {XY:'xyp',SM:'smp',SWSH:'swshp',SVP:'svp',BW:'bwp',DP:'dpp',HGSS:'hgssp',MEP:'mep'};
const promoSets = ['basep','np','dpp','hgssp','bwp','xyp','smp','swshp','svp','mep'];
export function parseCollectorQuery(input:string) {
  const value=normalize(input).replace(/\s*\/\s*/g,'/');
  const fraction=value.match(/(?:^|\s)([A-Z]*\d+[A-Z]*)\/(\d+)(?:$|\s)/);
  const series=value.match(/(?:^|\s)(\d+[A-Z]*)\/([A-Z]+-P)(?:$|\s)/);
  const prefix=value.replace(/\s/g,'').match(/^(SWSH|HGSS|SVP|MEP|XY|SM|BW|DP)(\d+[A-Z]*)$/);
  const black=value.match(/^(?:(.*?)\s+)?BLACK\s+STAR(?:\s+PROMOS?)?(?:\s+(\d+))?$/);
  if(value.includes('YX-P')) return {kind:'typo' as const, suggestion:value.replace(/YX-P/g,'XY-P')};
  if(fraction) return {kind:'fraction' as const,number:fraction[1],total:Number(fraction[2]),name:value.replace(fraction[0],' ').trim()};
  if(series) return {kind:'series' as const,number:series[1],series:series[2],name:value.replace(series[0],' ').trim()};
  if(prefix) return {kind:'prefix' as const,prefix:prefix[1],number:prefix[2],setId:prefixSets[prefix[1]]};
  if(black) return {kind:'black-star' as const,number:black[2],name:black[1]||''};
  if(/^\d+$/.test(value)) return {kind:'number' as const,number:value};
  return {kind:'name' as const,name:input.trim()};
}
export function createTcgdexSearch(transport: typeof fetch = fetch) {
  const cache = new Map<string,{until:number;value:unknown}>();
  async function get(path:string):Promise<unknown> {
    const hit=cache.get(path); if(hit && hit.until>Date.now()) return hit.value;
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),18000);
    try {
      const response=await transport('https://api.tcgdex.net/v2/'+path,{signal:controller.signal,credentials:'omit'});
      if(!response.ok) throw new Error(response.status===404 ? 'unsupported':'unavailable');
      const value:unknown=await response.json();
      if(cache.size>=200) cache.delete(cache.keys().next().value!);
      cache.set(path,{until:Date.now()+900000,value}); return value;
    } finally {clearTimeout(timer);}
  }
  return async function searchTcgdex({query,language,page=1,pageSize=24}:{query:string;language:string;page?:number;pageSize?:number}):Promise<SearchResult> {
    if(!/^[a-z]{2}(?:-[a-z]{2})?$/.test(language)) throw new Error('Langue invalide');
    page=Math.max(1,Math.floor(page)||1); pageSize=Math.min(100,Math.max(1,Math.floor(pageSize)||24));
    const empty=(message:string,status:SearchResult['status']='empty'):SearchResult=>({cards:[],message,hasMore:false,page,status});
    if(!query.trim()) return empty('Saisissez un nom, un numéro ou une promo.');
    const parsed=parseCollectorQuery(query);
    if(parsed.kind==='typo') return {...empty(`Vouliez-vous écrire ${parsed.suggestion} ?`),suggestion:parsed.suggestion};
    try {
      const sets=await get(language+'/sets') as SetInfo[];
      if(!Array.isArray(sets)) throw new Error('unavailable');
      const result=(card:Card,set:SetInfo):SearchCard=>({...card,setId:set.id,setName:set.name,language,provider:'tcgdex',
        printedNumber:parsed.kind==='prefix' && ['SVP','MEP'].includes(parsed.prefix)?`${parsed.prefix}${card.localId}`:parsed.kind==='series'?`${card.localId}/${parsed.series}`:promoSets.includes(set.id)?card.localId:set.cardCount?.official?`${card.localId}/${set.cardCount.official}`:card.localId});
      let candidates:SetInfo[]|undefined;
      if(parsed.kind==='fraction') candidates=sets.filter(s=>s.cardCount?.official===parsed.total);
      if(parsed.kind==='series') candidates=sets.filter(s=>numberKey(s.id)===numberKey(parsed.series));
      if(parsed.kind==='prefix') candidates=sets.filter(s=>s.id===parsed.setId);
      if(parsed.kind==='black-star') candidates=sets.filter(s=>promoSets.includes(s.id));
      if(candidates) {
        if(!candidates.length) return empty(`Série absente du catalogue TCGDex en ${language.toUpperCase()}. Choisissez explicitement une autre langue ou la saisie manuelle.`,'unsupported');
        const cards:SearchCard[]=[];
        // Bounded sequential metadata requests; set detail contains its complete card list.
        for(const candidate of candidates) {
          const set=await get(language+'/sets/'+encodeURIComponent(candidate.id)) as SetInfo;
          if(!Array.isArray(set.cards)) throw new Error('unavailable');
          const expected=parsed.kind==='prefix' ? (['SVP','MEP'].includes(parsed.prefix)?parsed.number:parsed.prefix+parsed.number) : 'number' in parsed?parsed.number:undefined;
          for(const card of set.cards) if((!expected||numberKey(card.localId)===numberKey(expected))&&(!('name' in parsed)||!parsed.name||normalize(card.name+' '+set.name).includes(normalize(parsed.name)))) cards.push(result(card,set));
        }
        return {cards,message:cards.length?`TCGDex · ${language.toUpperCase()}`:'Aucune carte exacte. La saisie manuelle reste disponible.',hasMore:false,page,status:cards.length?'ok':'empty'};
      }
      const parameters=new URLSearchParams({'pagination:page':String(page),'pagination:itemsPerPage':String(pageSize)});
      parameters.set(parsed.kind==='number'?'localId':'name',parsed.kind==='number'?'eq:'+String(Number(parsed.number)):parsed.kind==='name'?parsed.name:query);
      const rows=await get(language+'/cards?'+parameters) as Card[];
      if(!Array.isArray(rows)) throw new Error('unavailable');
      const cards=rows.filter(c=>parsed.kind!=='number'||numberKey(c.localId)===numberKey(parsed.number)).map(card=>result(card,sets.filter(s=>card.id.startsWith(s.id+'-')).sort((a,b)=>b.id.length-a.id.length)[0]||{id:card.id.slice(0,card.id.lastIndexOf('-')),name:'Série non précisée'}));
      return {cards,message:parsed.kind==='number'?'Numéro ambigu : vérifiez la série et la langue.':`TCGDex · ${language.toUpperCase()}`,hasMore:rows.length===pageSize,page,status:cards.length?'ok':'empty'};
    } catch(error) {return empty(error instanceof Error&&error.message==='unsupported'?'Catalogue absent dans cette langue. Choisissez une autre langue ou la saisie manuelle.':'TCGDex indisponible. Réessayez ou utilisez la saisie manuelle.',error instanceof Error&&error.message==='unsupported'?'unsupported':'unavailable');}
  };
}
export const searchTcgdex = createTcgdexSearch();
