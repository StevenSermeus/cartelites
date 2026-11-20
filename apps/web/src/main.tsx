import { optimizeUploadImage } from './optimizeImage';
import BuybackPage, { PublicNavigation } from './BuybackPage';
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
import { loadReceiptLogo } from './receiptLogo';
import { LegalPage, legalPages, SiteFooter, type LegalPath } from './LegalPages';
import { brand, BrandIdentity } from './brand';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPurchaseReceiptPdf, type SignatoryProfile } from './receiptPdf';
import './style.css';

const DashboardPage = lazy(() => import('./DashboardPage'));
const SettingsPage = lazy(() => import('./SettingsPage'));

type Item = {
  hiddenFromCatalogue?: boolean;
  description?: string;
  origin?: 'purchase' | 'consignment';
  productType?: 'card' | 'sealed' | 'other';
  commissionRateBps?: number;
  agreedPriceCents?: number;
  _id: string;
  name: string;
  tcg?: 'pokemon' | 'riftbound';
  series?: string;
  identifier?: string;
  serialNumber?: string;
  catalogueImageUrl?: string;
  language?: 'fr' | 'en' | 'ja';
  condition?: 'M' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';
  gradingCompany?: 'PSA' | 'CollectAura' | 'PCA' | 'CCC';
  gradingGrade?: string;
  gradingCertificate?: string;
  gradingNotes?: string;
  marketValueCents?: number;
  discountPercent?: number;
  purchasePriceCents: number;
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
type GradingCompany = 'PSA' | 'CollectAura' | 'PCA' | 'CCC';
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
      <img className="grading-badge-logo" src={gradingLogos[company]} alt={label} loading="lazy" />
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
  tcg?: 'pokemon' | 'riftbound';
  series: string;
  identifier: string;
  marketValue: string;
  discountPercent: string;
  askingPrice: string;
  askingPriceTouched: boolean;
  photo: File | null;
  language?: 'fr' | 'en' | 'ja';
  condition?: 'M' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';
  gradingCompany?: 'PSA' | 'CollectAura' | 'PCA' | 'CCC';
  gradingGrade?: string;
  gradingCertificate?: string;
  gradingNotes?: string;
  catalogueImageUrl?: string;
  catalogueCardId?: string;
  availableLanguages?: CatalogLanguage[];
  cardSearch?: string;
  cardResults?: CatalogCard[];
  searching?: boolean;
};
type CatalogLanguage = 'fr' | 'en' | 'ja';
export type CatalogCard = {
  id: string;
  localId: string;
  name: string;
  image?: string;
  setName?: string;
  language: CatalogLanguage;
  availableLanguages?: CatalogLanguage[];
};
const cardLanguages = [
  { id: 'fr', name: 'Français' },
  { id: 'en', name: 'Anglais' },
  { id: 'ja', name: 'Japonais' },
] as const;
const gradingCompanies = [
  { id: 'PSA', name: 'PSA' },
  { id: 'CollectAura', name: 'Collect Aura' },
  { id: 'PCA', name: 'PCA' },
  { id: 'CCC', name: 'CCC Grading' },
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
  cardLanguages.find((language) => language.id === id)?.name ?? 'Français';
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
type Purchase = {
  _id: string;
  sellerId: string;
  reference: string;
  occurredAt: number;
  sellerName: string;
  status: string;
  items: Item[];
};
type Sale = {
  catalogueImageUrl?: string;
  photos?: { _id: string; filename: string; contentType?: string }[];
  paymentStatus?: 'pending' | 'received';
  payment?: SalePayment;
  origin?: 'purchase' | 'consignment';
  commissionRateBps?: number;
  commissionCents?: number;
  depositorAmountCents?: number;
  _id: string;
  itemId: string;
  itemName: string;
  series?: string;
  identifier?: string;
  language?: 'fr' | 'en' | 'ja';
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
  purchasePriceCents: number;
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
type AdminPage =
  | 'purchaseHistory'
  | 'dashboard'
  | 'clients'
  | 'purchases'
  | 'stock'
  | 'sales'
  | 'saleSummary'
  | 'salesHistory'
  | 'saleConflicts'
  | 'settings'
  | 'consignments'
  | 'consignmentNew'
  | 'consignmentPayouts'
  | 'exports';
const adminPagePaths: Record<AdminPage, string> = {
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
function localDateInputValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function dateAtCurrentLocalTime(value: string, timeSource = new Date()) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(
    year,
    month - 1,
    day,
    timeSource.getHours(),
    timeSource.getMinutes(),
    timeSource.getSeconds(),
    timeSource.getMilliseconds(),
  ).getTime();
}
let csrfToken: string | undefined;
let lastUserActivity = -Infinity;
const markWebActivity = () => { if (document.visibilityState === 'visible') lastUserActivity = Date.now(); };
function sessionActivityHeaders(): Record<string, string> {
  return document.visibilityState === 'visible' && Date.now() - lastUserActivity < 60_000
    ? { 'X-Session-Activity': '1' } : {};
}
async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(sessionActivityHeaders())) headers.set(key, value);
  headers.set('Content-Type', 'application/json');
  if (csrfToken && init.method && init.method !== 'GET') headers.set('X-CSRF-Token', csrfToken);
  const r = await fetch(`${API}${path}`, { ...init, headers, credentials: 'include' });
  csrfToken = r.headers.get('X-CSRF-Token') ?? csrfToken;
  if (!r.ok) {
    const payload = (await r.json().catch(() => ({}))) as { error?: string };
    if (payload.error === 'SALE_NOT_FOUND') throw new Error('Cette vente est introuvable. Actualisez l’historique.');
    if (r.status === 404)
      throw new Error(
        `Route API introuvable (${API}${path}). Vérifiez que l’API tourne sur le port 3001 et que VITE_API_URL pointe vers son adresse.`,
      );
    if (['PRICE_BELOW_AGREEMENT', 'SALE_BELOW_AGREED_PRICE', 'PRICE_BELOW_AGREED', 'CONSINGMENT_PRICE_TOO_LOW', 'CONSIGNMENT_PRICE_BELOW_AGREED', 'BELOW_AGREED_PRICE'].includes(payload.error ?? '')) throw new Error('Le prix est inférieur à l’accord du déposant. Modifiez l’accord dans Dépôts-ventes après son autorisation.');
    if (payload.error === 'INVALID_SALE_PAYMENT') throw new Error('Vérifiez les montants : espèces et virement doivent couvrir exactement le total de la vente.');
    if (payload.error === 'INVALID_SALE_PAYMENT_DATE') throw new Error('La réception du paiement ne peut pas précéder le jour de la vente.');
    if (payload.error === 'SALE_CANCELLED') throw new Error('Cette vente a été annulée. Son encaissement ne peut plus être modifié.');
    if (payload.error === 'INVALID_PAYMENT_DATE') throw new Error('Le solde est insuffisant à cette date ou l’encaissement n’a pas encore été reçu.');
    if (payload.error === 'PAYMENT_EXCEEDS_BALANCE') throw new Error('Le versement dépasse le solde dû au déposant. Actualisez les données.');
    if (payload.error === 'AUTHORIZATION_REQUIRED') throw new Error('Indiquez l’autorisation du déposant pour modifier cet accord.');
    if (payload.error === 'INVALID_STOCK_SELECTION') throw new Error('Sélectionnez entre 1 et 500 articles distincts du stock.');
    if (payload.error === 'ITEM_UNAVAILABLE') throw new Error('Cet article n’est plus disponible. Actualisez les données.');
    if (payload.error === 'SALE_BEFORE_PURCHASE')
      throw new Error('La date de vente ne peut pas précéder le jour du rachat ou du dépôt.');
    if (payload.error === 'ITEM_NOT_FOUND') throw new Error('Carte introuvable dans votre stock.');
    if (payload.error === 'PURCHASE_DATE_AFTER_SALE')
      throw new Error('Impossible de déplacer le rachat après une vente déjà enregistrée.');
    throw new Error(payload.error ?? `Erreur serveur (${r.status})`);
  }
  const result = r.status === 204 ? null : await r.json();
  return result as T;
}
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
  salePriceCents: number;
};
function ConventionCatalog() {
  const [cards, setCards] = useState<PublicCard[]>([]);
  const [tcg, setTcg] = useState<Tcg | 'all'>('all');
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [minimum, setMinimum] = useState('');
  const [maximum, setMaximum] = useState('');
  const [gradingStatus, setGradingStatus] = useState<'all' | 'graded' | 'ungraded'>('all');
  const [gradingCompany, setGradingCompany] = useState<'all' | GradingCompany>('all');
  const [gradingGrade, setGradingGrade] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
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
  }, [tcg, search, minimum, maximum, gradingStatus, gradingCompany, gradingGrade, pageSize]);
  useEffect(() => {
    setLoading(true);
    let active = true;
    setError('');
    let unsubscribe: (() => void) | undefined;
    const timer = window.setTimeout(
      () => {
        unsubscribe = publicRealtime.subscribe<{
          page: PublicCard[]; totalCount: number; continueCursor: string; isDone: boolean;
        }>('operations:publicCatalogue', {
          tcg, search, gradingStatus, gradingCompany: gradingCompany === 'all' ? '' : gradingCompany,
          gradingGrade, paginationOpts: { numItems: pageSize, cursor: cursorHistory[page - 1] ?? null },
          ...(minimum ? { minPrice: Math.round(Number(minimum) * 100) } : {}),
          ...(maximum ? { maxPrice: Math.round(Number(maximum) * 100) } : {}),
        }, result => {
          if (!active) return;
          setCards(result.page); setTotalCount(result.totalCount);
          setNextCursor(result.continueCursor); setIsDone(result.isDone);
          setLoading(false); setError('');
        }, reason => {
          if (active) { setCards([]); setError(reason.message); setLoading(false); }
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
    page,
    pageSize,
    search,
    minimum,
    maximum,
    gradingStatus,
    gradingCompany,
    gradingGrade,
    cursorHistory,
  ]);
  const formatPrice = (cents: number) =>
    new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
  const hasFilters = Boolean(
    tcg !== 'all' ||
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
      <button
        type="button"
        className="secondary public-catalogue-page-button"
        onClick={() => setPage((current) => Math.max(1, current - 1))}
        disabled={currentPage <= 1}
      >
        Précédent
      </button>
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
      <button
        type="button"
        className="secondary public-catalogue-page-button"
        onClick={() => {
          if (nextCursor) {
            setCursorHistory((history) => [...history.slice(0, page), nextCursor]);
            setPage((current) => current + 1);
          }
        }}
        disabled={isDone}
      >
        Suivant
      </button>
    </nav>
  );
  return (
    <main className="public-catalogue-page">
      <PublicNavigation active="catalogue" />
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
        <TcgChoices value={tcg} all onChange={setTcg} />
        <div className="form-grid public-catalogue-filters">
          <label className="public-catalogue-search-field">
            Recherche
            <input
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
        <details className="convention-advanced">
          <summary>Filtres avancés · prix et gradation</summary>
          <div className="form-grid public-catalogue-filters">
            <label>
              Prix minimum (€)
              <input
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
              Prix maximum (€)
              <input
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
                {gradingCompanies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Note de gradation
              <input
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
          <button
            className="secondary public-catalogue-reset"
            type="button"
            onClick={() => {
              setTcg('all');
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
          </button>
        )}
      </section>
      {error ? (
        <section className="panel public-catalogue-state" role="alert">
          <h2>Le stock est momentanément indisponible</h2>
          <p>{error}</p>
        </section>
      ) : loading ? (
        <section className="panel public-catalogue-state" aria-live="polite">
          <p>Chargement des cartes…</p>
        </section>
      ) : visible.length ? (
        <>
          <div className="public-catalogue-results-toolbar">
            <span className="public-catalogue-result-summary">
              {visible.length} carte{visible.length === 1 ? '' : 's'} trouvée
              {visible.length === 1 ? '' : 's'}
            </span>
            <div
              className="public-catalogue-layout-toggle"
              role="group"
              aria-label="Disposition des cartes"
            >
              <button
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
              </button>
              <button
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
              </button>
            </div>
          </div>
          {pagination()}
          <section
            className={`public-catalogue-grid${layout === 'list' ? ' public-catalogue-list' : ''}`}
            aria-label="Cartes disponibles"
            aria-live="polite"
          >
            {pageCards.map((card) => (
              <article className="public-catalogue-card" key={card.id}>
                <div className="public-catalogue-image-wrap">
                  <ConventionPhoto key={`${card.id}:${card.hasPhoto}`} {...card} apiBase={API} />
                </div>
                <div className="public-catalogue-card-details">
                  <div className="public-catalogue-card-title">
                    <h3>{card.name}</h3>
                    <strong className="public-catalogue-price">
                      {formatPrice(card.salePriceCents)}
                    </strong>
                  </div>
                  <p className="public-catalogue-series">{card.series || 'Série non renseignée'}</p>
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
            <button
              className="secondary"
              type="button"
              onClick={() => {
                setTcg('all');
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
            </button>
          )}
        </section>
      )}
    </main>
  );
}
function App() {
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
  const catalogRequests = useRef(new Map<string, number>());
  function beginCatalog(key: string) {
    const token = (catalogRequests.current.get(key) ?? 0) + 1;
    catalogRequests.current.set(key, token);
    return () => catalogRequests.current.get(key) === token;
  }
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
    [purchaseDate, setPurchaseDate] = useState(localDateInputValue()),
    [salePrices, setSalePrices] = useState<Record<string, string>>({}),
    [saleDates, setSaleDates] = useState<Record<string, string>>({}),
    [purchaseDates, setPurchaseDates] = useState<Record<string, string>>({}),
    [stockSearch, setStockSearch] = useState(''),
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
    [logged, setLogged] = useState(false),
    [signupEnabled, setSignupEnabled] = useState<boolean | null>(null),
    [loading, setLoading] = useState(false);
  const [salePaymentDraft, setSalePaymentDraft] = useState<PaymentDraft>(newPaymentDraft);
  const [paymentSale, setPaymentSale] = useState<Sale | null>(null);
  const [editPaymentDraft, setEditPaymentDraft] = useState<PaymentDraft>(newPaymentDraft);
  const [collectionFilter, setCollectionFilter] = useState('all');
  const [clientEditorOpen, setClientEditorOpen] = useState(false);
  const [clientReturnToPurchase, setClientReturnToPurchase] = useState(false);
  const visibilityAttempt = useRef<{ signature: string; body: string } | null>(null);
  const visibilityRunning = useRef(false);
  const saleAttempt = useRef<{ signature: string; body: string } | null>(null);
  const paymentAttempt = useRef<{ signature: string; body: string } | null>(null);
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
  useEffect(() => {
    if (!logged || adminPage !== 'purchaseHistory') return;
    let active = true;
    setHistoryBusy(true);
    setHistoryError('');
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        page: String(historyPage),
        size: String(historySize),
        search: historySearch,
        status: historyStatus,
      });
      if (historyFrom) params.set('from', String(new Date(`${historyFrom}T00:00:00`).getTime()));
      if (historyTo) params.set('to', String(new Date(`${historyTo}T23:59:59.999`).getTime()));
      void request<{ rows: Purchase[]; page: number; totalPages: number; totalCount: number }>(
        `/purchases/page?${params}`,
      )
        .then((result) => {
          if (!active) return;
          setHistoryRows(result.rows);
          setHistoryTotal(result.totalCount);
          setHistoryPages(result.totalPages);
          setHistoryPage(result.page);
        })
        .catch((e) => {
          if (active) setHistoryError(e instanceof Error ? e.message : 'Historique indisponible');
        })
        .finally(() => {
          if (active) setHistoryBusy(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    logged,
    adminPage,
    historySearch,
    historyStatus,
    historyFrom,
    historyTo,
    historyPage,
    historySize,
    historyRevision,
  ]);
  const stockRead = useReadPage<Item>(request, '/stock', { search: stockSearch, origin: stockOrigin, visibility: adminPage === 'stock' ? stockVisibility : 'all', gradingStatus: stockGradingStatus, gradingCompany: stockGradingCompany, gradingText: stockGradingGrade }, logged && (adminPage === 'stock' || adminPage === 'sales'), historyRevision);
  const clientsRead = useReadPage<Client>(request, '/sellers', { search: clientSearch }, logged && adminPage === 'clients', historyRevision);
  useEffect(() => {
    setItems(previous => [...previous.filter(item => selectedItemIds.includes(item._id) && !stockRead.items.some(row => row._id === item._id)), ...stockRead.items]);
  }, [stockRead.items, selectedItemIds]);
  const salesHistoryRead = useReadPage<Sale>(request, '/sales', { paymentStatus: collectionFilter }, logged && adminPage === 'salesHistory', historyRevision);
  const conflictsRead = useReadPage<SaleConflict>(request, '/conflicts', {}, logged && adminPage === 'saleConflicts', historyRevision);
  function navigateAdminPage(page: AdminPage, replace = false) {
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
      const [authStatus] = await Promise.all([
        request<{ signupEnabled: boolean }>('/auth/status'),
      ]);
      setHistoryRevision((value) => value + 1);
      setSignupEnabled(authStatus.signupEnabled);
      setLogged(true);
      setError('');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Connexion impossible';
      if (message === 'UNAUTHENTICATED' || message === 'INVALID_SESSION') {
        realtime.reset();
      setLogged(false);
        setError('');
      } else setError(message);
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
  async function searchPokemonCards(draft: PurchaseDraft) {
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
      const localized = await Promise.all(
        cardLanguages.map(async ({ id: language }) => {
          const filter = search.localId
            ? `localId=${encodeURIComponent(search.localId)}`
            : `name=${encodeURIComponent(search.name)}`;
          const response = await fetch(
            `https://api.tcgdex.net/v2/${language}/cards?${filter}&pagination:page=1&pagination:itemsPerPage=100`,
          );
          if (!response.ok) throw new Error('Catalogue Pokémon indisponible.');
          const cards = (await response.json()) as Omit<CatalogCard, 'language'>[];
          return cards
            .filter(
              (card) =>
                !search.localId ||
                normalizeCardNumber(card.localId) === normalizeCardNumber(search.localId!),
            )
            .map((card) => ({ ...card, language }));
        }),
      );
      let results = localized.flat();
      const setMetadata = new Map<string, { official?: number; total?: number; name?: string }>();
      if (search.denominator !== undefined && results.length) {
        const setIds = [
          ...new Set(results.map((card) => card.id.slice(0, card.id.lastIndexOf('-')))),
        ];
        await Promise.all(
          setIds.map(async (setId) => {
            if (!setId) return;
            const cardLanguage =
              results.find((card) => card.id.startsWith(`${setId}-`))?.language ?? 'en';
            try {
              const response = await fetch(
                `https://api.tcgdex.net/v2/${cardLanguage}/sets/${encodeURIComponent(setId)}`,
              );
              if (!response.ok) return;
              const set = (await response.json()) as {
                cardCount?: { official?: number; total?: number };
                name?: string;
              };
              setMetadata.set(setId, { ...set.cardCount, name: set.name });
            } catch {
              // An unverified denominator must not return a potentially wrong card.
            }
          }),
        );
        results = results.filter((card) => {
          const setId = card.id.slice(0, card.id.lastIndexOf('-'));
          const count = setMetadata.get(setId);
          return count?.official === search.denominator || count?.total === search.denominator;
        });
      }
      const normalizedName = normalizeCardName(search.name);
      if (search.localId && normalizedName) {
        const scoreName = (card: CatalogCard) => {
          const setId = card.id.slice(0, card.id.lastIndexOf('-'));
          const candidates = [
            normalizeCardName(card.name),
            normalizeCardName(setMetadata.get(setId)?.name ?? ''),
          ];
          if (candidates.some((name) => name === normalizedName)) return 0;
          if (candidates.some((name) => name.startsWith(normalizedName))) return 1;
          if (candidates.some((name) => name.includes(normalizedName))) return 2;
          return Number.POSITIVE_INFINITY;
        };
        const bestScore = Math.min(...results.map(scoreName));
        results = Number.isFinite(bestScore)
          ? results.filter((card) => scoreName(card) === bestScore)
          : [];
      }
      results = results
        .sort((a, b) => {
          const nameScore = (card: CatalogCard) => {
            if (!normalizedName) return 0;
            const name = normalizeCardName(card.name);
            return name === normalizedName
              ? 0
              : name.startsWith(normalizedName)
                ? 1
                : name.includes(normalizedName)
                  ? 2
                  : 3;
          };
          return nameScore(a) - nameScore(b) || a.id.localeCompare(b.id);
        })
        .slice(0, search.localId ? 30 : 15);
      if (!current()) return;
      if (!results.length) {
        setError(
          `Aucune correspondance exacte pour « ${term} ». Aucun résultat approximatif n’a été affiché.`,
        );
      }
      const languagesByCard = new Map<string, CatalogLanguage[]>();
      for (const card of results) {
        const found = languagesByCard.get(card.id) ?? [];
        if (!found.includes(card.language)) found.push(card.language);
        languagesByCard.set(card.id, found);
      }
      const hydrated = results.map((card) => ({
        ...card,
        availableLanguages: languagesByCard.get(card.id) ?? [card.language],
      }));
      if (!current()) return;
      setPurchaseItems((rows) =>
        rows.map((row) =>
          row.key === draft.key ? { ...row, cardResults: hydrated, searching: false } : row,
        ),
      );
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
              set?: { name?: string };
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
        set?: { name?: string };
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
    setLoading(true);
    try {
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
          operationId: crypto.randomUUID(),
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
          purchasePriceCents: Math.round(marketValue * discountPercent),
          askingPriceCents: Math.round((asking ?? marketValue) * 100),
          vatRegime: 'margin',
        };
      });
      const reference = purchaseReference.trim() || `R-${Date.now()}`;
      const occurredAt = dateAtCurrentLocalTime(purchaseDate);
      const purchase = await request<{ purchaseId: string; itemIds: string[] }>('/purchases', {
        method: 'POST',
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          sellerId: clientId,
          occurredAt,
          reference,
          items,
        }),
      });
      const photoFailures: string[] = [];
      for (const [index, item] of validItems.entries()) {
        if (!item.photo || !purchase.itemIds[index]) continue;
        try {
          await uploadItemAttachment(purchase.itemIds[index], item.photo);
        } catch (error) {
          photoFailures.push(`${item.name} (${error instanceof Error ? error.message : 'Échec de l’envoi'})`);
        }
      }
      let receiptFailure = '';
      if (downloadReceipt) await downloadPurchaseReceipt({
        reference,
        occurredAt,
        status: 'pending',
        client,
        items: validItems.map((item) => ({
          name: item.name.trim(),
          series: item.series.trim(),
          identifier: item.identifier.trim(),
          language:
            item.language === 'en' ? 'Anglais' : item.language === 'ja' ? 'Japonais' : 'Français',
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
      setSelectedClient('');
      setPurchaseReference('');
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
      await load();
      if (receiptFailure)
        setError(
          `Rachat ${reference} enregistré. Le bordereau n’a pas pu être téléchargé : ${receiptFailure} Réessayez depuis l’historique.${photoFailures.length ? ` Photos non envoyées : ${photoFailures.join(', ')}.` : ''}`,
        );
      else if (photoFailures.length)
        setError(`Rachat ${reference} enregistré.${downloadReceipt ? ' Le bordereau PDF a été téléchargé.' : ''} Photo non envoyée pour : ${photoFailures.join(', ')}.`);
      else
        setError(
          `Rachat ${reference} enregistré en attente de validation du client.${downloadReceipt ? ' Le bordereau PDF a été téléchargé.' : ' Le bordereau reste disponible dans l’historique.'}`,
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rachat impossible.');
    } finally {
      setLoading(false);
    }
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
    if (!window.confirm(`Annuler le rachat ${purchase.reference} en attente ?`)) return;
    setLoading(true);
    try {
      await request(`/purchases/${encodeURIComponent(purchase._id)}/cancel`, { method: 'POST' });
      await load();
      setError(`Rachat ${purchase.reference} annulé.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Annulation du rachat impossible.');
    } finally {
      setLoading(false);
    }
  }
  async function uploadItemAttachment(itemId: string, file: File) {
    file = await optimizeUploadImage(file, API);
    const form = new FormData();
    form.append('itemId', itemId);
    form.append('file', file);
    const headers = new Headers(sessionActivityHeaders());
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
    const response = await fetch(`${API}/attachments`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: form,
    });
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
      occurredAt,
      status: purchase.status as 'pending' | 'active' | 'cancelled',
      client,
      items: purchase.items.map((item) => ({
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
      })),
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
    const amount = Number(salePrices[itemId]?.replace(',', '.'));
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
    if (!selectedItemIds.length) return setError('Sélectionnez au moins un article.');
    const saleItems = selectedItemIds.map((itemId) => {
      const item = items.find((entry) => entry._id === itemId);
      const text =
        salePrices[itemId] ??
        (item?.askingPriceCents === undefined ? '' : (item.askingPriceCents / 100).toString());
      const amount = Number(text.replace(',', '.'));
      if (!item || !text.trim() || !Number.isFinite(amount) || amount < 0) return null;
      return { itemId, salePriceCents: Math.round(amount * 100) };
    });
    if (saleItems.some(sale => { const item = items.find(item => item._id === sale?.itemId); return item?.origin === 'consignment' && sale && sale.salePriceCents < (item.agreedPriceCents ?? item.askingPriceCents ?? 0); })) return setError('Un prix est inférieur à l’accord du déposant. Enregistrez son autorisation dans Dépôts-ventes avant la vente.');
    if (saleItems.some((item) => item === null))
      return setError('Saisissez un prix de vente valide pour chaque article du panier.');
    setLoading(true);
    try {
      const total = saleItems.reduce((sum, item) => sum + (item?.salePriceCents ?? 0), 0);
      const payload = { items: saleItems, ...paymentPayload(salePaymentDraft, total) };
      const signature = JSON.stringify(payload);
      if (saleAttempt.current?.signature !== signature) saleAttempt.current = { signature, body: JSON.stringify({ operationId: crypto.randomUUID(), occurredAt: Date.now(), ...payload }) };
      await request('/sales/bulk', { method: 'POST', body: saleAttempt.current.body });
      saleAttempt.current = null;
      setSalePaymentDraft(newPaymentDraft());
      setSaleConfirmOpen(false);
      setSelectedItemIds([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Vente groupée impossible.');
    } finally {
      setLoading(false);
    }
  }
  async function saveSalePayment() {
    if (!paymentSale) return;
    setLoading(true);
    setError('');
    try {
      const { payment } = paymentPayload(editPaymentDraft, paymentSale.salePriceCents);
      if (!payment) throw new Error('Choisissez un mode de paiement reçu.');
      const payload = { saleId: paymentSale._id, ...payment };
      const signature = JSON.stringify(payload);
      if (paymentAttempt.current?.signature !== signature) paymentAttempt.current = { signature, body: JSON.stringify({ operationId: crypto.randomUUID(), ...payload }) };
      await request('/sales/payment', { method: 'POST', body: paymentAttempt.current.body });
      paymentAttempt.current = null;
      setPaymentSale(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Encaissement impossible.'); }
    finally { setLoading(false); }
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
    const amount = Number(salePrices[itemId]?.replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0)
      return setError('Saisissez un prix de vente valide.');
    setLoading(true);
    try {
      await request('/stock/asking-price', {
        method: 'POST',
        body: JSON.stringify({ itemId, askingPriceCents: Math.round(amount * 100) }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Modification du prix impossible.');
    } finally {
      setLoading(false);
    }
  }
  async function cancelSale(saleId: string) {
    setLoading(true);
    try {
      await request('/sales/cancel', {
        method: 'POST',
        body: JSON.stringify({ operationId: crypto.randomUUID(), saleId }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Annulation impossible.');
    } finally {
      setLoading(false);
    }
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
      setLogged(false);
      setItems([]);
      setPurchases([]);
      setSalesData([]);
    }
  }
  useEffect(() => {
    let cancelled = false;
    void request<{ authenticated: boolean; signupEnabled: boolean }>('/auth/status')
      .then(async (status) => {
        if (cancelled) return;
        setSignupEnabled(status.signupEnabled);
        if (status.authenticated) await load();
      })
      .catch(() => {
        if (!cancelled) {
          realtime.reset();
      setLogged(false);
          setSignupEnabled(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [load]);
  async function exportXlsx() {
    const [purchases, consignments, balances, exportSales, exportStock, clients] = await Promise.all([request<Purchase[]>('/purchases'), request<Consignment[]>('/consignments'), request<ConsignmentBalances>('/consignments/balances'), request<Sale[]>('/sales'), request<Item[]>('/stock'), request<Client[]>('/sellers')]);
    const { default: ExcelJS } = await import('exceljs');
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
      'Valeur actuelle (€)',
      'Décote (%)',
      'N° série',
      'Prix achat (€)',
      'Prix vente demandé (€)',
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
          new Date(purchase.occurredAt),
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
          item.marketValueCents === undefined ? '' : item.marketValueCents / 100,
          item.discountPercent ?? '',
          item.serialNumber ?? '',
          item.purchasePriceCents / 100,
          item.askingPriceCents === undefined ? '' : item.askingPriceCents / 100,
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
      'Prix vente (€)',
      'Référence achat origine',
      'Date achat origine',
      'Vendeur origine',
      'Valeur actuelle (€)',
      'Décote (%)',
      'Prix achat (€)',
      'Écart vente moins achat (€)',
      'Régime TVA',
      'Client final',
      'Statut',
      'Encaissement', 'Espèces reçues (€)', 'Virement reçu (€)', 'Date réception', 'Référence paiement',
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
        new Date(sale.occurredAt),
        sale.salePriceCents / 100,
        sale.purchaseReference,
        new Date(sale.purchaseOccurredAt),
        sale.sellerName,
        sale.marketValueCents === undefined ? '' : sale.marketValueCents / 100,
        sale.discountPercent ?? '',
        sale.purchasePriceCents / 100,
        (sale.salePriceCents - sale.purchasePriceCents) / 100,
        sale.vatRegime,
        sale.customerName ?? '',
        sale.status,
        paymentStatusLabel(sale), sale.payment ? sale.payment.cashCents / 100 : '', sale.payment ? sale.payment.transferCents / 100 : '', sale.payment ? new Date(sale.payment.receivedAt) : '', sale.payment?.reference ?? '',
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
      'Valeur actuelle (€)',
      'Décote (%)',
      'Prix achat (€)',
      'Prix vente demandé (€)',
      'Régime TVA',
      'Statut',
      'Visibilité catalogue',
    ]);
    for (const item of exportStock) {
      if (item.status === 'pending' || item.status === 'cancelled' || item.origin === 'consignment') continue;
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
        new Date(item.purchaseOccurredAt),
        item.sellerName,
        item.marketValueCents === undefined ? '' : item.marketValueCents / 100,
        item.discountPercent ?? '',
        item.purchasePriceCents / 100,
        item.askingPriceCents === undefined ? '' : item.askingPriceCents / 100,
        item.vatRegime,
        item.status,
        item.hiddenFromCatalogue ? 'Masqué' : 'Visible',
      ]);
    }
    const depositSheet = wb.addWorksheet('Dépôts');
    depositSheet.addRow(['Référence', 'Date dépôt', 'Échéance', 'Déposant', 'Identifiant article', 'Article', 'Type', 'Description', 'Prix convenu (€)', 'Commission (%)', 'Au déposant au prix convenu (€)', 'Statut', 'Conditions']);
    for (const deposit of consignments) for (const item of deposit.items) depositSheet.addRow([deposit.reference, new Date(deposit.occurredAt), deposit.dueAt ? new Date(deposit.dueAt) : '', deposit.sellerName, item._id, item.name, item.productType, item.description ?? '', (item.agreedPriceCents ?? item.askingPriceCents) / 100, item.commissionRateBps / 100, ((item.agreedPriceCents ?? item.askingPriceCents) - Math.round((item.agreedPriceCents ?? item.askingPriceCents) * item.commissionRateBps / 10000)) / 100, item.status, deposit.notes ?? '']);
    const commissionSheet = wb.addWorksheet('Commissions');
    commissionSheet.addRow(['Vente', 'Article', 'Déposant', 'Date', 'Encaissement (€)', 'Commission (%)', 'Commission (€)', 'Part déposant (€)', 'Statut', 'Encaissement', 'Espèces reçues (€)', 'Virement reçu (€)', 'Date réception', 'Référence paiement']);
    for (const sale of exportSales.filter(sale => sale.origin === 'consignment')) commissionSheet.addRow([sale._id, sale.itemName, sale.sellerName, new Date(sale.occurredAt), sale.salePriceCents / 100, (sale.commissionRateBps ?? 0) / 100, (sale.commissionCents ?? 0) / 100, (sale.depositorAmountCents ?? 0) / 100, sale.status, paymentStatusLabel(sale), sale.payment ? sale.payment.cashCents / 100 : '', sale.payment ? sale.payment.transferCents / 100 : '', sale.payment ? new Date(sale.payment.receivedAt) : '', sale.payment?.reference ?? '']);
    const paymentsSheet = wb.addWorksheet('Reversements');
    paymentsSheet.addRow(['Identifiant', 'Déposant', 'Date', 'Montant (€)', 'Mode', 'Référence']);
    for (const payment of balances.payments) paymentsSheet.addRow([payment._id, payment.sellerName, new Date(payment.occurredAt), payment.amountCents / 100, payment.method, payment.reference ?? '']);
    const balancesSheet = wb.addWorksheet('Soldes déposants');
    balancesSheet.addRow(['Déposant', 'Part des ventes actives (€)', 'Versé (€)', 'Solde dû / régularisation négative (€)']);
    for (const balance of balances.balances) balancesSheet.addRow([balance.sellerName, balance.earnedCents / 100, balance.paidCents / 100, balance.balanceCents / 100]);
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
    meta.addRow(['Généré le', new Date()]);
    meta.addRow(['Périmètre', 'Données centrales au moment de la génération']);
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
    const blob = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([blob]));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'suivi-tva-marge.xlsx';
    a.click();
    URL.revokeObjectURL(url);
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
      {!logged && <header className="workspace-header"><BrandIdentity /></header>}
      {logged && (
        <>
          <aside className="workspace-sidebar">
            <a className="workspace-home" href={adminPagePaths.dashboard} onClick={(event) => { event.preventDefault(); navigateAdminPage('dashboard'); }} aria-label="Vue d’ensemble"><BrandIdentity /></a>
            <span className="navigation-caption">Espace de gestion</span>
            <nav className="admin-nav" aria-label="Navigation administrateur">
              {([
                ['dashboard', 'Vue d’ensemble', FiGrid],
                ['stock', 'Stock', FiPackage],
                ['sales', 'Ventes', FiShoppingCart],
                ['purchaseHistory', 'Rachats', FiShoppingBag],
                ['consignments', 'Dépôts-ventes', FiArchive],
                ['clients', 'Clients', FiUsers],
                ['exports', 'Exports', FiDownload],
                ['settings', 'Paramètres', FiSettings],
              ] as const).map(([page, label, Icon]) => {
                const active = adminPage === page || (page === 'sales' && ['saleSummary', 'salesHistory', 'saleConflicts'].includes(adminPage)) || (page === 'purchaseHistory' && adminPage === 'purchases') || (page === 'consignments' && ['consignmentNew', 'consignmentPayouts'].includes(adminPage));
                const children: [AdminPage, string][] = page === 'sales' ? [['sales', 'Nouvelle vente'], ['salesHistory', 'Historique'], ['saleConflicts', 'Conflits']] : page === 'purchaseHistory' ? [['purchaseHistory', 'Historique'], ['purchases', 'Nouveau rachat']] : page === 'consignments' ? [['consignments', 'Dossiers'], ['consignmentNew', 'Nouveau dépôt'], ['consignmentPayouts', 'Reversements']] : [];
                return <div key={page} className={`navigation-group ${page === 'exports' ? 'navigation-utilities' : ''}`}><a href={adminPagePaths[page]} aria-current={active ? 'page' : undefined} onClick={(event) => { event.preventDefault(); navigateAdminPage(page); }}>
                  <Icon className="navigation-icon" aria-hidden="true" focusable="false" />
                  <span>{label}</span>
                </a>{active && children.length > 0 && <div className="navigation-submenu">{children.map(([destination, title]) => <a key={destination} href={adminPagePaths[destination]} aria-current={adminPage === destination ? 'page' : undefined} onClick={event => { event.preventDefault(); navigateAdminPage(destination); }}>{title}</a>)}</div>}</div>;
              })}
            </nav>
            <p className="sidebar-note">Stock, ventes et suivi clients<br />dans un même espace.</p>
          </aside>
          <div className="workspace-page-heading">
            <div><p className="eyebrow">Gestion / {{ dashboard: 'Vue d’ensemble', stock: 'Inventaire', sales: 'Ventes', saleSummary: 'Ventes', salesHistory: 'Ventes', saleConflicts: 'Ventes', purchases: 'Rachats', purchaseHistory: 'Rachats', consignments: 'Dépôts-ventes', consignmentNew: 'Nouveau dépôt', consignmentPayouts: 'Reversements', clients: 'Clients', exports: 'Outils', settings: 'Compte' }[adminPage]}</p>
              <h1>{{ dashboard: 'Votre activité en un regard', stock: 'Stock disponible', sales: 'Nouvelle vente', saleSummary: 'Panier et confirmation', salesHistory: 'Historique des ventes', saleConflicts: 'Conflits à résoudre', purchases: 'Nouveau rachat', purchaseHistory: 'Historique des rachats', consignments: 'Dépôts-ventes', consignmentNew: 'Nouveau dépôt', consignmentPayouts: 'Reversements', clients: 'Répertoire clients', exports: 'Exports', settings: 'Paramètres' }[adminPage]}</h1>
              <p>{{ dashboard: 'Suivez les encaissements et les opérations de votre boutique.', stock: 'Retrouvez vos articles et gérez leur visibilité au catalogue.', sales: 'Recherchez les articles à ajouter au panier.', saleSummary: 'Vérifiez les articles et renseignez le règlement.', salesHistory: 'Consultez les ventes et suivez leurs encaissements.', saleConflicts: 'Examinez les ventes concurrentes et consignez leur résolution.', purchases: 'Sélectionnez un client, puis ajoutez les articles du rachat.', purchaseHistory: 'Consultez les dossiers et poursuivez les opérations en attente.', consignments: 'Retrouvez les dossiers et les articles confiés.', consignmentNew: 'Identifiez le déposant et les articles confiés à la boutique.', consignmentPayouts: 'Consultez les soldes et enregistrez les paiements aux déposants.', clients: 'Retrouvez les coordonnées de vos vendeurs et déposants.', exports: 'Téléchargez vos données de gestion.', settings: 'Gérez votre signataire et les préférences de votre espace.' }[adminPage]}</p>
            </div>
            {adminPage === 'purchaseHistory' && <button onClick={() => navigateAdminPage('purchases')}>+ Nouveau rachat</button>}
            {adminPage === 'stock' && <div className="actions"><a href="/convention" target="_blank" rel="noreferrer">Catalogue convention <FiExternalLink aria-hidden="true" focusable="false" /></a><button onClick={() => navigateAdminPage('sales')}>+ Nouvelle vente</button></div>}
            {adminPage === 'consignments' && <button onClick={() => navigateAdminPage('consignmentNew')}>+ Nouveau dépôt</button>}
            {adminPage === 'dashboard' && <button onClick={() => navigateAdminPage('sales')}>+ Nouvelle vente</button>}
          </div>
          {(() => {
            const links: [AdminPage, string][] = ['sales', 'saleSummary', 'salesHistory', 'saleConflicts'].includes(adminPage) ? [['sales', 'Nouvelle vente'], ['salesHistory', 'Historique'], ['saleConflicts', 'Conflits']] : ['purchases', 'purchaseHistory'].includes(adminPage) ? [['purchaseHistory', 'Historique'], ['purchases', 'Nouveau rachat']] : ['consignments', 'consignmentNew', 'consignmentPayouts'].includes(adminPage) ? [['consignments', 'Dossiers'], ['consignmentNew', 'Nouveau dépôt'], ['consignmentPayouts', 'Reversements']] : [];
            return links.length ? <nav className="sales-section-nav" aria-label="Navigation de la section">{links.map(([page, label]) => <a key={page} href={adminPagePaths[page]} aria-current={adminPage === page ? 'page' : undefined} onClick={event => { event.preventDefault(); navigateAdminPage(page); }}>{label}</a>)}</nav> : null;
          })()}
        </>
      )}
      {logged && adminPage === 'exports' && (
        <section className="panel export-page">
          <p className="eyebrow">Outils de gestion</p>
          <h2>Télécharger les données</h2>
          <p>Créez un classeur Excel avec les données de gestion actuellement disponibles pour votre compte.</p>
          <div className="actions"><button type="button" onClick={() => void exportXlsx()}>Télécharger le classeur Excel</button></div>
          <p className="muted">Le téléchargement utilise les exports métier existants et conserve leurs règles de calcul.</p>
        </section>
      )}
      {!logged ? (
        <section className="panel">
          <h2>{resetToken ? 'Nouveau mot de passe' : 'Connexion'}</h2>
          {resetToken ? (
            <>
              <label>
                Nouveau mot de passe (12 caractères minimum)
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </label>
              <button type="button" disabled={loading} onClick={() => void completePasswordReset()}>
                Modifier le mot de passe
              </button>
            </>
          ) : (
            <>
              <label>
                E-mail
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label>
                Mot de passe
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <div className="actions">
                <button type="button" onClick={() => void auth('login')} disabled={loading}>
                  Se connecter
                </button>
                {signupEnabled && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void auth('register')}
                    disabled={loading}
                  >
                    Créer un compte
                  </button>
                )}
              </div>
              <button
                type="button"
                className="secondary"
                disabled={loading}
                onClick={() => void requestPasswordReset()}
              >
                Mot de passe oublié ?
              </button>
              {resetRequested && (
                <p>
                  Si un compte correspond à cette adresse, un lien de réinitialisation a été envoyé.
                </p>
              )}
            </>
          )}
          {error && <p className="error">{error}</p>}
        </section>
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
            </Suspense><section className="panel"><h2>Session</h2><p>Fermez votre session sur cet appareil.</p><button type="button" className="secondary" onClick={() => void logout()}>Déconnexion</button></section></>
          )}
          <section className="stats" hidden={adminPage !== 'stock'}>
            <strong>
              {stockRead.items.length}
              <span> articles sur cette page</span>
            </strong>
            <span>Source : données centrales · Internet requis</span>
          </section>
          <section className="panel" hidden={adminPage !== 'stock'}>
            <h2>Mon stock</h2>
            <label>Visibilité du catalogue<select value={stockVisibility} disabled={visibilityBusy} onChange={event => { setStockVisibility(event.target.value as typeof stockVisibility); setStockPage(1); setVisibilitySelectedIds([]); }}><option value="all">Tous les articles</option><option value="visible">Visibles dans le catalogue</option><option value="hidden">Masqués du catalogue</option></select></label>
            {visibilityNotice && <p role="status">{visibilityNotice}</p>}

            <label>Origine<select value={stockOrigin} onChange={event => { setStockOrigin(event.target.value); setStockPage(1); setVisibilitySelectedIds([]); }}><option value="all">Tous les articles</option><option value="purchase">Articles rachetés</option><option value="consignment">Dépôts-ventes</option></select></label>
            {error && <p className="error">{error}</p>}
            <label>
              Rechercher dans le stock
              <input
                value={stockSearch}
                onChange={(event) => {
                  setStockSearch(event.target.value);
                  setStockPage(1); setVisibilitySelectedIds([]);
                }}
                placeholder="Nom, description, série, référence, client ou certificat"
              />
            </label>
            <div className="form-grid stock-grading-filters" aria-label="Filtres de gradation">
              <label>
                Gradation
                <select
                  value={stockGradingStatus}
                  onChange={(event) => {
                    setStockGradingStatus(event.target.value as typeof stockGradingStatus);
                    setStockPage(1); setVisibilitySelectedIds([]);
                  }}
                >
                  <option value="all">Toutes</option>
                  <option value="graded">Gradées</option>
                  <option value="ungraded">Non gradées</option>
                </select>
              </label>
              <label>
                Société
                <select
                  value={stockGradingCompany}
                  onChange={(event) => {
                    setStockGradingCompany(event.target.value as typeof stockGradingCompany);
                    setStockPage(1); setVisibilitySelectedIds([]);
                  }}
                >
                  <option value="all">Toutes les sociétés</option>
                  {gradingCompanies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Note de gradation
                <input
                  type="search"
                  value={stockGradingGrade}
                  onChange={(event) => {
                    setStockGradingGrade(event.target.value);
                    setStockPage(1); setVisibilitySelectedIds([]);
                  }}
                  placeholder="Ex. 10 ou 9.5"
                />
              </label>
            </div>
            <StockVisibilityToolbar selectedCount={selectedVisibilityIds.length} resultCount={filteredItems.length} pageCount={visibleItems.length} disabled={visibilityBusy || loading}
              onSelectPage={() => setVisibilitySelectedIds(visibleItems.map(item => item._id))}
              onSelectResults={() => setVisibilitySelectedIds(filteredItems.slice(0, 500).map(item => item._id))}
              onClear={() => setVisibilitySelectedIds([])}
              onHide={() => void setCatalogueVisibility(selectedVisibilityIds, true)}
              onShow={() => void setCatalogueVisibility(selectedVisibilityIds, false)} />
            <div className="actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setSelectedItemIds(previous => [...new Set([...previous, ...filteredItems.map(item => item._id)])])}
              >
                Ajouter cette page au panier ({filteredItems.length})
              </button>
              <button type="button" className="secondary" onClick={() => setSelectedItemIds([])}>
                Vider le panier
              </button>
            </div>
            {selectedItemIds.length > 0 && (
              <div className="stock-sale-basket">
                <div className="stock-sale-basket-heading">
                  <div>
                    <h3>Panier de vente · {selectedItemIds.length} carte(s)</h3>
                    <span>Ouvrez le résumé pour modifier les prix et vérifier la vente.</span>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setSelectedItemIds([])}
                  >
                    Vider
                  </button>
                </div>
                <button
                  type="button"
                  className="cart-summary-link"
                  onClick={() => navigateAdminPage('saleSummary')}
                >
                  <FiShoppingCart aria-hidden="true" focusable="false" />
                  Voir le résumé du panier
                </button>
              </div>
            )}
            {visibleItems.map((item) => (
              <article key={item._id} className="stock-row">
                <label className="stock-select">
                  <input
                    type="checkbox"
                    aria-label={`Ajouter ${item.name} au panier de vente`}
                    checked={selectedItemIds.includes(item._id)}
                    onChange={(event) =>
                      setSelectedItemIds((ids) =>
                        event.target.checked
                          ? [...ids, item._id]
                          : ids.filter((id) => id !== item._id),
                      )
                    }
                  />
                </label>
                <div className="stock-content">
                  <div className="stock-details">
                    <div className="stock-visibility-actions">
                      <label><input type="checkbox" aria-label={`Sélectionner ${item.name} pour modifier sa visibilité`} disabled={visibilityBusy || loading || (!selectedVisibilityIds.includes(item._id) && selectedVisibilityIds.length >= 500)} checked={selectedVisibilityIds.includes(item._id)} onChange={event => setVisibilitySelectedIds(ids => event.target.checked ? [...new Set([...ids, item._id])] : ids.filter(id => id !== item._id))} /> Sélectionner pour la visibilité</label>
                      <span className={`stock-visibility-badge${item.hiddenFromCatalogue ? ' is-hidden' : ''}`}>{item.hiddenFromCatalogue ? 'Masqué du catalogue' : 'Visible dans le catalogue'}</span>
                      <button type="button" className="secondary" disabled={visibilityBusy || loading} aria-label={`${item.hiddenFromCatalogue ? 'Afficher' : 'Masquer'} ${item.name} dans le catalogue`} onClick={() => void setCatalogueVisibility([item._id], !item.hiddenFromCatalogue)}>{item.hiddenFromCatalogue ? 'Afficher dans le catalogue' : 'Masquer du catalogue'}</button>
                    </div>
                    <b>{item.name}</b>{item.origin === 'consignment' && <span className="consignment-badge">Dépôt-vente{item.productType === 'sealed' ? ' · Scellé' : ''}</span>}
                    <small>
                      {[item.series, item.identifier, item.serialNumber]
                        .filter(Boolean)
                        .join(' · ') || 'Carte sans détails'}{' '}
                      {item.language && ` · ${languageLabel(item.language)}`}{(!item.productType || item.productType === 'card') && ` · ${conditionLabel(item.condition)}`}
                      {item.origin === 'consignment' ? ` · Dépôt de ${item.sellerName} · Commission ${(item.commissionRateBps ?? 3000) / 100} %` : ` · Racheté à ${item.sellerName} · Achat ${(item.purchasePriceCents / 100).toFixed(2)} €`}
                    </small>
                    {item.gradingCompany && (
                      <GradingBadge
                        company={item.gradingCompany}
                        grade={item.gradingGrade}
                        certificate={item.gradingCertificate}
                      />
                    )}
                    {item.gradingCompany && item.gradingNotes && (
                      <small>Notes : {item.gradingNotes}</small>
                    )}
                    {item.photos?.map((photo) => (
                      <a
                        className="item-photo-link"
                        key={photo._id}
                        href={`${API}/attachments/${encodeURIComponent(photo._id)}/download`}
                      >
                        Photo : {photo.filename}
                      </a>
                    ))}
                    {item.origin === 'consignment' && <p>Prix convenu : {money(item.agreedPriceCents ?? item.askingPriceCents ?? 0)}. Pour modifier l’accord, ouvrez <button type="button" className="secondary" onClick={() => navigateAdminPage('consignments')}>Dépôts-ventes</button>.</p>}
                    <div className="price-edit">
                      <input
                        aria-label={`Prix de vente demandé pour ${item.name}`}
                        inputMode="decimal"
                        placeholder="Prix de vente (€)"
                        value={
                          salePrices[item._id] ??
                          (item.askingPriceCents === undefined
                            ? ''
                            : (item.askingPriceCents / 100).toFixed(2))
                        }
                        onChange={(event) =>
                          setSalePrices((values) => ({ ...values, [item._id]: event.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="secondary"
                        disabled={loading}
                        onClick={() => void saveAskingPrice(item._id)}
                      >
                        Enregistrer le prix
                      </button>
                    </div>
                  </div>
                  <ItemThumbnail name={item.name} catalogueImageUrl={item.catalogueImageUrl} photos={item.photos} apiBase={API} />
                </div>
                {item.askingPriceCents !== undefined && (
                  <strong>Vente {(item.askingPriceCents / 100).toFixed(2)} €</strong>
                )}
              </article>
            ))}
            
            {stockPagination()}
          </section>
          <section className="panel" hidden={adminPage !== 'sales'}>
            <h2>Choisir les articles</h2>
            {error && <p className="error" role="alert">{error}</p>}
            <label>Origine<select value={stockOrigin} onChange={event => { setStockOrigin(event.target.value); setStockPage(1); setVisibilitySelectedIds([]); }}><option value="all">Tous les articles</option><option value="purchase">Articles rachetés</option><option value="consignment">Dépôts-ventes</option></select></label>
            {selectedItemIds.length > 0 && (
              <p className="sale-cart-nudge">
                {selectedItemIds.length} article(s) dans le panier. Utilisez le caddie flottant pour
                ouvrir le résumé.
              </p>
            )}
            <label>
              Rechercher dans le stock
              <input
                value={stockSearch}
                onChange={(event) => {
                  setStockSearch(event.target.value);
                  setStockPage(1); setVisibilitySelectedIds([]);
                }}
                placeholder="Nom, série ou identifiant"
              />
            </label>
            <div className="sale-search-results">
              {visibleItems.map((item) => (
                <article key={item._id} className="sale-search-row">
                  <ItemThumbnail name={item.name} catalogueImageUrl={item.catalogueImageUrl} photos={item.photos} apiBase={API} />
                  <div className="sale-item-description">
                    <b>{item.name}</b>{item.origin === 'consignment' && <span className="consignment-badge">Dépôt-vente{item.productType === 'sealed' ? ' · Scellé' : ''}</span>}
                    <small>{[item.series, item.identifier].filter(Boolean).join(' · ')}</small>
                  </div>
                  <strong>{((item.askingPriceCents ?? 0) / 100).toFixed(2)} €</strong>
                  <button
                    type="button"
                    className="secondary"
                    disabled={selectedItemIds.includes(item._id)}
                    onClick={() => setSelectedItemIds((ids) => [...ids, item._id])}
                  >
                    {selectedItemIds.includes(item._id) ? 'Dans le panier' : 'Ajouter'}
                  </button>
                </article>
              ))}
            </div>
            {stockPagination()}
            
          </section>
          <section className="panel sale-cart-summary" hidden={adminPage !== 'saleSummary'}>
            <div className="sale-cart-summary-heading">
              <div>
                <h2>Résumé du panier</h2>
                {error && <p className="error" role="alert">{error}</p>}
                <p>{selectedItemIds.length} article(s) sélectionné(s)</p>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => navigateAdminPage('sales')}
              >
                Retour à la recherche
              </button>
            </div>
            {selectedItemIds.map((itemId) => {
              const item = items.find((entry) => entry._id === itemId);
              if (!item) return null;
              return (
                <article className="sale-cart-summary-row" key={itemId}>
                  <ItemThumbnail name={item.name} catalogueImageUrl={item.catalogueImageUrl} photos={item.photos} apiBase={API} />
                  <div className="sale-cart-summary-name">
                    <b>{item.name}</b>{item.origin === 'consignment' && <span className="consignment-badge">Dépôt-vente{item.productType === 'sealed' ? ' · Scellé' : ''}</span>}
                    <small>{[item.series, item.identifier].filter(Boolean).join(' · ')}</small>
                    {item.origin === 'consignment' && <small>{consignmentSplitLabel(item, salePrices[itemId])}</small>}
                  </div>
                  <label>
                    Prix de vente (€)
                    <input
                      inputMode="decimal"
                      value={
                        salePrices[itemId] ??
                        (item.askingPriceCents === undefined
                          ? ''
                          : (item.askingPriceCents / 100).toFixed(2))
                      }
                      onChange={(event) =>
                        setSalePrices((values) => ({ ...values, [itemId]: event.target.value }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Retirer ${item.name} du panier`}
                    onClick={() => setSelectedItemIds((ids) => ids.filter((id) => id !== itemId))}
                  >
                    Retirer
                  </button>
                </article>
              );
            })}
            {!selectedItemIds.length ? (
              <p>Le panier est vide. Retournez à la recherche pour ajouter des cartes.</p>
            ) : (
              <div className="sale-cart-summary-footer">
                <strong>
                  Total proposé{' '}
                  <span>
                    {new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(
                      selectedSaleTotalCents / 100,
                    )}
                  </span>
                </strong>
                <p>L’heure actuelle sera utilisée lors de l’enregistrement de la vente.</p>
                <button type="button" disabled={loading} onClick={() => setSaleConfirmOpen(true)}>
                  Vérifier et confirmer la vente
                </button>
              </div>
            )}
          </section>
          <section className="panel" hidden={adminPage !== 'clients'}>
            <h2>Clients</h2>
            <p>Créez une fiche client une seule fois, puis associez ses rachats à son dossier.</p>
            <button type="button" className="secondary" onClick={() => { clearClientForm(); setClientEditorOpen(true); }}>+ Nouveau client</button>
            {clientEditorOpen && <div className="client-editor"><h3>{editingClientId ? 'Modifier la fiche client' : 'Créer une fiche client'}</h3>
            <div className="form-grid">
              <label>
                Nom du client
                <input value={clientName} onChange={(event) => setClientName(event.target.value)} />
              </label>
              <label>
                E-mail
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(event) => setClientEmail(event.target.value)}
                />
              </label>
              <label>
                Téléphone
                <input
                  value={clientPhone}
                  onChange={(event) => setClientPhone(event.target.value)}
                />
              </label>
              <label>
                Adresse
                <input
                  value={clientAddress}
                  onChange={(event) => setClientAddress(event.target.value)}
                />
              </label>
            </div>
            <div className="actions">
              <button type="button" disabled={loading} onClick={() => void saveClient()}>
                {editingClientId ? 'Enregistrer les modifications' : 'Créer la fiche client'}
              </button>
              <button type="button" className="secondary" onClick={() => { clearClientForm(); setClientEditorOpen(false); if (clientReturnToPurchase) { setClientReturnToPurchase(false); navigateAdminPage('purchases'); } }}>Annuler</button>
            </div>
            </div>}
            <div className="client-search-section">
              <h3>Rechercher une fiche client</h3>
              <label>
                Nom, e-mail, téléphone ou adresse
                <input
                  type="search"
                  value={clientSearch}
                  onChange={(event) => {
                    setClientSearch(event.target.value);
                    setClientPage(1);
                  }}
                  placeholder="Saisissez un nom ou une coordonnée"
                />
              </label>
              <div className="client-search-summary" aria-live="polite">
                {filteredClients.length} résultat{filteredClients.length === 1 ? '' : 's'} sur cette page
              </div>
              {visibleClients.map((client) => (
                <article key={client._id}>
                  <div>
                    <b>{client.name}</b>
                    <small>
                      {[client.email, client.phone, client.address].filter(Boolean).join(' · ')}
                    </small>
                  </div>
                  <button type="button" className="secondary" onClick={() => { editClient(client); setClientEditorOpen(true); }}>
                    Modifier
                  </button>
                </article>
              ))}
              <ReadPagination data={clientsRead} />
            </div>
          </section>
          <section className="panel" hidden={adminPage !== 'purchases'}>
            <ClientPicker clients={clients} request={request} value={selectedClient} onChange={setSelectedClient} label="Rechercher un client" onResolved={client => setClients(previous => [...previous.filter(row => row._id !== client._id).slice(-19), client as Client])} onCreate={() => { clearClientForm(); setClientEditorOpen(true); setClientReturnToPurchase(true); navigateAdminPage('clients'); }} />
            <div className="form-grid">
              <label>
                Référence du rachat
                <input
                  value={purchaseReference}
                  onChange={(event) => setPurchaseReference(event.target.value)}
                  placeholder="Générée automatiquement si vide"
                />
              </label>
              <label>
                Date du rachat
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(event) => setPurchaseDate(event.target.value)}
                />
              </label>
            </div>
            <PurchaseEditor
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
          </section>
          <section className="panel" hidden={adminPage !== 'salesHistory'}>
            <h2>Encaissements</h2>
            <label>Encaissement<select value={collectionFilter} onChange={event => setCollectionFilter(event.target.value)}><option value="all">Toutes les ventes</option><option value="pending">À encaisser</option><option value="received">Reçues</option><option value="unknown">Non renseignées</option></select></label>
            {salesHistoryRead.items.map((sale) => (
              <article key={sale._id} className="sale-history-row">
                <ItemThumbnail name={sale.itemName} catalogueImageUrl={sale.catalogueImageUrl} photos={sale.photos} apiBase={API} />
                <span className="sale-item-description">
                  {sale.itemName} · {sale.sellerName} · {(sale.salePriceCents / 100).toFixed(2)} € ·{' '}
                  {sale.status}
                  <small>{paymentStatusLabel(sale)}{sale.payment && ` · ${paymentDetail(sale.payment)}`}{sale.status === 'cancelled' && ' · Vente annulée, historique conservé'}</small>
                  {sale.origin === 'consignment' && <small>Dépôt-vente · Commission {money(sale.commissionCents ?? 0)} · Part déposant {money(sale.depositorAmountCents ?? 0)}</small>}
                </span>
                {sale.status === 'active' && <button type="button" className="secondary" disabled={loading} onClick={() => {
                  setError(''); setPaymentSale(sale);
                  setEditPaymentDraft(sale.payment ? { mode: sale.payment.cashCents > 0 && sale.payment.transferCents > 0 ? 'mixed' : sale.payment.transferCents > 0 ? 'transfer' : 'cash', cash: (sale.payment.cashCents / 100).toFixed(2), date: new Date(sale.payment.receivedAt).toLocaleDateString('en-CA'), reference: sale.payment.reference ?? '' } : newPaymentDraft());
                }}>{sale.paymentStatus === 'received' ? 'Corriger l’encaissement' : 'Marquer reçu'}</button>}
                {sale.status === 'active' && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void cancelSale(sale._id)}
                  >
                    Annuler
                  </button>
                )}
              </article>
            ))}
            <ReadPagination data={salesHistoryRead} />
          </section>
          <section className="panel" hidden={adminPage !== 'saleConflicts'}>
            <h2>Ventes concurrentes</h2>
            {conflictsRead.items.map((conflict) => (
              <article key={conflict._id}>
                <div>
                  <b>{conflict.itemName}</b>
                  <small>
                    Vente concurrente · {(conflict.salePriceCents / 100).toFixed(2)} € ·{' '}
                    {new Date(conflict.occurredAt).toLocaleDateString('fr-BE')}
                  </small>
                  <input
                    aria-label={`Note de résolution pour ${conflict.itemName}`}
                    placeholder="Note de résolution"
                    value={resolutionNotes[conflict._id] ?? ''}
                    onChange={(event) =>
                      setResolutionNotes((notes) => ({
                        ...notes,
                        [conflict._id]: event.target.value,
                      }))
                    }
                  />
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void resolveConflict(conflict._id)}
                >
                  Marquer traité
                </button>
              </article>
            ))}
            <ReadPagination data={conflictsRead} />
          </section>
          <section className="panel" hidden={adminPage !== 'purchaseHistory'}>
            <div className="form-grid">
              <label>
                Recherche
                <input
                  type="search"
                  value={historySearch}
                  placeholder="Référence ou client"
                  onChange={(e) => {
                    setHistorySearch(e.target.value);
                    setHistoryPage(1);
                  }}
                />
              </label>
              <label>
                Statut
                <select
                  value={historyStatus}
                  onChange={(e) => {
                    setHistoryStatus(e.target.value);
                    setHistoryPage(1);
                  }}
                >
                  <option value="all">Tous</option>
                  <option value="pending">En attente</option>
                  <option value="active">Validés</option>
                  <option value="cancelled">Annulés</option>
                </select>
              </label>
              <label>
                Du
                <input
                  type="date"
                  value={historyFrom}
                  onChange={(e) => {
                    setHistoryFrom(e.target.value);
                    setHistoryPage(1);
                  }}
                />
              </label>
              <label>
                Au
                <input
                  type="date"
                  value={historyTo}
                  onChange={(e) => {
                    setHistoryTo(e.target.value);
                    setHistoryPage(1);
                  }}
                />
              </label>
            </div>
            <div className="purchase-result-pages">
              <label>
                Par page
                <select
                  value={historySize}
                  onChange={(e) => {
                    setHistorySize(Number(e.target.value));
                    setHistoryPage(1);
                  }}
                >
                  {[12, 24, 48].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setHistorySearch('');
                  setHistoryStatus('all');
                  setHistoryFrom('');
                  setHistoryTo('');
                  setHistoryPage(1);
                }}
              >
                Effacer les filtres
              </button>
              <span>{historyTotal} rachat(s)</span>
            </div>
            {historyError && <p role="alert">{historyError}</p>}
            {historyBusy && <p role="status">Chargement des rachats…</p>}
            {!historyBusy &&
              !historyError &&
              historyRows.map((purchase) => (
                <details className="purchase-history-row" key={purchase._id}>
                  <summary>
                    <span>
                      {purchase.reference} · {purchase.sellerName}
                    </span>
                    <strong className={`purchase-status purchase-status-${purchase.status}`}>
                      {purchase.status === 'pending'
                        ? 'En attente de validation client'
                        : purchase.status === 'cancelled'
                          ? 'Annulé'
                          : 'Validé'}
                    </strong>
                    <strong>{purchase.items.length} carte(s)</strong>
                    <span>{new Date(purchase.occurredAt).toLocaleDateString('fr-BE')}</span>
                  </summary>
                  <div className="purchase-history-body">
                    {purchase.status === 'pending' && (
                      <div className="actions">
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => void validatePendingPurchase(purchase)}
                        >
                          Valider le rachat et ajouter au stock
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={loading}
                          onClick={() => void cancelPendingPurchase(purchase)}
                        >
                          Annuler le rachat
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        void downloadSavedPurchaseReceipt(purchase)
                          .then((downloaded) => {
                            if (downloaded)
                              setError(`Justificatif PDF téléchargé pour ${purchase.reference}.`);
                          })
                          .catch((error) =>
                            setError(
                              error instanceof Error
                                ? error.message
                                : 'Génération du PDF impossible.',
                            ),
                          );
                      }}
                    >
                      Télécharger le justificatif non signé PDF
                    </button>
                    <ReceiptSigning kind="purchase" targetId={purchase._id} request={request} allowSigning={purchase.status !== 'cancelled'} />
                    {purchase.items.flatMap((item) =>
                      (item.photos ?? []).map((photo) => (
                        <a
                          key={photo._id}
                          href={`${API}/attachments/${encodeURIComponent(photo._id)}/download`}
                        >
                          {item.name} · {photo.filename}
                        </a>
                      )),
                    )}
                    <label>
                      Date du rachat
                      <input
                        type="date"
                        value={
                          purchaseDates[purchase._id] ??
                          localDateInputValue(new Date(purchase.occurredAt))
                        }
                        onChange={(event) =>
                          setPurchaseDates((dates) => ({
                            ...dates,
                            [purchase._id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void savePurchaseDate(purchase)}
                    >
                      Enregistrer la date
                    </button>
                    <button type="button" onClick={() => void loadAttachments(purchase._id)}>
                      Justificatifs
                    </button>
                    {(attachmentsByPurchase[purchase._id] ?? []).map((attachment) => (
                      <a
                        key={attachment._id}
                        href={`${API}/attachments/${encodeURIComponent(attachment._id)}/download`}
                      >
                        {attachment.filename}
                      </a>
                    ))}
                  </div>
                </details>
              ))}
            {!historyBusy && !historyError && !historyRows.length && (
              <p>Aucun rachat ne correspond aux filtres.</p>
            )}
            <nav className="purchase-result-pages" aria-label="Pages de l’historique">
              <button
                type="button"
                className="secondary"
                disabled={historyBusy || historyPage <= 1}
                onClick={() => setHistoryPage((p) => p - 1)}
              >
                Précédent
              </button>
              <span>
                Page {historyPage} / {historyPages}
              </span>
              <button
                type="button"
                className="secondary"
                disabled={historyBusy || historyPage >= historyPages}
                onClick={() => setHistoryPage((p) => p + 1)}
              >
                Suivant
              </button>
            </nav>
          </section>
          {selectedItemIds.length > 0 &&
            adminPage !== 'saleSummary' &&
            adminPage !== 'purchases' && (
              <button
                type="button"
                className="cart-fab"
                aria-label={`Ouvrir le résumé du panier, ${selectedItemIds.length} carte(s)`}
                onClick={() => navigateAdminPage('saleSummary')}
              >
                <FiShoppingCart aria-hidden="true" focusable="false" />
                <span className="cart-fab-count">{selectedItemIds.length}</span>
              </button>
            )}
          {paymentSale && <div className="sale-confirm-overlay"><section className="sale-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-sale-title"><h2 id="payment-sale-title">Encaissement de {paymentSale.itemName}</h2>{error && <p className="error" role="alert">{error}</p>}<SalePaymentEditor value={editPaymentDraft} onChange={setEditPaymentDraft} totalCents={paymentSale.salePriceCents} allowPending={false} disabled={loading} /><div className="actions"><button type="button" className="secondary" disabled={loading} onClick={() => setPaymentSale(null)}>Fermer</button><button type="button" disabled={loading} onClick={() => void saveSalePayment()}>Confirmer le paiement reçu</button></div></section></div>}
          {saleConfirmOpen && (
            <div className="sale-confirm-overlay">
              <section
                className="sale-confirm-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="sale-confirm-title"
              >
                <h2 id="sale-confirm-title">Valider la vente</h2>
                {error && <p className="error" role="alert">{error}</p>}
                <p>Vérifiez les articles et les prix avant d’enregistrer la vente.</p>
                {selectedItemIds.map((itemId) => {
                  const item = items.find((entry) => entry._id === itemId);
                  if (!item) return null;
                  return (
                    <label className="sale-confirm-row" key={itemId}>
                      <span>
                        <b>{item.name}</b>{item.origin === 'consignment' && <span className="consignment-badge">Dépôt-vente{item.productType === 'sealed' ? ' · Scellé' : ''}</span>}
                        <small>{[item.series, item.identifier].filter(Boolean).join(' · ')}</small>
                        {item.origin === 'consignment' && <small>{consignmentSplitLabel(item, salePrices[itemId])}</small>}
                      </span>
                      Prix (€)
                      <input
                        inputMode="decimal"
                        value={
                          salePrices[itemId] ??
                          (item.askingPriceCents === undefined
                            ? ''
                            : (item.askingPriceCents / 100).toFixed(2))
                        }
                        onChange={(event) =>
                          setSalePrices((values) => ({ ...values, [itemId]: event.target.value }))
                        }
                      />
                    </label>
                  );
                })}
                <SalePaymentEditor value={salePaymentDraft} onChange={setSalePaymentDraft} totalCents={selectedSaleTotalCents} disabled={loading} />
                <div className="actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={loading}
                    onClick={() => setSaleConfirmOpen(false)}
                  >
                    Retour au panier
                  </button>
                  <button
                    type="button"
                    disabled={loading || !selectedItemIds.length}
                    onClick={() => void sellSelectedItems()}
                  >
                    {loading ? 'Enregistrement…' : 'Confirmer et enregistrer la vente'}
                  </button>
                </div>
              </section>
            </div>
          )}
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
createRoot(root).render(
  <>
    {isLegalPage ? (
      <LegalPage path={path as LegalPath} />
    ) : path === '/rachat' ? (
      <BuybackPage />
    ) : path === '/convention' ? (
      <ConventionCatalog />
    ) : (
      <App />
    )}
    <SiteFooter />
  </>,
);
