import {useEffect,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {activitySources,type ActivityEntry} from '../data/activityFeed';
import {request,openAttachment,type Attachment} from '../data/apiRepository';
import {useTheme} from '../theme/ThemeProvider';
import {formatShopMoney} from '../theme/shopFormatting';
import {historyStatusLabels} from '../data/historyFilters';
import {InventoryButton} from '../components/InventoryManager';
export function ActivityDetail({entry,onWorkflow,busy=false,workflowError=''}:{entry:ActivityEntry;onWorkflow:()=>void;busy?:boolean;workflowError?:string}) {
  const {colors,timezone}=useTheme();
  const row=entry.record;
  const [attachments,setAttachments]=useState<Attachment[]>([]),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;setAttachments([]);setError('');
    const key=entry.source==='receipts'?'receiptId':entry.source==='gifts'?'giftId':undefined;
    if(key)void request<Attachment[]>(`/inventory/evidence?${key}=${encodeURIComponent(row._id)}`).then(value=>{if(active)setAttachments(value);}).catch(reason=>{if(active)setError(String(reason));});
    return()=>{active=false;};
  },[entry.key]);
  const fields:[string,unknown][]=[['Référence',row.reference],['Fournisseur',row.supplier],['Déposant',row.sellerName],['Article',row.itemName],['Quantité',row.quantity],['Unités par display',row.packSize],['Bénéficiaire',row.recipient],['Motif',row.reason],['Note',row.note??row.authorizationNote],['Mode de versement',row.method],['Statut',historyStatusLabels[row.status]],['Type',row.kind==='return'?'Restitution':row.kind==='terms'?'Accord révisé':undefined]];
  const amount=row.amountCents;
  return <ScrollView contentContainerStyle={{padding:20,gap:16}}>
    <Text accessibilityRole="header" style={{fontSize:26,fontWeight:'700',color:colors.text}}>{activitySources.find(source=>source.id===entry.source)?.label}</Text>
    <Text style={{color:colors.secondary}}>{entry.date===null?'Date d’opération inconnue':new Date(entry.date).toLocaleString('fr-BE',{timeZone:timezone})}</Text>
    {amount!==undefined&&<Text style={{fontSize:28,fontWeight:'600',color:colors.text}}>{row.amountStatus==='detail-required'?'Montant : voir le dossier':amount===null?'Montant non renseigné':formatShopMoney(amount/100)}</Text>}
    <View style={{backgroundColor:colors.surface,borderRadius:16,padding:16,gap:14}}>{fields.filter(([,value])=>value!==undefined&&value!==null&&value!=='').map(([label,value])=><View key={label} style={{gap:4}}><Text style={{color:colors.secondary}}>{label}</Text><Text style={{color:colors.text}}>{String(value)}</Text></View>)}</View>
    {attachments.map(file=><InventoryButton key={file._id} label={`Ouvrir ${file.filename}`} secondary onPress={()=>void openAttachment(file._id,file.filename,file.contentType).catch(reason=>setError(String(reason)))} />)}
    {!!error&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{error}</Text>}
    {row.detailsIncomplete&&<Text style={{color:colors.secondary}}>Cet historique est partiel. Les informations absentes ne sont pas reconstituées.</Text>}
    {!!workflowError&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{workflowError}</Text>}
    <InventoryButton disabled={busy} label={['receipts','gifts','openings'].includes(entry.source)?'Ouvrir les opérations de stock':'Ouvrir les dépôts et versements'} onPress={onWorkflow} />
  </ScrollView>;
}
