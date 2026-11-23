import {useEffect,useState} from 'react';
import {Alert,Pressable,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {MotionModal} from './MotionModal';
import {captureAccountScope,onSessionInvalidated} from '../auth/session';
import {type SubmittedAttempt,type AttemptScope} from '../data/submittedAttempt';
import {submittedAttempts} from '../data/purchaseAttemptStorage';
import {recoverFinancialAttempt} from '../data/apiRepository';
import {useTheme} from '../theme/ThemeProvider';
import {formatShopMoney,formatShopDate} from '../theme/shopFormatting';
import {financialSummary} from '../data/financialSummary';

const labels:Record<string,string>={'/purchases':'Rachat','/sales':'Vente','/sales/bulk':'Panier de vente','/supplier-receipts':'Achat fournisseur','/stock/donate':'Don','/stock/open':'Ouverture de display','/consignments':'Dépôt-vente','/consignments/payments':'Versement au déposant','/sales/payment':'Correction de l’encaissement','/sales/cancel':'Annulation de vente','/consignments/returns/prepare':'Préparation d’une restitution'};
export function FinancialRecovery({onRecovered}:{onRecovered:(attempt:SubmittedAttempt)=>void}) {
  const {colors}=useTheme();
  const [rows,setRows]=useState<SubmittedAttempt[]>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [scope,setScope]=useState<AttemptScope|null>(null);
  useEffect(()=>{
    let active=true;
    const update=()=>{void captureAccountScope().then(async next=>{await submittedAttempts.load(next);next.assertActive();if(active){setScope(next);setRows(submittedAttempts.list(next.owner).filter(row=>!row.executing));}}).catch(()=>{if(active){setScope(null);setRows([]);setOpen(false);}});};
    update(); const unsubscribe=submittedAttempts.subscribe(update),invalidate=onSessionInvalidated(()=>{setScope(null);setRows([]);setOpen(false);});
    return()=>{active=false;unsubscribe();invalidate();};
  },[]);
  const button=(label:string,action:()=>void)=><Pressable accessibilityRole="button" disabled={busy} onPress={action} style={{minHeight:48,justifyContent:'center',padding:12,borderRadius:12,backgroundColor:colors.accentSoft}}><Text style={{color:colors.accent}}>{label}</Text></Pressable>;
  async function retry(attempt:SubmittedAttempt) {
    if(!scope)return;setBusy(true);setError('');
    try{scope.assertActive();await recoverFinancialAttempt(attempt);scope.assertActive();setRows(submittedAttempts.list(scope.owner));}
    catch(reason){try{scope.assertActive();setError(reason instanceof Error?reason.message:'Vérification impossible.');}catch{/* Previous account owns the attempt. */}}
    finally{try{scope.assertActive();setBusy(false);}catch{/* Unmounted account. */}}
  }
  async function closeAttempt(attempt:SubmittedAttempt) {
    if(!scope)return;setBusy(true);
    try{
      scope.assertActive();
      if(attempt.owner!==scope.owner || !submittedAttempts.list(scope.owner).includes(attempt))throw new Error('RECOVERY_ACCOUNT_MISMATCH');
      if(attempt.state==='confirmed'){
        if(attempt.context.files?.some(file=>!file.uploaded))throw new Error('Pièces jointes à envoyer.');
        onRecovered(attempt);
      }
      await submittedAttempts.releasePersisted(scope,attempt.path);scope.assertActive();setError('');
    }
    catch(reason){try{scope.assertActive();setError(reason instanceof Error?reason.message:'Opération encore incertaine.');}catch{/* Previous account owns this completion. */}}
    finally{try{scope.assertActive();setBusy(false);}catch{/* Unmounted account. */}}
  }
  return <>
    {rows.length>0&&button(`Opérations à vérifier · ${rows.length}`,()=>setOpen(true))}
    <MotionModal visible={open} animationType="slide" onRequestClose={()=>setOpen(false)}>
      <SafeAreaView style={{flex:1,backgroundColor:colors.background}}>
        <ScrollView contentContainerStyle={{padding:20,gap:16}}>
          {button('Fermer',()=>setOpen(false))}
          <Text accessibilityRole="header" style={{fontSize:24,fontWeight:'700',color:colors.text}}>Opérations à vérifier</Text>
          <Text style={{color:colors.secondary}}>Une réponse perdue ne signifie pas que l’opération a échoué. La vérification renvoie exactement la demande initiale. Les modifications faites ensuite au formulaire ne sont pas envoyées.</Text>
          <Text style={{color:colors.secondary}}>Les rachats sont conservés sur cet appareil pour ce compte et cette boutique, même après redémarrage. Pour les autres opérations, terminez la vérification avant de fermer l’application.</Text>
          {!!error&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{error}</Text>}
          {rows.map(attempt=>{
            const body=JSON.parse(attempt.body), files=attempt.context.files?.filter(file=>!file.uploaded).length??0;
            const {total,units,label}=financialSummary(attempt.path,body);
            return <View key={attempt.path} style={{gap:12,padding:16,borderRadius:16,backgroundColor:colors.surface}}>
              <Text style={{color:colors.text,fontSize:20,fontWeight:'600'}}>{labels[attempt.path]??(/\/purchases\/[^/]+\/edit$/.test(attempt.path)?'Correction de rachat':'Opération')}</Text>
              {attempt.path==='/consignments/returns/prepare'&&<Text style={{color:colors.secondary}}>Cette demande prépare le bon. La signature reste une action séparée ; la vérification ne restitue pas automatiquement les articles.</Text>}
              {!!body.reference&&<Text style={{color:colors.text}}>{body.reference}</Text>}
              {!!body.saleId&&<Text style={{color:colors.secondary}}>Vente · {body.saleId}</Text>}
              {!!body.conditionNotes&&<Text style={{color:colors.secondary}}>État à la remise · {body.conditionNotes}</Text>}
              {!!body.supplier&&<Text style={{color:colors.text}}>{body.supplier}</Text>}
              {typeof body.occurredAt==='number'&&<Text style={{color:colors.secondary}}>{formatShopDate(body.occurredAt)}</Text>}
              {typeof total==='number'&&<Text style={{color:colors.text}}>{label} · {formatShopMoney(total/100)}</Text>}
              {typeof units==='number'&&<Text style={{color:colors.secondary}}>{units} unité(s)</Text>}
              {Array.isArray(body.items)&&<Text style={{color:colors.secondary}}>{body.items.map((item:{name?:string})=>item.name).filter(Boolean).join(', ')}</Text>}
              {Array.isArray(body.lines)&&body.lines.map((line:{quantity:number;unitCostCents:number;product?:{name?:string}},index:number)=><Text key={index} style={{color:colors.secondary}}>{line.product?.name??'Produit'} · {line.quantity} × {formatShopMoney(line.unitCostCents/100)}</Text>)}
              <Text style={{color:colors.text}}>{attempt.state==='confirmed'?'Opération enregistrée.':attempt.state==='rejected'?'Demande refusée avant enregistrement.':'Résultat encore incertain. Aucun nouvel envoi modifié n’est autorisé.'}</Text>
              {!!attempt.error&&<Text style={{color:colors.secondary}}>{attempt.error}</Text>}
              {files>0&&<Text style={{color:colors.secondary}}>{files} pièce(s) à envoyer après confirmation.</Text>}
              {(attempt.state==='unknown'||(attempt.state==='confirmed'&&files>0))&&button(busy?'Vérification…':attempt.state==='confirmed'?'Réessayer les pièces jointes':'Vérifier la demande initiale',()=>Alert.alert('Vérifier cette opération ?', 'La demande initiale sera utilisée, sans appliquer les modifications du formulaire.',[{text:'Annuler',style:'cancel'},{text:'Vérifier',onPress:()=>void retry(attempt)}]))}
              {attempt.state==='rejected'&&button('Autoriser une nouvelle tentative',()=>Alert.alert('Corriger puis renvoyer ?', 'Cette demande a été refusée. Vous pourrez modifier le formulaire puis confirmer un nouvel envoi.',[{text:'Annuler',style:'cancel'},{text:'Autoriser',onPress:()=>closeAttempt(attempt)}]))}
              {attempt.state==='confirmed'&&files===0&&button('Terminer l’opération enregistrée',()=>Alert.alert('Terminer cette opération ?', 'Les formulaires en cours seront fermés. Retrouvez l’opération dans son historique.',[{text:'Annuler',style:'cancel'},{text:'Terminer',onPress:()=>closeAttempt(attempt)}]))}
            </View>;
          })}
        </ScrollView>
      </SafeAreaView>
    </MotionModal>
  </>;
}
