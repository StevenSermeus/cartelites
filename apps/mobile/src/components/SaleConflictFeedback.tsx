import {useEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import {captureAccountScope,getSessionScope} from '../auth/session';
import {readRecord,request} from '../data/apiRepository';
import {conflictItemId,stockConflictReason,type CurrentStock,type SaleConflictIssue,type ConflictLine} from '../data/saleConflict';
import {useTheme} from '../theme/ThemeProvider';
import {InventoryButton} from './InventoryManager';
type LineResult={line:ConflictLine;current:CurrentStock|null;reason:string|null;error?:string};
export function SaleConflictFeedback({issue,onReview,onRefreshStock}:{issue:SaleConflictIssue;onReview:(itemId?:string,summary?:string)=>void;onRefreshStock:()=>void}) {
  const {colors}=useTheme();const [rows,setRows]=useState<LineResult[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[linked,setLinked]=useState<string|null>(null);
  const generation=useRef(0),lock=useRef(false);
  async function load(){
    if(lock.current)return;lock.current=true;setBusy(true);setError('');const token=++generation.current,epoch=getSessionScope();const current=()=>token===generation.current&&epoch===getSessionScope();
    try{
      const scope=await captureAccountScope();scope.assertActive();if(!current())return;
      let linkedId:string|null=null;
      if(issue.conflictId){try{linkedId=conflictItemId(await request(`/conflicts/${encodeURIComponent(issue.conflictId)}`));scope.assertActive();if(!current())return;setLinked(linkedId);if(!linkedId)setError('Le dossier de conflit est introuvable. La vérification du stock reste disponible.');}catch(reason){scope.assertActive();if(!current())return;setError(reason instanceof Error?reason.message:'Dossier de conflit indisponible.');}}
      const results:LineResult[]=[];
      // Bounded batches: no unbounded fan-out or writes while inspecting a failed basket.
      for(let start=0;start<issue.lines.length;start+=4){scope.assertActive();if(!current())return;
        results.push(...await Promise.all(issue.lines.slice(start,start+4).map(async line=>{
          try{const item=await readRecord<CurrentStock|null>('/stock',line.itemId);scope.assertActive();return {line,current:item,reason:stockConflictReason(line,item)};}
          catch(reason){scope.assertActive();return {line,current:null,reason:null,error:reason instanceof Error?reason.message:'Lecture impossible.'};}
        })));
      }
      scope.assertActive();if(current())setRows(results);
    }catch(reason){if(current())setError(reason instanceof Error?reason.message:'Vérification du stock impossible.');}
    finally{if(current()){lock.current=false;setBusy(false);}}
  }
  useEffect(()=>{generation.current++;lock.current=false;setRows([]);setLinked(null);void load();return()=>{generation.current++;};},[issue]);
  return <View style={{padding:16,gap:12,borderWidth:1,borderColor:colors.border,borderRadius:16,backgroundColor:colors.surface}}>
    <Text accessibilityRole="header" style={{color:colors.text,fontSize:20,fontWeight:'600'}}>Vérifier le panier conservé</Text>
    <Text style={{color:colors.secondary}}>Ces lectures décrivent le stock actuel ; elles ne remplacent pas le résultat de la demande initiale. Une opération encore incertaine doit être vérifiée dans « Opérations à vérifier » avant tout nouvel envoi.</Text>
    {issue.conflictId&&<Text style={{color:colors.secondary}}>Conflit enregistré : {issue.conflictId}</Text>}
    {busy&&<Text accessibilityLiveRegion="polite" style={{color:colors.secondary}}>Vérification des articles…</Text>}
    {!!error&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{error}</Text>}
    {rows.map(row=><View key={row.line.itemId} style={{gap:6,paddingVertical:8,borderTopWidth:1,borderColor:colors.border}}>
      <Text style={{color:colors.text,fontWeight:'600'}}>{row.current?.name||row.line.name}</Text>
      <Text style={{color:row.error||row.reason?colors.danger:colors.secondary}}>{row.error||row.reason||'Disponible au moment de cette vérification.'}{linked===row.line.itemId?' · Article du conflit enregistré.':''}</Text>
      <InventoryButton secondary label="Revoir cette ligne" disabled={busy} onPress={()=>onReview(row.line.itemId,row.error||row.reason||'Disponible au moment de cette vérification.')}/>
    </View>)}
    {!busy&&rows.length>0&&rows.every(row=>!row.reason&&!row.error)&&<Text style={{color:colors.secondary}}>Aucune indisponibilité actuelle détectée. Vérifiez aussi la date de vente et les conditions du dépôt. Le dossier complet du conflit reste consultable dans l’interface web.</Text>}
    <InventoryButton secondary label={busy?'Vérification…':'Actualiser cette vérification'} disabled={busy} onPress={()=>void load()}/>
    <InventoryButton secondary label="Actualiser la liste du stock" disabled={busy} onPress={onRefreshStock}/>
    <InventoryButton label="Corriger le panier après refus confirmé" disabled={busy} onPress={()=>onReview()}/>
  </View>;
}
