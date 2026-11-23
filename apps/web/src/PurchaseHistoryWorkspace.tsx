import { useEffect, useRef, useState } from 'react';
import {completeCostTotal} from './lib/financialValues';
const costLabel=(value:number|null|undefined)=>value==null?'Non renseigné':formatMoney(value);
import { FiArrowLeft, FiArrowUpRight, FiFileText, FiSearch } from 'react-icons/fi';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './components/ui/dialog';
import { ReceiptSigning } from './ReceiptSigning';
import { PurchaseCorrectionEditor } from './PurchaseCorrectionEditor';
import { formatDate, formatMoney, shopDateInput } from './shopFormat';
import type { Purchase } from './main';
import type { Request } from './GradingCompanies';
import './transaction-history.css';

type Filters={search:string;status:string;from:string;to:string;size:number};
type Props={
  rows:Purchase[];filters:Filters;onFiltersChange:(filters:Filters)=>void;page:number;pages:number;total:number;onPage:(page:number)=>void;
  loading:boolean;busy:boolean;error:string;onRetry:()=>void;apiBase:string;request:Request;
  onCorrected:()=>Promise<void>;onValidate:(purchase:Purchase)=>Promise<void>;onCancel:(purchase:Purchase)=>Promise<boolean>;onDownload:(purchase:Purchase)=>Promise<void>;
  dates:Record<string,string>;onDate:(id:string,date:string)=>void;onSaveDate:(purchase:Purchase)=>Promise<void>;
  attachments:Record<string,{_id:string;filename:string}[]>;onAttachments:(id:string)=>Promise<void>;
};
const statusLabel=(value:string)=>value==='pending'?'En attente':value==='cancelled'?'Annulé':'Validé';
export function PurchaseHistoryWorkspace(p:Props){
  const [detail,setDetail]=useState<string|null>(null),[cancel,setCancel]=useState(false),[correctionId,setCorrectionId]=useState<string|null>(null);
  const scroll=useRef(0);
  const heading=useRef<HTMLHeadingElement>(null);
  const rowButtons=useRef(new Map<string,HTMLButtonElement>());
  useEffect(()=>{if(detail)heading.current?.focus({preventScroll:true});},[detail]);
  const row=p.rows.find(r=>r._id===detail);
  const change=(patch:Partial<Filters>)=>{setDetail(null);p.onFiltersChange({...p.filters,...patch});};
  const open=(id:string)=>{scroll.current=window.scrollY;setDetail(id);requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'instant'}));};
  const close=()=>{const prior=detail;setDetail(null);requestAnimationFrame(()=>{if(prior)rowButtons.current.get(prior)?.focus({preventScroll:true});window.scrollTo({top:scroll.current,behavior:'instant'});});};
  return <section className="transaction-history purchase-history-workspace">
    {p.error&&<p role="alert" className="error">{p.error}<Button variant="link" onClick={p.onRetry}>Réessayer</Button></p>}
    {row?<>
      <Button variant="link" className="history-back" onClick={close}><FiArrowLeft/>Retour aux rachats</Button>
      <div className="purchase-detail-heading"><div><span className="history-eyebrow">{statusLabel(row.status).toUpperCase()}</span><h2 ref={heading} tabIndex={-1}>{row.reference}</h2><p>{row.sellerName} · {formatDate(row.occurredAt)}</p></div><strong>{costLabel(completeCostTotal(row.items.map(item=>item.purchasePriceCents)))}</strong></div>
      <div className="purchase-detail-grid"><div>
        <div className="history-table-wrap"><table><thead><tr><th>Carte</th><th>État / gradation</th><th className="money">Rachat</th></tr></thead><tbody>{row.items.map(item=><tr key={item._id}><td><strong>{item.name}</strong><small className="history-cell-note">{[item.series,item.identifier,item.language?.toUpperCase()].filter(Boolean).join(' · ')}</small></td><td>{item.gradingCompany?`${item.gradingCompany} ${item.gradingGrade??''}`:item.condition??'—'}</td><td className="money">{costLabel(item.purchasePriceCents)}</td></tr>)}</tbody></table></div>
        {(row.buyerNote||row.sellerNote)&&<div className="purchase-notes"><h3>Notes du bordereau</h3>{row.buyerNote&&<div><strong>Acheteur</strong><p>{row.buyerNote}</p></div>}{row.sellerNote&&<div><strong>Vendeur</strong><p>{row.sellerNote}</p></div>}</div>}
        <section className="purchase-evidence"><h3>Photos et justificatifs</h3><div className="purchase-evidence-links">{row.items.flatMap(item=>(item.photos??[]).map(photo=><a key={photo._id} href={`${p.apiBase}/attachments/${encodeURIComponent(photo._id)}/download`}>{item.name} · {photo.filename}</a>))}{(p.attachments[row._id]??[]).map(file=><a key={file._id} href={`${p.apiBase}/attachments/${encodeURIComponent(file._id)}/download`}>{file.filename}</a>)}</div><Button variant="outline" onClick={()=>void p.onAttachments(row._id)}>Charger les justificatifs</Button></section>
      </div><aside className="history-detail">
        <h3>Gestion du rachat</h3><Button variant="outline" disabled={p.busy||row.status==='cancelled'} onClick={()=>setCorrectionId(row._id)}>Corriger les cartes et montants</Button><h3>Documents</h3><p>Les exemplaires signés restent conservés dans leur version d’origine.</p><div className="history-detail-actions"><Button variant="outline" disabled={p.busy} onClick={()=>void p.onDownload(row)}><FiFileText/>Bordereau non signé PDF</Button><ReceiptSigning kind="purchase" targetId={row._id} request={p.request} allowSigning={row.status!=='cancelled'}/></div>
        <div className="purchase-date-editor"><label>Date du rachat<Input type="date" value={p.dates[row._id]??shopDateInput(new Date(row.occurredAt))} onChange={e=>p.onDate(row._id,e.target.value)}/></label><Button variant="outline" disabled={p.busy} onClick={()=>void p.onSaveDate(row)}>Enregistrer la date</Button></div>
        {row.status==='pending'&&<div className="history-detail-actions"><p>La signature du bordereau ne valide pas automatiquement l’entrée au stock.</p><Button disabled={p.busy} onClick={()=>void p.onValidate(row)}>Valider et ajouter au stock</Button><Button variant="link" className="history-destructive" disabled={p.busy} onClick={()=>setCancel(true)}>Annuler ce rachat</Button></div>}
      </aside></div>
      <Dialog open={cancel} onOpenChange={value=>{if(!p.busy)setCancel(value);}}><DialogContent className="transaction-dialog"><DialogTitle>Annuler le rachat en attente ?</DialogTitle><DialogDescription>{row.reference}. Les cartes ne seront pas ajoutées au stock. Le dossier et ses documents seront conservés.</DialogDescription><div className="actions"><Button variant="outline" disabled={p.busy} onClick={()=>setCancel(false)}>Conserver le rachat</Button><Button variant="destructive" disabled={p.busy} onClick={()=>void p.onCancel(row).then(ok=>{if(ok)setCancel(false);})}>Confirmer l’annulation</Button></div></DialogContent></Dialog>
    </>:<>
      <div className="history-filters"><label className="history-search"><FiSearch aria-hidden="true"/><span className="sr-only">Rechercher un rachat</span><Input type="search" value={p.filters.search} placeholder="Référence ou contact…" onChange={e=>change({search:e.target.value})}/></label><label>Statut<select value={p.filters.status} onChange={e=>change({status:e.target.value})}><option value="all">Tous les rachats</option><option value="pending">En attente</option><option value="active">Validés</option><option value="cancelled">Annulés</option></select></label><label>Du<Input type="date" value={p.filters.from} onChange={e=>change({from:e.target.value})}/></label><label>Au<Input type="date" value={p.filters.to} onChange={e=>change({to:e.target.value})}/></label></div>
      <div className="history-count"><span>{p.total} rachat{p.total!==1?'s':''}</span><label>Par page<select value={p.filters.size} onChange={e=>change({size:Number(e.target.value)})}>{[12,24,48].map(n=><option key={n}>{n}</option>)}</select></label><Button variant="link" onClick={()=>change({search:'',status:'all',from:'',to:''})}>Effacer les filtres</Button></div>
      {p.loading?<p role="status">Chargement des rachats…</p>:<div className="history-table-wrap"><table><thead><tr><th>Référence / contact</th><th>Date</th><th>Statut</th><th className="money">Cartes</th><th className="money">Total</th><th><span className="sr-only">Détail</span></th></tr></thead><tbody>{p.rows.map(purchase=><tr key={purchase._id}><td><button ref={element=>{if(element)rowButtons.current.set(purchase._id,element);else rowButtons.current.delete(purchase._id);}} className="history-product" onClick={()=>open(purchase._id)}><span><strong>{purchase.reference}</strong><small>{purchase.sellerName}</small></span></button></td><td>{formatDate(purchase.occurredAt)}</td><td><span className={`history-status ${purchase.status==='active'?'is-received':purchase.status==='pending'?'is-pending':'is-cancelled'}`}>{statusLabel(purchase.status)}</span></td><td className="money">{purchase.items.length}</td><td className="money"><strong>{costLabel(completeCostTotal(purchase.items.map(item=>item.purchasePriceCents)))}</strong></td><td><Button variant="ghost" size="icon" aria-label={`Ouvrir le rachat ${purchase.reference}`} onClick={()=>open(purchase._id)}><FiArrowUpRight/></Button></td></tr>)}</tbody></table>{!p.rows.length&&!p.error&&<div className="workspace-empty"><FiFileText/><h2>Aucun rachat à afficher</h2><p>Modifiez les filtres ou créez votre premier rachat.</p></div>}</div>}
      <nav className="purchase-result-pages" aria-label="Pages des rachats"><Button variant="outline" disabled={p.loading||p.page<=1} onClick={()=>p.onPage(p.page-1)}>Précédent</Button><span>Page {p.page} / {p.pages}</span><Button variant="outline" disabled={p.loading||p.page>=p.pages} onClick={()=>p.onPage(p.page+1)}>Suivant</Button></nav>
    </>}
    <PurchaseCorrectionEditor purchaseId={correctionId} request={p.request} onClose={()=>setCorrectionId(null)} onSaved={p.onCorrected}/>
  </section>;
}
