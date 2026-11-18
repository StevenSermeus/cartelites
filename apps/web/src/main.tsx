import { loadReceiptLogo } from './receiptLogo';
import { LegalPage, legalPages, SiteFooter, type LegalPath } from './LegalPages';
import { brand, BrandIdentity } from './brand';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPurchaseReceiptPdf, type SignatoryProfile } from './receiptPdf';
import './style.css';

const DashboardPage = lazy(() => import('./DashboardPage'));
const SettingsPage = lazy(() => import('./SettingsPage'));

type Item = {
  _id: string;
  name: string;
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
type GradingCompany = 'PSA' | 'CollectAura' | 'PCA' | 'CCC';
const gradingLogos: Record<GradingCompany, string> = {
  PSA: 'https://cdn.shopify.com/s/files/1/0618/5998/7608/files/psa-logo-2.png?v=1768810462',
  CollectAura: 'https://status.collectaura.com/collectaura-logo.png',
  PCA: 'https://primary.jwwb.nl/public/r/b/j/temp-profycumnjgwqpqpzroz/pca_logo-high.png?crop=1.6667%3A1&enable=upscale&enable-io=true&width=800',
  CCC: 'https://cccgrading.com/files/certificateur-cartes-de-collection-logo-full_006763bd90f3307d49ddfba936a02c5a.svg',
};
function GradingBadge({ company, grade, certificate }: {
  company: GradingCompany;
  grade?: string;
  certificate?: string;
}) {
  const label = company === 'CollectAura' ? 'Collect Aura' : company === 'CCC' ? 'CCC Grading' : company;
  return (
    <div className={`grading-badge grading-badge--${company.toLowerCase()}`} aria-label={`${label}, note ${grade || 'non renseignée'}${certificate ? `, certificat ${certificate}` : ''}`}>
      <img className="grading-badge-logo" src={gradingLogos[company]} alt={label} loading="lazy" />
      <span className="grading-badge-grade"><small>GRADÉE</small><strong>{grade || 'Note —'}</strong></span>
      {certificate && <span className="grading-badge-cert">Cert. {certificate}</span>}
    </div>
  );
}
type Client = { _id: string; name: string; email?: string; phone?: string; address?: string };
type PurchaseDraft = {
  key: string;
  name: string;
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
type CatalogCard = {
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
const languageLabel = (id?: string) => cardLanguages.find((language) => language.id === id)?.name ?? 'Français';
const conditionLabel = (id?: string) => cardConditions.find((condition) => condition.id === id)?.name ?? 'Near Mint (NM)';
const normalizeCardNumber = (value: string | number) => {
  const trimmed = String(value).trim().toLocaleLowerCase();
  return /^\d+$/.test(trimmed) ? trimmed.replace(/^0+(?=\d)/, '') : trimmed.replace(/[^a-z0-9]/g, '');
};
const normalizeCardName = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
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
type AdminPage = 'dashboard' | 'clients' | 'purchases' | 'stock' | 'sales' | 'saleSummary' | 'settings';
const adminPagePaths: Record<AdminPage, string> = {
  dashboard: '/admin/dashboard',
  clients: '/admin/clients',
  purchases: '/admin/purchases',
  stock: '/admin/stock',
  sales: '/admin/sales',
  saleSummary: '/admin/sales/cart',
  settings: '/admin/settings',
};
function adminPageFromPath(path: string): AdminPage {
  const entry = Object.entries(adminPagePaths).find(([, route]) => route === path);
  return (entry?.[0] as AdminPage | undefined) ?? 'dashboard';
}
const configuredApiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const API = configuredApiUrl.endsWith('/api/v1')
  ? configuredApiUrl
  : `${configuredApiUrl}/api/v1`;
function localDateInputValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function dateAtCurrentLocalTime(value: string, timeSource = new Date()) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, timeSource.getHours(), timeSource.getMinutes(), timeSource.getSeconds(), timeSource.getMilliseconds()).getTime();
}
let csrfToken: string | undefined;
async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (csrfToken && init.method && init.method !== 'GET') headers.set('X-CSRF-Token', csrfToken);
  const r = await fetch(`${API}${path}`, { ...init, headers, credentials: 'include' });
  csrfToken = r.headers.get('X-CSRF-Token') ?? csrfToken;
  if (!r.ok) {
    const payload = (await r.json().catch(() => ({}))) as { error?: string };
    if (r.status === 404)
      throw new Error(`Route API introuvable (${API}${path}). Vérifiez que l’API tourne sur le port 3001 et que VITE_API_URL pointe vers son adresse.`);
    if (payload.error === 'SALE_BEFORE_PURCHASE')
      throw new Error('La date de vente ne peut pas précéder le jour du rachat.');
    if (payload.error === 'ITEM_NOT_FOUND') throw new Error('Carte introuvable dans votre stock.');
    if (payload.error === 'PURCHASE_DATE_AFTER_SALE')
      throw new Error('Impossible de déplacer le rachat après une vente déjà enregistrée.');
    throw new Error(payload.error ?? `Erreur serveur (${r.status})`);
  }
  return r.status === 204 ? (null as T) : ((await r.json()) as T);
}
type PublicCard = {
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
  }, [search, minimum, maximum, gradingStatus, gradingCompany, gradingGrade, pageSize]);
  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(() => {
    const params = new URLSearchParams({ size: String(pageSize), search, gradingStatus,
      gradingCompany: gradingCompany === 'all' ? '' : gradingCompany, gradingGrade });
    if (minimum) params.set('min', minimum);
    if (maximum) params.set('max', maximum);
    const cursor = cursorHistory[page - 1];
    if (cursor) params.set('cursor', cursor);
    fetch(`${API}/catalogue?${params}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Erreur serveur (${response.status})`);
        const result = await response.json() as { page: PublicCard[]; totalCount: number; continueCursor: string; isDone: boolean };
        setCards(result.page);
        setTotalCount(result.totalCount);
        setNextCursor(result.continueCursor);
        setIsDone(result.isDone);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'Catalogue indisponible'),
      )
      .finally(() => setLoading(false));
    }, search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [page, pageSize, search, minimum, maximum, gradingStatus, gradingCompany, gradingGrade, cursorHistory]);
  const formatPrice = (cents: number) =>
    new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
  const hasFilters = Boolean(search.trim() || minimum !== '' || maximum !== '' || gradingStatus !== 'all' || gradingCompany !== 'all' || gradingGrade.trim());
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
          {[12, 24, 48].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <button
        type="button"
        className="secondary public-catalogue-page-button"
        onClick={() => { if (nextCursor) { setCursorHistory((history) => [...history.slice(0, page), nextCursor]); setPage((current) => current + 1); } }}
        disabled={isDone}
      >
        Suivant
      </button>
    </nav>
  );
  return (
    <main className="public-catalogue-page">
      <header className="public-catalogue-hero">
        <BrandIdentity catalogue />
        <div className="public-catalogue-total" aria-live="polite">
          <strong>{totalCount}</strong>
          <span>cartes en stock</span>
        </div>
      </header>
      <section className="panel public-catalogue-tools" aria-label="Rechercher et filtrer les cartes">
        <div className="public-catalogue-tools-heading">
          <div>
            <h2>Explorer le stock</h2>
            <p>Recherchez par nom, série ou numéro de carte.</p>
          </div>
          <span className="public-catalogue-result-count" aria-live="polite">
            {loading ? 'Chargement…' : `${visible.length} résultat${visible.length === 1 ? '' : 's'}`}
          </span>
        </div>
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
            <select value={gradingStatus} onChange={(event) => { setGradingStatus(event.target.value as typeof gradingStatus); setPage(1); }}>
              <option value="all">Toutes les cartes</option>
              <option value="graded">Gradées uniquement</option>
              <option value="ungraded">Non gradées uniquement</option>
            </select>
          </label>
          <label>
            Société de gradation
            <select value={gradingCompany} onChange={(event) => { setGradingCompany(event.target.value as typeof gradingCompany); setPage(1); }}>
              <option value="all">Toutes les sociétés</option>
              {gradingCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          <label>
            Note de gradation
            <input type="search" value={gradingGrade} onChange={(event) => { setGradingGrade(event.target.value); setPage(1); }} placeholder="Ex. 10, Gem Mint, 9.5" />
          </label>
        </div>
        {hasFilters && (
          <button
            className="secondary public-catalogue-reset"
            type="button"
            onClick={() => {
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
              {visible.length} carte{visible.length === 1 ? '' : 's'} trouvée{visible.length === 1 ? '' : 's'}
            </span>
            <div className="public-catalogue-layout-toggle" role="group" aria-label="Disposition des cartes">
              <button
                type="button"
                className={layout === 'grid' ? 'public-catalogue-layout-option is-active' : 'public-catalogue-layout-option'}
                aria-pressed={layout === 'grid'}
                aria-label="Afficher en grille"
                title="Afficher en grille"
                onClick={() => setLayout('grid')}
              >
                <svg className="public-catalogue-layout-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
                  <rect x="2" y="2" width="6" height="6" rx="1" />
                  <rect x="12" y="2" width="6" height="6" rx="1" />
                  <rect x="2" y="12" width="6" height="6" rx="1" />
                  <rect x="12" y="12" width="6" height="6" rx="1" />
                </svg>
              </button>
              <button
                type="button"
                className={layout === 'list' ? 'public-catalogue-layout-option is-active' : 'public-catalogue-layout-option'}
                aria-pressed={layout === 'list'}
                aria-label="Afficher une carte par ligne"
                title="Afficher une carte par ligne"
                onClick={() => setLayout('list')}
              >
                <svg className="public-catalogue-layout-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
                  <rect x="2" y="3" width="4" height="4" rx="1" />
                  <rect x="8" y="3" width="10" height="4" rx="1" />
                  <rect x="2" y="9" width="4" height="4" rx="1" />
                  <rect x="8" y="9" width="10" height="4" rx="1" />
                  <rect x="2" y="15" width="4" height="3" rx="1" />
                  <rect x="8" y="15" width="10" height="3" rx="1" />
                </svg>
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
                {card.catalogueImageUrl ? (
                  <img
                    className="public-catalogue-image"
                    src={card.catalogueImageUrl}
                    alt={`Illustration de ${card.name}`}
                    loading="lazy"
                  />
                ) : (
                  <div className="public-catalogue-no-image" aria-label="Image indisponible">
                    Image indisponible
                  </div>
                )}
              </div>
              <div className="public-catalogue-card-details">
                <div className="public-catalogue-card-title">
                  <h3>{card.name}</h3>
                  <strong className="public-catalogue-price">{formatPrice(card.salePriceCents)}</strong>
                </div>
                <p className="public-catalogue-series">{card.series || 'Série non renseignée'}</p>
                <div className="public-catalogue-tags">
                  {card.identifier && <span>N° {card.identifier}</span>}
              <span>{languageLabel(card.language)}</span>
                  <span>{conditionLabel(card.condition)}</span>
                </div>
                {card.gradingCompany && <GradingBadge company={card.gradingCompany} grade={card.gradingGrade} />}
              </div>
            </article>
          ))}
          </section>
          {pagination()}
        </>
      ) : (
        <section className="panel public-catalogue-state">
          <h2>Aucune carte trouvée</h2>
          <p>Essayez un autre nom, numéro ou une plage de prix différente.</p>
          {hasFilters && (
            <button
              className="secondary"
              type="button"
              onClick={() => {
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
    [adminPage, setAdminPage] = useState<AdminPage>(() => adminPageFromPath(window.location.pathname)),
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
  function navigateAdminPage(page: AdminPage, replace = false) {
    const url = adminPagePaths[page];
    window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
    setAdminPage(page);
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
      const [stockData, purchaseData, sales, conflictsData, clientData, authStatus] = await Promise.all([
        request<Item[]>('/stock'),
        request<Purchase[]>('/purchases'),
        request<Sale[]>('/sales'),
        request<SaleConflict[]>('/conflicts'),
        request<Client[]>('/sellers'),
        request<{ signupEnabled: boolean }>('/auth/status'),
      ]);
      setItems(stockData);
      setClients(clientData);
      setPurchases(purchaseData);
      setSalesData(sales);
      setConflicts(conflictsData);
      setSignupEnabled(authStatus.signupEnabled);
      setLogged(true);
      setError('');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Connexion impossible';
      if (message === 'UNAUTHENTICATED' || message === 'INVALID_SESSION') {
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
      await request(`/auth/${path}`, { method: 'POST', body: JSON.stringify({ email, password }) });
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
    const search = parseCardSearch(term);
    setError('');
    setPurchaseItems((rows) =>
      rows.map((row) => (row.key === draft.key ? { ...row, searching: true } : row)),
    );
    try {
      const localized = await Promise.all(
        cardLanguages.map(async ({ id: language }) => {
          const filter = search.localId
            ? `localId=${encodeURIComponent(search.localId)}`
            : `name=${encodeURIComponent(search.name)}`;
          const response = await fetch(
            `https://api.tcgdex.net/v2/${language}/cards?${filter}&pagination:page=1&pagination:itemsPerPage=100`,
          );
          if (!response.ok) throw new Error('Catalogue Pokémon indisponible.');
          const cards = await response.json() as Omit<CatalogCard, 'language'>[];
          return cards
            .filter((card) => !search.localId || normalizeCardNumber(card.localId) === normalizeCardNumber(search.localId!))
            .map((card) => ({ ...card, language }));
        }),
      );
      let results = localized.flat();
      const setMetadata = new Map<string, { official?: number; total?: number; name?: string }>();
      if (search.denominator !== undefined && results.length) {
        const setIds = [...new Set(results.map((card) => card.id.slice(0, card.id.lastIndexOf('-'))))];
        await Promise.all(setIds.map(async (setId) => {
          if (!setId) return;
          const cardLanguage = results.find((card) => card.id.startsWith(`${setId}-`))?.language ?? 'en';
          try {
            const response = await fetch(`https://api.tcgdex.net/v2/${cardLanguage}/sets/${encodeURIComponent(setId)}`);
            if (!response.ok) return;
            const set = await response.json() as { cardCount?: { official?: number; total?: number }; name?: string };
            setMetadata.set(setId, { ...set.cardCount, name: set.name });
          } catch {
            // An unverified denominator must not return a potentially wrong card.
          }
        }));
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
          const candidates = [normalizeCardName(card.name), normalizeCardName(setMetadata.get(setId)?.name ?? '')];
          if (candidates.some((name) => name === normalizedName)) return 0;
          if (candidates.some((name) => name.startsWith(normalizedName))) return 1;
          if (candidates.some((name) => name.includes(normalizedName))) return 2;
          return Number.POSITIVE_INFINITY;
        };
        const bestScore = Math.min(...results.map(scoreName));
        results = Number.isFinite(bestScore) ? results.filter((card) => scoreName(card) === bestScore) : [];
      }
      results = results
        .sort((a, b) => {
          const nameScore = (card: CatalogCard) => {
            if (!normalizedName) return 0;
            const name = normalizeCardName(card.name);
            return name === normalizedName ? 0 : name.startsWith(normalizedName) ? 1 : name.includes(normalizedName) ? 2 : 3;
          };
          return nameScore(a) - nameScore(b) || a.id.localeCompare(b.id);
        })
        .slice(0, search.localId ? 30 : 15);
      if (!results.length) {
        setError(`Aucune correspondance exacte pour « ${term} ». Aucun résultat approximatif n’a été affiché.`);
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
      setPurchaseItems((rows) =>
        rows.map((row) =>
        row.key === draft.key ? { ...row, cardResults: hydrated, searching: false } : row,
        ),
      );
    } catch (e) {
      setPurchaseItems((rows) =>
        rows.map((row) => (row.key === draft.key ? { ...row, searching: false } : row)),
      );
      setError(e instanceof Error ? e.message : 'Recherche de carte impossible.');
    }
  }
  async function selectPokemonCard(draft: PurchaseDraft, card: CatalogCard) {
    let setName = draft.series;
    let selectedName = card.name;
    let localId = card.localId;
    let image = card.image;
    const localizedDetails = await Promise.all(cardLanguages.map(async ({ id: language }) => {
      try {
        const response = await fetch(`https://api.tcgdex.net/v2/${language}/cards/${encodeURIComponent(card.id)}`);
        if (!response.ok) return null;
        return { language, card: await response.json() as { image?: string; set?: { name?: string }; localId?: string; name?: string } };
      } catch {
        return null;
      }
    }));
    const availableLanguages = localizedDetails.filter((entry) => entry !== null).map((entry) => entry.language);
    const selected = localizedDetails.find((entry) => entry?.language === card.language)?.card;
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
    if (!draft.catalogueCardId) {
      setPurchaseItems((rows) => rows.map((row) => row.key === draft.key ? { ...row, language } : row));
      return;
    }
    try {
      const response = await fetch(
        `https://api.tcgdex.net/v2/${language}/cards/${encodeURIComponent(draft.catalogueCardId)}`,
      );
      if (!response.ok) throw new Error('Cette édition n’existe pas dans cette langue.');
      const card = (await response.json()) as { name: string; localId: string; image?: string; set?: { name?: string } };
      setPurchaseItems((rows) => rows.map((row) => row.key === draft.key ? {
        ...row,
        language,
        name: card.name,
        series: card.set?.name ?? row.series,
        identifier: card.localId,
        catalogueImageUrl: card.image ? `${card.image}/low.webp` : undefined,
      } : row));
    } catch (e) {
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
  async function createPurchase() {
    setLoading(true);
    try {
      const client = clients.find((entry) => entry._id === selectedClient);
      if (!client) throw new Error('Sélectionnez un client existant.');
      const clientId = client._id;
      const validItems = purchaseItems.filter((item) => item.name.trim());
      if (!validItems.length) throw new Error('Ajoutez au moins une carte avec un nom.');
      const items = validItems.map((item) => {
        if (!item.marketValue.trim()) throw new Error(`Saisissez la valeur actuelle de « ${item.name} ».`);
        if (!item.discountPercent.trim()) throw new Error(`Saisissez la décote de « ${item.name} ».`);
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
      await loadReceiptLogo();
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
        } catch {
          photoFailures.push(item.name);
        }
      }
      let receiptFailure = '';
      await downloadPurchaseReceipt({
        reference,
        occurredAt,
        status: 'pending',
        client,
        items: validItems.map((item) => ({
          name: item.name.trim(),
          series: item.series.trim(),
          identifier: item.identifier.trim(),
          language: item.language === 'en' ? 'Anglais' : item.language === 'ja' ? 'Japonais' : 'Français',
          condition: cardConditions.find((condition) => condition.id === item.condition)?.name ?? 'Near Mint (NM)',
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
      }).catch((error) => { receiptFailure = error instanceof Error ? error.message : 'Génération du PDF impossible.'; });
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
        setError(`Rachat ${reference} enregistré. Le bordereau n’a pas pu être téléchargé : ${receiptFailure} Réessayez depuis l’historique.${photoFailures.length ? ` Photos non envoyées : ${photoFailures.join(', ')}.` : ''}`);
      else if (photoFailures.length)
        setError(`Rachat et reçu créés. Photo non envoyée pour : ${photoFailures.join(', ')}.`);
      else setError(`Rachat ${reference} enregistré en attente de validation du client. Le bordereau PDF a été téléchargé.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rachat impossible.');
    } finally {
      setLoading(false);
    }
  }
  async function savePurchaseDate(purchase: Purchase) {
    const value =
      purchaseDates[purchase._id] ?? localDateInputValue(new Date(purchase.occurredAt));
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
      const receiptDownloaded = await downloadSavedPurchaseReceipt(purchase, occurredAt).catch((error) => {
        receiptFailure = error instanceof Error ? error.message : 'Génération du PDF impossible.';
        return false;
      });
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
    const form = new FormData();
    form.append('itemId', itemId);
    form.append('file', file);
    const headers = new Headers();
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
    const response = await fetch(`${API}/attachments`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: form,
    });
    csrfToken = response.headers.get('X-CSRF-Token') ?? csrfToken;
    if (!response.ok) throw new Error(`Erreur serveur (${response.status})`);
  }
  async function downloadPurchaseReceipt(receipt: Parameters<typeof createPurchaseReceiptPdf>[0]) {
    const [logo, signatory] = await Promise.all([loadReceiptLogo(), request<SignatoryProfile>('/auth/profile')]);
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
  async function downloadSavedPurchaseReceipt(purchase: Purchase, occurredAt = purchase.occurredAt) {
    const client = clients.find((entry) => entry._id === purchase.sellerId);
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
    if (!selectedItemIds.length) return setError('Sélectionnez au moins une carte.');
    const saleItems = selectedItemIds.map((itemId) => {
      const item = items.find((entry) => entry._id === itemId);
      const text =
        salePrices[itemId] ??
        (item?.askingPriceCents === undefined ? '' : (item.askingPriceCents / 100).toString());
      const amount = Number(text.replace(',', '.'));
      if (!item || !Number.isFinite(amount) || amount < 0) return null;
      return { itemId, salePriceCents: Math.round(amount * 100) };
    });
    if (saleItems.some((item) => item === null))
      return setError('Saisissez un prix de vente valide pour chaque carte du panier.');
    setLoading(true);
    try {
      await request('/sales/bulk', {
        method: 'POST',
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          items: saleItems,
          occurredAt: Date.now(),
        }),
      });
      setSaleConfirmOpen(false);
      setSelectedItemIds([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Vente groupée impossible.');
    } finally {
      setLoading(false);
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
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      csrfToken = undefined;
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
          setLogged(false);
          setSignupEnabled(null);
        }
      });
    return () => { cancelled = true; };
  }, [load]);
  async function exportXlsx() {
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
    ]);
    for (const sale of salesData) {
      if (sale.status !== 'active') continue;
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
    ]);
    for (const item of items) {
      if (item.status === 'pending' || item.status === 'cancelled') continue;
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
      ]);
    }
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
    for (const sheet of [purchasesSheet, salesSheet, stock, clientsSheet, meta]) {
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
  const filteredItems = items.filter((item) => {
    const textMatch = [item.name, item.series, item.identifier, item.serialNumber, item.sellerName, item.gradingCompany, item.gradingGrade, item.gradingCertificate, item.gradingNotes]
      .filter(Boolean).join(' ').toLocaleLowerCase('fr').includes(stockSearch.trim().toLocaleLowerCase('fr'));
    const graded = Boolean(item.gradingCompany);
    return textMatch &&
      (stockGradingStatus === 'all' || (stockGradingStatus === 'graded' ? graded : !graded)) &&
      (stockGradingCompany === 'all' || item.gradingCompany === stockGradingCompany) &&
      (!stockGradingGrade.trim() || (item.gradingGrade ?? '').toLocaleLowerCase('fr').includes(stockGradingGrade.trim().toLocaleLowerCase('fr')));
  });
  const itemsPerPage = 10;
  const stockPageCount = Math.max(1, Math.ceil(filteredItems.length / itemsPerPage));
  const currentStockPage = Math.min(stockPage, stockPageCount);
  const selectedSaleTotalCents = selectedItemIds.reduce((total, itemId) => {
    const item = items.find((entry) => entry._id === itemId);
    const raw = salePrices[itemId] ?? (item?.askingPriceCents === undefined ? '' : (item.askingPriceCents / 100).toString());
    const amount = Number(raw.replace(',', '.'));
    return total + (Number.isFinite(amount) ? Math.round(amount * 100) : 0);
  }, 0);
  const visibleItems = filteredItems.slice(
    (currentStockPage - 1) * itemsPerPage,
    currentStockPage * itemsPerPage,
  );
  const stockPagination = () => filteredItems.length > itemsPerPage ? (
    <nav className="stock-pagination" aria-label="Pages du stock">
      <button
        type="button"
        className="secondary"
        disabled={currentStockPage <= 1}
        onClick={() => setStockPage(Math.max(1, currentStockPage - 1))}
      >
        Précédent
      </button>
      <span aria-live="polite">Page {currentStockPage} sur {stockPageCount} · {filteredItems.length} cartes</span>
      <button
        type="button"
        className="secondary"
        disabled={currentStockPage >= stockPageCount}
        onClick={() => setStockPage(Math.min(stockPageCount, currentStockPage + 1))}
      >
        Suivant
      </button>
    </nav>
  ) : null;
  const filteredClients = clients.filter((client) =>
    [client.name, client.email, client.phone, client.address]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('fr')
      .includes(clientSearch.trim().toLocaleLowerCase('fr')),
  );
  const clientsPerPage = 10;
  const clientPageCount = Math.max(1, Math.ceil(filteredClients.length / clientsPerPage));
  const currentClientPage = Math.min(clientPage, clientPageCount);
  const visibleClients = filteredClients.slice(
    (currentClientPage - 1) * clientsPerPage,
    currentClientPage * clientsPerPage,
  );
  const selectedPurchaseClient = clients.find((client) => client._id === selectedClient);
  const matchingPurchaseClients = purchaseClientSearch.trim()
    ? clients
        .filter((client) =>
          [client.name, client.email, client.phone, client.address]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase('fr')
            .includes(purchaseClientSearch.trim().toLocaleLowerCase('fr')),
        )
        .slice(0, 8)
    : [];
  return (
    <main>
      <header>
        <BrandIdentity />
        {logged && (
          <div className="actions">
            <a href="/convention" target="_blank" rel="noreferrer">
              Catalogue convention
            </a>
            <button type="button" onClick={() => void exportXlsx()}>
              Exporter Excel
            </button>
            <button type="button" className="secondary" onClick={() => void logout()}>
              Déconnexion
            </button>
          </div>
        )}
      </header>
      {logged && (
        <nav className="admin-nav" aria-label="Navigation administrateur">
          {(['dashboard', 'clients', 'purchases', 'stock', 'sales', 'settings'] as const).map((page) => (
            <a
              key={page}
              href={adminPagePaths[page]}
              className={(adminPage === page || (page === 'sales' && adminPage === 'saleSummary')) ? '' : 'secondary'}
              aria-current={(adminPage === page || (page === 'sales' && adminPage === 'saleSummary')) ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault();
                navigateAdminPage(page);
              }}
            >
              {{ dashboard: 'Dashboard', clients: 'Clients', purchases: 'Rachats', stock: 'Stock', sales: 'Ventes', settings: 'Paramètres' }[page]}
            </a>
          ))}
        </nav>
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
            <Suspense fallback={<section className="panel"><p>Chargement du dashboard…</p></section>}>
              <DashboardPage purchases={purchases} sales={salesData} />
            </Suspense>
          )}
          {adminPage === 'settings' && (
            <Suspense fallback={<section className="panel"><p>Chargement des paramètres…</p></section>}>
              <SettingsPage
                loadProfile={() => request<SignatoryProfile>('/auth/profile')}
                saveProfile={(profile) => request<SignatoryProfile>('/auth/profile', { method: 'PATCH', body: JSON.stringify(profile) })}
                signupEnabled={signupEnabled ?? true}
                loading={loading}
                onToggle={(enabled) => void updateSignupSetting(enabled)}
              />
            </Suspense>
          )}
          <section className="stats" hidden={adminPage !== 'stock'}>
            <strong>
              {items.length}
              <span> objets en stock</span>
            </strong>
            <span>Source : données centrales · Internet requis</span>
          </section>
          <section className="panel" hidden={adminPage !== 'stock'}>
            <h2>Mon stock</h2>
            {error && <p className="error">{error}</p>}
            <label>
              Rechercher une carte
              <input
                value={stockSearch}
                onChange={(event) => {
                  setStockSearch(event.target.value);
                  setStockPage(1);
                }}
                placeholder="Nom, série ou identifiant"
              />
            </label>
            <div className="form-grid stock-grading-filters" aria-label="Filtres de gradation">
              <label>Gradation
                <select value={stockGradingStatus} onChange={(event) => { setStockGradingStatus(event.target.value as typeof stockGradingStatus); setStockPage(1); }}>
                  <option value="all">Toutes</option><option value="graded">Gradées</option><option value="ungraded">Non gradées</option>
                </select>
              </label>
              <label>Société
                <select value={stockGradingCompany} onChange={(event) => { setStockGradingCompany(event.target.value as typeof stockGradingCompany); setStockPage(1); }}>
                  <option value="all">Toutes les sociétés</option>{gradingCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                </select>
              </label>
              <label>Note de gradation
                <input type="search" value={stockGradingGrade} onChange={(event) => { setStockGradingGrade(event.target.value); setStockPage(1); }} placeholder="Ex. 10 ou 9.5" />
              </label>
            </div>
            <div className="actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setSelectedItemIds(filteredItems.map((item) => item._id))}
              >
                Tout sélectionner ({filteredItems.length})
              </button>
              <button type="button" className="secondary" onClick={() => setSelectedItemIds([])}>
                Effacer la sélection
              </button>
            </div>
            {selectedItemIds.length > 0 && (
              <div className="stock-sale-basket">
                <div className="stock-sale-basket-heading">
                  <div><h3>Panier de vente · {selectedItemIds.length} carte(s)</h3><span>Ouvrez le résumé pour modifier les prix et vérifier la vente.</span></div>
                  <button type="button" className="secondary" onClick={() => setSelectedItemIds([])}>Vider</button>
                </div>
                <button type="button" className="cart-summary-link" onClick={() => navigateAdminPage('saleSummary')}>
                  <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 3h2l2.2 11.2a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 1.9-1.4L22 8H6M10 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" /></svg>
                  Voir le résumé du panier
                </button>
              </div>
            )}
            {visibleItems.map((item) => (
              <article key={item._id} className="stock-row">
                <label className="stock-select">
                  <input
                    type="checkbox"
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
                    <b>{item.name}</b>
                    <small>
                      {[item.series, item.identifier, item.serialNumber]
                        .filter(Boolean)
                        .join(' · ') || 'Carte sans détails'} · {languageLabel(item.language)} ·{' '}
                      {conditionLabel(item.condition)} · Racheté à {item.sellerName} · Achat{' '}
                      {(item.purchasePriceCents / 100).toFixed(2)} €
                    </small>
                    {item.gradingCompany && <GradingBadge company={item.gradingCompany} grade={item.gradingGrade} certificate={item.gradingCertificate} />}
                    {item.gradingCompany && item.gradingNotes && <small>Notes : {item.gradingNotes}</small>}
                    {item.photos?.map((photo) => (
                      <a
                        className="item-photo-link"
                        key={photo._id}
                        href={`${API}/attachments/${encodeURIComponent(photo._id)}/download`}
                      >
                        Photo : {photo.filename}
                      </a>
                    ))}
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
                  {item.catalogueImageUrl && (
                    <img className="stock-card-image" src={item.catalogueImageUrl} alt="" />
                  )}
                </div>
                {item.askingPriceCents !== undefined && (
                  <strong>Vente {(item.askingPriceCents / 100).toFixed(2)} €</strong>
                )}
              </article>
            ))}
            {!filteredItems.length && <p>Aucune carte ne correspond à la recherche.</p>}
            {stockPagination()}
          </section>
          <section className="panel" hidden={adminPage !== 'sales'}>
            <h2>Nouvelle vente</h2>
            {selectedItemIds.length > 0 && <p className="sale-cart-nudge">{selectedItemIds.length} carte(s) dans le panier. Utilisez le caddie flottant pour ouvrir le résumé.</p>}
            <label>
              Rechercher dans le stock
              <input
                value={stockSearch}
                onChange={(event) => {
                  setStockSearch(event.target.value);
                  setStockPage(1);
                }}
                placeholder="Nom, série ou identifiant"
              />
            </label>
            <div className="sale-search-results">
              {visibleItems.map((item) => (
                <article key={item._id}>
                  <div>
                    <b>{item.name}</b>
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
            {!visibleItems.length && <p>Aucune carte disponible ne correspond à la recherche.</p>}
          </section>
          <section className="panel sale-cart-summary" hidden={adminPage !== 'saleSummary'}>
            <div className="sale-cart-summary-heading">
              <div><h2>Résumé du panier</h2><p>{selectedItemIds.length} carte(s) sélectionnée(s)</p></div>
              <button type="button" className="secondary" onClick={() => navigateAdminPage('sales')}>Retour à la recherche</button>
            </div>
            {selectedItemIds.map((itemId) => {
              const item = items.find((entry) => entry._id === itemId);
              if (!item) return null;
              return <article className="sale-cart-summary-row" key={itemId}>
                {item.catalogueImageUrl && <img src={item.catalogueImageUrl} alt="" />}
                <div className="sale-cart-summary-name"><b>{item.name}</b><small>{[item.series, item.identifier].filter(Boolean).join(' · ')}</small></div>
                <label>Prix de vente (€)<input inputMode="decimal" value={salePrices[itemId] ?? (item.askingPriceCents === undefined ? '' : (item.askingPriceCents / 100).toFixed(2))} onChange={(event) => setSalePrices((values) => ({ ...values, [itemId]: event.target.value }))} /></label>
                <button type="button" className="secondary" aria-label={`Retirer ${item.name} du panier`} onClick={() => setSelectedItemIds((ids) => ids.filter((id) => id !== itemId))}>Retirer</button>
              </article>;
            })}
            {!selectedItemIds.length ? <p>Le panier est vide. Retournez à la recherche pour ajouter des cartes.</p> : <div className="sale-cart-summary-footer">
              <strong>Total proposé <span>{new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(selectedSaleTotalCents / 100)}</span></strong>
              <p>L’heure actuelle sera utilisée lors de l’enregistrement de la vente.</p>
              <button type="button" disabled={loading} onClick={() => setSaleConfirmOpen(true)}>Vérifier et confirmer la vente</button>
            </div>}
          </section>
          <section className="panel" hidden={adminPage !== 'clients'}>
            <h2>Clients</h2>
            <p>Créez une fiche client une seule fois, puis associez ses rachats à son dossier.</p>
            <h3>{editingClientId ? 'Modifier la fiche client' : 'Créer une fiche client'}</h3>
            <div className="form-grid">
              <label>
                Nom du client
                <input
                  value={clientName}
                  onChange={(event) => setClientName(event.target.value)}
                />
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
              {editingClientId && (
                <button type="button" className="secondary" onClick={clearClientForm}>
                  Annuler
                </button>
              )}
            </div>
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
                {filteredClients.length} résultat{filteredClients.length === 1 ? '' : 's'}
              </div>
              {visibleClients.map((client) => (
                <article key={client._id}>
                  <div>
                    <b>{client.name}</b>
                    <small>
                      {[client.email, client.phone, client.address].filter(Boolean).join(' · ')}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => editClient(client)}
                  >
                    Modifier
                  </button>
                </article>
              ))}
              {!filteredClients.length ? (
                <p>Aucun client ne correspond à cette recherche.</p>
              ) : (
                <nav className="clients-pagination" aria-label="Pages des fiches client">
                  <button
                    type="button"
                    className="secondary"
                    disabled={currentClientPage <= 1}
                    onClick={() => setClientPage(Math.max(1, currentClientPage - 1))}
                  >
                    Précédent
                  </button>
                  <span aria-live="polite">Page {currentClientPage} sur {clientPageCount}</span>
                  <button
                    type="button"
                    className="secondary"
                    disabled={currentClientPage >= clientPageCount}
                    onClick={() => setClientPage(Math.min(clientPageCount, currentClientPage + 1))}
                  >
                    Suivant
                  </button>
                </nav>
              )}
            </div>
          </section>
          <section className="panel" hidden={adminPage !== 'purchases'}>
            <h2>Enregistrer un rachat</h2>
            {selectedPurchaseClient ? (
              <div className="purchase-client-selected">
                <div>
                  <small>Client sélectionné</small>
                  <strong>{selectedPurchaseClient.name}</strong>
                  <span>{[selectedPurchaseClient.email, selectedPurchaseClient.phone].filter(Boolean).join(' · ')}</span>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setSelectedClient('');
                    setPurchaseClientSearch('');
                  }}
                >
                  Changer de client
                </button>
              </div>
            ) : (
              <div className="purchase-client-picker">
                <label htmlFor="purchase-client-search">Rechercher un client</label>
                <input
                  id="purchase-client-search"
                  type="search"
                  value={purchaseClientSearch}
                  onChange={(event) => setPurchaseClientSearch(event.target.value)}
                  placeholder="Nom, e-mail ou téléphone"
                  autoComplete="off"
                />
                {purchaseClientSearch.trim() ? (
                  matchingPurchaseClients.length ? (
                    <div className="purchase-client-results" role="listbox" aria-label="Clients correspondants">
                      {matchingPurchaseClients.map((client) => (
                        <button
                          key={client._id}
                          type="button"
                          role="option"
                          aria-selected="false"
                          className="purchase-client-result"
                          onClick={() => {
                            setSelectedClient(client._id);
                            setPurchaseClientSearch('');
                          }}
                        >
                          <strong>{client.name}</strong>
                          <span>{[client.email, client.phone].filter(Boolean).join(' · ')}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="purchase-client-empty">Aucun client ne correspond à cette recherche.</p>
                  )
                ) : (
                  <p className="purchase-client-hint">Saisissez quelques lettres pour retrouver une fiche client.</p>
                )}
              </div>
            )}
            {clients.length === 0 && (
              <p>
                Aucun client enregistré.{' '}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => navigateAdminPage('clients')}
                >
                  Créer une fiche client
                </button>
              </p>
            )}
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
            <p>
              Ajoutez les cartes une par une. Chaque carte peut avoir sa photo, son prix de rachat
              et ses informations d’identification.
            </p>
            {purchaseItems.map((item, index) => (
              <fieldset className="card-draft" key={item.key}>
                <legend>Carte {index + 1}</legend>
                <div className="form-grid">
                  <label>
                    Rechercher dans le catalogue Pokémon
                    <input
                      value={item.cardSearch ?? ''}
                      onChange={(event) =>
                        setPurchaseItems((rows) =>
                          rows.map((row) => row.key === item.key ? { ...row, cardSearch: event.target.value } : row),
                        )
                      }
                      placeholder="Nom ou numéro de collection"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="secondary"
                  disabled={item.searching}
                  onClick={() => void searchPokemonCards(item)}
                >
                  {item.searching ? 'Recherche…' : 'Rechercher la carte'}
                </button>
                {(item.cardResults ?? []).map((card) => (
                  <button
                    type="button"
                    className="catalog-choice secondary"
                    key={`${card.language}-${card.id}`}
                    onClick={() => void selectPokemonCard(item, card)}
                  >
                    {card.image && <img src={`${card.image}/low.webp`} alt="" />}
                    <span>{card.name} · {card.setName ?? card.id} · {card.localId} · {cardLanguages.find((language) => language.id === card.language)?.name}</span>
                  </button>
                ))}
                {item.catalogueImageUrl && (
                  <img className="card-catalogue-image" src={item.catalogueImageUrl} alt={`Illustration catalogue : ${item.name}`} />
                )}
                <div className="form-grid">
                  <label>
                    Nom de la carte
                    <input
                      value={item.name}
                      onChange={(event) =>
                        setPurchaseItems((rows) =>
                          rows.map((row) =>
                            row.key === item.key ? { ...row, name: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Série
                    <input
                      value={item.series}
                      onChange={(event) =>
                        setPurchaseItems((rows) =>
                          rows.map((row) =>
                            row.key === item.key ? { ...row, series: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Numéro d’identification
                    <input
                      value={item.identifier}
                      onChange={(event) =>
                        setPurchaseItems((rows) =>
                          rows.map((row) =>
                            row.key === item.key ? { ...row, identifier: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Langue de la carte
                    <select
                      value={item.language ?? 'fr'}
                      onChange={(event) =>
                        void changeCatalogCardLanguage(item, event.target.value as CatalogLanguage)
                      }
                    >
                      {cardLanguages.filter((language) => !item.catalogueCardId || item.availableLanguages?.includes(language.id)).map((language) => <option key={language.id} value={language.id}>{language.name}</option>)}
                    </select>
                  </label>
                  <label>
                    État (ordre Cardmarket)
                    <select
                      value={item.condition ?? 'NM'}
                      onChange={(event) =>
                        setPurchaseItems((rows) => rows.map((row) => row.key === item.key ? { ...row, condition: event.target.value as PurchaseDraft['condition'] } : row))
                      }
                    >
                      {cardConditions.map((condition) => <option key={condition.id} value={condition.id}>{condition.name}</option>)}
                    </select>
                  </label>
                  <label>
                    Société de gradation (facultatif)
                    <select
                      value={item.gradingCompany ?? ''}
                      onChange={(event) =>
                        setPurchaseItems((rows) => rows.map((row) => row.key === item.key
                          ? { ...row, gradingCompany: (event.target.value || undefined) as PurchaseDraft['gradingCompany'] }
                          : row))
                      }
                    >
                      <option value="">Non gradée</option>
                      {gradingCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                    </select>
                  </label>
                  {item.gradingCompany && <>
                    <label>
                      Note de gradation
                      <input
                        value={item.gradingGrade ?? ''}
                        onChange={(event) => setPurchaseItems((rows) => rows.map((row) => row.key === item.key ? { ...row, gradingGrade: event.target.value } : row))}
                        placeholder="Ex. 10, Gem Mint, 9.5"
                      />
                    </label>
                    <label>
                      Numéro de certification
                      <input
                        value={item.gradingCertificate ?? ''}
                        onChange={(event) => setPurchaseItems((rows) => rows.map((row) => row.key === item.key ? { ...row, gradingCertificate: event.target.value } : row))}
                      />
                    </label>
                    <label className="grading-notes-field">
                      Notes de gradation / sous-notes
                      <textarea
                        value={item.gradingNotes ?? ''}
                        onChange={(event) => setPurchaseItems((rows) => rows.map((row) => row.key === item.key ? { ...row, gradingNotes: event.target.value } : row))}
                        placeholder="Centrage, coins, bords, surface…"
                        rows={2}
                      />
                    </label>
                  </>}
                  <label>
                    Valeur actuelle (€)
                    <input
                      inputMode="decimal"
                      value={item.marketValue}
                      onChange={(event) =>
                        setPurchaseItems((rows) =>
                          rows.map((row) =>
                            row.key === item.key
                              ? {
                                  ...row,
                                  marketValue: event.target.value,
                                  askingPrice: row.askingPriceTouched
                                    ? row.askingPrice
                                    : event.target.value,
                                }
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Décote (%)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={item.discountPercent}
                      onChange={(event) =>
                        setPurchaseItems((rows) =>
                          rows.map((row) =>
                            row.key === item.key
                              ? { ...row, discountPercent: event.target.value }
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Prix de rachat calculé (€)
                    <input
                      readOnly
                      value={(
                        ((Number(item.marketValue.replace(',', '.')) || 0) *
                          (Number(item.discountPercent) || 0)) /
                        100
                      ).toFixed(2)}
                    />
                  </label>
                  <label>
                    Prix de vente proposé (€)
                    <input
                      inputMode="decimal"
                      value={item.askingPriceTouched ? item.askingPrice : item.marketValue}
                      onChange={(event) =>
                        setPurchaseItems((rows) =>
                          rows.map((row) =>
                            row.key === item.key
                              ? {
                                  ...row,
                                  askingPrice: event.target.value,
                                  askingPriceTouched: true,
                                }
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Photo de la carte (facultative)
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      onChange={(event) =>
                        setPurchaseItems((rows) =>
                          rows.map((row) =>
                            row.key === item.key
                              ? { ...row, photo: event.target.files?.[0] ?? null }
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                {purchaseItems.length > 1 && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setPurchaseItems((rows) => rows.filter((row) => row.key !== item.key))
                    }
                  >
                    Retirer cette carte
                  </button>
                )}
              </fieldset>
            ))}
            <div className="actions">
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setPurchaseItems((rows) => [
                    ...rows,
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
                  ])
                }
              >
                + Ajouter une carte
              </button>
              <button type="button" disabled={loading} onClick={() => void createPurchase()}>
                Mettre en attente et générer le bordereau PDF
              </button>
            </div>
          </section>
          <section className="panel" hidden={adminPage !== 'stock' && adminPage !== 'sales'}>
            <h2>Historique des ventes</h2>
            {salesData.map((sale) => (
              <article key={sale._id}>
                <span>
                  {sale.itemName} · {sale.sellerName} · {(sale.salePriceCents / 100).toFixed(2)} € ·{' '}
                  {sale.status}
                </span>
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
            {!salesData.length && <p>Aucune vente enregistrée.</p>}
          </section>
          <section className="panel" hidden={adminPage !== 'stock'}>
            <h2>Conflits à résoudre</h2>
            {conflicts.map((conflict) => (
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
            {!conflicts.length && <p>Aucun conflit ouvert.</p>}
          </section>
          <section className="panel" hidden={adminPage !== 'purchases'}>
            <h2>Historique des rachats</h2>
            {purchases.map((purchase) => (
              <article key={purchase._id}>
                <span>
                  {purchase.reference} · {purchase.sellerName}
                </span>
                <strong className={`purchase-status purchase-status-${purchase.status}`}>
                  {purchase.status === 'pending' ? 'En attente de validation client' : purchase.status === 'cancelled' ? 'Annulé' : 'Validé'}
                </strong>
                <strong>{purchase.items.length} objet(s)</strong>
                {purchase.status === 'pending' && <div className="actions">
                  <button type="button" disabled={loading} onClick={() => void validatePendingPurchase(purchase)}>Valider le rachat et ajouter au stock</button>
                  <button type="button" className="secondary" disabled={loading} onClick={() => void cancelPendingPurchase(purchase)}>Annuler le rachat</button>
                </div>}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    void downloadSavedPurchaseReceipt(purchase).then((downloaded) => {
                      if (downloaded) setError(`Justificatif PDF téléchargé pour ${purchase.reference}.`);
                    }).catch((error) => setError(error instanceof Error ? error.message : 'Génération du PDF impossible.'));
                  }}
                >
                  Télécharger le justificatif PDF
                </button>
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
              </article>
            ))}
            {!purchases.length && <p>Aucun rachat enregistré.</p>}
          </section>
          {selectedItemIds.length > 0 && adminPage !== 'saleSummary' && (
            <button type="button" className="cart-fab" aria-label={`Ouvrir le résumé du panier, ${selectedItemIds.length} carte(s)`} onClick={() => navigateAdminPage('saleSummary')}>
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 3h2l2.2 11.2a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 1.9-1.4L22 8H6M10 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" /></svg>
              <span className="cart-fab-count">{selectedItemIds.length}</span>
            </button>
          )}
          {saleConfirmOpen && (
            <div className="sale-confirm-overlay">
              <section className="sale-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="sale-confirm-title">
                <h2 id="sale-confirm-title">Valider la vente</h2>
                <p>Vérifiez les cartes et les prix avant d’enregistrer la vente.</p>
                {selectedItemIds.map((itemId) => {
                  const item = items.find((entry) => entry._id === itemId);
                  if (!item) return null;
                  return <label className="sale-confirm-row" key={itemId}>
                    <span><b>{item.name}</b><small>{[item.series, item.identifier].filter(Boolean).join(' · ')}</small></span>
                    Prix (€)<input inputMode="decimal" value={salePrices[itemId] ?? (item.askingPriceCents === undefined ? '' : (item.askingPriceCents / 100).toFixed(2))} onChange={(event) => setSalePrices((values) => ({ ...values, [itemId]: event.target.value }))} />
                  </label>;
                })}
                <div className="actions">
                  <button type="button" className="secondary" disabled={loading} onClick={() => setSaleConfirmOpen(false)}>Retour au panier</button>
                  <button type="button" disabled={loading || !selectedItemIds.length} onClick={() => void sellSelectedItems()}>{loading ? 'Enregistrement…' : 'Confirmer et enregistrer la vente'}</button>
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
const path = window.location.pathname.replace(/\/$/, '') || '/';
const isLegalPage = Object.hasOwn(legalPages, path);
createRoot(root).render(
  <>
    {isLegalPage ? <LegalPage path={path as LegalPath} /> : path === '/convention' ? <ConventionCatalog /> : <App />}
    <SiteFooter />
  </>,
);
