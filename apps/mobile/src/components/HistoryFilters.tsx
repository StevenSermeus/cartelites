import {useState} from 'react';
import {Pressable,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {MotionModal} from './MotionModal';
import {DateField} from './DateField';
import {Field} from './Field';
import {emptyHistoryFilters,historyFilterCount,historyFilterQuery,historyStatusLabels,type HistoryFilters as FilterValue,type HistoryFilterOptions} from '../data/historyFilters';
import {useTheme} from '../theme/ThemeProvider';

export function HistoryFilters({value,onChange,options,searchLabel='Rechercher dans l’historique'}:{value:FilterValue;onChange:(value:FilterValue)=>void;options:HistoryFilterOptions;searchLabel?:string}) {
  const {colors}=useTheme();const [open,setOpen]=useState(false),[draft,setDraft]=useState(value);
  const error=historyFilterQuery(draft).error;
  const choices=(label:string,key:'status'|'origin'|'paymentStatus'|'eventKind',values:[string,string][]) => <View style={{gap:8}}>
    <Text accessibilityRole="header" style={{color:colors.text,fontWeight:'600'}}>{label}</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{values.map(([id,text])=><Pressable key={id} accessibilityRole="button" accessibilityState={{selected:draft[key]===id}} onPress={()=>setDraft(current=>({...current,[key]:id}))} style={{minHeight:44,justifyContent:'center',paddingHorizontal:14,paddingVertical:10,borderRadius:12,backgroundColor:draft[key]===id?colors.accentSoft:colors.surface,borderWidth:1,borderColor:colors.border}}><Text style={{color:draft[key]===id?colors.accent:colors.text}}>{text}</Text></Pressable>)}</View>
  </View>;
  const button=(label:string,action:()=>void,disabled=false)=><Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={action} style={{minHeight:48,justifyContent:'center',padding:12,opacity:disabled?0.5:1}}><Text style={{color:colors.accent,fontWeight:'600'}}>{label}</Text></Pressable>;
  return <View style={{gap:4}}>
    <Field label={searchLabel} placeholder="Nom, référence…" value={value.search} onChangeText={search=>onChange({...value,search})}/>
    <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>{button(`Filtres${historyFilterCount(value)?` · ${historyFilterCount(value)}`:''}`,()=>{setDraft(value);setOpen(true);})}{(historyFilterCount(value)>0||!!value.search)&&button('Réinitialiser',()=>onChange(emptyHistoryFilters()))}</View>
    {(value.from||value.to)&&<Text style={{color:colors.secondary}}>Date de l’opération : {value.from||'début'} → {value.to||'aujourd’hui et après'}</Text>}
    {open&&<MotionModal animationType="slide" onRequestClose={()=>setOpen(false)}><SafeAreaView style={{flex:1,backgroundColor:colors.background}} accessibilityViewIsModal>
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:8}}>{button('Fermer',()=>setOpen(false))}{button('Réinitialiser',()=>setDraft({...emptyHistoryFilters(),search:value.search}))}</View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,gap:24}}>
        <Text accessibilityRole="header" style={{fontSize:28,fontWeight:'700',color:colors.text}}>Filtrer l’historique</Text>
        <DateField label="À partir du" value={draft.from} optional onChange={from=>setDraft(current=>({...current,from}))}/>
        <DateField label="Jusqu’au" value={draft.to} optional onChange={to=>setDraft(current=>({...current,to}))}/>
        <Text style={{color:colors.secondary}}>Les dates suivent le fuseau horaire de la boutique. Les opérations sans date connue sont exclues lorsqu’une période est sélectionnée.</Text>
        {options.statuses.length>0&&choices('Statut','status',[['all','Tous'],...options.statuses.map(id=>[id,historyStatusLabels[id]] as [string,string])])}
        {options.origins&&choices('Origine du stock','origin',[['all','Toutes'],...options.origins.map(id=>[id,({purchase:'Rachat',supplier:'Fournisseur',consignment:'Dépôt-vente'})[id]] as [string,string])])}
        {options.payment&&choices('Encaissement','paymentStatus',[['all','Tous'],['received','Reçu'],['pending','À encaisser'],['unknown','Non renseigné']])}
        {options.events&&choices('Document','eventKind',[['all','Tous'],['return','Restitution'],['terms','Accord révisé']])}
        {!!error&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{error}</Text>}
        {button('Appliquer les filtres',()=>{onChange(draft);setOpen(false);},!!error)}
      </ScrollView>
    </SafeAreaView></MotionModal>}
  </View>;
}
