import {useEffect,useState} from 'react';
import type {SalePaymentHistoryPage,SalePaymentSnapshot} from '../../../packages/domain/src/history';
import type {Request} from './GradingCompanies';
import {Button} from './components/ui/button';
import {formatMoney,shopTimezone} from './shopFormat';
import {realtime} from './realtime';

const statusLabel={received:'Paiement reçu',pending:'À encaisser',unknown:'Encaissement non renseigné'};
const stateLabel={current:'État actuel',superseded:'Remplacé par une correction',reversed:'Annulé avec la vente'};
const stamp=(value:number|null)=>value===null?'Date non renseignée':new Date(value).toLocaleString('fr-BE',{timeZone:shopTimezone,dateStyle:'medium',timeStyle:'short'});
function PaymentFacts({value}:{value:SalePaymentSnapshot}) {
  return <><p>{statusLabel[value.collectionStatus]}</p><dl>
    <div><dt>Espèces</dt><dd>{value.cashCents===null?'Non renseignées':formatMoney(value.cashCents)}</dd></div>
    <div><dt>Virement</dt><dd>{value.transferCents===null?'Non renseigné':formatMoney(value.transferCents)}</dd></div>
    <div><dt>Date de réception</dt><dd>{stamp(value.receivedAt)}</dd></div>
    {value.reference&&<div><dt>Référence</dt><dd>{value.reference}</dd></div>}
  </dl></>;
}
/** Key by sale ID at the call site so source cursors cannot cross sales. */
export function SalePaymentHistory({saleId,request}:{saleId:string;request:Request}) {
  const [cursors,setCursors]=useState<(string|null)[]>([null]);
  const [result,setResult]=useState<SalePaymentHistoryPage>();
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(true);
  const [retry,setRetry]=useState(0);
  const cursor=cursors.at(-1)??null;
  useEffect(()=>{
    let active=true;
    setBusy(true);setError('');setResult(undefined);
    const fail=(reason:Error)=>{if(active){setError(reason.message);setBusy(false);setResult(undefined);}};
    const stop=realtime.subscribe<SalePaymentHistoryPage>('operations:salePaymentHistory',{saleId,size:10,...(cursor?{cursor}:{})},value=>{
      if(!active)return;
      try{(request as Request&{assertActive?:()=>void}).assertActive?.();setResult(value);setBusy(false);setError('');}
      catch(reason){fail(reason instanceof Error?reason:new Error('La session a changé.'));}
    },fail);
    return()=>{active=false;stop();};
  },[saleId,request,cursor,retry]);
  return <section className="sale-payment-history" aria-label="Historique des encaissements">
    <h3>Historique des encaissements</h3>
    <p>Les corrections conservent les états précédents. Une annulation de vente ne constitue pas un remboursement.</p>
    {busy&&<p role="status">Chargement des encaissements…</p>}
    {error&&<p role="alert">{error} <Button variant="outline" onClick={()=>setRetry(value=>value+1)}>Réessayer l’historique</Button></p>}
    {result?.historyStatus==='incomplete'&&<p role="status">Certaines données anciennes sont manquantes. Les dates, auteurs ou montants inconnus restent indiqués comme tels.</p>}
    {result&&<>
      {!result.items.length&&<p>{result.isDone?'Aucun événement d’encaissement conservé dans cette page.':'Aucun événement dans cette page ; poursuivez avec la suivante.'}</p>}
      <ol>{result.items.map(row=><li key={row.id}>
        <h4>{row.kind==='initial'?'Enregistrement initial':'Correction de l’encaissement'}</h4>
        <p>{stateLabel[row.state]} · {stamp(row.changedAt)}</p>
        <p>{row.actorLabel?`Par ${row.actorLabel}`:'Auteur non renseigné'}</p>
        <PaymentFacts value={row}/>
        {row.previous&&<details><summary>État avant cette correction</summary><PaymentFacts value={row.previous}/></details>}
      </li>)}</ol>
      <nav aria-label="Pagination des encaissements">
        <Button variant="outline" disabled={busy||cursors.length===1} onClick={()=>setCursors(value=>value.slice(0,-1))}>Précédents</Button>
        <span>Page {cursors.length}</span>
        <Button variant="outline" disabled={busy||result.isDone||!result.nextCursor} onClick={()=>setCursors(value=>[...value,result.nextCursor])}>Suivants</Button>
      </nav>
    </>}
  </section>;
}
