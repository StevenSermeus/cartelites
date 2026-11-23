import { SeriesFilter } from './SeriesInput';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog';
import { SalesHistoryWorkspace, SaleConflictsWorkspace } from './TransactionHistory';
import { PurchaseHistoryWorkspace } from './PurchaseHistoryWorkspace';
import { SaleTickets } from './SaleTickets';
import { SalesWorkspace } from './SalesWorkspace';
import { ContactsWorkspace } from './ContactsWorkspace';
import { StockWorkspace } from './StockWorkspace';
import { WorkspaceChrome, type WorkspacePage } from './WorkspaceChrome';
import { AuthenticationPanel } from './AuthenticationPanel';
import DocumentsPage from './DocumentsPage';
import { shopDateInput,shopDateTimestamp } from './shopFormat';
import { currencySymbol, shopCurrency, shopTimezone } from './shopFormat';
import { RequestGenerations } from './lib/operationAttempt';
import { SubmittedAttempt, PendingPurchasePhotos, RequestFailure, type SubmissionState } from './lib/submittedAttempt';
import {parseAuthStatus,type AuthStatus} from './lib/authStatus';
import { AccountSession, AccountRecoveryVault, hasRetainedAccountWork, type ScopedRequestInit } from './lib/accountScope';
import { submissionSummary, formatSubmissionSummary } from './lib/submissionSummary';
import { InventoryOperations } from './InventoryOperations';
import { GradingCompanies, useGradingCompanies } from './GradingCompanies';
import { PublicProductDetail } from './PublicProductDetail';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { searchTcgdex } from '../../../packages/domain/src/tcgdexSearch';
import { ProductEditor } from './ProductEditor';
import { optimizeUploadImage } from './optimizeImage';
import BuybackPage, { PublicNavigation, ShopPage } from './BuybackPage';
import { ReceiptSigning, ReceiptSigningPage, parseSignaturePath } from './ReceiptSigning';
import { FiArchive, FiDownload, FiGrid, FiList, FiPackage, FiSettings, FiShoppingBag, FiShoppingCart, FiUsers, FiExternalLink } from 'react-icons/fi';
import { ConventionPhoto } from './ConventionPhoto';
import { API, realtime, publicRealtime } from './realtime';
import { ItemThumbnail } from './ItemThumbnail';
import { ClientPicker } from './ClientPicker';
import { useReadPage, ReadPagination } from './useReadPage';
import { StockVisibilityToolbar } from './StockVisibilityToolbar';
import { SalePaymentEditor, newPaymentDraft, paymentPayload, paymentStatusLabel, paymentDetail, type SalePayment, type PaymentDraft } from './SalePaymentEditor';
import ConsignmentsPage, { type Consignment, type ConsignmentBalances, money } from './ConsignmentsPage';
import { PurchaseEditor } from './PurchaseEditor';
import { searchRiftbound, type Tcg } from '../../../packages/domain/src/riftbound';
import { TcgChoices } from './TcgChoices';
import {moneyCell,moneyDifference,allocatedSaleCost,stockValuation} from './lib/financialValues';
import {readExportPages,exportBalances,exportDate} from './lib/exportPages';
import { loadReceiptLogo } from './receiptLogo';
import { LegalPage, legalPages, SiteFooter, type LegalPath } from './LegalPages';
import { brand, BrandIdentity, AppearanceControl } from './brand';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPurchaseReceiptPdf, type SignatoryProfile } from './receiptPdf';
import './style.css';
import './workspace.css';

const DashboardPage = lazy(() => import('./DashboardPage'));
const SettingsPage = lazy(() => import('./SettingsPage'));

type Item = {
  quantity?: number;
  hiddenFromCatalogue?: boolean;
  priceVisible?: boolean;
  description?: string;
  origin?: 'purchase' | 'consignment' | 'supplier';
  productType?: 'card' | 'sealed' | 'other';
  commissionRateBps?: number;
  agreedPriceCents?: number;
  _id: string;
  name: string;
  tcg?: 'pokemon' | 'riftbound' | 'other';
  series?: string;
  identifier?: string;
  serialNumber?: string;
  catalogueImageUrl?: string;
  language?: 'fr' | 'en' | 'ja' | 'zh';
  condition?: 'M' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';
  gradingCompany?: string;
  gradingGrade?: string;
  gradingCertificate?: string;
  gradingNotes?: string;
  marketValueCents?: number;
  discountPercent?: number;
  purchasePriceCents: number|null;
  askingPriceCents?: number;
  photos?: { _id: string; filename: string }[];
  purchaseOccurredAt: number;
  status: string;
  sellerName: string;
  purchaseReference: string;
  vatRegime: 'margin' | 'other';
};
function consignmentSplitLabel(item: Item, value?: string) {
  const price = value === undefined ? item.askingPriceCents ?? 0 : Math.round(Number(value.replace(',', '.')) * 100);
  if (!Number.isFinite(price) || price < 0) return 'Saisissez un prix valide.';
  const commission = Math.round(price * (item.commissionRateBps ?? 3000) / 10000);
  return `Commission : ${money(commission)} · Au déposant : ${money(price - commission)}${price < (item.agreedPriceCents ?? item.askingPriceCents ?? 0) ? ' · Prix inférieur à l’accord : autorisation requise' : ''}`;
}
type GradingCompany = string;
const gradingLogos: Record<GradingCompany, string> = {
  PSA: 'https://cdn.shopify.com/s/files/1/0618/5998/7608/files/psa-logo-2.png?v=1768810462',
  CollectAura: 'https://status.collectaura.com/collectaura-logo.png',
  PCA: 'https://primary.jwwb.nl/public/r/b/j/temp-profycumnjgwqpqpzroz/pca_logo-high.png?crop=1.6667%3A1&enable=upscale&enable-io=true&width=800',
  CCC: 'https://cccgrading.com/files/certificateur-cartes-de-collection-logo-full_006763bd90f3307d49ddfba936a02c5a.svg',
};
function GradingBadge({
  company,
  grade,
  certificate,
}: {
  company: GradingCompany;
  grade?: string;
  certificate?: string;
}) {
  const label =
    company === 'CollectAura' ? 'Collect Aura' : company === 'CCC' ? 'CCC Grading' : company;
  return (
    <div
      className={`grading-badge grading-badge--${company.toLowerCase()}`}
      aria-label={`${label}, note ${grade || 'non renseignée'}${certificate ? `, certificat ${certificate}` : ''}`}
    >
      {gradingLogos[company] ? <img className="grading-badge-logo" src={gradingLogos[company]} alt={label} loading="lazy" /> : <span>{label}</span>}
      <span className="grading-badge-grade">
        <small>GRADÉE</small>
        <strong>{grade || 'Note —'}</strong>
      </span>
      {certificate && <span className="grading-badge-cert">Cert. {certificate}</span>}
    </div>
  );
}
type Client = { _id: string; name: string; email?: string; phone?: string; address?: string };
export type PurchaseDraft = {
  included?: boolean;
  key: string;
  name: string;
  tcg?: 'pokemon' | 'riftbound' | 'other';
  series: string;
  identifier: string;
  marketValue: string;
  discountPercent: string;
  askingPrice: string;
  askingPriceTouched: boolean;
  photo: File | null;
  language?: 'fr' | 'en' | 'ja' | 'zh';
  condition?: 'M' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';
  gradingCompany?: string;
  gradingGrade?: string;
  gradingCertificate?: string;
  gradingNotes?: string;
  catalogueImageUrl?: string;
  catalogueCardId?: string;
  catalogueSetId?:string;
  availableLanguages?: CatalogLanguage[];
  cardSearch?: string;
  cardResults?: CatalogCard[];
  searching?: boolean;
  providerPage?: number;
  providerHasMore?: boolean;
};
type CatalogLanguage = 'fr' | 'en' | 'ja' | 'zh';
export type CatalogCard = {
  id: string;
  localId: string;
  name: string;
  image?: string;
  setName?: string;
  setId?:string;
  language: CatalogLanguage;
  availableLanguages?: CatalogLanguage[];
};
const cardLanguages = [
  { id: 'fr', name: 'Français' },
  { id: 'en', name: 'Anglais' },
  { id: 'ja', name: 'Japonais' },
] as const;

const cardConditions = [
  { id: 'M', name: 'Mint (M)' },
  { id: 'NM', name: 'Near Mint (NM)' },
  { id: 'EX', name: 'Excellent (EX)' },
  { id: 'GD', name: 'Good (GD)' },
  { id: 'LP', name: 'Light Played (LP)' },
  { id: 'PL', name: 'Played (PL)' },
  { id: 'PO', name: 'Poor (PO)' },
] as const;
const languageLabel = (id?: string) =>
  id === 'zh' ? 'Chinois' : cardLanguages.find((language) => language.id === id)?.name ?? 'Français';
const conditionLabel = (id?: string) =>
  cardConditions.find((condition) => condition.id === id)?.name ?? 'Near Mint (NM)';
