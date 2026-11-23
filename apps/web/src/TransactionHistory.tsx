import { useEffect, useRef, useState } from 'react';
import {allocatedSaleCost} from './lib/financialValues';
import { FiArrowLeft, FiArrowUpRight, FiCheckCircle, FiClock, FiFileText, FiSearch, FiXCircle } from 'react-icons/fi';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog';
import { ItemThumbnail } from './ItemThumbnail';
import { ReadPagination, type useReadPage } from './useReadPage';
import { paymentDetail, paymentStatusLabel } from './SalePaymentEditor';
import { formatDate, formatMoney } from './shopFormat';
import type { Sale } from './main';
import './transaction-history.css';
import { SaleTickets } from './SaleTickets';
import { SalePaymentHistory } from './SalePaymentHistory';
import type { Request } from './GradingCompanies';

type Pagination = ReturnType<typeof useReadPage>;
type Filters = { search: string; status: string; origin: string; payment: string; from: string; to: string };
type Props = {
  request: Request; rows: Sale[]; pagination: Pagination; apiBase: string; busy: boolean; mutationBlocked?: boolean; error: string;
  filters: Filters; onFiltersChange: (value: Filters) => void;
  onCollect: (sale: Sale) => void; onCancel: (id: string) => Promise<boolean>; onDocuments: () => void; onNewSale: () => void;
};
const statusLabel = (status: string) => status === 'active' ? 'Confirmée' : status === 'cancelled' ? 'Annulée' : status;
export function SalesHistoryWorkspace({request,rows,pagination,apiBase,busy,mutationBlocked=false,error,filters,onFiltersChange,onCollect,onCancel,onDocuments,onNewSale}:Props) {
  const [selectedId,setSelectedId] = useState<string|null>(null);
  const detailHeading=useRef<HTMLHeadingElement>(null);
  const opener=useRef<HTMLElement|null>(null);
  const openDetail=(id:string)=>{opener.current=document.activeElement as HTMLElement;setSelectedId(id);};
  const closeDetail=()=>{setSelectedId(null);requestAnimationFrame(()=>opener.current?.focus({preventScroll:true}));};
  useEffect(()=>{if(selectedId)detailHeading.current?.focus({preventScroll:true});},[selectedId]);
  const [cancelId,setCancelId] = useState<string|null>(null);
  const selected = rows.find(row=>row._id===selectedId);
  const cancelled = rows.find(row=>row._id===cancelId);
  const change = (patch:Partial<Filters>) => {setSelectedId(null);onFiltersChange({...filters,...patch});};
  const hasFilters = !!filters.search.trim() || filters.status !== 'all' || filters.origin !== 'all' || filters.payment !== 'all' || !!filters.from || !!filters.to;
  const clearFilters = () => change({search:'',status:'all',origin:'all',payment:'all',from:'',to:''});
  return <section className="transaction-history" aria-label="Historique des ventes">
    <div className="history-filters">
      <label className="history-search"><FiSearch aria-hidden="true"/><span className="sr-only">Rechercher une vente</span><Input type="search" placeholder="Article, contact ou référence…" value={filters.search} onChange={e=>change({search:e.target.value})}/></label>
      <label>Encaissement<select value={filters.payment} onChange={e=>change({payment:e.target.value})}><option value="all">Tous</option><option value="pending">À encaisser</option><option value="received">Reçus</option><option value="unknown">Non renseignés</option></select></label>
      <label>Statut<select value={filters.status} onChange={e=>change({status:e.target.value})}><option value="all">Toutes les ventes</option><option value="active">Confirmées</option><option value="cancelled">Annulées</option></select></label>
      <label>Origine<select value={filters.origin} onChange={e=>change({origin:e.target.value})}><option value="all">Toutes les origines</option><option value="purchase">Rachats</option><option value="supplier">Fournisseurs</option><option value="consignment">Dépôts-ventes</option></select></label>
      <label>Du<Input type="date" value={filters.from} onChange={e=>change({from:e.target.value})}/></label><label>Au<Input type="date" value={filters.to} onChange={e=>change({to:e.target.value})}/></label>
    </div>
    {hasFilters && <Button variant="link" onClick={clearFilters}>Effacer les filtres</Button>}
    {error&&<p role="alert" className="error">{error}</p>}
    <div className={`history-split ${selected?'has-detail':''}`}>
      <div className="history-list">
        <div className="history-table-wrap"><table><thead><tr><th>Article</th><th>Date</th><th>État</th><th className="money">Vente</th><th><span className="sr-only">Détail</span></th></tr></thead>
          <tbody>{rows.map(sale=><tr key={sale._id} data-selected={selectedId===sale._id}>
            <td><button className="history-product" onClick={()=>openDetail(sale._id)} aria-label={`Voir la vente de ${sale.itemName}`}><ItemThumbnail name={sale.itemName} catalogueImageUrl={sale.catalogueImageUrl} photos={sale.photos} apiBase={apiBase}/><span><strong>{sale.itemName}</strong><small>{sale.identifier || sale.series || (sale.origin==='consignment'?'Dépôt-vente':'Stock boutique')}</small></span></button></td>
            <td>{formatDate(sale.occurredAt)}</td><td><span className={`history-status ${sale.status==='cancelled'?'is-cancelled':sale.paymentStatus==='received'?'is-received':'is-pending'}`}>{sale.status==='cancelled'?<FiXCircle/>:sale.paymentStatus==='received'?<FiCheckCircle/>:<FiClock/>}{sale.status==='cancelled'?'Annulée':paymentStatusLabel(sale)}</span></td><td className="money"><strong>{formatMoney(sale.salePriceCents)}</strong></td><td><Button variant="ghost" size="icon" aria-label={`Détail de ${sale.itemName}`} onClick={()=>openDetail(sale._id)}><FiArrowUpRight/></Button></td>
          </tr>)}</tbody></table></div>
        <ReadPagination data={pagination} emptyState={<div className="workspace-empty">
          <FiFileText aria-hidden="true"/>
          <h2>{pagination.hasNext || pagination.hasPrevious ? 'Aucune vente dans cette page' : hasFilters ? 'Aucune vente ne correspond' : 'Aucune vente enregistrée'}</h2>
          <p>{pagination.hasNext ? 'Poursuivez avec Suivant pour parcourir les autres ventes correspondant aux filtres.' : pagination.hasPrevious ? 'Revenez à la page précédente ou ajustez les filtres.' : hasFilters ? 'Vos filtres sont conservés. Modifiez-les pour élargir la recherche.' : 'Les ventes et leurs encaissements apparaîtront ici après confirmation du panier.'}</p>
          {hasFilters ? <Button variant="outline" onClick={clearFilters}>Effacer les filtres</Button> : !pagination.hasPrevious && !pagination.hasNext && <Button variant="outline" onClick={onNewSale}>Préparer une vente</Button>}
        </div>}/>
      </div>
      {selected&&<aside className="history-detail" aria-label="Détail de la vente">
        <Button variant="link" onClick={closeDetail}><FiArrowLeft/>Retour à la liste</Button>
        <header><span className="history-eyebrow">VENTE {statusLabel(selected.status).toLocaleUpperCase('fr')}</span><h2 ref={detailHeading} tabIndex={-1}>{selected.itemName}</h2><p>{formatDate(selected.occurredAt)}</p><strong className="history-detail-total">{formatMoney(selected.salePriceCents)}</strong></header>
        <dl><div><dt>Encaissement</dt><dd>{paymentStatusLabel(selected)}</dd></div>{selected.payment&&<div><dt>Répartition</dt><dd>{paymentDetail(selected.payment)}</dd></div>}{selected.customerName&&<div><dt>Client</dt><dd>{selected.customerName}</dd></div>}<div><dt>Provenance</dt><dd>{selected.origin==='consignment'?'Dépôt-vente':selected.origin==='supplier'?'Fournisseur':'Rachat'}</dd></div>{selected.purchaseReference&&<div><dt>Acquisition</dt><dd>{selected.purchaseReference}</dd></div>}{selected.sellerName&&<div><dt>Contact d’origine</dt><dd>{selected.sellerName}</dd></div>}{selected.origin==='consignment'?<><div><dt>Commission</dt><dd>{selected.commissionCents==null?'Non renseignée':formatMoney(selected.commissionCents)}</dd></div><div><dt>Part du déposant</dt><dd>{selected.depositorAmountCents==null?'Non renseignée':formatMoney(selected.depositorAmountCents)}</dd></div></>:<div><dt>Coût attribué</dt><dd>{allocatedSaleCost(selected)===null?'Non renseigné':formatMoney(allocatedSaleCost(selected)!)}</dd></div>}</dl>
        {selected.status==='cancelled'&&<p className="history-information">Cette vente est annulée. Son historique et ses pièces sont conservés.</p>}
        <SalePaymentHistory key={selected._id} saleId={selected._id} request={request}/>
        <div className="history-detail-actions">{selected.status==='active'&&<Button disabled={busy||mutationBlocked} onClick={()=>onCollect(selected)}>{selected.paymentStatus==='received'?'Corriger l’encaissement':'Enregistrer le paiement reçu'}</Button>}<SaleTickets key={selected._id} saleIds={[selected._id]} request={request}/><Button variant="link" onClick={onDocuments}><FiFileText/>Tous les documents</Button>{selected.status==='active'&&<Button variant="link" className="history-destructive" disabled={busy||mutationBlocked} onClick={()=>setCancelId(selected._id)}>Annuler cette vente</Button>}</div>
      </aside>}
    </div>
    <Dialog open={!!cancelled} onOpenChange={open=>{if(!open&&!busy)setCancelId(null);}}><DialogContent className="transaction-dialog"><DialogTitle>Annuler la vente ?</DialogTitle><DialogDescription>{cancelled?.itemName} · {formatMoney(cancelled?.salePriceCents??0)}. Les quantités et les allocations seront restaurées. L’historique sera conservé.</DialogDescription>{error&&<p role="alert" className="error">{error}</p>}<div className="actions"><Button variant="outline" disabled={busy} onClick={()=>setCancelId(null)}>Conserver la vente</Button><Button variant="destructive" disabled={busy} onClick={()=>{if(cancelId)void onCancel(cancelId).then(ok=>{if(ok)setCancelId(null);});}}>{busy?'Annulation…':'Confirmer l’annulation'}</Button></div></DialogContent></Dialog>
  </section>;
}

