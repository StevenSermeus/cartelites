import {NativeDetail} from '../navigation/NativeDetail';
import {ActivityDetail} from './ActivityDetail';
import {useEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {request} from '../data/apiRepository';
import {captureAccountScope,getSessionScope} from '../auth/session';
import {activitySources,emptyActivity,mergeActivity,HistoryRequestGeneration,type ActivityPage,type ActivityEntry,type ActivitySource} from '../data/activityFeed';
import {activityFilterOptions,changeHistorySource,emptyHistoryFilters,historyFilterQuery,historyQueryString,activityRowStatus} from '../data/historyFilters';
import {HistoryFilters} from '../components/HistoryFilters';
import {useTheme} from '../theme/ThemeProvider';
import {formatShopMoney} from '../theme/shopFormatting';
import {InventoryButton} from '../components/InventoryManager';

export function ActivityScreen({active,onOpen}:{active:boolean;onOpen:(entry:ActivityEntry,isCurrent:()=>boolean)=>Promise<void>}) {
  const {colors,timezone}=useTheme();
  const [state,setState]=useState(emptyActivity),[selected,setSelected]=useState<ActivityEntry|null>(null);
  const [source,setSource]=useState<ActivitySource|'all'>('all'),[filters,setFilters]=useState(emptyHistoryFilters);
  const [errors,setErrors]=useState<Partial<Record<ActivitySource,string>>>({});
  const [busy,setBusy]=useState(false),[opening,setOpening]=useState<string|null>(null),[openError,setOpenError]=useState('');
  const latest=useRef(state),generation=useRef(new HistoryRequestGeneration()),lock=useRef(false),loaded=useRef(false),openingLock=useRef(false);
  const validation=historyFilterQuery(filters);
  const queryKey=JSON.stringify([getSessionScope(),source,filters]);
  const keyRef=useRef(queryKey); keyRef.current=queryKey;
  const [resultKey,setResultKey]=useState(queryKey);
  const load=async(reset=false)=>{
    if(lock.current||validation.error)return;
    lock.current=true;setBusy(true);
    const version=generation.current.current(),key=queryKey,epoch=getSessionScope();
    const current=()=>epoch===getSessionScope()&&generation.current.accepts(version)&&keyRef.current===key;
    const base=reset?emptyActivity():latest.current;
    if(reset){latest.current=base;setState(base);setErrors({});}
    const sources=activitySources.filter(row=>(source==='all'||source===row.id)&&!base.done.includes(row.id));
    try {
      const scope=await captureAccountScope();scope.assertActive();if(!current())return;
      await Promise.all(sources.map(async row=>{
        try {
          const page=await request<ActivityPage>(`/activity/${row.id}?${historyQueryString(filters,base.cursors[row.id])}`);
          scope.assertActive();if(!current())return;
          // Validate and merge outside React's state updater: malformed pages remain recoverable.
          const next=mergeActivity(latest.current,row.id,page);latest.current=next;setState(next);setResultKey(key);
          setErrors(previous=>({...previous,[row.id]:undefined}));
        }catch(error){if(current())setErrors(previous=>({...previous,[row.id]:error instanceof Error?error.message:'Chargement impossible'}));}
      }));
    }catch(error){if(current())setErrors({[sources[0]?.id??'purchases']:error instanceof Error?error.message:'Chargement impossible'});}
    finally{if(current()){setBusy(false);lock.current=false;loaded.current=true;}}
  };
  useEffect(()=>{
    generation.current.invalidate();lock.current=false;loaded.current=false;latest.current=emptyActivity();setState(latest.current);setResultKey(queryKey);setErrors({});setBusy(false);openingLock.current=false;setOpening(null);setOpenError('');
    if(!active||validation.error)return;
    const timer=setTimeout(()=>void load(),250);
    return()=>{clearTimeout(timer);generation.current.invalidate();lock.current=false;};
  },[queryKey]);
  useEffect(()=>{if(active&&!loaded.current&&!lock.current&&!validation.error)void load();},[active]);
  useEffect(()=>()=>{generation.current.invalidate();},[]);
  const open=async(entry:ActivityEntry)=>{
    if(openingLock.current)return;openingLock.current=true;const version=generation.current.current(),key=queryKey,epoch=getSessionScope();const matches=()=>epoch===getSessionScope()&&generation.current.accepts(version)&&keyRef.current===key;setOpening(entry.key);setOpenError('');
    try {await onOpen(entry,matches);if(matches())setSelected(null);}
    catch(error){if(matches())setOpenError(error instanceof Error?error.message:'Ouverture impossible. Réessayez.');}
    finally{if(matches()){openingLock.current=false;setOpening(null);}}
  };
  const entries=resultKey===queryKey&&!validation.error?state.entries:[];
  const pending=activitySources.some(row=>(source==='all'||source===row.id)&&!state.done.includes(row.id));
  return <View style={{gap:16}}>
    {selected&&<NativeDetail id={selected.key} title={activitySources.find(row=>row.id===selected.source)!.label} onClose={()=>setSelected(null)}>
      <ActivityDetail entry={selected} onWorkflow={()=>void open(selected)} busy={!!opening} workflowError={openError}/>
    </NativeDetail>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingVertical:4}}>
      {[{id:'all',label:'Tout'},...activitySources].map(row=><Pressable key={row.id} accessibilityRole="button" accessibilityState={{selected:source===row.id}} onPress={()=>{setSource(row.id as typeof source);setFilters(changeHistorySource(filters));}} style={{minHeight:44,paddingHorizontal:14,justifyContent:'center',borderRadius:22,backgroundColor:source===row.id?colors.accentSoft:colors.surface}}><Text style={{color:source===row.id?colors.accent:colors.text}}>{row.label}</Text></Pressable>)}
    </ScrollView>
    <HistoryFilters value={filters} onChange={setFilters} options={activityFilterOptions(source)} searchLabel="Rechercher une opération"/>
    <Text style={{color:colors.secondary}}>{entries.length} opération(s) chargée(s), par ordre d’enregistrement décroissant.{source==='all'?' Cet aperçu regroupe les pages déjà chargées de chaque catégorie ; il ne constitue pas un classement global de tout l’historique.':''} Les dates affichées sont celles des opérations, qui peuvent être antidatées.</Text>
    {!!validation.error&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{validation.error}</Text>}
    <InventoryButton label="Actualiser l’activité" secondary disabled={busy||!!validation.error} onPress={()=>void load(true)}/>
    {activitySources.filter(row=>(source==='all'||source===row.id)&&errors[row.id]).map(row=><Text accessibilityRole="alert" key={row.id} style={{color:colors.danger}}>{row.label} : {errors[row.id]}</Text>)}
    {!!openError&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{openError}</Text>}
    <View style={{borderRadius:16,overflow:'hidden',backgroundColor:colors.surface}}>
      {entries.map(entry=>{
        const row=entry.record,label=activitySources.find(source=>source.id===entry.source)!.label;
        return <Pressable key={entry.key} accessibilityRole="button" accessibilityState={{disabled:!!opening,busy:opening===entry.key}} disabled={!!opening} onPress={()=>['purchases','sales','consignments'].includes(entry.source)?void open(entry):setSelected(entry)} style={{padding:16,gap:5,borderBottomWidth:0.5,borderColor:colors.border}}>
          <View style={{flexDirection:'row',justifyContent:'space-between',gap:10}}><Text style={{color:colors.text,fontWeight:'600',flex:1}}>{row.title}</Text><Text style={{color:colors.text,flexShrink:1}}>{row.amountStatus==='known'&&row.amountCents!==null?formatShopMoney(row.amountCents/100):row.amountStatus==='detail-required'?'Montant : voir le détail':'Montant non renseigné'}</Text></View>
          <Text style={{color:colors.secondary}}>{label} · {entry.date===null?'Date d’opération inconnue':new Date(entry.date).toLocaleString('fr-BE',{timeZone:timezone,dateStyle:'medium',timeStyle:'short'})}</Text>
          {row.detailsIncomplete&&<Text style={{color:colors.secondary}}>Historique partiel</Text>}
          <Text style={{color:row.status==='cancelled'?colors.danger:colors.accent}}>{opening===entry.key?'Ouverture…':activityRowStatus(row)} ›</Text>
        </Pressable>;
      })}
    </View>
    {!busy&&!entries.length&&!validation.error&&<Text style={{color:colors.secondary}}>{pending?'Aucune opération dans les pages chargées. Poursuivez le chargement pour explorer les pages suivantes.':'Aucune opération pour ces critères.'}</Text>}
    {pending&&!validation.error&&<InventoryButton label={busy?'Chargement…':Object.values(errors).some(Boolean)?'Charger davantage / réessayer':'Charger davantage'} disabled={busy} onPress={()=>void load()}/>}
    {busy&&<Text accessibilityLiveRegion="polite" style={{color:colors.secondary}}>Chargement des opérations…</Text>}
  </View>;
}
