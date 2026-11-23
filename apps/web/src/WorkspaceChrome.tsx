import { useEffect, useState } from 'react';
import { FiArchive, FiArrowDownLeft, FiArrowRight, FiBox, FiDownload, FiExternalLink, FiFileText, FiGrid, FiMenu, FiPackage, FiPlus, FiSettings, FiShoppingBag, FiShoppingCart, FiUsers } from 'react-icons/fi';
import { AppearanceControl, BrandLogo, brand } from './brand';
import { Button } from './components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog';
import { formatMoney as money } from './shopFormat';

export type WorkspacePage = 'dashboard' | 'stock' | 'sales' | 'saleSummary' | 'salesHistory' | 'saleConflicts' | 'purchases' | 'purchaseHistory' | 'inventoryOperations' | 'consignments' | 'consignmentNew' | 'consignmentPayouts' | 'clients' | 'documents' | 'exports' | 'settings';
const destinations = [
  ['dashboard', 'Vue d’ensemble', FiGrid], ['stock', 'Stock', FiPackage],
  ['sales', 'Ventes', FiShoppingCart], ['purchaseHistory', 'Achats', FiShoppingBag],
  ['consignments', 'Dépôts-ventes', FiArchive], ['clients', 'Contacts', FiUsers],
  ['documents', 'Documents', FiFileText], ['exports', 'Exports', FiDownload], ['settings', 'Paramètres', FiSettings],
] as const;
const pageCopy: Record<WorkspacePage, [string, string]> = {
  dashboard: ['Vue d’ensemble', 'Les chiffres et les mouvements de votre boutique.'],
  stock: ['Stock', 'Tous vos articles, leurs lots et leur disponibilité.'],
  sales: ['Vendre', 'Sélectionnez les articles. Votre panier vous suit dans l’espace de gestion.'],
  saleSummary: ['Votre panier', 'Vérifiez les quantités, les prix et le règlement.'],
  salesHistory: ['Ventes', 'Historique, encaissements et corrections.'], saleConflicts: ['Conflits de vente', 'Vérifiez les opérations qui demandent votre attention.'],
  purchaseHistory: ['Achats', 'Rachats, acquisitions en attente et réceptions fournisseur.'],
  purchases: ['Nouveau rachat', 'Un contact, des articles, puis un document à signer.'],
  inventoryOperations: ['Achats et mouvements', 'Réceptions fournisseur, dons et ouvertures de displays.'],
  consignments: ['Dépôts-ventes', 'Les articles confiés, leurs accords et les soldes à reverser.'],
  consignmentNew: ['Nouveau dépôt', 'Préparez les articles et les conditions avec le déposant.'],
  consignmentPayouts: ['Versements', 'Suivez les soldes et les paiements aux déposants.'],
  clients: ['Contacts', 'Vendeurs, clients, fournisseurs et déposants.'], documents: ['Documents', 'Vos originaux archivés et l’historique des envois.'],
  exports: ['Exports', 'Retrouvez vos données dans un classeur de gestion.'], settings: ['Paramètres', 'Votre compte, votre signataire et les sociétés de gradation.'],
};
function section(page: WorkspacePage): WorkspacePage {
  if (['saleSummary', 'salesHistory', 'saleConflicts'].includes(page)) return 'sales';
  if (['purchases', 'inventoryOperations'].includes(page)) return 'purchaseHistory';
  if (['consignmentNew', 'consignmentPayouts'].includes(page)) return 'consignments';
  return page;
}
type Props = {
  page: WorkspacePage; paths: Record<WorkspacePage, string>; navigate: (page: WorkspacePage) => void;
  basketCount: number; basketTotalCents: number; addStockOpen: boolean; onAddStockOpenChange: (open: boolean) => void;
};
export function WorkspaceChrome({ page, paths, navigate, basketCount, basketTotalCents, addStockOpen, onAddStockOpenChange }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [page]);
  const active = section(page);
  const go = (destination: WorkspacePage) => { setMenuOpen(false); onAddStockOpenChange(false); navigate(destination); };
  const nav = <nav className="workspace-navigation" aria-label="Espace de gestion">{destinations.map(([destination, label, Icon]) => <a key={destination} href={paths[destination]} aria-current={active === destination ? 'page' : undefined} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); go(destination); }}><Icon aria-hidden="true" /><span>{label}</span>{destination === 'sales' && basketCount > 0 && <span className="workspace-nav-count">{basketCount}</span>}</a>)}</nav>;
  const tabs: [WorkspacePage, string][] = active === 'sales' ? [['sales', 'Sélection'], ['saleSummary', 'Panier'], ['salesHistory', 'Historique'], ['saleConflicts', 'Conflits']] : active === 'purchaseHistory' ? [['purchaseHistory', 'Rachats'], ['inventoryOperations', 'Fournisseurs et mouvements']] : active === 'consignments' ? [['consignments', 'Dossiers'], ['consignmentPayouts', 'Versements']] : [];
  return <>
    <a href="#workspace-content" className="workspace-skip">Aller au contenu</a>
    <aside className="workspace-rail">
      <a href={paths.dashboard} className="workspace-brand" onClick={event => { event.preventDefault(); go('dashboard'); }}><BrandLogo decorative /><span>{brand.name}<small>Espace de gestion</small></span></a>
      <p className="workspace-nav-label">BOUTIQUE</p>{nav}
      <div className="workspace-rail-bottom"><a href="/convention" target="_blank" rel="noreferrer"><FiExternalLink aria-hidden="true" /> Catalogue Convention</a><AppearanceControl /><div className="workspace-legal"><a href="/mentions-legales">Mentions légales</a><a href="/confidentialite">Confidentialité</a></div></div>
    </aside>
    <div className="workspace-topbar">
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <Button variant="ghost" size="icon" className="workspace-menu" aria-label="Ouvrir la navigation" onClick={() => setMenuOpen(true)}><FiMenu /></Button>
        <DialogContent className="workspace-nav-dialog"><DialogTitle>{brand.name}</DialogTitle><DialogDescription>Espace de gestion</DialogDescription>{nav}<AppearanceControl /></DialogContent>
      </Dialog>
      <span className="workspace-location">Boutique <span aria-hidden="true">/</span> <strong>{destinations.find(([p]) => p === active)?.[1]}</strong></span>
      <div className="workspace-topbar-actions"><Button variant="outline" onClick={() => go('saleSummary')} aria-label={`Ouvrir le panier, ${basketCount} unité(s)`}><FiShoppingCart aria-hidden="true" /><span>Panier</span><span className="workspace-basket-count">{basketCount}</span>{basketCount > 0 && <span className="workspace-basket-total">{money(basketTotalCents)}</span>}</Button><Button size="icon" variant="ghost" onClick={() => go('settings')} aria-label="Mon compte"><FiSettings /></Button></div>
    </div>
    <div className="workspace-titlebar" id="workspace-content" tabIndex={-1}><div><h1>{pageCopy[page][0]}</h1><p>{pageCopy[page][1]}</p></div><div className="actions">
      {['dashboard', 'stock'].includes(page) && <Button onClick={() => onAddStockOpenChange(true)}><FiPlus aria-hidden="true" />Ajouter au stock</Button>}
      {page === 'purchaseHistory' && <Button onClick={() => go('purchases')}><FiPlus aria-hidden="true" />Nouveau rachat</Button>}
      {page === 'consignments' && <Button onClick={() => go('consignmentNew')}><FiPlus aria-hidden="true" />Nouveau dépôt</Button>}
      {page === 'salesHistory' && <Button onClick={() => go('sales')}><FiPlus aria-hidden="true" />Nouvelle vente</Button>}
    </div></div>
    {tabs.length > 0 && <nav className="workspace-tabs" aria-label="Navigation de la section">{tabs.map(([destination, label]) => <a href={paths[destination]} key={destination} aria-current={page === destination ? 'page' : undefined} onClick={event => { event.preventDefault(); go(destination); }}>{label}</a>)}</nav>}
    <Dialog open={addStockOpen} onOpenChange={onAddStockOpenChange}><DialogContent className="workspace-acquisition-dialog"><DialogTitle>Ajouter au stock</DialogTitle><DialogDescription>Choisissez l’origine des articles pour ouvrir le bon dossier.</DialogDescription><div className="acquisition-choices">{([
      ['purchases', 'Rachat', 'Acheter des articles à un particulier.', FiArrowDownLeft],
      ['inventoryOperations', 'Achat fournisseur', 'Réceptionner des produits, leurs lots et leur facture.', FiBox],
      ['consignmentNew', 'Dépôt-vente', 'Préparer un accord et les articles confiés.', FiArchive],
    ] as const).map(([destination, title, description, Icon]) => <Button key={destination} variant="outline" onClick={() => go(destination)}><Icon aria-hidden="true" /><span><strong>{title}</strong><small>{description}</small></span><FiArrowRight aria-hidden="true" /></Button>)}</div></DialogContent></Dialog>
  </>;
}
