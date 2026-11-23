import {shopTimezone} from '../theme/shopFormatting';
import {useEffect,useRef,useState} from 'react';
import {Linking,Pressable,Text,View} from 'react-native';
import type {MarketPriceResult,MarketPriceSource,MarketPriceMode,MarketPriceQuery,MarketListing} from '../../../../packages/domain/src/marketPrices';
import {request} from '../data/apiRepository';
import {formatMarketMoney,marketPriceLabel,safeMarketUrl} from '../data/marketPrices';
import {useTheme} from '../theme/ThemeProvider';
import {Field} from './Field';
const sources:[MarketPriceSource,string][]=[['ebay_fr','eBay.fr'],['ebay_us','eBay.com'],['cardmarket','Cardmarket'],['vinted','Vinted'],['gcc','GCC']];
const evidenceLabels={language:'Langue',gradingCompany:'Société de gradation',grade:'Note',collectorNumber:'Numéro',setName:'Série'};
function MatchEvidence({listing}:{listing:MarketListing}) {
  const {colors}=useTheme();const [expanded,setExpanded]=useState(false);
  return <View style={{gap:6}}>
    <Pressable accessibilityRole="button" accessibilityState={{expanded}} onPress={()=>setExpanded(value=>!value)} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:colors.accent}}>{expanded?'Masquer':'Vérifier'} les critères de correspondance</Text></Pressable>
    {expanded&&<>
      {Object.entries(listing.match).map(([key,value])=><Text key={key} style={{color:value==='mismatch'?colors.danger:colors.secondary}}>{evidenceLabels[key as keyof typeof evidenceLabels]} : {value==='match'?'confirmé':value==='mismatch'?'différent':'non confirmé'}</Text>)}
      {listing.matchReasons.map((reason,index)=><Text key={index} style={{color:colors.secondary}}>{reason}</Text>)}
    </>}
  </View>;
}
export function MarketPricePanel({name,identifier,series,language,gradingCompany,gradingGrade}:{name:string;identifier?:string;series?:string;language?:string;gradingCompany?:string;gradingGrade?:string}) {
  const {colors}=useTheme();
  const identity=JSON.stringify([name,identifier,series,language,gradingCompany,gradingGrade]);
  const [expanded,setExpanded]=useState(false),[query,setQuery]=useState([name,identifier,series].filter(Boolean).join(' '));
  const [productUrl,setProductUrl]=useState('');
  const [source,setSource]=useState<MarketPriceSource>('ebay_fr'),[mode,setMode]=useState<MarketPriceMode>('sold');
  const [result,setResult]=useState<MarketPriceResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const generation=useRef(0),committed=useRef<MarketPriceQuery|null>(null),lock=useRef(false);
  const invalidate=()=>{generation.current++;lock.current=false;committed.current=null;setBusy(false);setResult(null);setError('');};
  useEffect(()=>{invalidate();setProductUrl('');setQuery([name,identifier,series].filter(Boolean).join(' '));},[identity]);
  useEffect(()=>()=>{generation.current++;},[]);
  async function search(more=false,selectedProductUrl?:string) {
    if(lock.current||!query.trim())return;
    if(query.trim().length>200){setError('La recherche est limitée à 200 caractères.');return;}
    const selectedUrl=selectedProductUrl??productUrl.trim();
    if(source==='cardmarket'&&selectedUrl&&!safeMarketUrl(selectedUrl)){setError('Indiquez un lien produit HTTPS valide.');return;}
    const base:MarketPriceQuery=more&&committed.current?committed.current:{source,mode,query:query.trim(),productUrl:source==='cardmarket'?selectedUrl||undefined:undefined,language:language||undefined,gradingCompany:gradingCompany||undefined,grade:gradingGrade||undefined,collectorNumber:identifier||undefined,setName:series||undefined};
    if([base.language,base.gradingCompany,base.grade,base.collectorNumber,base.setName].some(value=>value&&value.length>100)){setError('Un détail de la carte dépasse la limite de 100 caractères du service de prix.');return;}
    const params=new URLSearchParams();
    for(const [key,value] of Object.entries({...base,...(more?{page:result?.nextPage??undefined,cursor:result?.nextCursor??undefined}:{page:1})}))if(value!==undefined&&value!=='')params.set(key,String(value));
    const version=++generation.current;committed.current=base;lock.current=true;setBusy(true);setError('');
    try {
      const data=await request<MarketPriceResult>(`/market-prices?${params}`);
      if(version!==generation.current)return;
      setResult(previous=>more&&previous?{...data,listings:[...new Map([...previous.listings,...data.listings].map(listing=>[`${listing.source}:${listing.id}`,listing])).values()]}:data);
    }catch(reason){if(version===generation.current)setError(reason instanceof Error?reason.message:'Recherche impossible.');}
    finally {if(version===generation.current){lock.current=false;setBusy(false);}}
  }
  const button=(title:string,onPress:()=>void,disabled=false,selected=false)=><Pressable accessibilityRole="button" accessibilityState={{disabled,selected}} disabled={disabled} onPress={onPress} style={{minHeight:44,paddingHorizontal:12,justifyContent:'center',borderRadius:10,backgroundColor:selected?colors.accentSoft:colors.raised,opacity:disabled?0.5:1}}><Text style={{color:colors.accent}}>{title}</Text></Pressable>;
  async function open(listing:MarketListing){if(!safeMarketUrl(listing.url)){setError('Lien de source non sécurisé.');return;}try{await Linking.openURL(listing.url);}catch{setError('Impossible d’ouvrir cette annonce.');}}
  return <View style={{backgroundColor:colors.surface,borderRadius:16,padding:14,gap:12}}>
    <Pressable accessibilityRole="button" accessibilityState={{expanded}} onPress={()=>setExpanded(value=>!value)} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:colors.accent,fontWeight:'600'}}>Comparer les prix du marché {expanded?'⌄':'›'}</Text></Pressable>
    {expanded&&<>
      <Text style={{color:colors.secondary}}>Les annonces sont des références à vérifier. Elles ne remplacent pas votre estimation ; les ventes conclues sont privilégiées.</Text>
      <Field label="Recherche de prix" maxLength={200} value={query} onChangeText={value=>{invalidate();setProductUrl('');setQuery(value);}} />
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{sources.map(([id,label])=><View key={id}>{button(label,()=>{invalidate();setProductUrl('');setSource(id);setMode(id==='cardmarket'||id==='vinted'?'active':'sold');},false,source===id)}</View>)}</View>
      {source==='cardmarket'&&<Field label="Lien du produit Cardmarket (facultatif)" maxLength={2048} value={productUrl} onChangeText={value=>{invalidate();setProductUrl(value);}} />}
      <View style={{flexDirection:'row',gap:8}}>{button('Ventes conclues',()=>{invalidate();setMode('sold');},source==='cardmarket'||source==='vinted',mode==='sold')}{button('Annonces actives',()=>{invalidate();setMode('active');},false,mode==='active')}</View>
      {(source==='cardmarket'||source==='vinted')&&<Text style={{color:colors.secondary}}>Cette source fournit des annonces actives ; les ventes conclues ne sont pas disponibles.</Text>}
      {button(busy?'Recherche…':'Rechercher les références',()=>void search(),busy||!query.trim())}
      {!!error&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{error}</Text>}
      {result&&<>
        <Text accessibilityLiveRegion="polite" style={{color:colors.secondary}}>{result.message}</Text>
        {result.limitations.map((message,index)=><Text key={index} style={{color:colors.secondary}}>{message}</Text>)}
        {result.status==='pending'&&button(`Réessayer${result.retryAfterSeconds?` après ${result.retryAfterSeconds} s`:''}`,()=>void search(),busy)}
        {!!result.productCandidates?.length&&<View style={{gap:8}}>
          <Text style={{color:colors.text,fontWeight:'600'}}>Choisir le produit correspondant</Text>
          <Text style={{color:colors.secondary}}>Vérifiez l’édition avant de consulter les offres vendeurs. Aucun prix minimum de produit n’est assimilé à une annonce.</Text>
          {result.productCandidates.map(candidate=><View key={candidate.url}>{button(candidate.title,()=>{invalidate();setProductUrl(candidate.url);void search(false,candidate.url);},busy||!safeMarketUrl(candidate.url),productUrl===candidate.url)}</View>)}
        </View>}
        {result.listings.map(listing=><View key={`${listing.source}:${listing.id}`} style={{borderTopWidth:0.5,borderColor:colors.border,paddingTop:14,gap:7}}>
          <Text style={{color:colors.text,fontWeight:'600'}}>{listing.title}</Text>
          <Text style={{color:colors.accent}}>{listing.matchConfidence==='confirmed'?'Correspondance structurée confirmée':'Candidat · identité à vérifier'}</Text>
          <Text style={{color:colors.text}}>{marketPriceLabel(listing)}</Text>
          {listing.shipping&&<Text style={{color:colors.secondary}}>Livraison : {formatMarketMoney(listing.shipping)}</Text>}
          {listing.buyerProtectionFee&&<Text style={{color:colors.secondary}}>Protection acheteur : {formatMarketMoney(listing.buyerProtectionFee)}</Text>}
          {listing.totalBeforeShipping&&<Text style={{color:colors.secondary}}>Total avant livraison : {formatMarketMoney(listing.totalBeforeShipping)}</Text>}
          <Text style={{color:colors.secondary}}>{listing.state==='sold'?'Vendu':listing.state==='active'?'Annonce active':'Statut non confirmé'} · {listing.format==='auction'?'Enchères':listing.format==='fixed_price'?'Prix fixe':'Format non renseigné'}{listing.soldAt?` · ${listing.soldAt}`:''}</Text>
          <MatchEvidence listing={listing}/>
          {listing.warnings.map((warning,index)=><Text key={`warning${index}`} style={{color:colors.warning}}>{warning}</Text>)}
          {button('Ouvrir l’annonce source',()=>void open(listing),!safeMarketUrl(listing.url))}
        </View>)}
        {(result.nextPage!==null||result.nextCursor!==null)&&button(busy?'Chargement…':'Afficher plus de références',()=>void search(true),busy)}
        <Text style={{color:colors.secondary,fontSize:12}}>Consulté le {new Date(result.fetchedAt).toLocaleString('fr-BE',{timeZone:shopTimezone()})}{result.cached?' · résultat en cache':''}</Text>
      </>}
    </>}
  </View>;
}
