import {shopTimezone} from '../theme/shopFormatting';
import {prepareTicketEmailAttempt,ticketEmailStatus,failedTicketEmailAttempt,serverTicketEmailAttempts,type TicketEmailAttempt} from '../data/ticketEmailAttempt';
import {loadTicketEmails,persistTicketEmails,ticketEmailLedger,subscribeTicketEmails} from '../data/ticketEmailStorage';
import {documentVersion} from '../data/documentVersion';
import {captureAccountScope,getSessionScope} from '../auth/session';
import {useEffect,useRef,useState} from 'react';
import {Alert,Text,View} from 'react-native';
import * as Crypto from 'expo-crypto';
import {request,sharePdfFile} from '../data/apiRepository';
import {useTheme} from '../theme/ThemeProvider';
import {InventoryButton} from './InventoryManager';
import {Field} from './Field';
import {ReceiptPdfViewer} from './ReceiptPdfViewer';
type Ticket={_id:string;createdAt:number;version?:number;objectKey?:string;saleIds:string[]};
type Scope=Awaited<ReturnType<typeof captureAccountScope>>;
const emailLabel=(status:TicketEmailAttempt['status'])=>status==='accepted'?'Accepté par le service email':status==='failed'?'Non envoyé':status==='stale'?'Version périmée, non envoyée':'Résultat incertain';
export function SaleTicket({saleIds,autoCreate=false}:{saleIds:string[];autoCreate?:boolean}) {
 const {colors}=useTheme();
 const [rows,setRows]=useState<Ticket[]>([]),[selected,setSelected]=useState<string|null>(null),[email,setEmail]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[pdf,setPdf]=useState<string|null>(null),[ready,setReady]=useState(false),[history,setHistory]=useState<TicketEmailAttempt[]>([]),[attempt,setAttempt]=useState<TicketEmailAttempt|null>(null);
 const lock=useRef(false),generation=useRef(Crypto.randomUUID()),generationSales=useRef<string[]|null>(null),scopeRef=useRef<Scope|null>(null),rowsRef=useRef<Ticket[]>([]),mounted=useRef(true),key=saleIds.join(',');
 const unresolved=attempt?.status==='unknown',stale=attempt?.status==='stale',held=unresolved||stale;
 const accepted=attempt?.status==='accepted'&&attempt.ticketId===selected&&attempt.recipient===email.trim();
 function sync(scope:Scope,tickets=rowsRef.current,restore=false) {
  scope.assertActive();if(!mounted.current)return;
  const current=ticketEmailLedger.current(scope.owner,tickets.map(row=>row._id),saleIds);
  setAttempt(current);setHistory(ticketEmailLedger.all(scope.owner).filter(row=>tickets.some(ticket=>ticket._id===row.ticketId)||row.saleIds?.some(id=>saleIds.includes(id))).sort((a,b)=>(b.updatedAt??0)-(a.updatedAt??0)));
  if(current&&(restore||current.status==='unknown'||current.status==='stale')){setSelected(current.ticketId);setEmail(current.recipient);}
 }
 async function run(action:(scope:Scope)=>Promise<void>,originalScope?:Scope) {
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');const epoch=getSessionScope();
  try{const scope=originalScope??await captureAccountScope();scope.assertActive();scopeRef.current=scope;await action(scope);scope.assertActive();}
  catch(reason){if(mounted.current&&epoch===getSessionScope())setError(reason instanceof Error?reason.message:'Ticket indisponible. La vente reste enregistrée.');}
  finally{lock.current=false;if(mounted.current&&epoch===getSessionScope())setBusy(false);}
 }
 async function list(scope:Scope,restore=false) {
  scope.assertActive();setReady(false);await loadTicketEmails(scope.owner);scope.assertActive();
  const result=await request<Ticket[]>('/sale-tickets?saleId='+encodeURIComponent(saleIds[0]));scope.assertActive();
  const remote:TicketEmailAttempt[]=[];
  // Existing API exposes recent attempts per archived version. Load all returned versions before permitting a new send.
  for(const ticket of result){const detail=await request<{emails:unknown[]}>(`/sale-tickets/${ticket._id}`);scope.assertActive();remote.push(...serverTicketEmailAttempts(ticket._id,detail.emails).map(row=>({...row,saleIds:ticket.saleIds})));}
  ticketEmailLedger.reconcile(scope.owner,remote);await persistTicketEmails(scope.owner);scope.assertActive();
  if(!mounted.current)return result;
  rowsRef.current=result;setRows(result);setSelected(value=>value&&result.some(row=>row._id===value)?value:result[0]?._id??null);sync(scope,result,restore);setReady(true);return result;
 }
 async function generate(scope:Scope) {
  scope.assertActive();const current=ticketEmailLedger.current(scope.owner,rowsRef.current.map(row=>row._id),saleIds);if(current?.status==='unknown'||current?.status==='stale')throw new Error('Résolvez la tentative précédente avant de changer de version.');
  generationSales.current??=rowsRef.current.find(row=>row._id===selected)?.saleIds??saleIds;
  const {id}=await request<{id:string}>('/sale-tickets',{operationId:generation.current,saleIds:generationSales.current});scope.assertActive();
  await request(`/sale-tickets/${id}/pdf`);scope.assertActive();await list(scope);scope.assertActive();
  generation.current=Crypto.randomUUID();generationSales.current=null;setSelected(id);setMessage('Ticket PDF enregistré et archivé.');
 }
 async function sendEmail(scope:Scope,retryConfirmed=false) {
  scope.assertActive();if(!selected||!ready)return;
  const previous=ticketEmailLedger.current(scope.owner,rowsRef.current.map(row=>row._id),saleIds);
  if(previous?.status==='stale')throw new Error('Choisissez explicitement la version actuelle avant un nouvel envoi.');
  const current={...prepareTicketEmailAttempt(previous,{ticketId:selected,recipient:email},Crypto.randomUUID,retryConfirmed),saleIds:[...saleIds]};
  if(current.status==='accepted')return;
  ticketEmailLedger.begin(scope.owner,current);
  try {
   // Durable intent precedes transport; remounts and account switches cannot create a second attempt.
   ticketEmailLedger.put(scope.owner,{...current,updatedAt:Date.now()});await persistTicketEmails(scope.owner);scope.assertActive();sync(scope);
   let next:TicketEmailAttempt;
   try{const result=await request<{status:string}>(`/sale-tickets/${current.ticketId}/email`,{operationId:current.id,recipient:current.recipient});const status=ticketEmailStatus(result.status);next={...current,status,uncertain:status==='unknown',updatedAt:Date.now()};}
   catch(reason){next=failedTicketEmailAttempt(current,reason);ticketEmailLedger.put(scope.owner,next);await persistTicketEmails(scope.owner);scope.assertActive();sync(scope);throw reason;}
   ticketEmailLedger.put(scope.owner,next);await persistTicketEmails(scope.owner);scope.assertActive();sync(scope);setMessage(emailLabel(next.status)+'.');
  } finally {ticketEmailLedger.end(scope.owner,current);}
 }
 async function confirmSend() {
  const epoch=getSessionScope();try{const scope=await captureAccountScope();scope.assertActive();const current=ticketEmailLedger.current(scope.owner,rowsRef.current.map(row=>row._id),saleIds),unknown=current?.status==='unknown',failed=current?.status==='failed';
   Alert.alert(unknown?'Vérifier cet envoi ?':failed?'Réessayer l’envoi ?':'Envoyer le ticket ?',unknown?current.recipient:email.trim(),[{text:'Annuler',style:'cancel'},{text:unknown?'Vérifier':failed?'Réessayer':'Envoyer',onPress:()=>void run(s=>sendEmail(s,failed),scope)}]);
  }catch(reason){if(epoch===getSessionScope())setError(reason instanceof Error?reason.message:'Session indisponible.');}
 }
 async function releaseStale() {
  const epoch=getSessionScope();try{const scope=await captureAccountScope();scope.assertActive();const current=ticketEmailLedger.current(scope.owner,rowsRef.current.map(row=>row._id),saleIds);if(current?.status!=='stale')return;
   Alert.alert('Choisir le ticket actuel ?', 'La version précédente a été refusée avant tout envoi. Cette action libère uniquement cette tentative non envoyée. Vérifiez ou régénérez ensuite le ticket avant de confirmer un nouvel envoi.',[{text:'Annuler',style:'cancel'},{text:'Choisir',onPress:()=>void run(async s=>{s.assertActive();ticketEmailLedger.releaseStale(s.owner,current.id);await persistTicketEmails(s.owner);s.assertActive();const latest=await list(s);s.assertActive();setSelected(latest[0]?._id??null);},scope)}]);
  }catch(reason){if(epoch===getSessionScope())setError(reason instanceof Error?reason.message:'Session indisponible.');}
 }
 useEffect(()=>{mounted.current=true;const unsubscribe=subscribeTicketEmails(()=>{const scope=scopeRef.current;if(scope)try{sync(scope);}catch{/* Old account notifications never enter this workspace. */}});return()=>{mounted.current=false;unsubscribe();};},[key]);
 useEffect(()=>{if(saleIds.length)void run(async scope=>{const found=await list(scope,true);if(!found.length&&autoCreate)await generate(scope);});},[key]);
 return <View style={{backgroundColor:colors.surface,borderRadius:16,padding:16,gap:8,marginVertical:12}}>
  <Text accessibilityRole="header" style={{color:colors.text,fontSize:20,fontWeight:'600'}}>Ticket de vente</Text>
  <Text style={{color:colors.secondary}}>Chaque version conserve les informations au moment de sa génération. Régénérez après une annulation ou un encaissement.</Text>
  {!!error&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{error}</Text>}
  {!!message&&<Text accessibilityLiveRegion="polite" style={{color:colors.text}}>{message}</Text>}
  {!ready&&<Text style={{color:colors.secondary}}>{busy?'Chargement des versions et des envois…':'Historique non vérifié. Rechargez-le avant un nouvel envoi.'}</Text>}
  <InventoryButton secondary disabled={busy} label="Actualiser les versions et les envois" onPress={()=>void run(scope=>list(scope).then(()=>undefined))}/>
  <InventoryButton label={rows.length?'Régénérer une nouvelle version':'Générer et archiver le ticket'} disabled={busy||held||!ready} onPress={()=>void run(generate)}/>
  {rows.map(row=><InventoryButton key={row._id} secondary={selected!==row._id} disabled={busy||held} label={`${documentVersion(row.version)} · ${new Date(row.createdAt).toLocaleString('fr-BE',{timeZone:shopTimezone()})}`} onPress={()=>setSelected(row._id)}/>)}
  {selected&&<>
   <InventoryButton secondary disabled={busy} label="Lire le PDF" onPress={()=>void run(async scope=>{const result=await request<{pdfBase64:string}>(`/sale-tickets/${selected}/pdf`);scope.assertActive();setPdf(result.pdfBase64);})}/>
   <InventoryButton secondary disabled={busy} label="Télécharger / Partager le PDF" onPress={()=>void run(async scope=>{const result=await request<{pdfBase64:string;filename:string}>(`/sale-tickets/${selected}/pdf`);scope.assertActive();await sharePdfFile(result.filename,result.pdfBase64,scope);})}/>
   <Field label="Email du destinataire" value={email} onChangeText={setEmail} editable={!busy&&!held&&ready} keyboardType="email-address"/>
   {unresolved&&<Text accessibilityRole="alert" style={{color:colors.text}}>Résultat incertain : le ticket, le destinataire et la clé d’envoi sont conservés. La vérification reprend cette même tentative.</Text>}
   {stale&&<><Text accessibilityRole="alert" style={{color:colors.text}}>Cette version ne correspond plus à la vente. Le serveur a refusé cette tentative avant l’envoi.</Text><InventoryButton secondary disabled={busy} label="Choisir le ticket actuel" onPress={()=>void releaseStale()}/></>}
   <InventoryButton disabled={busy||!ready||stale||!email.trim()||accepted} label={unresolved?'Vérifier l’envoi':attempt?.status==='failed'?'Réessayer l’envoi':accepted?'Envoi accepté':'Envoyer par email'} onPress={()=>void confirmSend()}/>
  </>}
  <Text accessibilityRole="header" style={{color:colors.text,fontWeight:'600'}}>Historique des envois</Text>
  <Text style={{color:colors.secondary}}>Envois récents renvoyés par le serveur et tentatives conservées sur cet appareil. « Accepté » confirme la prise en charge par le service, pas la réception du message.</Text>
  {ready&&!history.length&&<Text style={{color:colors.secondary}}>Aucun envoi dans cet historique.</Text>}
  {history.map(row=><Text key={row.id} style={{color:colors.text}}>{row.recipient} · {emailLabel(row.status)} · {row.updatedAt?new Date(row.updatedAt).toLocaleString('fr-BE',{timeZone:shopTimezone()}):'Date non renseignée'}{row.released?' · tentative libérée':''}</Text>)}
  {pdf&&<ReceiptPdfViewer base64={pdf} onClose={()=>setPdf(null)} backLabel="Ticket de vente"/>}
 </View>;
}
