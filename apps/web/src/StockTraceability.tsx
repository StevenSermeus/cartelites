import { useEffect, useState } from 'react';
import { Button } from './components/ui/button';
import type { Request } from './GradingCompanies';
import { formatDate, formatMoney } from './shopFormat';
import { realtime } from './realtime';
import { lotView, type StockLotRecord } from './lib/stockTraceability';

type Activity = { id:string;kind:string;occurredAt:number|null;quantityDelta:number|null;source:{type:string;id:string};reference?:string;lotId?:string;counterpartItemId?:string;reversesId?:string };
type ActivityPage = {items:Activity[];nextCursor:string|null;isDone:boolean;historyStatus:'complete'|'indexing'|'incomplete'};
const activityLabel: Record<string,string> = {
  purchase:'Rachat', acquisition:'Acquisition', 'supplier-receipt':'Réception fournisseur',
  consignment:'Entrée en dépôt-vente', sale:'Vente', 'sale-cancellation':'Annulation de vente',
  gift:'Don', 'gift-reversal':'Annulation de don', 'display-opening':'Ouverture de display',
  'opening-output':'Création de boosters', 'opening-reversal':'Annulation d’ouverture',
  'consignment-return':'Restitution au déposant', reversal:'Annulation de mouvement',
  opening:'Ouverture de display', 'consignment-terms':'Modification de l’accord',
  'purchase-correction':'Correction d’acquisition', 'opening-balance':'Solde historique repris',
};
export function StockTraceability({itemId,request}:{itemId:string;request:Request}) {
  const [lots,setLots]=useState<StockLotRecord[]>();
  const [lotError,setLotError]=useState('');
  const [lotRetry,setLotRetry]=useState(0);
  const [lotPage,setLotPage]=useState(0);
  const [cursors,setCursors]=useState<(string|undefined)[]>([undefined]);
  const cursor=cursors[cursors.length-1];
  const [activity,setActivity]=useState<ActivityPage>();
  const [activityError,setActivityError]=useState('');
  const [activityBusy,setActivityBusy]=useState(false);
  const [activityRetry,setActivityRetry]=useState(0);
  useEffect(()=>{
    let active=true;setLots(undefined);setLotError('');
    const fail=(error:Error)=>{if(active){setLots(undefined);setLotError(error.message);}};
    const stop=realtime.subscribe<{lots:StockLotRecord[]}>('inventory:detail',{itemId},data=>{
      if(!active)return;
      try {(request as Request&{assertActive?:()=>void}).assertActive?.();setLots(data.lots);setLotError('');setLotPage(page=>Math.min(page,Math.max(0,Math.ceil(data.lots.length/10)-1)));}
      catch(error){fail(error instanceof Error?error:new Error('La session a changé.'));}
    },fail);
    return()=>{active=false;stop();};
  },[itemId,request,lotRetry]);
  useEffect(()=>{
    let active=true;setActivity(undefined);setActivityBusy(true);setActivityError('');
    const fail=(error:Error)=>{if(active){setActivity(undefined);setActivityError(error.message);setActivityBusy(false);}};
    const stop=realtime.subscribe<ActivityPage>('inventory:activity',{itemId,size:25,cursor:cursor??null},data=>{
      if(!active)return;
      try {(request as Request&{assertActive?:()=>void}).assertActive?.();setActivity(data);setActivityBusy(false);setActivityError('');}
      catch(error){fail(error instanceof Error?error:new Error('La session a changé.'));}
    },fail);
    return()=>{active=false;stop();};
  },[itemId,request,cursor,activityRetry]);
  return <>
    <section className="sw-detail-section stock-traceability" aria-label="Lots d’acquisition">
      <h3>Lots d’acquisition</h3>
      <p>Chaque lot conserve sa provenance et son coût restant. Les ventes utilisent les lots disponibles dans l’ordre FIFO.</p>
      {!lots&&!lotError&&<p role="status">Chargement des lots…</p>}
      {lotError&&<p role="alert">{lotError} <Button variant="outline" onClick={()=>setLotRetry(v=>v+1)}>Réessayer les lots</Button></p>}
      {lots?.length===0&&<p>Aucun lot détaillé enregistré pour cet article. Les informations historiques disponibles restent dans la provenance et l’activité.</p>}
      {lots&&lots.length>0&&<><ol className="stock-traceability-list">{lots.slice(lotPage*10,(lotPage+1)*10).map(raw=>{const lot=lotView(raw);return <li key={lot.id}><h4>{lot.reference||lot.label}</h4><p>{lot.label}{lot.party?` · ${lot.party}`:''} · {lot.occurredAt===null?'Date non renseignée':formatDate(lot.occurredAt)}</p><dl><div><dt>Quantité reçue</dt><dd>{lot.received??'Non renseignée'}</dd></div><div><dt>Quantité restante</dt><dd>{lot.remaining??'Non renseignée'}</dd></div><div><dt>Coût initial du lot</dt><dd>{lot.originalCost===null?'Non renseigné':formatMoney(lot.originalCost)}</dd></div><div><dt>Coût restant du lot</dt><dd>{lot.remainingCost===null?'Non renseigné':formatMoney(lot.remainingCost)}</dd></div></dl><details><summary>Références de traçabilité</summary><p>Lot : <code>{lot.id}</code>{lot.sourceId&&<><br/>Origine : <code>{lot.sourceId}</code></>}</p></details></li>;})}</ol>{lots.length>10&&<nav className="stock-traceability-pages" aria-label="Pagination des lots"><Button variant="outline" disabled={lotPage===0} onClick={()=>setLotPage(v=>v-1)}>Lots précédents</Button><span>Page {lotPage+1} sur {Math.ceil(lots.length/10)}</span><Button variant="outline" disabled={(lotPage+1)*10>=lots.length} onClick={()=>setLotPage(v=>v+1)}>Lots suivants</Button></nav>}</>}
    </section>
    <section className="sw-detail-section stock-traceability" aria-label="Activité de l’article">
      <h3>Activité de l’article</h3>
      <p>Entrées, sorties et annulations issues de l’historique enregistré, détaillées par lot lorsqu’il existe. Une quantité positive entre en stock ; une quantité négative en sort.</p>
      {activityBusy&&<p role="status">Chargement de l’activité…</p>}
      {activityError&&<p role="alert">{activityError} <Button variant="outline" onClick={()=>setActivityRetry(v=>v+1)}>Réessayer l’activité</Button></p>}
      {activity?.historyStatus==='indexing'&&<p role="status">L’historique est en cours de préparation. Les mouvements affichés peuvent être incomplets. <Button variant="outline" onClick={()=>setActivityRetry(v=>v+1)}>Actualiser l’activité</Button></p>}
      {activity?.historyStatus==='incomplete'&&<p role="status">Certaines données historiques sont manquantes. Cette liste ne permet pas de reconstituer à elle seule tout le stock.</p>}
      {activity&&!activity.items.length&&<p>{activity.isDone?'Aucun mouvement enregistré dans cette page.':'Aucun mouvement dans cette page ; poursuivez avec la suivante.'}</p>}
      {activity&&<><ol className="stock-traceability-list">{activity.items.map(row=><li key={row.id}><div className="stock-activity-heading"><h4>{activityLabel[row.kind]??'Mouvement de stock'}</h4><strong>{row.quantityDelta===null?'Quantité inconnue':`${row.quantityDelta>0?'+':''}${row.quantityDelta} unité(s)`}</strong></div><p>{row.occurredAt===null?'Date non renseignée':formatDate(row.occurredAt)}{row.reference?` · ${row.reference}`:''}</p><details><summary>Références de traçabilité</summary><p>Opération : <code>{row.source.id}</code>{row.lotId&&<><br/>Lot : <code>{row.lotId}</code></>}{row.counterpartItemId&&<><br/>Article lié : <code>{row.counterpartItemId}</code></>}{row.reversesId&&<><br/>Annule : <code>{row.reversesId}</code></>}</p></details></li>)}</ol><nav className="stock-traceability-pages" aria-label="Pagination de l’activité"><Button variant="outline" disabled={activityBusy||cursors.length===1} onClick={()=>setCursors(v=>v.slice(0,-1))}>Activité précédente</Button><span>Page {cursors.length}</span><Button variant="outline" disabled={activityBusy||!activity.nextCursor||activity.isDone} onClick={()=>setCursors(v=>[...v,activity.nextCursor??undefined])}>Activité suivante</Button></nav></>}
    </section>
  </>;
}
