import {useRef,useState} from 'react';
import {Alert,ScrollView,Text,View} from 'react-native';
import {captureAccountScope,getSessionScope} from '../auth/session';
import {request} from '../data/apiRepository';
import {gradingDraft,gradingPayload,gradingFailure,type GradingCompanyRecord} from '../data/gradingCompanies';
import {useGradingCompanies,invalidateGradingCompanies} from '../data/useGradingCompanies';
import {Field} from '../components/Field';
import {InventoryButton} from '../components/InventoryManager';
import {useTheme} from '../theme/ThemeProvider';
export function GradingCompanies() {
  const {colors}=useTheme(),{companies,loading,error,reload}=useGradingCompanies();
  const [editing,setEditing]=useState<GradingCompanyRecord|null>(null),[creating,setCreating]=useState(false),[draft,setDraft]=useState(()=>gradingDraft());
  const [busy,setBusy]=useState(false),[failure,setFailure]=useState(''),[notice,setNotice]=useState('');const lock=useRef(false);
  async function save(original?:GradingCompanyRecord,archived?:boolean,originalScope?:Awaited<ReturnType<typeof captureAccountScope>>) {
    if(lock.current)return;lock.current=true;setBusy(true);setFailure('');setNotice('');const epoch=getSessionScope();
    try{
      const scope=originalScope??await captureAccountScope();scope.assertActive();
      const body=gradingPayload(archived===undefined?draft:gradingDraft(original),original,archived??original?.archivedAt!==undefined);
      await request(original?`/grading-companies/${encodeURIComponent(original._id)}`:'/grading-companies',body,original?'PATCH':'POST');scope.assertActive();
      setEditing(null);setCreating(false);setDraft(gradingDraft());invalidateGradingCompanies();setNotice(archived===true?'Société archivée.':archived===false?'Société réactivée.':original?'Société mise à jour.':'Société ajoutée.');
    }catch(reason){if(epoch===getSessionScope())setFailure(gradingFailure(reason));}
    finally{if(epoch===getSessionScope()){lock.current=false;setBusy(false);}}
  }
  async function confirmArchive(company:GradingCompanyRecord) {
    const epoch=getSessionScope();
    try{const scope=await captureAccountScope();scope.assertActive();Alert.alert(company.archivedAt?'Réactiver cette société ?':'Archiver cette société ?',company.archivedAt?'Elle sera de nouveau proposée dans les fiches.':'Elle ne sera plus proposée pour les nouveaux articles. Les données des fiches existantes sont conservées.',[{text:'Annuler',style:'cancel'},{text:company.archivedAt?'Réactiver':'Archiver',onPress:()=>{try{scope.assertActive();void save(company,!company.archivedAt,scope);}catch{/* Ignore an old account's alert. */}}}]);}
    catch(reason){if(epoch===getSessionScope())setFailure(gradingFailure(reason));}
  }
  async function reviewCurrent() {
    const scope=await captureAccountScope();const rows=await reload();scope.assertActive();
    const latest=rows?.find(row=>row._id===editing?._id);if(!latest)return;
    Alert.alert('Version actuelle',`${latest.name}${latest.abbreviation?` · ${latest.abbreviation}`:''}\n${latest.website??'Aucun site'}\n${latest.archivedAt?'Archivée':'Active'}\nVotre saisie sera conservée pour comparaison avant un nouvel enregistrement.`,[{text:'Garder la version précédente',style:'cancel'},{text:'Utiliser cette version',onPress:()=>{try{scope.assertActive();setEditing(latest);setFailure('');setNotice('Version actuelle chargée. Vérifiez votre saisie avant de l’enregistrer.');}catch{/* The account changed while the native alert was open. */}}}]);
  }
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,gap:16}}>
    <Text accessibilityRole="header" style={{fontSize:28,fontWeight:'700',color:colors.text}}>Sociétés de gradation</Text>
    <Text style={{color:colors.secondary}}>Répertoire de la boutique, commun aux rachats, au stock et aux dépôts. L’archivage retire une société des nouveaux choix et conserve les fiches existantes.</Text>
    {(creating||editing)?<View style={{gap:8}}>
      <Field label="Nom de la société" maxLength={100} value={draft.name} editable={!busy} onChangeText={name=>setDraft(value=>({...value,name}))}/>
      <Field label="Abréviation, facultative" maxLength={30} value={draft.abbreviation} editable={!busy} onChangeText={abbreviation=>setDraft(value=>({...value,abbreviation}))}/>
      <Field label="Site HTTPS, facultatif" value={draft.website} editable={!busy} keyboardType="url" onChangeText={website=>setDraft(value=>({...value,website}))}/>
      <InventoryButton label={busy?'Enregistrement…':editing?'Enregistrer les modifications':'Ajouter la société'} disabled={busy||!draft.name.trim()} onPress={()=>void save(editing??undefined)}/>
      <InventoryButton label="Annuler la saisie" secondary disabled={busy} onPress={()=>{setCreating(false);setEditing(null);setFailure('');}}/>
      {editing&&<InventoryButton label="Examiner la version actuelle" secondary disabled={busy||loading} onPress={()=>{const epoch=getSessionScope();void reviewCurrent().catch(reason=>{if(epoch===getSessionScope())setFailure(gradingFailure(reason));});}}/>}
    </View>:<InventoryButton label="Ajouter une société" disabled={busy} onPress={()=>{setDraft(gradingDraft());setCreating(true);setFailure('');setNotice('');}}/>}
    {!!(failure||error)&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{failure||error}</Text>}
    {!!notice&&<Text accessibilityLiveRegion="polite" style={{color:colors.secondary}}>{notice}</Text>}
    {loading&&<Text accessibilityLiveRegion="polite" style={{color:colors.secondary}}>Chargement du répertoire…</Text>}
    <InventoryButton label={error?'Réessayer le chargement':'Actualiser le répertoire'} secondary disabled={busy||loading} onPress={()=>void reload()}/>
    {!loading&&!error&&!companies.length&&<Text style={{color:colors.secondary}}>Aucune société. Ajoutez-en une pour la proposer dans les fiches.</Text>}
    {companies.map(company=><View key={company._id} style={{paddingVertical:16,gap:8,borderTopWidth:1,borderColor:colors.border}}>
      <Text style={{color:colors.text,fontSize:18,fontWeight:'600'}}>{company.name}{company.abbreviation?` · ${company.abbreviation}`:''}</Text>
      <Text style={{color:colors.secondary}}>{company.archivedAt?'Archivée':'Disponible dans les fiches'}{company.website?` · ${company.website}`:''}</Text>
      <View style={{gap:6}}><InventoryButton label={`Modifier ${company.name}`} secondary disabled={busy||creating||!!editing} onPress={()=>{setEditing(company);setDraft(gradingDraft(company));setFailure('');setNotice('');}}/>
      <InventoryButton label={company.archivedAt?'Réactiver':'Archiver'} secondary disabled={busy||creating||!!editing} onPress={()=>void confirmArchive(company)}/></View>
    </View>)}
  </ScrollView>;
}