type Conflict = {_id:string;itemName:string;itemId:string;occurredAt:number;salePriceCents:number};
export function SaleConflictsWorkspace({rows,pagination,notes,onNote,onResolve,busy,error}:{rows:Conflict[];pagination:Pagination;notes:Record<string,string>;onNote:(id:string,value:string)=>void;onResolve:(id:string)=>Promise<void>;busy:boolean;error:string}) {
  const [selected,setSelected] = useState<string|null>(null);
  const row = rows.find(r=>r._id===selected);
  return <section className="transaction-history"><div className="history-information"><h2>Vérifier les ventes concurrentes</h2><p>Une vente n’a pas pu être appliquée au stock. Vérifiez le paiement et la situation réelle, puis consignez le traitement effectué.</p></div>{error&&<p role="alert" className="error">{error}</p>}<div className="history-table-wrap"><table><thead><tr><th>Article</th><th>Date</th><th className="money">Montant demandé</th><th>Traitement</th></tr></thead><tbody>{rows.map(c=><tr key={c._id}><td><strong>{c.itemName}</strong></td><td>{formatDate(c.occurredAt)}</td><td className="money">{formatMoney(c.salePriceCents)}</td><td><Button variant="outline" onClick={()=>setSelected(c._id)}>Examiner</Button></td></tr>)}</tbody></table></div><ReadPagination data={pagination}/><Dialog open={!!row} onOpenChange={open=>{if(!open&&!busy)setSelected(null);}}><DialogContent className="transaction-dialog"><DialogTitle>Résoudre le conflit</DialogTitle><DialogDescription>{row?.itemName} · {formatMoney(row?.salePriceCents??0)}. Cette action clôture le signalement ; elle ne crée pas une nouvelle vente et n’enregistre pas de remboursement.</DialogDescription><label>Note de résolution<textarea rows={4} value={row?notes[row._id]??'':''} onChange={e=>{if(row)onNote(row._id,e.target.value);}} placeholder="Expliquez la vérification et l’action effectuées."/></label>{error&&<p role="alert" className="error">{error}</p>}<Button disabled={busy||!row||!notes[row._id]?.trim()} onClick={()=>{if(row)void onResolve(row._id);}}>{busy?'Enregistrement…':'Marquer comme traité'}</Button></DialogContent></Dialog></section>;
}
