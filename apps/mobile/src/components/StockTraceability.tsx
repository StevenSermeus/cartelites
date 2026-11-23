import {useEffect,useState} from 'react';
import {ActivityIndicator,Pressable,Text,View} from 'react-native';
import {type Item} from '../data/apiRepository';
import {captureAccountScope,getSessionScope} from '../auth/session';
import {realtime} from '../data/realtime';
import {stockLots,itemActivityPage,movementLabel,quantityChangeLabel,lotOriginLabel,activitySourceLabel,nextActivityCursor,nextActivityPage,previousActivityPage,type StockLot,type ItemActivityPage} from '../data/stockTraceability';
import {formatCost} from '../data/inventoryCosts';
import {formatShopDate} from '../theme/shopFormatting';
import {useTheme} from '../theme/ThemeProvider';
import {Pagination} from './Pagination';

const lotPageSize=8;
const errorMessage=(error:unknown)=>error instanceof Error?error.message:'Chargement impossible.';

/** Authenticated traceability only. Never added to public catalogue product data. */
export function StockTraceability({item,revision}:{item:Item;revision:string}) {
  const {colors}=useTheme();
  const [lots,setLots]=useState<{id:string;rows:StockLot[]|null;loading:boolean;error:string}>({id:item._id,rows:null,loading:true,error:''});
  const [lotPage,setLotPage]=useState(0),[lotRetry,setLotRetry]=useState(0);
  const [cursors,setCursors]=useState<(string|undefined)[]>([undefined]),[activityRetry,setActivityRetry]=useState(0);
  const cursor=cursors.at(-1),activityKey=JSON.stringify([item._id,cursor]);
  const [activity,setActivity]=useState<{key:string;page:ItemActivityPage|null;loading:boolean;error:string}>({key:activityKey,page:null,loading:true,error:''});
  useEffect(()=>{
    let active=true,stop:(()=>void)|undefined;const epoch=getSessionScope();
    const current=()=>active&&epoch===getSessionScope();
    setLots(previous=>({...previous,loading:true,error:''}));
    const fail=(error:unknown)=>{if(current())setLots({id:item._id,rows:null,loading:false,error:errorMessage(error)});};
    void captureAccountScope().then(scope=>{
      if(!current())return;scope.assertActive();
      stop=realtime.subscribe<unknown>('inventory:detail',{itemId:item._id},value=>{
        if(!current())return;
        try{scope.assertActive();setLots({id:item._id,rows:stockLots(value),loading:false,error:''});}catch(error){fail(error);}
      },fail);
    }).catch(fail);
    return()=>{active=false;stop?.();};
  },[item._id,revision,lotRetry]);
  useEffect(()=>{
    let active=true,stop:(()=>void)|undefined;const epoch=getSessionScope();
    const current=()=>active&&epoch===getSessionScope();
    setActivity(previous=>({...previous,loading:true,error:''}));
    const fail=(error:unknown)=>{if(current())setActivity({key:activityKey,page:null,loading:false,error:errorMessage(error)});};
    void captureAccountScope().then(scope=>{
      if(!current())return;scope.assertActive();
      stop=realtime.subscribe<unknown>('inventory:activity',{itemId:item._id,size:25,cursor:cursor??null},value=>{
        if(!current())return;
        try{scope.assertActive();setActivity({key:activityKey,page:itemActivityPage(value),loading:false,error:''});}catch(error){fail(error);}
      },fail);
    }).catch(fail);
    return()=>{active=false;stop?.();};
  },[activityKey,revision,activityRetry]);
  const rows=lots.id===item._id?lots.rows:null;
  const currentLotPage=Math.min(lotPage,Math.max(0,Math.ceil((rows?.length??0)/lotPageSize)-1));
  const current=activity.key===activityKey?activity.page:null;
  const button=(label:string,onPress:()=>void,disabled=false)=><Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{minHeight:44,justifyContent:'center',paddingVertical:8}}><Text style={{color:colors.accent,opacity:disabled?0.5:1}}>{label}</Text></Pressable>;
  const dateLabel=(timestamp:number|null)=>timestamp===null?'Date non renseignée':formatShopDate(timestamp);
  const card={padding:14,gap:7,borderWidth:1,borderColor:colors.border,borderRadius:14,backgroundColor:colors.surface};
  const body={color:colors.text},muted={color:colors.secondary};
  return <View style={{gap:18,marginTop:20}}>
    <View style={{gap:8}}>
      <Text accessibilityRole="header" style={{...body,fontSize:22,fontWeight:'600'}}>Lots et provenance</Text>
      <Text style={muted}>Quantités et coûts d’entrée conservés par lot. Les ventes prélèvent les unités selon leur ordre d’entrée.</Text>
      {item.origin==='consignment'&&<Text style={body}>Propriété du déposant{item.sellerName?` · ${item.sellerName}`:''}. Les montants de vente et de commission restent distincts du coût d’achat boutique.</Text>}
      {lots.loading&&<View style={{flexDirection:'row',alignItems:'center',gap:8}}><ActivityIndicator color={colors.accent}/><Text style={muted}>{rows?'Actualisation des lots…':'Chargement des lots…'}</Text></View>}
      {!!lots.error&&<View><Text accessibilityRole="alert" style={{color:colors.danger}}>{lots.error}</Text>{button('Réessayer les lots',()=>setLotRetry(value=>value+1),lots.loading)}</View>}
      {rows!==null&&!rows.length&&!lots.loading&&<Text style={muted}>Aucun lot documenté pour cet article. Ce résultat ne remplace pas une réconciliation de son historique.</Text>}
      {rows?.slice(currentLotPage*lotPageSize,(currentLotPage+1)*lotPageSize).map(lot=><View key={lot.id} style={card}>
        <Text style={{...body,fontWeight:'600'}}>{lotOriginLabel(lot)}{lot.reference?` · ${lot.reference}`:''}</Text>
        {!!lot.supplier&&<Text style={muted}>{lot.supplier}</Text>}
        <Text style={muted}>{dateLabel(lot.occurredAt)}</Text>
        <Text style={body}>Quantité d’origine : {lot.originalQuantity??'non renseignée'} · restante : {lot.remainingQuantity??'non renseignée'}</Text>
        {lot.sourceKind!=='consignment'&&<><Text style={body}>Coût total du lot : {formatCost(lot.originalCostCents)}</Text><Text style={body}>Coût restant : {formatCost(lot.remainingCostCents)}</Text></>}
        {lot.openingBalanceOnly&&<Text style={muted}>Solde d’ouverture repris : les mouvements antérieurs ne sont pas reconstitués.</Text>}
        <Text selectable style={{...muted,fontSize:12}}>Lot · {lot.id}</Text>
        {!!lot.sourceId&&<Text selectable style={{...muted,fontSize:12}}>Origine · {lot.sourceId}</Text>}
      </View>)}
      {!!rows&&rows.length>lotPageSize&&<Pagination data={{loading:lots.loading,error:'',page:currentLotPage+1,hasPrevious:currentLotPage>0,nextCursor:(currentLotPage+1)*lotPageSize<rows.length?'next':null,previous:()=>setLotPage(Math.max(0,currentLotPage-1)),next:()=>setLotPage(currentLotPage+1),reload:()=>setLotRetry(value=>value+1)}}/>}
      {!lots.error&&button('Actualiser les lots',()=>setLotRetry(value=>value+1),lots.loading)}
    </View>
    <View style={{gap:8}}>
      <Text accessibilityRole="header" style={{...body,fontSize:22,fontWeight:'600'}}>Activité de l’article</Text>
      <Text style={muted}>Mouvements issus des opérations enregistrées. Une opération peut comporter plusieurs lignes lorsqu’elle concerne plusieurs lots.</Text>
      {current?.historyStatus==='indexing'&&<Text accessibilityRole="alert" style={{color:colors.warning}}>Historique en cours d’indexation. Les lignes chargées sont partielles ; actualisez pour suivre leur reconstruction.</Text>}
      {current?.historyStatus==='incomplete'&&<Text accessibilityRole="alert" style={{color:colors.warning}}>Historique incomplet : certaines dates ou quantités anciennes n’ont pas pu être reconstituées. Aucune valeur n’est inventée.</Text>}
      <Pagination data={{loading:activity.loading,error:activity.key===activityKey?activity.error:'',page:cursors.length,hasPrevious:cursors.length>1,nextCursor:nextActivityCursor(current,cursors),previous:()=>setCursors(previousActivityPage),next:()=>setCursors(values=>nextActivityPage(values,nextActivityCursor(current,values))),reload:()=>setActivityRetry(value=>value+1)}}/>
      {current?.items.map(event=><View key={event.id} style={card}>
        <Text style={{...body,fontWeight:'600'}}>{movementLabel(event.kind)}{event.reference?` · ${event.reference}`:''}</Text>
        <Text style={body}>{quantityChangeLabel(event.quantityDelta)}</Text>
        <Text style={muted}>{dateLabel(event.occurredAt)}</Text>
        <Text selectable style={{...muted,fontSize:12}}>{activitySourceLabel(event.source.type)} · {event.source.id}</Text>
        {!!event.lotId&&<Text selectable style={{...muted,fontSize:12}}>Lot · {event.lotId}</Text>}
        {!!event.counterpartItemId&&<Text selectable style={{...muted,fontSize:12}}>Article lié · {event.counterpartItemId}</Text>}
        {!!event.reversesId&&<Text selectable style={{...muted,fontSize:12}}>Restauration liée à · {event.reversesId}</Text>}
      </View>)}
      {current&&!current.items.length&&!activity.loading&&<Text style={muted}>{current.historyStatus==='complete'?'Aucun mouvement enregistré sur cette page.':'Aucun mouvement disponible sur cette page pour le moment. L’historique reste partiel.'}</Text>}
      {!activity.error&&button('Actualiser les mouvements',()=>setActivityRetry(value=>value+1),activity.loading)}
    </View>
  </View>;
}