const normalizeCardNumber = (value: string | number) => {
  const trimmed = String(value).trim().toLocaleLowerCase();
  return /^\d+$/.test(trimmed)
    ? trimmed.replace(/^0+(?=\d)/, '')
    : trimmed.replace(/[^a-z0-9]/g, '');
};
const normalizeCardName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, '');
const parseCardSearch = (term: string) => {
  const collectorNumber = term.match(/(?:^|\s)([a-z0-9]+)\s*\/\s*(\d+)(?:\s|$)/i);
  if (collectorNumber)
    return {
      localId: collectorNumber[1],
      denominator: Number(collectorNumber[2]),
      name: term.replace(collectorNumber[0], ' ').trim(),
    };
  if (/^\d+$/.test(term) || /^[a-z]*\d+[a-z]*$/i.test(term))
    return { localId: term, denominator: undefined, name: '' };
  return { localId: undefined, denominator: undefined, name: term };
};
export type Purchase = {
  buyerNote?: string;
  sellerNote?: string;
  _id: string;
  sellerId: string;
  reference: string;
  occurredAt: number;
  sellerName: string;
  status: string;
  items: Item[];
};
export type Sale = {
  quantity?:number;
  costCents?:number|null;
  catalogueImageUrl?: string;
  photos?: { _id: string; filename: string; contentType?: string }[];
  paymentStatus?: 'pending' | 'received';
  payment?: SalePayment;
  origin?: 'purchase' | 'consignment' | 'supplier';
  commissionRateBps?: number;
  commissionCents?: number;
  depositorAmountCents?: number;
  _id: string;
  itemId: string;
  itemName: string;
  series?: string;
  identifier?: string;
  language?: 'fr' | 'en' | 'ja' | 'zh';
  condition?: 'M' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';
  gradingCompany?: GradingCompany;
  gradingGrade?: string;
  gradingCertificate?: string;
  gradingNotes?: string;
  marketValueCents?: number;
  discountPercent?: number;
  askingPriceCents?: number;
  occurredAt: number;
  salePriceCents: number;
  purchaseReference: string;
  purchaseOccurredAt: number;
  purchasePriceCents: number|null;
  sellerName: string;
  vatRegime: 'margin' | 'other';
  customerName?: string;
  status: string;
};
type SaleConflict = {
  _id: string;
  itemName: string;
  itemId: string;
  occurredAt: number;
  salePriceCents: number;
};
type Attachment = { _id: string; filename: string; contentType: string; size: number };
type AdminPage = WorkspacePage;
const adminPagePaths: Record<AdminPage, string> = {
  documents: '/admin/documents',
  inventoryOperations: '/admin/inventory-operations',
  dashboard: '/admin/dashboard',
  clients: '/admin/clients',
  purchases: '/admin/purchases',
  purchaseHistory: '/admin/purchase-history',
  stock: '/admin/stock',
  sales: '/admin/sales',
  saleSummary: '/admin/sales/cart',
  salesHistory: '/admin/sales/history',
  saleConflicts: '/admin/sales/conflicts',
  settings: '/admin/settings',
  exports: '/admin/exports',
  consignments: '/admin/consignments',
  consignmentNew: '/admin/consignments/new',
  consignmentPayouts: '/admin/consignments/payouts',
};
function adminPageFromPath(path: string): AdminPage {
  const entry = Object.entries(adminPagePaths).find(([, route]) => route === path);
  return (entry?.[0] as AdminPage | undefined) ?? 'dashboard';
}
function localDateInputValue(date=new Date()){return shopDateInput(date);}
function dateAtCurrentLocalTime(value:string,timeSource=new Date()){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:shopTimezone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(timeSource);
 const get=(type:string)=>Number(parts.find(p=>p.type===type)!.value);
 return shopDateTimestamp(value,shopTimezone,get('hour'),get('minute'),get('second'))+timeSource.getMilliseconds();
}
let csrfToken: string | undefined;
let lastUserActivity = -Infinity;
const markWebActivity = () => { if (document.visibilityState === 'visible') lastUserActivity = Date.now(); };
function sessionActivityHeaders(): Record<string, string> {
  return document.visibilityState === 'visible' && Date.now() - lastUserActivity < 60_000
    ? { 'X-Session-Activity': '1' } : {};
}
async function rawRequest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(sessionActivityHeaders())) headers.set(key, value);
  headers.set('Content-Type', 'application/json');
  if (csrfToken && init.method && init.method !== 'GET') headers.set('X-CSRF-Token', csrfToken);
  const {assertAccountScope,...transportInit}=init as ScopedRequestInit;
  assertAccountScope?.();
  const r = await fetch(`${API}${path}`, { ...transportInit, headers, credentials: 'include' });
  assertAccountScope?.();
  csrfToken = r.headers.get('X-CSRF-Token') ?? csrfToken;
  if (!r.ok) {
    const payload = (await r.json().catch(() => ({}))) as { error?: string };
    const failure=(message:string)=>new RequestFailure(message,r.status,payload.error);
    if (payload.error === 'AUTH_SERVICE_UNAVAILABLE') throw failure('Le service de connexion est momentanément indisponible. Réessayez dans un instant.');
    if (payload.error === 'SALE_NOT_FOUND') throw failure('Cette vente est introuvable. Actualisez l’historique.');
    if (r.status === 404)
      throw failure(
        `Route API introuvable (${API}${path}). Vérifiez que l’API tourne sur le port 3001 et que VITE_API_URL pointe vers son adresse.`,
      );
    if (['PRICE_BELOW_AGREEMENT', 'SALE_BELOW_AGREED_PRICE', 'PRICE_BELOW_AGREED', 'CONSINGMENT_PRICE_TOO_LOW', 'CONSIGNMENT_PRICE_BELOW_AGREED', 'BELOW_AGREED_PRICE'].includes(payload.error ?? '')) throw failure('Le prix est inférieur à l’accord du déposant. Modifiez l’accord dans Dépôts-ventes après son autorisation.');
    if (payload.error === 'INVALID_SALE_PAYMENT') throw failure('Vérifiez les montants : espèces et virement doivent couvrir exactement le total de la vente.');
    if (payload.error === 'INVALID_SALE_PAYMENT_DATE') throw failure('La réception du paiement ne peut pas précéder le jour de la vente.');
    if (payload.error === 'SALE_CANCELLED') throw failure('Cette vente a été annulée. Son encaissement ne peut plus être modifié.');
    if (payload.error === 'INVALID_PAYMENT_DATE') throw failure('Le solde est insuffisant à cette date ou l’encaissement n’a pas encore été reçu.');
    if (payload.error === 'PAYMENT_EXCEEDS_BALANCE') throw failure('Le versement dépasse le solde dû au déposant. Actualisez les données.');
    if (payload.error === 'AUTHORIZATION_REQUIRED') throw failure('Indiquez l’autorisation du déposant pour modifier cet accord.');
    if (payload.error === 'INVALID_STOCK_SELECTION') throw failure('Sélectionnez entre 1 et 500 articles distincts du stock.');
    if (payload.error === 'ITEM_UNAVAILABLE') throw failure('Cet article n’est plus disponible. Actualisez les données.');
    if (payload.error === 'SALE_BEFORE_PURCHASE')
      throw failure('La date de vente ne peut pas précéder le jour du rachat ou du dépôt.');
    if (payload.error === 'ITEM_NOT_FOUND') throw failure('Carte introuvable dans votre stock.');
    if (payload.error === 'PURCHASE_DATE_AFTER_SALE')
      throw failure('Impossible de déplacer le rachat après une vente déjà enregistrée.');
    throw failure(payload.error ?? `Erreur serveur (${r.status})`);
  }
  const result = r.status === 204 ? null : await r.json();
  return result as T;
}
const request = rawRequest;
type ReadPage<T> = { items: T[]; nextCursor: string | null; isDone: boolean };
async function firstReadPage<T>(path: string): Promise<T[]> {
  const params = new URLSearchParams({ size: '25' });
  const page = await request<ReadPage<T>>(`${path}?${params}`);
  return page.items;
}
type PublicCard = {
  hasPhoto?: boolean;
  productType?: 'card' | 'sealed' | 'other';
  id: string;
  name: string;
  series: string;
  identifier: string;
  language: string;
  condition: string;
  gradingCompany?: GradingCompany;
  gradingGrade?: string;
  gradingNotes?: string;
  catalogueImageUrl?: string;
  salePriceCents?: number;
  quantity: number;
};
function ConventionCatalog() {
  const [detailId,setDetailId]=useState<string|null>(null);
  const [cards, setCards] = useState<PublicCard[]>([]);
  const [gradingCompanies,setGradingCompanies] = useState<string[]>([]);
  const [languages,setLanguages] = useState<string[]>([]);
  const [seriesOptions,setSeriesOptions] = useState<string[]>([]);
  const [series,setSeries] = useState('');
  const [language,setLanguage] = useState('');
  const [tcg, setTcg] = useState<Tcg | 'all'>('all');
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [minimum, setMinimum] = useState('');
  const [maximum, setMaximum] = useState('');
  const [gradingStatus, setGradingStatus] = useState<'all' | 'graded' | 'ungraded'>('all');
  const [gradingCompany, setGradingCompany] = useState<'all' | GradingCompany>('all');
  const [gradingGrade, setGradingGrade] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [catalogueSort,setCatalogueSort]=useState<'recent'|'name'|'price-asc'|'price-desc'>('recent');
  const [catalogueRetry,setCatalogueRetry]=useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setCursorHistory([null]);
    setPage(1);
  }, [tcg, series, language, search, minimum, maximum, gradingStatus, gradingCompany, gradingGrade, pageSize,catalogueSort]);
  useEffect(() => {
    setLoading(true);
    let active = true;
    setError('');
    let unsubscribe: (() => void) | undefined;
    const timer = window.setTimeout(
      () => {
        unsubscribe = publicRealtime.subscribe<{
          page: PublicCard[]; gradingCompanies: string[]; languages: string[]; series: string[]; totalCount: number; continueCursor: string; isDone: boolean;
        }>('operations:publicCatalogue', {
          tcg, series, language, search, sort:catalogueSort, gradingStatus, gradingCompany: gradingCompany === 'all' ? '' : gradingCompany,
          gradingGrade, paginationOpts: { numItems: pageSize, cursor: cursorHistory[page - 1] ?? null },
          ...(minimum ? { minPrice: Math.round(Number(minimum) * 100) } : {}),
          ...(maximum ? { maxPrice: Math.round(Number(maximum) * 100) } : {}),
        }, result => {
          if (!active) return;
          setCards(result.page); setTotalCount(result.totalCount);
          setGradingCompanies(result.gradingCompanies); setLanguages(result.languages); setSeriesOptions(result.series);
          setNextCursor(result.continueCursor); setIsDone(result.isDone);
          setLoading(false); setError('');
        }, reason => {
          if (active) { setCards([]); setError('Connexion au catalogue impossible. Vérifiez votre connexion puis réessayez.'); setLoading(false); }
        });
      },
      search ? 250 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
      unsubscribe?.();
    };
  }, [
    tcg,
    series,
    language,
    page,
    pageSize,
    search,
    minimum,
    maximum,
    gradingStatus,
    gradingCompany,
    gradingGrade,
    cursorHistory,catalogueSort,catalogueRetry,
  ]);
  const formatPrice = (cents: number) =>
    new Intl.NumberFormat('fr-BE', { style: 'currency', currency: shopCurrency }).format(cents / 100);
  const hasFilters = Boolean(
    tcg !== 'all' || series !== '' || language !== '' ||
      search.trim() ||
      minimum !== '' ||
      maximum !== '' ||
      gradingStatus !== 'all' ||
      gradingCompany !== 'all' ||
      gradingGrade.trim(),
  );
  const visible = cards;
  const currentPage = page;
  const pageCards = cards;
  const pagination = () => (
    <nav className="public-catalogue-pagination" aria-label="Pagination du catalogue">
      <Button
        type="button"
        className="secondary public-catalogue-page-button"
        onClick={() => setPage((current) => Math.max(1, current - 1))}
        disabled={loading || currentPage <= 1}
      >
        Précédent
      </Button>
      <span aria-live="polite">
        Page <strong>{currentPage}</strong>
      </span>
      <label className="public-catalogue-page-size-control">
        Cartes par page
        <select
          value={pageSize}
          onChange={(event) => {
            setPageSize(Number(event.target.value));
            setPage(1);
          }}
          aria-label="Nombre de cartes par page"
        >
          {[12, 24, 48].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <Button
        type="button"
        className="secondary public-catalogue-page-button"
        onClick={() => {
          if (nextCursor) {
            setCursorHistory((history) => [...history.slice(0, page), nextCursor]);
            setPage((current) => current + 1);
          }
        }}
        disabled={loading || isDone || !nextCursor}
      >
        Suivant
      </Button>
    </nav>
  );
  return (
    <main className="public-catalogue-page">
      <PublicNavigation active="catalogue" /><AppearanceControl />
      {detailId && <PublicProductDetail id={detailId} onClose={()=>setDetailId(null)} />}
      <header className="public-catalogue-hero">
        <BrandIdentity catalogue />
        <div className="public-catalogue-total" aria-live="polite">
          <strong>{totalCount}</strong>
          <span>cartes en stock</span>
        </div>
      </header>
      <section
        className="panel public-catalogue-tools"
        aria-label="Rechercher et filtrer les cartes"
      >
        <div className="public-catalogue-tools-heading">
          <div>
            <h2>Explorer le stock</h2>
            <p>Recherchez par nom, série ou numéro de carte.</p>
          </div>
          <span className="public-catalogue-result-count" aria-live="polite">
            {loading
              ? 'Chargement…'
              : `${visible.length} résultat${visible.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <TcgChoices value={tcg} all onChange={value => {setTcg(value); setSeries(''); setSeriesOptions([]);}} />
        <div className="form-grid public-catalogue-filters">
          <label className="public-catalogue-search-field">
            Recherche
            <Input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Ex. Dracaufeu, Écarlate et Violet, 232/091"
              autoComplete="off"
            />
          </label>
        </div>
        <label className="convention-series-filter">Série / extension
          <SeriesFilter value={series} onChange={setSeries} options={seriesOptions} />
          <small className="convention-series-status" style={{ visibility: loading ? 'visible' : 'hidden' }} role="status">{loading ? 'Chargement des séries…' : '\u00a0'}</small>
        </label>
        <details className="convention-advanced">
          <summary>Filtres avancés · langue, prix et gradation</summary>
          <div className="form-grid public-catalogue-filters">
            <label>Langue
              <select value={language} onChange={event=>setLanguage(event.target.value)}>
                <option value="">Toutes les langues</option>
                {[...new Set([...languages,...(language?[language]:[])])].map(value=><option key={value} value={value}>{languageLabel(value)}</option>)}
              </select>
            </label>
            <label>
              Prix minimum ({currencySymbol})
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={minimum}
                onChange={(event) => {
                  setMinimum(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              Prix maximum ({currencySymbol})
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={maximum}
                onChange={(event) => {
                  setMaximum(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              État de gradation
              <select
                value={gradingStatus}
                onChange={(event) => {
                  setGradingStatus(event.target.value as typeof gradingStatus);
                  setPage(1);
                }}
              >
                <option value="all">Toutes les cartes</option>
                <option value="graded">Gradées uniquement</option>
                <option value="ungraded">Non gradées uniquement</option>
              </select>
            </label>
            <label>
              Société de gradation
              <select
                value={gradingCompany}
                onChange={(event) => {
                  setGradingCompany(event.target.value as typeof gradingCompany);
                  setPage(1);
                }}
              >
                <option value="all">Toutes les sociétés</option>
                {[...new Set([...gradingCompanies,...(gradingCompany!=='all'?[gradingCompany]:[])])].map((company) => (
                  <option key={company} value={company}>
                    {company}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Note de gradation
              <Input
                type="search"
                value={gradingGrade}
                onChange={(event) => {
                  setGradingGrade(event.target.value);
                  setPage(1);
                }}
                placeholder="Ex. 10, Gem Mint, 9.5"
              />
            </label>
          </div>
        </details>
        {hasFilters && (
          <Button
            className="secondary public-catalogue-reset"
            type="button"
            onClick={() => {
              setTcg('all'); setLanguage(''); setSeries('');
              setSearch('');
              setMinimum('');
              setMaximum('');
              setGradingStatus('all');
              setGradingCompany('all');
              setGradingGrade('');
              setPage(1);
            }}
          >
            Effacer les filtres
          </Button>
        )}
      </section>
      {error ? (
        <section className="panel public-catalogue-state" role="alert">
          <h2>Le stock est momentanément indisponible</h2>
          <p>{error}</p><Button variant="outline" onClick={()=>setCatalogueRetry(v=>v+1)}>Réessayer</Button>
        </section>
      ) : loading || visible.length ? (
        <>
          <div className="public-catalogue-results-toolbar">
            <label className="catalogue-sort">Trier par<select value={catalogueSort} onChange={e=>setCatalogueSort(e.target.value as typeof catalogueSort)}><option value="recent">Ajouts récents</option><option value="name">Nom A–Z</option><option value="price-asc">Prix croissant</option><option value="price-desc">Prix décroissant</option></select></label>
            <span className="public-catalogue-result-summary" style={{ visibility: loading && !visible.length ? 'hidden' : 'visible' }}>
              {visible.length} carte{visible.length === 1 ? '' : 's'} trouvée
              {visible.length === 1 ? '' : 's'}
            </span>
            <div
              className="public-catalogue-layout-toggle"
              role="group"
              aria-label="Disposition des cartes"
            >
              <Button
                type="button"
                className={
                  layout === 'grid'
                    ? 'public-catalogue-layout-option is-active'
                    : 'public-catalogue-layout-option'
                }
                aria-pressed={layout === 'grid'}
                aria-label="Afficher en grille"
                title="Afficher en grille"
                onClick={() => setLayout('grid')}
              >
                <FiGrid className="public-catalogue-layout-icon" aria-hidden="true" focusable="false" />
              </Button>
              <Button
                type="button"
                className={
                  layout === 'list'
                    ? 'public-catalogue-layout-option is-active'
                    : 'public-catalogue-layout-option'
                }
                aria-pressed={layout === 'list'}
                aria-label="Afficher une carte par ligne"
                title="Afficher une carte par ligne"
                onClick={() => setLayout('list')}
              >
                <FiList className="public-catalogue-layout-icon" aria-hidden="true" focusable="false" />
              </Button>
            </div>
          </div>
          {pagination()}
          <section
            className={`public-catalogue-grid${layout === 'list' ? ' public-catalogue-list' : ''}`}
            aria-label="Cartes disponibles"
            aria-live="polite"
            aria-busy={loading}
          >
            {loading && !pageCards.length && Array.from({ length: pageSize }, (_, index) => (
              <article className="public-catalogue-card public-catalogue-skeleton" key={`placeholder-${index}`} aria-hidden="true">
                <div className="public-catalogue-image-wrap" />
                <div className="public-catalogue-card-details">
                  <span className="public-catalogue-skeleton-line" />
                  <span className="public-catalogue-skeleton-line" />
                  <span className="public-catalogue-skeleton-line" />
                  <span className="public-catalogue-skeleton-line" />
                </div>
              </article>
            ))}
            {pageCards.map((card) => (
              <article className="public-catalogue-card" key={card.id}>
                <button type="button" className="public-catalogue-image-wrap" disabled={loading} aria-label={`Voir ${card.name}`} onClick={()=>setDetailId(card.id)}>
                  <ConventionPhoto key={`${card.id}:${card.hasPhoto}`} {...card} apiBase={API} />
                </button>
                <div className="public-catalogue-card-details">
                  <div className="public-catalogue-card-title">
                    <h3><Button variant="link" className="product-detail-link" disabled={loading} onClick={()=>setDetailId(card.id)}>{card.name}</Button></h3>
                    <strong className="public-catalogue-price">
                      {card.salePriceCents === undefined ? 'Ouvert aux offres' : formatPrice(card.salePriceCents)}
                    </strong>
                  </div>
                  <p className="public-catalogue-series">{card.series || 'Série non renseignée'}</p>
                  <p className="public-catalogue-availability">{card.quantity} disponible{card.quantity > 1 ? 's' : ''}</p>
                  <div className="public-catalogue-tags">
                    {card.identifier && <span>N° {card.identifier}</span>}
                    {card.language && <span>{languageLabel(card.language)}</span>}
                    {(!card.productType || card.productType === 'card') && <span>{conditionLabel(card.condition)}</span>}{card.productType === 'sealed' && <span>Produit scellé</span>}{card.productType === 'other' && <span>Autre article</span>}
                  </div>
                  {card.gradingCompany && (
                    <GradingBadge company={card.gradingCompany} grade={card.gradingGrade} />
                  )}
                </div>
              </article>
            ))}
          </section>
          {pagination()}
        </>
      ) : (
        <section className="panel public-catalogue-state">
          <h2>Aucun article trouvé</h2>
          <p>Essayez un autre nom, numéro ou une plage de prix différente.</p>
          {hasFilters && (
            <Button
              className="secondary"
              type="button"
              onClick={() => {
                setTcg('all'); setLanguage(''); setSeries('');
                setSearch('');
                setMinimum('');
                setMaximum('');
                setGradingStatus('all');
                setGradingCompany('all');
                setGradingGrade('');
                setPage(1);
              }}
            >
              Réinitialiser la recherche
            </Button>
          )}
        </section>
      )}
    </main>
  );
}
const accountSession=new AccountSession();
function newAccountRecovery(accountId:string|null) {
  return {
    purchase:new SubmittedAttempt<{purchaseId:string;itemIds:string[]},{client:Client;validItems:PurchaseDraft[];buyerNote:string;sellerNote:string;reference:string;occurredAt:number;downloadReceipt:boolean}>(accountId??undefined),
    sale:new SubmittedAttempt<{ids:string[]}>(accountId??undefined),
    saleHistory:new SubmittedAttempt<unknown,{name:string}>(accountId??undefined),
    photos:new PendingPurchasePhotos<File>(),
  };
}
const accountRecovery=new AccountRecoveryVault<ReturnType<typeof newAccountRecovery>>(value=>value.purchase.state!=='idle'||value.sale.state!=='idle'||value.saleHistory.state!=='idle'||value.photos.rows.length>0);
function App() {
  const [identity,setIdentity]=useState<{accountId:string|null;epoch:number}|null>(null);
  const [boundaryError,setBoundaryError]=useState('');
  const checkGeneration=useRef(0);
  const selectedAccount=useRef<string|null>(null);
  const selectIdentity=useCallback((accountId:string|null)=>{
    checkGeneration.current++;
    const epoch=accountSession.select(accountId);
    if(selectedAccount.current!==accountId)realtime.reset();
    selectedAccount.current=accountId;
    setIdentity(previous=>previous?.accountId===accountId&&previous.epoch===epoch?previous:{accountId,epoch});
  },[]);
  const verifyIdentity=useCallback(async()=>{
    const generation=++checkGeneration.current;
    try {const status=parseAuthStatus(await rawRequest<unknown>('/auth/status'));if(generation!==checkGeneration.current)return;setBoundaryError('');selectIdentity(status.authenticated&&status.accountId?status.accountId:null);}
    catch(error){if(generation===checkGeneration.current)setBoundaryError(error instanceof Error?error.message:'Vérification de la session impossible.');}
  },[selectIdentity]);
  const accountMismatch=useCallback(()=>{selectIdentity(null);void verifyIdentity();},[selectIdentity,verifyIdentity]);
  useEffect(()=>{void verifyIdentity();const focus=()=>void verifyIdentity();window.addEventListener('focus',focus);const visible=()=>{if(document.visibilityState==='visible')focus();};document.addEventListener('visibilitychange',visible);return()=>{checkGeneration.current++;window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visible);};},[verifyIdentity]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(hasRetainedAccountWork()){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
  if(!identity)return <main className="auth-shell"><p role="status">{boundaryError||'Vérification de la session…'}</p>{boundaryError&&<Button onClick={()=>void verifyIdentity()}>Réessayer</Button>}</main>;
  return <AccountWorkspace key={`${identity.accountId??'signed-out'}:${identity.epoch}`} accountId={identity.accountId} onIdentity={selectIdentity} onAccountMismatch={accountMismatch} sessionError={boundaryError} onRetrySession={verifyIdentity}/>;
}
function AccountWorkspace({accountId,onIdentity,onAccountMismatch,sessionError,onRetrySession}:{accountId:string|null;onIdentity:(accountId:string|null)=>void;onAccountMismatch:()=>void;sessionError:string;onRetrySession:()=>Promise<void>}) {
  const scope=useRef(accountSession.scope(accountId)).current;
  const request=useRef(scope.bind(rawRequest,onAccountMismatch)).current;
  const recovery=useRef(accountId?accountRecovery.forAccount(accountId,()=>newAccountRecovery(accountId)):newAccountRecovery(null)).current;

  const exportLock=useRef(false);
  const [exporting,setExporting]=useState(false);
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [saleQuantities,setSaleQuantities]=useState<Record<string,number>>({});
  function changeSaleQuantity(item:Item,quantity:number) {
    if(saleAttempt.current.current)return;
    const next=Math.max(0,Math.min(quantity,item.origin==='supplier'?(item.quantity??0):1));
    const previous=selectedItemIds.includes(item._id)?saleQuantities[item._id]??1:0;
    setSaleQuantities(values=>({...values,[item._id]:next}));
    setSelectedItemIds(ids=>next?[...new Set([...ids,item._id])]:ids.filter(id=>id!==item._id));
    setSalePrices(values=>({...values,[item._id]:((previous&&values[item._id]!==undefined?Number(values[item._id].replace(',','.'))/previous:(item.askingPriceCents??0)/100)*next).toFixed(2)}));
  }
  function quantityControl(item:Item) {
    const quantity=selectedItemIds.includes(item._id)?saleQuantities[item._id]??1:0;
    return <div className="basket-quantity" role="group" aria-label={`Quantité de ${item.name}`}><Button type="button" variant="secondary" aria-label={`Retirer une unité de ${item.name}`} disabled={!quantity} onClick={()=>changeSaleQuantity(item,quantity-1)}>−</Button><span aria-live="polite">{quantity?`✓ ${quantity}`:'0'}</span><Button type="button" aria-label={`Ajouter une unité de ${item.name}`} disabled={quantity>=(item.origin==='supplier'?(item.quantity??0):1)} onClick={()=>changeSaleQuantity(item,quantity+1)}>+</Button></div>;
  }
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editPriceVisibility, setEditPriceVisibility] = useState(false);
  useEffect(() => {
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    for (const event of events) window.addEventListener(event, markWebActivity, { passive: true });
    const visibility = () => { if (document.visibilityState !== 'visible') lastUserActivity = -Infinity; };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      for (const event of events) window.removeEventListener(event, markWebActivity);
      document.removeEventListener('visibilitychange', visibility);
      lastUserActivity = -Infinity;
    };
  }, []);
  const catalogRequests = useRef(new RequestGenerations());
  function beginCatalog(key:string){return catalogRequests.current.begin(key);}
  function changeTcg(draft: PurchaseDraft, tcg: Tcg, reset = false) {
    if (!reset && (draft.tcg ?? 'pokemon') === tcg) return;
    beginCatalog(draft.key);
    setError('');
    setPurchaseItems((rows) =>
      rows.map((row) =>
        row.key === draft.key
          ? {
              ...row,
              tcg,
              name: '',
              series: '',
              identifier: '',
              cardResults: [],
              searching: false,
              catalogueCardId: undefined,
              catalogueSetId: undefined,
              catalogueImageUrl: undefined,
              availableLanguages: undefined,
              language: tcg === 'riftbound' ? 'en' : 'fr',
            }
          : row,
      ),
    );
  }

  const resetFromLink = new URLSearchParams(window.location.search).get('reset') ?? '';
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [newPassword, setNewPassword] = useState(''),
    [resetToken, setResetToken] = useState(resetFromLink),
    [resetRequested, setResetRequested] = useState(false),
    [items, setItems] = useState<Item[]>([]),
    [clients, setClients] = useState<Client[]>([]),
    [purchases, setPurchases] = useState<Purchase[]>([]),
    [salesData, setSalesData] = useState<Sale[]>([]),
    [conflicts, setConflicts] = useState<SaleConflict[]>([]),
    [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({}),
    [clientName, setClientName] = useState(''),
    [clientEmail, setClientEmail] = useState(''),
    [clientPhone, setClientPhone] = useState(''),
    [clientAddress, setClientAddress] = useState(''),
    [selectedClient, setSelectedClient] = useState(''),
    [purchaseClientSearch, setPurchaseClientSearch] = useState(''),
    [editingClientId, setEditingClientId] = useState(''),
    [adminPage, setAdminPage] = useState<AdminPage>(() =>
      adminPageFromPath(window.location.pathname),
    ),
    [clientSearch, setClientSearch] = useState(''),
    [clientPage, setClientPage] = useState(1),
    [purchaseItems, setPurchaseItems] = useState<PurchaseDraft[]>([
      {
        key: crypto.randomUUID(),
        name: '',
        series: '',
        identifier: '',
        marketValue: '',
        discountPercent: '70',
        askingPrice: '',
        askingPriceTouched: false,
        photo: null,
      },
    ]),
    [purchaseReference, setPurchaseReference] = useState(''),
    [attachmentsByPurchase, setAttachmentsByPurchase] = useState<Record<string, Attachment[]>>({}),
    [buyerNote, setBuyerNote] = useState(''),
    [sellerNote, setSellerNote] = useState(''),
    [purchaseDate, setPurchaseDate] = useState(localDateInputValue()),
    [salePrices, setSalePrices] = useState<Record<string, string>>({}),
    [saleDates, setSaleDates] = useState<Record<string, string>>({}),
    [purchaseDates, setPurchaseDates] = useState<Record<string, string>>({}),
    [stockSearch, setStockSearch] = useState(''),
    [stockTcg, setStockTcg] = useState<Tcg | 'all'>('all'),
    [stockSeries, setStockSeries] = useState(''),
    [stockOrigin, setStockOrigin] = useState('all'),
    [stockVisibility, setStockVisibility] = useState<'all' | 'visible' | 'hidden'>('all'),
    [visibilitySelectedIds, setVisibilitySelectedIds] = useState<string[]>([]),
    [visibilityBusy, setVisibilityBusy] = useState(false),
    [visibilityNotice, setVisibilityNotice] = useState(''),
    [consignmentBalances, setConsignmentBalances] = useState<ConsignmentBalances>({ balances: [], payments: [] }),
    [stockGradingStatus, setStockGradingStatus] = useState<'all' | 'graded' | 'ungraded'>('all'),
    [stockGradingCompany, setStockGradingCompany] = useState<'all' | GradingCompany>('all'),
    [stockGradingGrade, setStockGradingGrade] = useState(''),
    [stockPage, setStockPage] = useState(1),
    [selectedItemIds, setSelectedItemIds] = useState<string[]>([]),
    [saleConfirmOpen, setSaleConfirmOpen] = useState(false),
    [bulkSalePrice, setBulkSalePrice] = useState(''),
    [error, setError] = useState(''),
    [initializationError,setInitializationError] = useState(''),
    [logged, setLogged] = useState(Boolean(accountId)),
    [signupEnabled, setSignupEnabled] = useState<boolean | null>(null),
    [loading, setLoading] = useState(false);
  const [lastSaleIds,setLastSaleIds]=useState<string[]>([]);
  const [salePaymentDraft, setSalePaymentDraft] = useState<PaymentDraft>(newPaymentDraft);
  const [paymentSale, setPaymentSale] = useState<Sale | null>(null);
  const [editPaymentDraft, setEditPaymentDraft] = useState<PaymentDraft>(newPaymentDraft);
  const [collectionFilter, setCollectionFilter] = useState('all');
  const [salesSearch, setSalesSearch] = useState('');
  const [salesStatus, setSalesStatus] = useState('all');
  const [salesHistoryOrigin, setSalesHistoryOrigin] = useState('all');
  const [salesFrom, setSalesFrom] = useState('');
  const [salesTo, setSalesTo] = useState('');
  const [purchaseStage, setPurchaseStage] = useState<'contact' | 'items' | 'review'>('contact');
  const purchaseAttempt=useRef(recovery.purchase);
  const [purchaseSubmission,setPurchaseSubmission]=useState<SubmissionState>(recovery.purchase.state);
  const purchasePhotos=useRef(recovery.photos);
  const [pendingPurchasePhotos,setPendingPurchasePhotos]=useState(recovery.photos.rows.length);
  const [photoRetryBusy,setPhotoRetryBusy]=useState(false);
  const photoRetryLock=useRef(false);
  const purchaseRunning = useRef(false);
  const companyRecords = useGradingCompanies(request, logged);
  const gradingCompanies = companyRecords.companies.filter(c=>!c.archivedAt).map(c=>({id:c.name,name:c.name}));
  const [askingPriceDrafts, setAskingPriceDrafts] = useState<Record<string, string>>({});
  const [clientEditorOpen, setClientEditorOpen] = useState(false);
  const [clientReturnToPurchase, setClientReturnToPurchase] = useState(false);
  const visibilityAttempt = useRef<{ signature: string; body: string } | null>(null);
  const visibilityRunning = useRef(false);
  const saleAttempt=useRef(recovery.sale);
  const [saleSubmission,setSaleSubmission]=useState<SubmissionState>(recovery.sale.state);
  const saleRunning=useRef(false);
  useEffect(()=>{if(!pendingPurchasePhotos&&purchaseSubmission==='idle'&&saleSubmission==='idle')return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[pendingPurchasePhotos,purchaseSubmission,saleSubmission]);
  const saleHistoryAttempt=useRef(recovery.saleHistory);
  const [saleHistorySubmission,setSaleHistorySubmission]=useState<SubmissionState>(recovery.saleHistory.state);
  const saleHistoryRunning=useRef(false);
  const [historyRows, setHistoryRows] = useState<Purchase[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('all');
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historySize, setHistorySize] = useState(12);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPages, setHistoryPages] = useState(1);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyRevision, setHistoryRevision] = useState(0);
  const historyReadGeneration=useRef(0);
  const refreshPurchaseHistory=useCallback(async()=>{
    const generation=++historyReadGeneration.current;
    setHistoryBusy(true);setHistoryError('');
    const params=new URLSearchParams({page:String(historyPage),size:String(historySize),search:historySearch,status:historyStatus});
    if(historyFrom)params.set('from',String(shopDateTimestamp(historyFrom,shopTimezone,0)));
    if(historyTo)params.set('to',String(shopDateTimestamp(historyTo,shopTimezone,23,59,59)+999));
    try {
      const result=await request<{rows:Purchase[];page:number;totalPages:number;totalCount:number}>(`/purchases/page?${params}`);
      scope.assertActive();
      if(generation!==historyReadGeneration.current)throw new Error('La recherche a changé. Actualisez la liste courante.');
      setHistoryRows(result.rows);setHistoryTotal(result.totalCount);setHistoryPages(result.totalPages);setHistoryPage(result.page);
    } catch(e) {
      if(generation===historyReadGeneration.current)setHistoryError(e instanceof Error?e.message:'Historique indisponible');
      throw e;
    } finally {if(generation===historyReadGeneration.current)setHistoryBusy(false);}
  },[request,scope,historyPage,historySize,historySearch,historyStatus,historyFrom,historyTo]);
  useEffect(()=>{
    if(!logged||adminPage!=='purchaseHistory')return;
    const timer=window.setTimeout(()=>{void refreshPurchaseHistory().catch(()=>{});},250);
    return()=>{historyReadGeneration.current++;window.clearTimeout(timer);};
  },[logged,adminPage,refreshPurchaseHistory,historyRevision]);
  const stockRead = useReadPage<Item>(request, '/stock', { search: stockSearch, tcg: stockTcg, series: stockSeries, origin: stockOrigin, visibility: adminPage === 'stock' ? stockVisibility : 'all', gradingStatus: stockGradingStatus, gradingCompany: stockGradingCompany, gradingText: stockGradingGrade }, logged && (adminPage === 'stock' || adminPage === 'sales'), historyRevision);
  const clientsRead = useReadPage<Client>(request, '/sellers', { search: clientSearch }, logged && adminPage === 'clients', historyRevision);
  useEffect(() => {
    setItems(previous => [...previous.filter(item => selectedItemIds.includes(item._id) && !stockRead.items.some(row => row._id === item._id)), ...stockRead.items]);
  }, [stockRead.items, selectedItemIds]);
  const salesHistoryRead = useReadPage<Sale>(request, '/sales', { paymentStatus: collectionFilter, search: salesSearch, status: salesStatus, origin: salesHistoryOrigin, ...(salesFrom ? {from:String(shopDateTimestamp(salesFrom,shopTimezone,0))} : {}), ...(salesTo ? {to:String(shopDateTimestamp(salesTo,shopTimezone,23,59,59)+999)} : {}) }, logged && adminPage === 'salesHistory', historyRevision);
  const conflictsRead = useReadPage<SaleConflict>(request, '/conflicts', {}, logged && adminPage === 'saleConflicts', historyRevision);
  function navigateAdminPage(page: AdminPage, replace = false) {
    setError('');
    const url = adminPagePaths[page];
    window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
    setAdminPage(page);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  useEffect(() => {
    const syncPage = () => setAdminPage(adminPageFromPath(window.location.pathname));
    window.addEventListener('popstate', syncPage);
    if (window.location.pathname.startsWith('/admin/')) syncPage();
    else navigateAdminPage('dashboard', true);
    return () => window.removeEventListener('popstate', syncPage);
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      try {
        await request('/auth/csrf');
      } catch {
        // An unauthenticated first visit has no CSRF cookie yet.
      }
      const authStatus=parseAuthStatus(await request<unknown>('/auth/status'));
      setInitializationError('');
      const verifiedAccount=authStatus.authenticated&&authStatus.accountId?authStatus.accountId:null;
      if(verifiedAccount!==accountId){onIdentity(verifiedAccount);return;}
      setHistoryRevision((value) => value + 1);
      setSignupEnabled(authStatus.signupEnabled);
      if (!authStatus.authenticated) {
        realtime.reset();
        setLogged(false);
        return;
      }
      setLogged(true);
      setError('');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Connexion impossible';
      if (message === 'UNAUTHENTICATED' || message === 'INVALID_SESSION') {
        realtime.reset();onIdentity(null);
        setLogged(false);
        setError('');
      } else setInitializationError(message);
    } finally {
      setLoading(false);
    }
  }, []);
  async function auth(path: string) {
    setLoading(true);
    try {
      const result = await request<{ expiresIn: number; refreshAfterSeconds: number }>(`/auth/${path}`, { method: 'POST', body: JSON.stringify({ email, password }) });
      markWebActivity();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  }
  async function requestPasswordReset() {
    setLoading(true);
    setError('');
    try {
      await request('/auth/password-reset/request', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setResetRequested(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La demande a échoué.');
    } finally {
      setLoading(false);
    }
  }
  async function completePasswordReset() {
    setLoading(true);
    setError('');
    try {
      await request('/auth/password-reset/complete', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      });
      window.history.replaceState({}, '', window.location.pathname);
      setResetToken('');
      setPassword('');
      setNewPassword('');
      setError('Mot de passe modifié. Vous pouvez vous connecter.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Le lien de réinitialisation est invalide.');
    } finally {
      setLoading(false);
    }
  }
  async function saveClient() {
    if (!clientName.trim()) return setError('Saisissez le nom du client.');
    setLoading(true);
    try {
      const payload = {
        name: clientName.trim(),
        email: clientEmail.trim() || undefined,
        phone: clientPhone.trim() || undefined,
        address: clientAddress.trim() || undefined,
      };
      const saved = await request<{ id: string }>(
        editingClientId ? `/sellers/${encodeURIComponent(editingClientId)}` : '/sellers',
        {
          method: editingClientId ? 'PATCH' : 'POST',
          body: JSON.stringify(
            editingClientId ? payload : { operationId: crypto.randomUUID(), ...payload },
          ),
        },
      );
      const updatedClient: Client = { _id: saved.id, ...payload };
      setClients((entries) =>
        editingClientId
          ? entries.map((client) => (client._id === saved.id ? updatedClient : client))
          : [...entries, updatedClient],
      );
      setEditingClientId('');
      setClientName('');
      setClientEmail('');
      setClientPhone('');
      setClientAddress('');
      clientsRead.reload();
      setClientEditorOpen(false);
      if (clientReturnToPurchase) { setSelectedClient(saved.id); setClientReturnToPurchase(false); navigateAdminPage('purchases'); }
      setError(editingClientId ? 'Fiche client modifiée.' : 'Fiche client créée.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement de la fiche impossible.');
    } finally {
      setLoading(false);
    }
  }
  async function searchPokemonCards(draft: PurchaseDraft, append = false) {
    if (draft.tcg === 'other') return setError('Pour un autre produit, utilisez la saisie manuelle.');
    const term = draft.cardSearch?.trim();
    if (!term) return setError('Saisissez un nom ou un numéro de carte à rechercher.');
    const current = beginCatalog(draft.key);
    const search = parseCardSearch(term);
    setError('');
    setPurchaseItems((rows) =>
      rows.map((row) => (row.key === draft.key ? { ...row, searching: true } : row)),
    );
    try {
      if (draft.tcg === 'riftbound') {
        const results = await searchRiftbound(term);
        if (!current()) return;
        setPurchaseItems((rows) =>
          rows.map((row) =>
            row.key === draft.key ? { ...row, cardResults: results, searching: false } : row,
          ),
        );
        if (!results.length) setError(`Aucune carte Riftbound trouvée pour « ${term} » (FR/EN).`);
        return;
      }
      const result = await searchTcgdex({query:term,language:draft.language??'fr',page:append?(draft.providerPage??1)+1:1,pageSize:50});
      if (!current()) return;
      if (result.message) setError(result.message);
      const hydrated = result.cards.map(card=>({...card,language:card.language as CatalogLanguage,availableLanguages:[card.language] as CatalogLanguage[]}));
      setPurchaseItems(rows=>rows.map(row=>row.key===draft.key?{...row,cardResults:append?[...(row.cardResults??[]),...hydrated]:hydrated,providerPage:result.page,providerHasMore:result.hasMore,searching:false}:row));
    } catch (e) {
      if (!current()) return;
      setPurchaseItems((rows) =>
        rows.map((row) => (row.key === draft.key ? { ...row, searching: false } : row)),
      );
      setError(e instanceof Error ? e.message : 'Recherche de carte impossible.');
    }
  }
  async function selectPokemonCard(draft: PurchaseDraft, card: CatalogCard) {
    const current = beginCatalog(draft.key);
    if (draft.tcg === 'riftbound') {
      setPurchaseItems((rows) =>
        rows.map((row) =>
          row.key === draft.key
            ? {
                ...row,
                name: card.name,
                series: card.setName ?? '',
                identifier: card.localId,
                language: card.language,
                catalogueCardId: card.id,
                catalogueSetId:card.setId,
                catalogueImageUrl: card.image,
                availableLanguages: [card.language],
                cardResults: [],
                searching: false,
              }
            : row,
        ),
      );
      return;
    }
    setPurchaseItems((rows) =>
      rows.map((row) => (row.key === draft.key ? { ...row, searching: true } : row)),
    );
    let setName = draft.series;
    let selectedName = card.name;
    let localId = card.localId;
    let image = card.image;
    const localizedDetails = await Promise.all(
      cardLanguages.map(async ({ id: language }) => {
        try {
          const response = await fetch(
            `https://api.tcgdex.net/v2/${language}/cards/${encodeURIComponent(card.id)}`,
          );
          if (!response.ok) return null;
          return {
            language,
            card: (await response.json()) as {
              image?: string;
              set?: { name?: string;id?:string };
              localId?: string;
              name?: string;
            },
          };
        } catch {
          return null;
        }
      }),
    );
    const availableLanguages = localizedDetails
      .filter((entry) => entry !== null)
      .map((entry) => entry.language);
    const selected = localizedDetails.find((entry) => entry?.language === card.language)?.card;
    if (!current()) return;
    setName = selected?.set?.name ?? setName;
    image = selected?.image ?? image;
    localId = selected?.localId ?? localId;
    selectedName = selected?.name ?? selectedName;
    setPurchaseItems((rows) =>
      rows.map((row) =>
        row.key === draft.key
          ? {
              ...row,
              name: selectedName,
              searching: false,
              series: setName,
              identifier: localId,
              language: card.language,
              catalogueCardId: card.id,
                catalogueSetId:selected?.set?.id??card.setId,
              availableLanguages: availableLanguages.length ? availableLanguages : [card.language],
              catalogueImageUrl: image ? `${image}/low.webp` : undefined,
              cardResults: [],
            }
          : row,
      ),
    );
  }
  async function changeCatalogCardLanguage(draft: PurchaseDraft, language: CatalogLanguage) {
    const current = beginCatalog(draft.key);
    if (draft.tcg === 'riftbound' && draft.catalogueCardId) return;
    if (!draft.catalogueCardId) {
      if (!current()) return;
      setPurchaseItems((rows) =>
        rows.map((row) => (row.key === draft.key ? { ...row, language } : row)),
      );
      return;
    }
    try {
      const response = await fetch(
        `https://api.tcgdex.net/v2/${language}/cards/${encodeURIComponent(draft.catalogueCardId)}`,
      );
      if (!response.ok) throw new Error('Cette édition n’existe pas dans cette langue.');
      const card = (await response.json()) as {
        name: string;
        localId: string;
        image?: string;
        set?: { name?: string;id?:string };
      };
      if (!current()) return;
      setPurchaseItems((rows) =>
        rows.map((row) =>
          row.key === draft.key
            ? {
                ...row,
                language,
                name: card.name,
                series: card.set?.name ?? row.series,
                identifier: card.localId,
                catalogueImageUrl: card.image ? `${card.image}/low.webp` : undefined,
              }
            : row,
        ),
      );
    } catch (e) {
      if (!current()) return;
      setError(e instanceof Error ? e.message : 'Version dans cette langue introuvable.');
    }
  }
  function editClient(client: Client) {
    setEditingClientId(client._id);
    setClientName(client.name);
    setClientEmail(client.email ?? '');
    setClientPhone(client.phone ?? '');
    setClientAddress(client.address ?? '');
    setError('');
  }
  function clearClientForm() {
    setEditingClientId('');
    setClientName('');
    setClientEmail('');
    setClientPhone('');
    setClientAddress('');
  }
  async function createPurchase(downloadReceipt: boolean) {
    if (purchaseRunning.current||photoRetryLock.current) return;
    purchaseRunning.current = true;
    setLoading(true);
    setError('');
    try {
      if(!purchaseAttempt.current.current) {
      const client = clients.find((entry) => entry._id === selectedClient);
      if (!client) throw new Error('Sélectionnez un client existant.');
      const clientId = client._id;
      const validItems = purchaseItems.filter((item) => item.included);
      if (!validItems.length) throw new Error('Ajoutez au moins une carte avec un nom.');
      const items = validItems.map((item) => {
        if (!item.name.trim()) throw new Error('Renseignez le nom de chaque carte ajoutée.');
        if (!item.marketValue.trim())
          throw new Error(`Saisissez la valeur actuelle de « ${item.name} ».`);
        if (!item.discountPercent.trim())
          throw new Error(`Saisissez la décote de « ${item.name} ».`);
        const marketValue = Number(item.marketValue.replace(',', '.'));
        const discountPercent = Number(item.discountPercent.replace(',', '.'));
        if (!Number.isFinite(marketValue) || marketValue < 0)
          throw new Error(`Valeur actuelle invalide pour « ${item.name} ».`);
        if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100)
          throw new Error(`La décote de « ${item.name} » doit être comprise entre 0 et 100 %.`);
        const asking =
          item.askingPriceTouched && item.askingPrice.trim()
            ? Number(item.askingPrice.replace(',', '.'))
            : marketValue;
        if (asking !== undefined && (!Number.isFinite(asking) || asking < 0))
          throw new Error(`Prix de vente invalide pour « ${item.name} ».`);
        return {
          name: item.name.trim(),
          tcg: item.tcg ?? 'pokemon',
          series: item.series.trim() || undefined,
          identifier: item.identifier.trim() || undefined,
          marketValueCents: Math.round(marketValue * 100),
          discountPercent,
          language: item.language ?? 'fr',
          condition: item.condition ?? 'NM',
          gradingCompany: item.gradingCompany,
          gradingGrade: item.gradingGrade?.trim() || undefined,
          gradingCertificate: item.gradingCertificate?.trim() || undefined,
          gradingNotes: item.gradingNotes?.trim() || undefined,
          catalogueImageUrl: item.catalogueImageUrl || undefined,
          catalogueCardId:item.catalogueCardId,
          catalogueSetId:item.catalogueSetId,
          purchasePriceCents: Math.round(marketValue * discountPercent),
          askingPriceCents: Math.round((asking ?? marketValue) * 100),
          vatRegime: 'margin',
        };
      });
      const reference = purchaseReference.trim() || `R-${Date.now()}`;
      const occurredAt = dateAtCurrentLocalTime(purchaseDate);
      if (!Number.isFinite(occurredAt)) throw new Error('Saisissez une date de rachat valide.');
      purchaseAttempt.current.prepare('/purchases', {
        sellerId:clientId,buyerNote,sellerNote,occurredAt,reference,
        items:items.map(item=>({...item,operationId:crypto.randomUUID()})),
      }, {client,validItems:validItems.map(item=>({...item})),buyerNote,sellerNote,reference,occurredAt,downloadReceipt});
      }
      setPurchaseSubmission(purchaseAttempt.current.state);
      const submission=purchaseAttempt.current.current!;
      const {reference,occurredAt,client,validItems}=submission.context;
      const submittedBuyerNote=submission.context.buyerNote,submittedSellerNote=submission.context.sellerNote,submittedReceipt=submission.context.downloadReceipt;
      const wasConfirmed=submission.state==='confirmed';
      const purchase=await purchaseAttempt.current.execute(request);scope.assertActive();
      setPurchaseSubmission('confirmed');
      if(!wasConfirmed) purchasePhotos.current.add(validItems.flatMap((item,index)=>item.photo&&purchase.itemIds[index]?[{purchaseId:purchase.purchaseId,itemId:purchase.itemIds[index],name:item.name,file:item.photo}]:[]));
      setPendingPurchasePhotos(purchasePhotos.current.rows.length);
      const photoFailures=await purchasePhotos.current.retry(uploadItemAttachment);
      scope.assertActive();
      setPendingPurchasePhotos(purchasePhotos.current.rows.length);
      let receiptFailure = '';
      if (submittedReceipt) await downloadPurchaseReceipt({
        buyerNote:submittedBuyerNote, sellerNote:submittedSellerNote,
        reference,
        occurredAt,
        status: 'pending',
        client,
        items: validItems.map((item) => ({
          name: item.name.trim(),
          series: item.series.trim(),
          identifier: item.identifier.trim(),
          language:
            item.language === 'zh' ? 'Chinois' : item.language === 'en' ? 'Anglais' : item.language === 'ja' ? 'Japonais' : 'Français',
          condition:
            cardConditions.find((condition) => condition.id === item.condition)?.name ??
            'Near Mint (NM)',
          gradingCompany: item.gradingCompany,
          gradingGrade: item.gradingGrade,
          gradingCertificate: item.gradingCertificate,
          gradingNotes: item.gradingNotes,
          discountPercent: Number(item.discountPercent.replace(',', '.')),
          marketValueCents: Math.round(Number(item.marketValue.replace(',', '.')) * 100),
          purchasePriceCents: Math.round(
            Number(item.marketValue.replace(',', '.')) *
              Number(item.discountPercent.replace(',', '.')),
          ),
        })),
      }).catch((error) => {
        receiptFailure = error instanceof Error ? error.message : 'Génération du PDF impossible.';
      });
      scope.assertActive();
      purchaseAttempt.current.release();
      setPurchaseSubmission('idle');
      setPurchaseStage('contact');
      setSelectedClient('');
      setPurchaseReference('');
      setBuyerNote('');
      setSellerNote('');
      setPurchaseDate(localDateInputValue());
      setPurchaseItems([
        {
          key: crypto.randomUUID(),
          name: '',
          series: '',
          identifier: '',
          marketValue: '',
          discountPercent: '70',
          askingPrice: '',
          askingPriceTouched: false,
          photo: null,
        },
      ]);
      const refreshFailure=await load().then(()=>'',()=> ' Les données n’ont pas pu être actualisées ; le rachat reste enregistré.');
      if (receiptFailure)
        setError(
          `Rachat ${reference} enregistré. Le bordereau n’a pas pu être téléchargé : ${receiptFailure} Réessayez depuis l’historique.${photoFailures.length ? ` Photos non envoyées : ${photoFailures.join(', ')}.` : ''}`,
        );
      else if (photoFailures.length)
        setError(`Rachat ${reference} enregistré.${submittedReceipt ? ' Le bordereau PDF a été téléchargé.' : ''} Photo non envoyée pour : ${photoFailures.join(', ')}.`);
      else
        setError(
          `Rachat ${reference} enregistré en attente de validation du client.${submittedReceipt ? ' Le bordereau PDF a été téléchargé.' : ' Le bordereau reste disponible dans l’historique.'}${refreshFailure}`,
        );
    } catch (e) {
      setPurchaseSubmission(purchaseAttempt.current.state);
      setError(`${e instanceof Error ? e.message : 'Rachat impossible.'}${purchaseAttempt.current.state==='unknown'?' Résultat incertain : reprenez la même demande avec le bouton de récupération.':''}`);
    } finally {
      purchaseRunning.current = false;
      setLoading(false);
    }
  }
  async function retryPurchasePhotos() {
    if(photoRetryLock.current)return;
    photoRetryLock.current=true;setPhotoRetryBusy(true);
    try {const failures=await purchasePhotos.current.retry(uploadItemAttachment);scope.assertActive();setPendingPurchasePhotos(purchasePhotos.current.rows.length);setError(failures.length?`Photos encore en attente : ${failures.join(', ')}`:'Toutes les photos en attente sont enregistrées.');}
    catch(error){if(error instanceof Error&&error.message!=='ACCOUNT_SCOPE_CHANGED')setError(error.message);}
    finally {photoRetryLock.current=false;setPhotoRetryBusy(false);}
  }
  async function savePurchaseDate(purchase: Purchase) {
    const value = purchaseDates[purchase._id] ?? localDateInputValue(new Date(purchase.occurredAt));
    const occurredAt = dateAtCurrentLocalTime(value, new Date(purchase.occurredAt));
    if (!Number.isFinite(occurredAt)) return setError('Saisissez une date de rachat valide.');
    setLoading(true);
    try {
      await loadReceiptLogo();
      await request(`/purchases/${encodeURIComponent(purchase._id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ occurredAt }),
      });
      let receiptFailure = '';
      const receiptDownloaded = await downloadSavedPurchaseReceipt(purchase, occurredAt).catch(
        (error) => {
          receiptFailure = error instanceof Error ? error.message : 'Génération du PDF impossible.';
          return false;
        },
      );
      await load();
      setError(
        receiptDownloaded
          ? 'Date modifiée. Le reçu PDF actualisé a été téléchargé.'
          : `Date modifiée, mais le justificatif n’a pas pu être téléchargé. ${receiptFailure || 'Fiche client introuvable.'}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Modification de la date impossible.');
    } finally {
      setLoading(false);
    }
  }
  async function validatePendingPurchase(purchase: Purchase) {
    setLoading(true);
    try {
      await request(`/purchases/${encodeURIComponent(purchase._id)}/validate`, { method: 'POST' });
      await load();
      setError(`Rachat ${purchase.reference} validé : les cartes sont maintenant dans le stock.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Validation du rachat impossible.');
    } finally {
      setLoading(false);
    }
  }
  async function cancelPendingPurchase(purchase: Purchase) {
    setLoading(true);
    try {
      await request(`/purchases/${encodeURIComponent(purchase._id)}/cancel`, { method: 'POST' });
      await load();
      setError(`Rachat ${purchase.reference} annulé.`);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Annulation du rachat impossible.');
      return false;
    } finally {
      setLoading(false);
    }
  }
  async function uploadEvidence(target:{supplierReceiptId?:string;giftId?:string},file:File,operationId:string) {
    scope.assertActive();
    const form=new FormData();for(const [key,value] of Object.entries(target))if(value)form.append(key,value);form.append('file',file);form.append('operationId',operationId);
    const headers=scope.headers(sessionActivityHeaders());if(csrfToken)headers.set('X-CSRF-Token',csrfToken);
    const response=await fetch(`${API}/attachments`,{method:'POST',headers,credentials:'include',body:form});scope.assertActive();if(response.status===401){onAccountMismatch();throw new Error('ACCOUNT_SCOPE_CHANGED');}if(response.status===403){const problem=await response.clone().json().catch(()=>null);scope.assertActive();if(problem?.error==='ACCOUNT_MISMATCH'){onAccountMismatch();throw new Error('ACCOUNT_SCOPE_CHANGED');}}csrfToken=response.headers.get('X-CSRF-Token')??csrfToken;
    if(!response.ok)throw new Error('Le justificatif n’a pas pu être envoyé. Le mouvement reste enregistré.');
  }
  async function uploadItemAttachment(itemId: string, file: File, operationId?: string) {
    scope.assertActive();
    file = await optimizeUploadImage(file, API);
    const form = new FormData();
    form.append('itemId', itemId);
    if (operationId) form.append('operationId', operationId);
    form.append('file', file);
    const headers = scope.headers(sessionActivityHeaders());
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
    const response = await fetch(`${API}/attachments`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: form,
    });
    scope.assertActive();
    if(response.status===401){onAccountMismatch();throw new Error('ACCOUNT_SCOPE_CHANGED');}
    if(response.status===403){const problem=await response.clone().json().catch(()=>null);scope.assertActive();if(problem?.error==='ACCOUNT_MISMATCH'){onAccountMismatch();throw new Error('ACCOUNT_SCOPE_CHANGED');}}
    csrfToken = response.headers.get('X-CSRF-Token') ?? csrfToken;
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      const messages: Record<string, string> = {
        ATTACHMENT_STORAGE_ACCESS_DENIED: 'Accès R2 refusé : vérifiez les droits du jeton sur le bucket',
        ATTACHMENT_STORAGE_UNAVAILABLE: 'Stockage R2 indisponible',
        ATTACHMENT_IMAGE_INVALID: 'La photo est illisible ou son format est invalide',
        ATTACHMENT_TYPE_NOT_ALLOWED: 'Format refusé : utilisez une image JPEG, PNG ou WebP',
        ATTACHMENT_SIZE_NOT_ALLOWED: 'La photo est vide ou dépasse la taille autorisée',
        ATTACHMENT_TOO_LARGE: 'La photo dépasse la taille autorisée',
      };
      throw new Error(messages[payload?.error ?? ''] ?? `Envoi de la photo impossible (${response.status})`);
    }
  }
  async function downloadPurchaseReceipt(receipt: Parameters<typeof createPurchaseReceiptPdf>[0]) {
    const [logo, signatory] = await Promise.all([
      loadReceiptLogo(),
      request<SignatoryProfile>('/auth/profile'),
    ]);
    scope.assertActive();
    const url = URL.createObjectURL(createPurchaseReceiptPdf({ ...receipt, signatory }, logo));
    const link = document.createElement('a');
    link.href = url;
    link.download = `rachat-${receipt.reference.replace(/[^a-z0-9-]/gi, '-')}.pdf`;
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  async function downloadSavedPurchaseReceipt(
    purchase: Purchase,
    occurredAt = purchase.occurredAt,
  ) {
    const client = clients.find((entry) => entry._id === purchase.sellerId) ?? await request<Client>(`/sellers/${encodeURIComponent(purchase.sellerId)}`);
    if (!client) {
      setError('Fiche client introuvable : le justificatif ne peut pas être généré.');
      return false;
    }
    await downloadPurchaseReceipt({
      reference: purchase.reference,
      buyerNote: purchase.buyerNote, sellerNote: purchase.sellerNote,
      occurredAt,
      status: purchase.status as 'pending' | 'active' | 'cancelled',
      client,
      items: purchase.items.map((item) => {
        if(item.purchasePriceCents==null||!Number.isSafeInteger(item.purchasePriceCents)||item.purchasePriceCents<0)throw new Error(`Coût d’acquisition inconnu pour « ${item.name} » : impossible de générer un nouveau bordereau. Les documents archivés restent disponibles.`);
        return ({
        name: item.name,
        series: item.series ?? '',
        identifier: item.identifier ?? '',
        language: languageLabel(item.language),
        condition: conditionLabel(item.condition),
        gradingCompany: item.gradingCompany,
        gradingGrade: item.gradingGrade,
        gradingCertificate: item.gradingCertificate,
        gradingNotes: item.gradingNotes,
        marketValueCents:
          item.marketValueCents ??
          (item.discountPercent !== undefined && item.discountPercent > 0
            ? Math.round((item.purchasePriceCents * 100) / item.discountPercent)
            : item.purchasePriceCents),
        discountPercent: item.discountPercent ?? 70,
        purchasePriceCents: item.purchasePriceCents,
      });}),
    });
    return true;
  }
  async function loadAttachments(purchaseId: string) {
    try {
      const attachments = await request<Attachment[]>(
        `/purchases/${encodeURIComponent(purchaseId)}/attachments`,
      );
      setAttachmentsByPurchase((current) => ({ ...current, [purchaseId]: attachments }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement des justificatifs impossible.');
    }
  }
  async function sellItem(itemId: string) {
    const item = stockRead.items.find(item => item._id === itemId);
    const raw = askingPriceDrafts[itemId] ?? (item?.askingPriceCents === undefined ? '' : String(item.askingPriceCents / 100));
    const amount = raw.trim() ? Number(raw.replace(',', '.')) : NaN;
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Saisissez un prix de vente valide.');
      return;
    }
    setLoading(true);
    try {
      await request('/sales', {
        method: 'POST',
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          itemId,
          occurredAt: dateAtCurrentLocalTime(saleDates[itemId] || localDateInputValue()),
          salePriceCents: Math.round(amount * 100),
        }),
      });
      setSalePrices((values) => ({ ...values, [itemId]: '' }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Vente impossible.');
    } finally {
      setLoading(false);
    }
  }
  async function sellSelectedItems() {
    if(saleRunning.current)return;
    saleRunning.current=true;setLoading(true);setError('');
    try {
      if(!saleAttempt.current.current) {
    if (!selectedItemIds.length) return setError('Sélectionnez au moins un article.');
    const saleItems = selectedItemIds.map((itemId) => {
      const item = items.find((entry) => entry._id === itemId);
      const text =
        salePrices[itemId] ??
        (item?.askingPriceCents === undefined ? '' : (item.askingPriceCents / 100).toString());
      const amount = Number(text.replace(',', '.'));
      if (!item || !text.trim() || !Number.isFinite(amount) || amount < 0) return null;
      return { itemId, quantity:saleQuantities[itemId]??1, salePriceCents: Math.round(amount * 100) };
    });
    if (saleItems.some(sale => { const item = items.find(item => item._id === sale?.itemId); return item?.origin === 'consignment' && sale && sale.salePriceCents < (item.agreedPriceCents ?? item.askingPriceCents ?? 0); })) return setError('Un prix est inférieur à l’accord du déposant. Enregistrez son autorisation dans Dépôts-ventes avant la vente.');
    if (saleItems.some((item) => item === null))
      return setError('Saisissez un prix de vente valide pour chaque article du panier.');

        const total=saleItems.reduce((sum,item)=>sum+(item?.salePriceCents??0),0);
        saleAttempt.current.prepare('/sales/bulk',{occurredAt:Date.now(),items:saleItems,...paymentPayload(salePaymentDraft,total)},undefined);
      }
      setSaleSubmission(saleAttempt.current.state);
      const result=await saleAttempt.current.execute(request);scope.assertActive();
      setSaleSubmission('confirmed');setLastSaleIds(result.ids);
      setSalePaymentDraft(newPaymentDraft());setSaleConfirmOpen(false);setSelectedItemIds([]);setSaleQuantities({});
      saleAttempt.current.release();setSaleSubmission('idle');
      try {await load();} catch {setError('Vente enregistrée. L’actualisation a échoué ; rechargez les données sans recréer la vente.');}
    } catch(e) {
      setSaleSubmission(saleAttempt.current.state);
      setSaleConfirmOpen(false);
      setError(`${e instanceof Error?e.message:'Vente groupée impossible.'}${saleAttempt.current.state==='unknown'?' Résultat incertain : reprenez la même demande, sans modifier le panier.':''}`);
    } finally {saleRunning.current=false;setLoading(false);}
  }
  async function resumeSaleHistory() {
    if (saleHistoryRunning.current || !saleHistoryAttempt.current.current) return false;
    saleHistoryRunning.current=true;setLoading(true);setError('');
    try {
      await saleHistoryAttempt.current.execute(request);scope.assertActive();
      // A failed refresh is a read failure; never resend a confirmed correction.
      setPaymentSale(null);setEditPaymentDraft(newPaymentDraft());
      saleHistoryAttempt.current.release();setSaleHistorySubmission('idle');
      try {await load();} catch {setError('Opération enregistrée. Actualisez l’historique sans répéter la correction ou l’annulation.');}
      return true;
    } catch(e) {
      setSaleHistorySubmission(saleHistoryAttempt.current.state);
      setError(`${e instanceof Error?e.message:'Enregistrement impossible.'}${saleHistoryAttempt.current.state==='unknown'?' Résultat incertain : reprenez la demande conservée avant une nouvelle correction ou annulation.':''}`);
      return false;
    } finally {saleHistoryRunning.current=false;setLoading(false);}
  }
  async function saveSalePayment() {
    if (saleHistoryRunning.current) return;
    try {
      if(!saleHistoryAttempt.current.current) {
        if(!paymentSale)return;
        const {payment}=paymentPayload(editPaymentDraft,paymentSale.salePriceCents);
        if(!payment)throw new Error('Choisissez un mode de paiement reçu.');
        saleHistoryAttempt.current.prepare('/sales/payment',{saleId:paymentSale._id,...payment},{name:paymentSale.itemName});
      }
      setSaleHistorySubmission(saleHistoryAttempt.current.state);
      await resumeSaleHistory();
    } catch(e) {setError(e instanceof Error?e.message:'Encaissement impossible.');}
  }
  async function setCatalogueVisibility(itemIds: string[], hidden: boolean) {
    if (visibilityRunning.current || !itemIds.length) return;
    if (itemIds.length > 500) return setError('Sélectionnez au maximum 500 articles par opération.');
    visibilityRunning.current = true;
    setVisibilityBusy(true);
    setVisibilityNotice('');
    setError('');
    try {
      const payload = { itemIds: [...new Set(itemIds)].sort(), hidden };
      const signature = JSON.stringify(payload);
      if (visibilityAttempt.current?.signature !== signature) visibilityAttempt.current = { signature, body: JSON.stringify({ operationId: crypto.randomUUID(), ...payload }) };
      const result = await request<{ updatedCount: number }>('/stock/visibility', { method: 'POST', body: visibilityAttempt.current.body });
      // Update the local display after server acknowledgement, even if refresh fails.
      setItems(current => current.map(item => payload.itemIds.includes(item._id) ? { ...item, hiddenFromCatalogue: hidden } : item));
      visibilityAttempt.current = null;
      setVisibilitySelectedIds([]);
      setVisibilityNotice(`${result.updatedCount} article(s) ${hidden ? 'masqué(s) du' : 'visible(s) dans le'} catalogue.`);
      try {
        stockRead.reload();
      } catch {
        setError('La visibilité est enregistrée, mais le stock n’a pas pu être actualisé. Actualisez la page lorsque la connexion est rétablie.');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'La visibilité n’a pas pu être enregistrée. Réessayez.');
    } finally {
      visibilityRunning.current = false;
      setVisibilityBusy(false);
    }
  }
  async function saveAskingPrice(itemId: string) {
    const item = stockRead.items.find(item => item._id === itemId);
    const raw = askingPriceDrafts[itemId] ?? (item?.askingPriceCents === undefined ? '' : String(item.askingPriceCents / 100));
    const amount = raw.trim() ? Number(raw.replace(',', '.')) : NaN;
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw.trim()) || !Number.isSafeInteger(Math.round(amount * 100)))
      return 'Saisissez un prix de vente valide.';
    setLoading(true);
    try {
      await request('/stock/asking-price', {
        method: 'POST',
        body: JSON.stringify({ itemId, askingPriceCents: Math.round(amount * 100) }),
      });
      await load();
    } catch (e) {
      return e instanceof Error ? e.message : 'Modification du prix impossible.';
    } finally {
      setLoading(false);
    }
  }
  async function cancelSale(saleId: string) {
    if (saleHistoryRunning.current) return false;
    if(saleHistoryAttempt.current.current) {
      const pending=saleHistoryAttempt.current.current;
      if(pending.path==='/sales/cancel'&&JSON.parse(pending.body).saleId===saleId)return resumeSaleHistory();
      setError('Reprenez la correction ou l’annulation conservée avant une nouvelle opération.');
      return false;
    }
    const sale=salesHistoryRead.items.find(value=>value._id===saleId);
    saleHistoryAttempt.current.prepare('/sales/cancel',{saleId},{name:sale?.itemName??saleId});
    setSaleHistorySubmission(saleHistoryAttempt.current.state);
    return resumeSaleHistory();
  }
  async function resolveConflict(conflictId: string) {
    const resolutionNote = resolutionNotes[conflictId]?.trim();
    if (!resolutionNote) {
      setError('Ajoutez une note expliquant le traitement du conflit.');
      return;
    }
    setLoading(true);
    try {
      await request('/conflicts/resolve', {
        method: 'POST',
        body: JSON.stringify({ conflictId, resolutionNote }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Résolution impossible.');
    } finally {
      setLoading(false);
    }
  }
  async function updateSignupSetting(enabled: boolean) {
    setLoading(true);
    try {
      const result = await request<{ enabled: boolean }>('/auth/signup-status', {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      });
      setSignupEnabled(result.enabled);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Modification du paramètre impossible.');
    } finally {
      setLoading(false);
    }
  }
  async function logout() {
    lastUserActivity = -Infinity;
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      csrfToken = undefined;
      realtime.reset();
      onIdentity(null);
      setLogged(false);
      setItems([]);
      setPurchases([]);
      setSalesData([]);
    }
  }
  useEffect(() => {
    // Identity was already verified by the outer boundary. A temporary failure
    // must retain that workspace and offer retry, never turn it into a logout.
    void load();
  }, [load]);
  async function exportXlsx() {
    if(exportLock.current)return;
    exportLock.current=true;setExporting(true);setError('');
    try {
    const readingStartedAt = new Date();
    type ExportSale = Sale & {sellerId?:string;balanceEligible:boolean;exportRowId:string};
    type ExportLot = {itemId:string;remainingQuantity:number;remainingCostCents:number|null};
    const [purchases, consignments, exportSales, exportStock, clients, payments, stockLots] = await Promise.all([
      readExportPages<Purchase>(request,'purchases'), readExportPages<Consignment>(request,'consignments'),
      readExportPages<ExportSale>(request,'sales'), readExportPages<Item>(request,'stock'),
      readExportPages<Client & {hasDeposits:boolean}>(request,'contacts'),
      readExportPages<ConsignmentBalances['payments'][number]>(request,'payments'),
      readExportPages<ExportLot>(request,'stockLots'),
    ]);
    const readingFinishedAt = new Date();
    const balances = {payments, balances:exportBalances(clients,exportSales,payments)};
    const lotsByItem = new Map<string,ExportLot[]>();
    for(const lot of stockLots){const rows=lotsByItem.get(lot.itemId)??[];rows.push(lot);lotsByItem.set(lot.itemId,rows);}
    const valuedStock=exportStock.filter(item=>item.status!=='pending'&&item.status!=='cancelled'&&item.origin!=='consignment');
    const valuations=new Map(valuedStock.map(item=>[item._id,stockValuation(item,lotsByItem.get(item._id)??[])]));
    const { default: ExcelJS } = await import('exceljs');scope.assertActive();
    const wb = new ExcelJS.Workbook();
    wb.creator = brand.name;
    wb.created = new Date();
    const purchasesSheet = wb.addWorksheet('Achats');
    purchasesSheet.addRow([
      'Référence rachat',
      'Identifiant objet',
      'Date rachat',
      'Vendeur',
      'Désignation',
      'Série',
      'N° identification',
      'Langue',
      'État',
      'Société de gradation',
      'Note de gradation',
      'N° de certification',
      'Notes de gradation',
      "Valeur actuelle (€)".replaceAll('€',currencySymbol),
      'Décote (%)',
      'N° série',
      "Prix achat (€)".replaceAll('€',currencySymbol),
      "Prix vente demandé (€)".replaceAll('€',currencySymbol),
      'Régime TVA',
      'Statut',
    ]);
    for (const purchase of purchases) {
      if (purchase.status !== 'active') continue;
      for (const item of purchase.items) {
        if (item.status === 'pending' || item.status === 'cancelled') continue;
        purchasesSheet.addRow([
          purchase.reference,
          item._id,
          exportDate(purchase.occurredAt,shopTimezone),
          purchase.sellerName,
          item.name,
          item.series ?? '',
          item.identifier ?? '',
          languageLabel(item.language),
          conditionLabel(item.condition),
          item.gradingCompany ?? '',
          item.gradingGrade ?? '',
          item.gradingCertificate ?? '',
          item.gradingNotes ?? '',
          moneyCell(item.marketValueCents),
          item.discountPercent ?? '',
          item.serialNumber ?? '',
          moneyCell(item.purchasePriceCents),
          moneyCell(item.askingPriceCents),
          item.vatRegime,
          purchase.status,
        ]);
      }
    }
    const salesSheet = wb.addWorksheet('Ventes');
    salesSheet.addRow([
      'Identifiant objet',
      'Désignation',
      'Série',
      'N° identification',
      'Langue',
      'État',
      'Société de gradation',
      'Note de gradation',
      'N° de certification',
      'Notes de gradation',
      'Date vente',
      'Quantité vendue',
      "Total vente (€)".replaceAll('€',currencySymbol),
      'Référence achat origine',
      'Date achat origine',
      'Vendeur origine',
      "Valeur actuelle (€)".replaceAll('€',currencySymbol),
      'Décote (%)',
      "Coût total attribué (€)".replaceAll('€',currencySymbol),
      "Écart vente moins achat (€)".replaceAll('€',currencySymbol),
      'Régime TVA',
      'Client final',
      'Statut',
      'Encaissement', "Espèces reçues (€)".replaceAll('€',currencySymbol), "Virement reçu (€)".replaceAll('€',currencySymbol), 'Date réception', 'Référence paiement',
    ]);
    for (const sale of exportSales) {
      if (sale.status !== 'active' || sale.origin === 'consignment') continue;
      salesSheet.addRow([
        sale.itemId,
        sale.itemName,
        sale.series ?? '',
        sale.identifier ?? '',
        languageLabel(sale.language),
        conditionLabel(sale.condition),
        sale.gradingCompany ?? '',
        sale.gradingGrade ?? '',
        sale.gradingCertificate ?? '',
        sale.gradingNotes ?? '',
        exportDate(sale.occurredAt,shopTimezone),
        sale.quantity??'',
        sale.salePriceCents / 100,
        sale.purchaseReference,
        exportDate(sale.purchaseOccurredAt,shopTimezone),
        sale.sellerName,
        moneyCell(sale.marketValueCents),
        sale.discountPercent ?? '',
        moneyCell(allocatedSaleCost(sale)),
        moneyCell(moneyDifference(sale.salePriceCents,allocatedSaleCost(sale))),
        sale.vatRegime,
        sale.customerName ?? '',
        sale.status,
        paymentStatusLabel(sale), sale.payment ? sale.payment.cashCents / 100 : '', sale.payment ? sale.payment.transferCents / 100 : '', sale.payment ? exportDate(sale.payment.receivedAt,shopTimezone) : '', sale.payment?.reference ?? '',
      ]);
    }
    const stock = wb.addWorksheet('Stock');
    stock.addRow([
      'Identifiant objet',
      'Désignation',
      'Série',
      'N° identification',
      'Langue',
      'État',
      'Société de gradation',
      'Note de gradation',
      'N° de certification',
      'Notes de gradation',
      'N° série',
      'Référence rachat',
      'Date rachat',
      'Vendeur origine',
      "Valeur actuelle (€)".replaceAll('€',currencySymbol),
      'Décote (%)',
      'Quantité actuellement en stock',
      "Coût total restant des lots (€)".replaceAll('€',currencySymbol),
      'État du coût restant',
      "Coût historique de la ligne d’achat (€)".replaceAll('€',currencySymbol),
      "Prix demandé unitaire (€)".replaceAll('€',currencySymbol),
      "Valeur totale au prix demandé (€)".replaceAll('€',currencySymbol),
      'Régime TVA',
      'Statut',
      'Visibilité catalogue',
    ]);
    for (const item of exportStock) {
      if (item.status === 'pending' || item.status === 'cancelled' || item.origin === 'consignment') continue;
      const valuation=valuations.get(item._id)!;
      stock.addRow([
        item._id,
        item.name,
        item.series ?? '',
        item.identifier ?? '',
        languageLabel(item.language),
        conditionLabel(item.condition),
        item.gradingCompany ?? '',
        item.gradingGrade ?? '',
        item.gradingCertificate ?? '',
        item.gradingNotes ?? '',
        item.serialNumber ?? '',
        item.purchaseReference,
        exportDate(item.purchaseOccurredAt,shopTimezone),
        item.sellerName,
        moneyCell(item.marketValueCents),
        item.discountPercent ?? '',
        valuation.quantity??'',
        moneyCell(valuation.remainingCostCents),
        valuation.remainingCostCents===null?'Inconnu ou incomplet':'Connu',
        moneyCell(item.purchasePriceCents),
        moneyCell(valuation.unitAskingPriceCents),
        moneyCell(valuation.totalAskingPriceCents),
        item.vatRegime,
        item.status,
        item.hiddenFromCatalogue ? 'Masqué' : 'Visible',
      ]);
    }
    const depositSheet = wb.addWorksheet('Dépôts');
    depositSheet.addRow(['Référence', 'Date dépôt', 'Échéance', 'Déposant', 'Identifiant article', 'Article', 'Type', 'Description', "Prix convenu (€)".replaceAll('€',currencySymbol), 'Commission (%)', "Au déposant au prix convenu (€)".replaceAll('€',currencySymbol), 'Statut', 'Conditions']);
    for (const deposit of consignments) for (const item of deposit.items) depositSheet.addRow([deposit.reference, exportDate(deposit.occurredAt,shopTimezone), deposit.dueAt ? exportDate(deposit.dueAt,shopTimezone) : '', deposit.sellerName, item._id, item.name, item.productType, item.description ?? '', (item.agreedPriceCents ?? item.askingPriceCents) / 100, item.commissionRateBps / 100, ((item.agreedPriceCents ?? item.askingPriceCents) - Math.round((item.agreedPriceCents ?? item.askingPriceCents) * item.commissionRateBps / 10000)) / 100, item.status, deposit.notes ?? '']);
    const commissionSheet = wb.addWorksheet('Commissions');
    commissionSheet.addRow(['Vente', 'Article', 'Déposant', 'Date', "Encaissement (€)".replaceAll('€',currencySymbol), 'Commission (%)', "Commission (€)".replaceAll('€',currencySymbol), "Part déposant (€)".replaceAll('€',currencySymbol), 'Statut', 'Encaissement', "Espèces reçues (€)".replaceAll('€',currencySymbol), "Virement reçu (€)".replaceAll('€',currencySymbol), 'Date réception', 'Référence paiement']);
    for (const sale of exportSales.filter(sale => sale.origin === 'consignment')) commissionSheet.addRow([sale._id, sale.itemName, sale.sellerName, exportDate(sale.occurredAt,shopTimezone), sale.salePriceCents / 100, sale.commissionRateBps==null?'':sale.commissionRateBps/100, moneyCell(sale.commissionCents), moneyCell(sale.depositorAmountCents), sale.status, paymentStatusLabel(sale), sale.payment ? sale.payment.cashCents / 100 : '', sale.payment ? sale.payment.transferCents / 100 : '', sale.payment ? exportDate(sale.payment.receivedAt,shopTimezone) : '', sale.payment?.reference ?? '']);
    const paymentsSheet = wb.addWorksheet('Reversements');
    paymentsSheet.addRow(['Identifiant', 'Déposant', 'Date', "Montant (€)".replaceAll('€',currencySymbol), 'Mode', 'Référence']);
    for (const payment of balances.payments) paymentsSheet.addRow([payment._id, payment.sellerName, exportDate(payment.occurredAt,shopTimezone), payment.amountCents / 100, payment.method, payment.reference ?? '']);
    const balancesSheet = wb.addWorksheet('Soldes déposants');
    balancesSheet.addRow(['Déposant', "Part des ventes actives (€)".replaceAll('€',currencySymbol), "Versé (€)".replaceAll('€',currencySymbol), "Solde dû / régularisation négative (€)".replaceAll('€',currencySymbol)]);
    for (const balance of balances.balances) balancesSheet.addRow([balance.sellerName, moneyCell(balance.earnedCents), moneyCell(balance.paidCents), moneyCell(balance.balanceCents)]);
    const clientsSheet = wb.addWorksheet('Clients');
    clientsSheet.addRow(['Identifiant client', 'Nom', 'E-mail', 'Téléphone', 'Adresse']);
    for (const client of clients)
      clientsSheet.addRow([
        client._id,
        client.name,
        client.email ?? '',
        client.phone ?? '',
        client.address ?? '',
      ]);
    const meta = wb.addWorksheet('Export');
    meta.addRow(['Généré le (UTC)', new Date().toISOString()]);
    meta.addRow(['Début de lecture (UTC)', readingStartedAt.toISOString()]);
    meta.addRow(['Fin de lecture (UTC)', readingFinishedAt.toISOString()]);
    meta.addRow(['Périmètre', 'Toutes les pages des données centrales pendant cet intervalle. Des modifications simultanées peuvent être visibles entre les pages ; cet export ne constitue pas un instantané atomique.']);
    meta.addRow(['Dates métier', `Dates civiles au format AAAA-MM-JJ dans le fuseau ${shopTimezone}.`]);
    meta.addRow(['Coûts inconnus', 'Cellules vides : coût non renseigné ; aucune marge calculée sans coût connu. Un coût nul connu reste 0.']);
    meta.addRow(['Stock', 'Quantité et coût total restant : lots actuellement détenus. Coût historique de ligne : acquisition d’origine, non unitaire. Prix demandé : unitaire ; valeur demandée : quantité × prix unitaire, sans valeur de vente garantie.']);
    for (const sheet of [purchasesSheet, salesSheet, stock, depositSheet, commissionSheet, paymentsSheet, balancesSheet, clientsSheet, meta]) {
      const lastColumn = sheet.columnCount;
      sheet.autoFilter = {
        from: 'A1',
        to: { row: Math.max(sheet.rowCount, 1), column: lastColumn },
      };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF124C70' } };
      sheet.columns.forEach((column) => {
        let width = 12;
        column.eachCell?.({ includeEmpty: false }, (cell) => {
          width = Math.max(width, String(cell.value ?? '').length + 2);
        });
        column.width = Math.min(width, 34);
      });
    }
    const blob = await wb.xlsx.writeBuffer();scope.assertActive();
    const url = URL.createObjectURL(new Blob([blob]));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'suivi-tva-marge.xlsx';
    a.click();
    URL.revokeObjectURL(url);
    } catch(reason) {
      setError(`Export impossible. Aucun classeur partiel n’a été téléchargé. ${reason instanceof Error?reason.message:'Une lecture des données a échoué.'} Vous pouvez réessayer.`);
    } finally {exportLock.current=false;setExporting(false);}
  }
  const filteredItems = stockRead.items;
  const selectedSaleTotalCents = selectedItemIds.reduce((total, itemId) => {
    const item = items.find((entry) => entry._id === itemId);
    const raw =
      salePrices[itemId] ??
      (item?.askingPriceCents === undefined ? '' : (item.askingPriceCents / 100).toString());
    const amount = Number(raw.replace(',', '.'));
    return total + (Number.isFinite(amount) ? Math.round(amount * 100) : 0);
  }, 0);
  const visibleItems = filteredItems;
  const filteredItemIds = new Set(filteredItems.map(item => item._id));
  const selectedVisibilityIds = visibilitySelectedIds.filter(id => filteredItemIds.has(id));
  const stockPagination = () => <ReadPagination data={stockRead} />;
  const filteredClients = clientsRead.items;
  const visibleClients = filteredClients;
  const selectedPurchaseClient = clients.find((client) => client._id === selectedClient);
  const signingRoute = parseSignaturePath(window.location.pathname);
  if (logged && signingRoute) return <ReceiptSigningPage {...signingRoute} request={request} />;
  return (
    <main className={logged ? "admin-shell" : "auth-shell"}>
      {logged && <WorkspaceChrome page={adminPage} paths={adminPagePaths} navigate={navigateAdminPage} basketCount={selectedItemIds.reduce((total, id) => total + (saleQuantities[id] ?? 1), 0)} basketTotalCents={selectedSaleTotalCents} addStockOpen={addStockOpen} onAddStockOpenChange={setAddStockOpen} />}
      {(initializationError||sessionError)&&<section className="workspace-feedback" role="alert"><span>Vérification de la session indisponible. Votre saisie est conservée. {initializationError||sessionError}</span><Button disabled={loading} onClick={()=>void Promise.all([load(),onRetrySession()])}>Réessayer la connexion</Button></section>}
      {logged && purchaseSubmission!=='idle' && <section className="workspace-feedback" role="status" style={{flexWrap:'wrap'}}><strong>{formatSubmissionSummary(submissionSummary(purchaseAttempt.current.current),shopCurrency,shopTimezone)}</strong><span>{purchaseSubmission==='rejected'?'La demande de rachat a été refusée. Vous pouvez revoir les champs.':'Le résultat du rachat doit être récupéré avant toute modification.'}</span><Button disabled={loading} onClick={()=>void createPurchase(false)}>Reprendre le même rachat</Button>{purchaseSubmission==='rejected'&&<Button disabled={loading} onClick={()=>{purchaseAttempt.current.release();setPurchaseSubmission('idle');}}>Revoir le rachat refusé</Button>}</section>}
      {logged && saleSubmission!=='idle' && <section className="workspace-feedback" role="status" style={{flexWrap:'wrap'}}><strong>{formatSubmissionSummary(submissionSummary(saleAttempt.current.current),shopCurrency,shopTimezone)}</strong><span>{saleSubmission==='rejected'?'La vente a été refusée. Vous pouvez revoir le panier.':'Vente en attente de confirmation. Le panier et le paiement soumis sont conservés.'}</span><Button disabled={loading} onClick={()=>void sellSelectedItems()}>Reprendre la même vente</Button>{saleSubmission==='rejected'&&<Button disabled={loading} onClick={()=>{saleAttempt.current.release();setSaleSubmission('idle');}}>Revoir la vente refusée</Button>}</section>}
      {logged && saleHistorySubmission!=='idle' && <section className="workspace-feedback" role="status" style={{flexWrap:'wrap'}}><strong>{formatSubmissionSummary(submissionSummary(saleHistoryAttempt.current.current),shopCurrency,shopTimezone)}</strong><span>{saleHistorySubmission==='rejected'?'La demande a été refusée. Vous pouvez la revoir.':'La demande et sa référence sont conservées. Vérifiez son résultat avant une autre correction ou annulation.'}</span><Button disabled={loading} onClick={()=>void resumeSaleHistory()}>Vérifier la demande conservée</Button>{saleHistorySubmission==='rejected'&&<Button disabled={loading} onClick={()=>{saleHistoryAttempt.current.release();setSaleHistorySubmission('idle');setPaymentSale(null);}}>Revoir la demande refusée</Button>}</section>}
      {logged && pendingPurchasePhotos>0 && <section className="workspace-feedback" role="status" style={{flexWrap:'wrap'}}><span>{pendingPurchasePhotos} photo(s) de rachats enregistrés restent à envoyer. Gardez cette page ouverte pour conserver les fichiers.</span><Button disabled={photoRetryBusy||loading} onClick={()=>void retryPurchasePhotos()}>{photoRetryBusy?'Envoi…':'Réessayer les photos restantes'}</Button></section>}
      {logged && error && <div className="workspace-feedback" role="status"><span>{error}</span><Button variant="ghost" size="icon" aria-label="Fermer le message" onClick={()=>setError('')}>×</Button></div>}
      {logged && adminPage === 'saleSummary' && lastSaleIds.length>0 && !selectedItemIds.length && <section className="sale-completed"><div><h2>Vente enregistrée</h2><p>Retrouvez le paiement et les corrections dans l’historique.</p></div><SaleTickets saleIds={lastSaleIds} request={request}/><Button variant="outline" onClick={()=>navigateAdminPage('salesHistory')}>Voir l’historique</Button></section>}
      {logged && adminPage === 'documents' && <DocumentsPage request={request} />}
      {logged && adminPage === 'inventoryOperations' && <InventoryOperations request={request} upload={uploadEvidence} onChanged={load} />}
      {logged && adminPage === 'settings' && <GradingCompanies request={request} />}
      {logged && adminPage === 'exports' && (
        <section className="panel export-page">
          <p className="eyebrow">Outils de gestion</p>
          <h2>Télécharger les données</h2>
          <p>Créez un classeur Excel avec les données de gestion actuellement disponibles pour votre compte.</p>
          <div className="actions"><Button type="button" disabled={exporting} onClick={() => void exportXlsx()}>{exporting?'Préparation du classeur…':'Télécharger le classeur Excel'}</Button></div>
          <p className="muted">Le téléchargement utilise les exports métier existants et conserve leurs règles de calcul.</p>
        </section>
      )}
      {!logged ? (
        <AuthenticationPanel email={email} password={password} newPassword={newPassword} resetToken={resetToken} loading={loading} signupEnabled={signupEnabled} resetRequested={resetRequested} error={error} onEmail={setEmail} onPassword={setPassword} onNewPassword={setNewPassword} onLogin={() => void auth('login')} onRegister={() => void auth('register')} onResetRequest={() => void requestPasswordReset()} onResetComplete={() => void completePasswordReset()} />
      ) : (
        <>
          {adminPage === 'dashboard' && (
            <Suspense
              fallback={
                <section className="panel">
                  <p>Chargement du dashboard…</p>
                </section>
              }
            >
              <DashboardPage request={request} onOpenConsignments={() => navigateAdminPage('consignmentPayouts')} />
            </Suspense>
          )}
          <div hidden={!['consignments', 'consignmentNew', 'consignmentPayouts'].includes(adminPage)}><ConsignmentsPage view={adminPage === 'consignmentNew' ? 'new' : adminPage === 'consignmentPayouts' ? 'payouts' : 'history'} active={['consignments', 'consignmentNew', 'consignmentPayouts'].includes(adminPage)} clients={clients} request={request} upload={uploadItemAttachment} apiBase={API} onChanged={load} onCreateClient={() => { clearClientForm(); setClientEditorOpen(true); setClientReturnToPurchase(false); navigateAdminPage('clients'); }} /></div>
          {adminPage === 'settings' && (
            <><Suspense
              fallback={
                <section className="panel">
                  <p>Chargement des paramètres…</p>
                </section>
              }
            >
              <SettingsPage
                loadProfile={() => request<SignatoryProfile>('/auth/profile')}
                saveProfile={(profile) =>
                  request<SignatoryProfile>('/auth/profile', {
                    method: 'PATCH',
                    body: JSON.stringify(profile),
                  })
                }
                signupEnabled={signupEnabled ?? true}
                loading={loading}
                onToggle={(enabled) => void updateSignupSetting(enabled)}
              />
            </Suspense><section className="panel"><h2>Session</h2><p>Fermez votre session sur cet appareil.</p><Button type="button" className="secondary" onClick={() => void logout()}>Déconnexion</Button></section></>
          )}
          {adminPage === 'stock' && <fieldset disabled={saleSubmission!=='idle'} style={{border:0,padding:0,margin:0,minWidth:0}}><StockWorkspace
            items={visibleItems} apiBase={API} request={request}
            filters={{search:stockSearch,tcg:stockTcg,series:stockSeries,origin:stockOrigin,visibility:stockVisibility,gradingStatus:stockGradingStatus,gradingCompany:stockGradingCompany,gradingGrade:stockGradingGrade}}
            onFiltersChange={f=>{setStockTcg(f.tcg);setStockSeries(f.series);setStockSearch(f.search);setStockOrigin(f.origin);setStockVisibility(f.visibility);setStockGradingStatus(f.gradingStatus);setStockGradingCompany(f.gradingCompany);setStockGradingGrade(f.gradingGrade);setStockPage(1);setVisibilitySelectedIds([]);}}
            gradingCompanies={gradingCompanies} loading={stockRead.busy} busy={loading} error={stockRead.error||error} notice={visibilityNotice}
            visibilityBusy={visibilityBusy} visibilitySelection={selectedVisibilityIds} onVisibilitySelectionChange={setVisibilitySelectedIds} onSetVisibility={(ids,hidden)=>void setCatalogueVisibility(ids,hidden)}
            basketQuantities={Object.fromEntries(selectedItemIds.map(id=>[id,saleQuantities[id]??1]))}
            basketCount={selectedItemIds.reduce((n,id)=>n+(saleQuantities[id]??1),0)} basketTotalCents={selectedSaleTotalCents}
            onBasketQuantityChange={changeSaleQuantity}
            onAddPageToBasket={()=>{for(const item of visibleItems) if(!selectedItemIds.includes(item._id)) changeSaleQuantity(item,1);}}
            onClearBasket={()=>{setSelectedItemIds([]);setSaleQuantities({});}} onOpenBasket={()=>navigateAdminPage('saleSummary')}
            priceDrafts={askingPriceDrafts} onPriceDraftChange={(item,value)=>setAskingPriceDrafts(v=>({...v,[item._id]:value}))}
            onSaveAskingPrice={item=>saveAskingPrice(item._id)} onEditProduct={(item, focusPriceVisibility)=>{setEditPriceVisibility(!!focusPriceVisibility);setEditingProductId(item._id);}}
            onOpenConsignments={()=>navigateAdminPage('consignments')} onAddStock={()=>setAddStockOpen(true)} pagination={stockRead}
          /></fieldset>}
          {editingProductId && <ProductEditor focusPriceVisibility={editPriceVisibility} key={editingProductId} itemId={editingProductId} apiBase={API} request={request} upload={uploadItemAttachment} onClose={() => setEditingProductId(null)} onChanged={async () => { stockRead.reload(); await load(); }} />}
          {['sales','saleSummary'].includes(adminPage) && <fieldset disabled={saleSubmission!=='idle'} style={{border:0,padding:0,margin:0,minWidth:0}}><SalesWorkspace mode={adminPage==='sales'?'selection':'review'} items={visibleItems}
            basketItems={selectedItemIds.flatMap(id=>{const item=items.find(x=>x._id===id);return item?[item]:[];})}
            basketQuantities={Object.fromEntries(selectedItemIds.map(id=>[id,saleQuantities[id]??1]))} lineTotals={salePrices} totalCents={selectedSaleTotalCents} apiBase={API}
            tcg={stockTcg} series={stockSeries} onTcgChange={value=>{setStockTcg(value as Tcg | 'all');setStockSeries('');}} onSeriesChange={setStockSeries}
            search={stockSearch} origin={stockOrigin} onSearchChange={value=>{setStockSearch(value);setStockPage(1);}} onOriginChange={value=>{setStockOrigin(value);setStockPage(1);}}
            onQuantityChange={changeSaleQuantity} onLineTotalChange={(item,value)=>setSalePrices(v=>({...v,[item._id]:value}))}
            onRemoveItem={item=>setSelectedItemIds(ids=>ids.filter(id=>id!==item._id))} onClearBasket={()=>{setSelectedItemIds([]);setSaleQuantities({});}}
            onReviewBasket={()=>navigateAdminPage('saleSummary')} onContinueShopping={()=>navigateAdminPage('sales')}
            paymentDraft={salePaymentDraft} onPaymentChange={setSalePaymentDraft} confirmOpen={saleConfirmOpen} onConfirmOpenChange={setSaleConfirmOpen}
            onConfirmSale={()=>void sellSelectedItems()} loading={stockRead.busy} submitting={loading} error={stockRead.error||error} pagination={stockRead}
          /></fieldset>}
          {adminPage === 'clients' && <ContactsWorkspace data={clientsRead} search={clientSearch} onSearch={value=>{setClientSearch(value);setClientPage(1);}} editorOpen={clientEditorOpen} editing={!!editingClientId}
            draft={{name:clientName,email:clientEmail,phone:clientPhone,address:clientAddress}} onDraft={draft=>{setClientName(draft.name);setClientEmail(draft.email);setClientPhone(draft.phone);setClientAddress(draft.address);}}
            busy={loading} error={error} onNew={()=>{clearClientForm();setError('');setClientEditorOpen(true);}} onEdit={client=>{editClient(client);setError('');setClientEditorOpen(true);}}
            onClose={()=>{clearClientForm();setError('');setClientEditorOpen(false);if(clientReturnToPurchase){setClientReturnToPurchase(false);navigateAdminPage('purchases');}}} onSave={()=>void saveClient()} />}
          <section className="buyback-flow" hidden={adminPage !== 'purchases'}><fieldset disabled={purchaseSubmission!=='idle'||loading} style={{border:0,padding:0,margin:0,minWidth:0}}>
            <ol className="flow-steps" aria-label="Étapes du rachat">{(['contact','items','review'] as const).map((stage,index)=><li key={stage} aria-current={purchaseStage===stage?'step':undefined}><span>{index+1}</span>{['Contact','Cartes','Vérification'][index]}</li>)}</ol>
            <div className="buyback-contact-stage" hidden={purchaseStage !== 'contact'}>
            <header><h2>À qui rachetez-vous ces cartes ?</h2><p>Choisissez le contact qui figurera sur le bordereau.</p></header>
            <ClientPicker clients={clients} request={request} value={selectedClient} onChange={setSelectedClient} label="Rechercher un client" onResolved={client => setClients(previous => [...previous.filter(row => row._id !== client._id).slice(-19), client as Client])} onCreate={() => { clearClientForm(); setClientEditorOpen(true); setClientReturnToPurchase(true); navigateAdminPage('clients'); }} />
            <div className="form-grid">
              <label>
                Référence du rachat
                <Input
                  value={purchaseReference}
                  onChange={(event) => setPurchaseReference(event.target.value)}
                  placeholder="Générée automatiquement si vide"
                />
              </label>
              <label>
                Date du rachat
                <Input
                  type="date"
                  value={purchaseDate}
                  onChange={(event) => setPurchaseDate(event.target.value)}
                />
              </label>
            </div>
            <p>Notes et conditions facultatives, reprises sur le bordereau. Pour un complément après gradation, précisez les cartes concernées et la note attendue.</p>
            <div className="form-grid">
              <label>Note de l’acheteur (facultative)<textarea rows={4} maxLength={2000} value={buyerNote} onChange={event => setBuyerNote(event.target.value)} placeholder={"Ex. : complément de 100 € par carte si la note convenue est obtenue.".replaceAll('€',currencySymbol)} /></label>
              <label>Note du vendeur (facultative)<textarea rows={4} maxLength={2000} value={sellerNote} onChange={event => setSellerNote(event.target.value)} /></label>
            </div>
            <div className="flow-footer"><span>Les cartes seront saisies à l’étape suivante.</span><Button disabled={!selectedPurchaseClient || loading || !purchaseDate} onClick={()=>setPurchaseStage('items')}>Continuer vers les cartes →</Button></div>
            </div>
            <div hidden={purchaseStage === 'contact'}>
            <div className="buyback-contact-summary"><strong>{selectedPurchaseClient?.name || 'Contact à sélectionner'}</strong><span>{purchaseDate && new Date(`${purchaseDate}T12:00:00`).toLocaleDateString('fr-BE')} · {purchaseReference || 'Référence automatique'}</span></div>
            <PurchaseEditor
              onBackToContact={()=>setPurchaseStage('contact')}
              onStageChange={stage=>setPurchaseStage(current=>current==='contact'?'contact':stage)}
              request={request}
              invalidateSearch={key=>{beginCatalog(key);}}
              loadMore={row=>searchPokemonCards(row,true)}
              rows={purchaseItems}
              setRows={setPurchaseItems}
              search={searchPokemonCards}
              select={selectPokemonCard}
              changeTcg={changeTcg}
              changeLanguage={changeCatalogCardLanguage}
              save={createPurchase}
              busy={loading}
              hasClient={!!selectedPurchaseClient}
            />
            </div>
          </fieldset></section>
          {adminPage === 'salesHistory' && <SalesHistoryWorkspace request={request} rows={salesHistoryRead.items} pagination={salesHistoryRead} apiBase={API} busy={loading} mutationBlocked={saleHistorySubmission!=='idle'} error={error}
            filters={{search:salesSearch,status:salesStatus,origin:salesHistoryOrigin,payment:collectionFilter,from:salesFrom,to:salesTo}}
            onFiltersChange={f=>{setSalesSearch(f.search);setSalesStatus(f.status);setSalesHistoryOrigin(f.origin);setCollectionFilter(f.payment);setSalesFrom(f.from);setSalesTo(f.to);}}
            onCollect={sale=>{if(saleHistoryAttempt.current.current)return;setError('');setPaymentSale(sale);setEditPaymentDraft(sale.payment ? {mode:sale.payment.cashCents>0&&sale.payment.transferCents>0?'mixed':sale.payment.transferCents>0?'transfer':'cash',cash:(sale.payment.cashCents/100).toFixed(2),date:shopDateInput(new Date(sale.payment.receivedAt)),reference:sale.payment.reference??''}:newPaymentDraft());}}
            onCancel={cancelSale} onDocuments={()=>navigateAdminPage('documents')} onNewSale={()=>navigateAdminPage('sales')} />}
          {adminPage === 'saleConflicts' && <SaleConflictsWorkspace rows={conflictsRead.items} pagination={conflictsRead} notes={resolutionNotes} onNote={(id,value)=>setResolutionNotes(v=>({...v,[id]:value}))} onResolve={resolveConflict} busy={loading} error={error} />}
          {adminPage === 'purchaseHistory' && <PurchaseHistoryWorkspace rows={historyRows}
            filters={{search:historySearch,status:historyStatus,from:historyFrom,to:historyTo,size:historySize}}
            onFiltersChange={f=>{setHistorySearch(f.search);setHistoryStatus(f.status);setHistoryFrom(f.from);setHistoryTo(f.to);setHistorySize(f.size);setHistoryPage(1);}}
            page={historyPage} pages={historyPages} total={historyTotal} onPage={setHistoryPage} loading={historyBusy} busy={loading} error={historyError}
            onCorrected={refreshPurchaseHistory} onRetry={()=>setHistoryRevision(v=>v+1)} apiBase={API} request={request} onValidate={validatePendingPurchase} onCancel={cancelPendingPurchase}
            onDownload={async purchase=>{try{if(await downloadSavedPurchaseReceipt(purchase))setError(`Bordereau PDF téléchargé pour ${purchase.reference}.`);}catch(e){setError(e instanceof Error?e.message:'Téléchargement impossible.');}}}
            dates={purchaseDates} onDate={(id,date)=>setPurchaseDates(v=>({...v,[id]:date}))} onSaveDate={savePurchaseDate} attachments={attachmentsByPurchase} onAttachments={loadAttachments}/>}
          <Dialog open={!!paymentSale} onOpenChange={open=>{if(!open&&!loading)setPaymentSale(null);}}>
            <DialogContent className="transaction-dialog"><DialogTitle>{paymentSale?.paymentStatus==='received'?'Corriger l’encaissement':'Enregistrer l’encaissement'}</DialogTitle><DialogDescription>{paymentSale?.itemName} · {money(paymentSale?.salePriceCents??0)}. Cette action enregistre un paiement déjà reçu.</DialogDescription>
              {error && <p className="error" role="alert">{error}</p>}
              <SalePaymentEditor value={editPaymentDraft} onChange={setEditPaymentDraft} totalCents={paymentSale?.salePriceCents??0} allowPending={false} disabled={loading||saleHistorySubmission!=='idle'} />
              <div className="actions"><Button variant="outline" disabled={loading} onClick={()=>setPaymentSale(null)}>Fermer</Button><Button disabled={loading} onClick={()=>void saveSalePayment()}>{loading?'Enregistrement…':saleHistorySubmission!=='idle'?'Vérifier la demande conservée':'Confirmer le paiement reçu'}</Button></div>
            </DialogContent>
          </Dialog>

        </>
      )}
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Élément racine de l’application web introuvable.');
let path = window.location.pathname.replace(/\/$/, '') || '/';
if (path === '/') {
  path = '/convention';
  window.history.replaceState({}, '', `${path}${window.location.search}${window.location.hash}`);
}
const isLegalPage = Object.hasOwn(legalPages, path);
const reactRoot = import.meta.hot?.data.reactRoot ?? createRoot(root);
if (import.meta.hot) import.meta.hot.data.reactRoot = reactRoot;
reactRoot.render(
  <>
    {isLegalPage ? (
      <LegalPage path={path as LegalPath} />
    ) : path === '/rachat' ? (
      <BuybackPage />
    ) : path === '/depot-vente' ? (
      <BuybackPage kind="depot" />
    ) : path === '/boutique' ? (
      <ShopPage />
    ) : path === '/convention' ? (
      <ConventionCatalog />
    ) : (
      <App />
    )}
    {(isLegalPage || path === "/convention" || path === "/rachat" || path === "/depot-vente" || path === "/boutique") && <SiteFooter />}
  </>,
);
