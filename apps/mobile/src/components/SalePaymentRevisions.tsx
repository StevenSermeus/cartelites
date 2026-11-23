import {useEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import type {SalePaymentHistoryPage,SalePaymentSnapshot} from '../../../../packages/domain/src/history';
import {captureAccountScope,getSessionScope} from '../auth/session';
import {request} from '../data/apiRepository';
import {HistoryRequestGeneration} from '../data/activityFeed';
import {mergePaymentHistory,paymentSnapshotTotal} from '../data/salePaymentHistory';
import {formatShopMoney} from '../theme/shopFormatting';
import {useTheme} from '../theme/ThemeProvider';
import {InventoryButton} from './InventoryManager';

export function SalePaymentRevisions({saleId,revision}:{saleId:string;revision:string}) {
  const {colors,timezone}=useTheme();
  const [page,setPage]=useState<SalePaymentHistoryPage|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const generation=useRef(new HistoryRequestGeneration()),lock=useRef(false),latest=useRef(page);
  const key=JSON.stringify([getSessionScope(),saleId,revision]),keyRef=useRef(key);keyRef.current=key;
  const [resultKey,setResultKey]=useState(key);
  const load=async(reset=false)=>{
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    const token=generation.current.current(),epoch=getSessionScope(),matches=()=>epoch===getSessionScope()&&generation.current.accepts(token)&&keyRef.current===key;
    const previous=reset?null:latest.current;
    try{
      const scope=await captureAccountScope();scope.assertActive();if(!matches())return;
      const cursor=previous?.nextCursor;
      const result=await request<SalePaymentHistoryPage>(`/sales/${encodeURIComponent(saleId)}/payment-history?size=20${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);
      scope.assertActive();if(!matches())return;
      const merged=mergePaymentHistory(previous,result);latest.current=merged;setPage(merged);setResultKey(key);
    }catch(reason){if(matches())setError(reason instanceof Error?reason.message:'Historique indisponible.');}
    finally{if(matches()){lock.current=false;setBusy(false);}}
  };
  useEffect(()=>{generation.current.invalidate();lock.current=false;latest.current=null;setPage(null);void load(true);return()=>{generation.current.invalidate();lock.current=false;};},[key]);
  const date=(value:number|null)=>value===null?'Non renseignée':new Date(value).toLocaleString('fr-BE',{timeZone:timezone});
  const money=(value:number|null)=>value===null?'Non renseigné':formatShopMoney(value/100);
  const snapshot=(value:SalePaymentSnapshot)=><View style={{gap:4}}>
    <Text style={{color:colors.text}}>{value.collectionStatus==='received'?'Reçu':value.collectionStatus==='pending'?'À encaisser':'Encaissement non renseigné'} · Total {money(paymentSnapshotTotal(value))}</Text>
    <Text style={{color:colors.secondary}}>Espèces : {money(value.cashCents)} · Virement : {money(value.transferCents)}</Text>
    <Text style={{color:colors.secondary}}>Réception : {date(value.receivedAt)}</Text>
    {value.reference!==null&&<Text style={{color:colors.secondary}}>Référence : {value.reference||'Aucune'}</Text>}
  </View>;
  const current=resultKey===key?page:null;
  return <View style={{gap:12,marginTop:20}}>
    <Text accessibilityRole="header" style={{color:colors.text,fontWeight:'600',fontSize:20}}>Historique des règlements</Text>
    {current&&<>
      <Text style={{color:colors.secondary}}>État actuel</Text>{snapshot(current.current)}
      {current.saleStatus==='cancelled'&&<Text style={{color:colors.secondary}}>Vente annulée : règlements conservés pour la traçabilité. Aucun remboursement bancaire n’est déclenché par l’annulation.</Text>}
      {current.historyStatus==='incomplete'&&<Text style={{color:colors.secondary}}>Historique ancien incomplet. Les dates, auteurs et montants absents restent non renseignés.</Text>}
      {current.currentEntryId&&!current.items.some(row=>row.id===current.currentEntryId)&&<Text style={{color:colors.secondary}}>Le règlement actuel n’est pas dans les pages chargées. Actualisez l’historique pour afficher sa révision.</Text>}
      {current.items.map(row=><View key={row.id} style={{paddingVertical:16,gap:8,borderTopWidth:1,borderColor:colors.border}}>
        <Text style={{color:colors.text,fontWeight:'600'}}>{row.kind==='initial'?'Encaissement initial':'Révision du règlement'} · {row.state==='current'?'Actuel':row.state==='superseded'?'Remplacé':'Annulé'}</Text>
        <Text style={{color:colors.secondary}}>Enregistré le : {date(row.changedAt)} · Par : {row.actorLabel??'Auteur non renseigné'}</Text>
        {row.previous&&<><Text style={{color:colors.secondary,fontWeight:'600'}}>Avant</Text>{snapshot(row.previous)}<Text style={{color:colors.secondary,fontWeight:'600'}}>Après</Text></>}
        {snapshot(row)}
      </View>)}
      {!current.items.length&&!busy&&<Text style={{color:colors.secondary}}>{current.isDone?'Aucune révision disponible.':'Aucune révision sur cette page ; poursuivez le chargement.'}</Text>}
    </>}
    {busy&&<Text accessibilityLiveRegion="polite" style={{color:colors.secondary}}>Chargement des règlements…</Text>}
    {!!error&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{error}</Text>}
    {(!!error||current&&!current.isDone)&&<InventoryButton secondary disabled={busy} label={error?'Réessayer':'Charger les règlements suivants'} onPress={()=>void load(!current)}/>}
    {current&&<InventoryButton secondary disabled={busy} label="Actualiser les règlements" onPress={()=>void load(true)}/>}
  </View>;
}
