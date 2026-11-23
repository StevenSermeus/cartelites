/* Shared real, read-only TCGDex search. No shop data or credentials are sent. */
(function (root) {
  'use strict';
  const API = 'https://api.tcgdex.net/v2/';
  const cache = new Map();
  const promoIds = ['basep','np','dpp','hgssp','bwp','xyp','smp','swshp','svp','mep'];
  const prefixSets = {XY:'xyp',SM:'smp',SWSH:'swshp',SVP:'svp',BW:'bwp',DP:'dpp',HGSS:'hgssp',MEP:'mep'};
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  const numberKey = s => norm(s).replace(/\s/g,'').replace(/\d+/g, d => String(Number(d)));
  async function get(path) {
    const previous = cache.get(path);
    if (previous && previous.until > Date.now()) return previous.value;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(API + path, {signal:controller.signal, credentials:'omit'});
      if (response.status === 404) throw new Error('Catalogue ou langue indisponible dans TCGDex. Essayez une autre langue ou la saisie manuelle.');
      if (!response.ok) throw new Error('TCGDex indisponible (' + response.status + '). Réessayez.');
      const value = await response.json();
      cache.set(path, {until:Date.now()+15*60*1000,value});
      return value;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('TCGDex ne répond pas. Réessayez ou utilisez la saisie manuelle.');
      if (error instanceof TypeError) throw new Error('Connexion à TCGDex impossible. Vérifiez Internet ; si cet aperçu bloque le réseau, ouvrez le fichier HTML dans votre navigateur.');
      throw error;
    } finally {clearTimeout(timer);}
  }
  function parse(input) {
    const value=norm(input).replace(/\s*\/\s*/g,'/');
    if (/YX-P/.test(value)) return {kind:'typo',suggestion:value.replace(/YX-P/g,'XY-P')};
    const fraction=value.match(/(?:^|\s)([A-Z]*\d+[A-Z]*)\/(\d+)(?:$|\s)/);
    if(fraction) return {kind:'fraction',number:fraction[1],total:Number(fraction[2]),name:value.replace(fraction[0],' ').trim()};
    const promo=value.match(/(?:^|\s)(\d+[A-Z]*)\/([A-Z]+-P)(?:$|\s)/);
    if(promo) return {kind:'promo-series',number:promo[1],series:promo[2],name:value.replace(promo[0],' ').trim()};
    const black=value.match(/^(?:(.*?)\s+)?BLACK\s+STAR(?:\s+PROMOS?)?(?:\s+(\d+))?$/);
    if(black) return {kind:'black-star',number:black[2],name:black[1]||''};
    const prefixed=value.replace(/\s/g,'').match(/^(SWSH|HGSS|SVP|MEP|XY|SM|BW|DP)(\d+[A-Z]*)$/);
    if(prefixed) return {kind:'prefix',prefix:prefixed[1],number:prefixed[2],setId:prefixSets[prefixed[1]]};
    if(/^\d+$/.test(value)) return {kind:'number',number:value};
    return {kind:'name',name:input.trim()};
  }
  function cardResult(card,set,language,promoSeries) {
    const localId=String(card.localId);
    const isPromo=promoIds.includes(set.id) || /-P$/i.test(set.id);
    return {id:card.id,name:card.name,localId,setId:set.id,setName:set.name,language,
      printedNumber:promoSeries ? localId+'/'+promoSeries : isPromo ? localId : set.cardCount?.official ? localId+'/'+set.cardCount.official : localId,
      image:card.image ? card.image+['/','high','.webp'].join('') : undefined,provider:'tcgdex'};
  }
  async function search(input,language='fr',options={}) {
    if(!String(input).trim()) return {cards:[],note:'Saisissez un nom, un numéro complet ou une promo.',hasMore:false};
    if(!/^[a-z]{2}(?:-[a-z]{2})?$/.test(language)) throw new Error('Langue invalide.');
    const query=parse(input);
    if(query.kind==='typo') return {cards:[],note:'Vouliez-vous écrire '+query.suggestion+' ? Corrigez la recherche pour confirmer.',suggestion:query.suggestion,hasMore:false};
    let lang=language;
    let note='Résultats réels TCGDex · '+lang.toUpperCase();
    if(query.kind==='promo-series') {lang='ja';note='Série promo japonaise · recherche en japonais (JA).';}
    const sets=await get(lang+'/sets');
    if(!Array.isArray(sets)) throw new Error('Réponse de catalogue invalide.');
    let candidates;
    if(query.kind==='fraction') candidates=sets.filter(s=>s.cardCount?.official===query.total);
    else if(query.kind==='promo-series') candidates=sets.filter(s=>numberKey(s.id)===numberKey(query.series));
    else if(query.kind==='prefix') candidates=sets.filter(s=>s.id===query.setId);
    else if(query.kind==='black-star') candidates=sets.filter(s=>promoIds.includes(s.id));
    if(candidates) {
      if(!candidates.length) return {cards:[],note:query.kind==='promo-series'?'La série '+query.series+' n’est pas présente dans le catalogue japonais TCGDex consulté. Vous pouvez créer la fiche manuellement.':'Aucune série correspondante dans cette langue. Essayez une autre langue ou la saisie manuelle.',hasMore:false};
      const lists=await Promise.all(candidates.map(s=>get(lang+'/sets/'+encodeURIComponent(s.id))));
      const cards=lists.flatMap(set=>(set.cards||[]).filter(card=>{
        const key=numberKey(card.localId);
        const expected=query.kind==='prefix' && !['SVP','MEP'].includes(query.prefix) ? query.prefix+query.number : query.number;
        return (!expected || key===numberKey(expected)) && (!query.name || norm(card.name+' '+set.name).includes(query.name));
      }).map(card=>cardResult(card,set,lang,query.kind==='promo-series'?query.series:undefined)));
      return {cards,note:cards.length?note:'Aucune carte exacte dans les séries correspondantes. Essayez une autre langue ou la saisie manuelle.',hasMore:false};
    }
    const page=Math.max(1,Number(options.page)||1),pageSize=24;
    // Bare numbers are exact; name searches use the provider's substring search.
    const parameters=new URLSearchParams({'pagination:page':String(page),'pagination:itemsPerPage':String(pageSize)});
    parameters.set(query.kind==='number'?'localId':'name',query.kind==='number'?'eq:'+String(Number(query.number)):query.name);
    const rows=await get(lang+'/cards?'+parameters);
    if(!Array.isArray(rows)) throw new Error('Réponse de recherche invalide.');
    const cards=rows.map(card=>{
      const set=sets.find(s=>card.id.startsWith(s.id+'-'));
      return cardResult(card,set||{id:card.id.slice(0,card.id.lastIndexOf('-')),name:'Série non précisée'},lang);
    });
    return {cards,note:query.kind==='number'?'Numéro sans série : plusieurs cartes peuvent correspondre. Vérifiez la série et la langue.':note,hasMore:rows.length===pageSize,page};
  }
  root.CartelitesSearch={search,parse,clearCache:()=>cache.clear()};
})(typeof window!=='undefined'?window:globalThis);
