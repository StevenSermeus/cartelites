import { markUserActivity, setSessionForeground } from './src/auth/session';
import * as Crypto from 'expo-crypto';
import { SalePaymentFields, SalePaymentHistory, emptyPaymentDraft, buildSaleSettlement } from './src/components/SalePaymentFields';
import { ConsignmentScreen } from './src/screens/ConsignmentScreen';
import { PurchaseEditor, PurchaseSummary } from './src/components/PurchaseEditor';
import { searchRiftbound, type Tcg } from '../../packages/domain/src/riftbound';
import { pickAttachment } from './src/data/pickAttachment';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  AppState,
  Image,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { clearSession, readSession, revokeSession, readInstanceUrl, changeInstance, getApiBaseUrl } from './src/auth/session';
import { Field } from './src/components/Field';
import { ClientPicker } from './src/components/ClientPicker';
import { usePagedData } from './src/data/usePagedData';
import { Pagination } from './src/components/Pagination';
import {
  type Attachment,
  type GradingCompany,
  cancelSale,
  cancelPendingPurchase,
  createPurchase,
  createSales,
  createSeller,
  type Item,
  type Purchase,
  type PurchaseDraft,
  type Sale,
  type Seller,
  listPurchaseAttachments,
  listSales,
  listSellers,
  readRecord,
  readPage,
  listStock,
  onSessionExpired,
  openAttachment,
  sharePurchaseReceipt,
  updatePurchaseDate,
  validatePurchase,
  updateAskingPrice,
  updateSeller,
  uploadItemAttachment,
} from './src/data/apiRepository';
import { completePurchaseItems, mapPurchaseReceipt, type ReceiptInput } from './src/data/purchaseReceipt';
import { AuthScreen } from './src/screens/AuthScreen';
import { StockScreen } from './src/screens/StockScreen';

type Page =
  | 'clients'
  | 'consignments'
  | 'purchase'
  | 'stock'
  | 'sales'
  | 'saleSummary'
  | 'history'
  | 'salesHistory'
  | 'account';
type CardLanguage = 'fr' | 'en' | 'ja';
type CardCondition = 'M' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';
const gradingCompanies: { id: GradingCompany; label: string }[] = [
  { id: 'PSA', label: 'PSA' },
  { id: 'CollectAura', label: 'Collect Aura' },
  { id: 'PCA', label: 'PCA' },
  { id: 'CCC', label: 'CCC Grading' },
];
type CardResult = {
  id: string;
  localId: string;
  name: string;
  image?: string;
  setName?: string;
  language: CardLanguage;
  availableLanguages?: CardLanguage[];
};
const languages: { id: CardLanguage; label: string }[] = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'Anglais' },
  { id: 'ja', label: 'Japonais' },
];
const conditions: { id: CardCondition; label: string }[] = [
  { id: 'M', label: 'Mint (M)' },
  { id: 'NM', label: 'Near Mint (NM)' },
  { id: 'EX', label: 'Excellent (EX)' },
  { id: 'GD', label: 'Good (GD)' },
  { id: 'LP', label: 'Light Played (LP)' },
  { id: 'PL', label: 'Played (PL)' },
  { id: 'PO', label: 'Poor (PO)' },
];
const languageName = (id?: string) => languages.find((row) => row.id === id)?.label ?? 'Français';
const conditionName = (id?: string) =>
  conditions.find((row) => row.id === id)?.label ?? 'Near Mint (NM)';
const emptyDraft = (): PurchaseDraft => ({
  key: `${Date.now()}-${Math.random()}`,
  name: '',
  series: '',
  identifier: '',
  marketValue: '',
  discountPercent: '70',
  askingPrice: '',
  askingPriceTouched: false,
  photo: null,
  language: 'fr',
  condition: 'NM',
  catalogueImageUrl: '',
  cardSearch: '',
  cardResults: [],
  availableLanguages: ['fr'],
});
function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function formatEuros(value: number) {
  return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(value);
}
function dateAtCurrentTime(value: string, timeSource = new Date()) {
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
function freshDraft() {
  return [emptyDraft()];
}

export default function App() {
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
    setPurchaseDrafts((rows) =>
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
              catalogueImageUrl: '',
              availableLanguages: undefined,
              language: tcg === 'riftbound' ? 'en' : 'fr',
            }
          : row,
      ),
    );
  }

  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => {
    setSessionForeground(authenticated && AppState.currentState === 'active');
    const listener = AppState.addEventListener('change', state => setSessionForeground(authenticated && state === 'active'));
    return () => { listener.remove(); setSessionForeground(false); };
  }, [authenticated]);

  const [instanceReady, setInstanceReady] = useState(false);
  const [instanceUrl, setInstanceUrl] = useState('');
  const [instanceError, setInstanceError] = useState('');
  const [instanceBusy, setInstanceBusy] = useState(false);
  const [instanceSettings, setInstanceSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<Page>('stock');
  const contentScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => { contentScroll.current?.scrollTo({ y: 0, animated: false }); }, [page]);
  const pageHeaders: Record<Page, [string, string]> = {
    stock: ['Stock', 'Consultez et gérez vos articles disponibles.'],
    sales: ['Vendre', 'Recherchez un article pour composer votre panier.'],
    saleSummary: ['Panier', 'Vérifiez les articles et le règlement.'],
    history: ['Rachats', 'Retrouvez vos rachats et leur statut.'],
    purchase: ['Nouveau rachat', 'Client, articles, puis vérification.'],
    consignments: ['Dépôts', 'Dossiers, nouveaux dépôts et reversements.'],
    clients: ['Clients', 'Recherchez ou ajoutez un client.'],
    salesHistory: ['Historique des ventes', 'Consultez les ventes et leurs encaissements.'],
    account: ['Plus', 'Clients, historiques et connexion.'],
  };
  const activeTab = ['sales', 'saleSummary', 'salesHistory'].includes(page) ? 'sales'
    : ['history', 'purchase'].includes(page) ? 'history'
    : ['account', 'clients'].includes(page) ? 'account' : page;
  const [items, setItems] = useState<Item[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseAttachments, setPurchaseAttachments] = useState<Record<string, Attachment[]>>({});
  const [error, setError] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [purchaseClientSearch, setPurchaseClientSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [editingClientId, setEditingClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(localDateValue());
  const [purchaseDrafts, setPurchaseDrafts] = useState<PurchaseDraft[]>(freshDraft);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [salePrices, setSalePrices] = useState<Record<string, string>>({});
  const [askingPriceEdits, setAskingPriceEdits] = useState<Record<string, string>>({});
  const [saleSearch, setSaleSearch] = useState('');
  const [saleResultPage, setSaleResultPage] = useState(1);
  const [saleDate, setSaleDate] = useState(localDateValue());
  const [salePayment, setSalePayment] = useState(emptyPaymentDraft);
  const saleAttempt = useRef<{ signature: string; operationId: string; occurredAt: number } | null>(null);
  const [purchaseDateEdits, setPurchaseDateEdits] = useState<Record<string, string>>({});

  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('all');
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [historyRevision, setHistoryRevision] = useState(0);
  const [expandedPurchase, setExpandedPurchase] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptInput | null>(null);
  const [receiptPurchase, setReceiptPurchase] = useState<Purchase | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState('');
  const [receiptNotice, setReceiptNotice] = useState('');
  const [receiptSharing, setReceiptSharing] = useState(false);
  const receiptRequest = useRef(0);
  const receiptShareLock = useRef(false);
  const closeReceipt = () => { receiptRequest.current++; setReceiptPurchase(null); setReceipt(null); setReceiptLoading(false); setReceiptError(''); setReceiptNotice(''); };
  const [purchaseStep, setPurchaseStep] = useState(0);
  const clientData = usePagedData<Seller>('/sellers', { search: clientSearch }, authenticated && page === 'clients', historyRevision);
  const saleData = usePagedData<Sale>('/sales', {}, authenticated && page === 'salesHistory', historyRevision);
  const saleStockData = usePagedData<Item>('/stock', { search: saleSearch }, authenticated && page === 'sales', historyRevision);
  const purchaseHistory = usePagedData<Purchase>('/purchases', {
    search: historySearch.trim(), status: historyStatus,
    from: historyFrom ? new Date(`${historyFrom}T00:00:00`).getTime() : undefined,
    to: historyTo ? new Date(`${historyTo}T23:59:59.999`).getTime() : undefined,
  }, authenticated && page === 'history', historyRevision);
  useEffect(() => setPurchases(purchaseHistory.items), [purchaseHistory.items]);
  useEffect(() => { if (page === 'salesHistory') setSales(saleData.items); }, [saleData.items, page]);

  const historyBusy = purchaseHistory.loading;
  const historyError = purchaseHistory.error;
  const refresh = useCallback(async () => {
    setHistoryRevision(value => value + 1);
    setError('');
  }, []);

  useEffect(() => {
    void (async () => {
      const saved = await readInstanceUrl();
      setInstanceUrl(saved ?? '');
      setInstanceReady(Boolean(saved));
      setAuthenticated(Boolean(saved && await readSession()));
      setReady(true);
    })().catch((reason) => { setError(String(reason)); setInstanceError(String(reason)); setReady(true); });
  }, []);
  useEffect(
    () =>
      onSessionExpired(() => {
        closeReceipt();
      setAuthenticated(false);
        setItems([]);
        setSellers([]);
        setSales([]);
        setPurchases([]);
        setSelectedItemIds([]);
        setError('');
      }),
    [],
  );
  useEffect(() => {
    if (authenticated) void refresh().catch((reason) => setError(String(reason)));
  }, [authenticated, refresh]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && authenticated)
        void refresh().catch((reason) => setError(String(reason)));
    });
    return () => subscription.remove();
  }, [authenticated, refresh]);
  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(() => {
      if (AppState.currentState === 'active')
        void refresh().catch((reason) => setError(String(reason)));
    }, 60_000);
    return () => clearInterval(interval);
  }, [authenticated, refresh]);

  const filteredClients = clientData.items;
  const filteredPurchaseClients = useMemo(() => {
    const term = purchaseClientSearch.trim().toLocaleLowerCase('fr');
    if (!term) return [];
    return sellers
      .filter((client) =>
        [client.name, client.email, client.phone]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('fr')
          .includes(term),
      )
      .slice(0, 8);
  }, [purchaseClientSearch, sellers]);
  const selectedPurchaseClient = sellers.find((client) => client._id === clientId);
  const filteredSaleItems = saleStockData.items;
  const salePageItems = saleStockData.items;
  const saleResultPageSize = 25;
  const saleResultPageCount = saleStockData.page;
  const selectedItems = selectedItemIds
    .map((id) => items.find((item) => item._id === id))
    .filter((item): item is Item => Boolean(item));

  const saveClient = async () => {
    if (!clientName.trim()) return setError('Le nom du client est obligatoire.');
    setBusy(true);
    setError('');
    try {
      const client = {
        name: clientName.trim(),
        email: clientEmail.trim() || undefined,
        phone: clientPhone.trim() || undefined,
        address: clientAddress.trim() || undefined,
      };
      if (editingClientId) await updateSeller(editingClientId, client);
      else await createSeller(client);
      await refresh();
      setEditingClientId('');
      setClientName('');
      setClientEmail('');
      setClientPhone('');
      setClientAddress('');
      setError(editingClientId ? 'Fiche client modifiée.' : 'Fiche client créée.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };
  const editClient = (client: Seller) => {
    setEditingClientId(client._id);
    setClientName(client.name);
    setClientEmail(client.email ?? '');
    setClientPhone(client.phone ?? '');
    setClientAddress(client.address ?? '');
    setError('');
  };
  const clearClient = () => {
    setEditingClientId('');
    setClientName('');
    setClientEmail('');
    setClientPhone('');
    setClientAddress('');
  };

  const searchCards = async (draft: PurchaseDraft) => {
    const term = draft.cardSearch.trim();
    if (!term) return setError('Saisissez le nom ou le numéro d’une carte à rechercher.');
    const current = beginCatalog(draft.key);
    setError('');
    setPurchaseDrafts((rows) =>
      rows.map((row) => (row.key === draft.key ? { ...row, searching: true } : row)),
    );
    try {
      if (draft.tcg === 'riftbound') {
        const results = await searchRiftbound(term);
        if (!current()) return;
        setPurchaseDrafts((rows) =>
          rows.map((row) =>
            row.key === draft.key ? { ...row, cardResults: results, searching: false } : row,
          ),
        );
        if (!results.length) setError(`Aucune carte Riftbound trouvée pour « ${term} » (FR/EN).`);
        return;
      }
      const localized = await Promise.all(
        languages.map(async ({ id: language }) => {
          const filters = [`name=${encodeURIComponent(term)}`];
          const localNumber =
            term.match(/^(?:[A-Za-z0-9-]+\s+)?([A-Za-z0-9-]+)\/(?:[A-Za-z0-9-]+)$/)?.[1] ??
            (/^\d+$/.test(term) ? term : undefined);
          if (localNumber) filters.push(`localId=${encodeURIComponent(localNumber)}`);
          const responses = await Promise.all(
            filters.map((filter) =>
              fetch(
                `https://api.tcgdex.net/v2/${language}/cards?${filter}&pagination:page=1&pagination:itemsPerPage=10`,
              ),
            ),
          );
          if (responses.some((response) => !response.ok))
            throw new Error('Le catalogue Pokémon est momentanément indisponible.');
          const resultLists = await Promise.all(
            responses.map((response) => response.json() as Promise<Omit<CardResult, 'language'>[]>),
          );
          const unique = new Map(resultLists.flat().map((result) => [result.id, result]));
          return [...unique.values()].slice(0, 15).map((result) => ({ ...result, language }));
        }),
      );
      const results = localized.flat();
      const availableById = new Map<string, CardLanguage[]>();
      for (const result of results) {
        const found = availableById.get(result.id) ?? [];
        if (!found.includes(result.language)) found.push(result.language);
        availableById.set(result.id, found);
      }
      if (!current()) return;
      const matches = results.map((result) => ({
        ...result,
        availableLanguages: availableById.get(result.id) ?? [result.language],
      }));
      setPurchaseDrafts((rows) =>
        rows.map((row) =>
          row.key === draft.key ? { ...row, cardResults: matches, searching: false } : row,
        ),
      );
    } catch (reason) {
      if (!current()) return;
      setPurchaseDrafts((rows) =>
        rows.map((row) => (row.key === draft.key ? { ...row, searching: false } : row)),
      );
      setError(reason instanceof Error ? reason.message : 'Recherche de carte impossible.');
    }
  };
  const chooseCard = async (draft: PurchaseDraft, result: CardResult) => {
    const current = beginCatalog(draft.key);
    if (draft.tcg === 'riftbound') {
      setPurchaseDrafts((rows) =>
        rows.map((row) =>
          row.key === draft.key
            ? {
                ...row,
                name: result.name,
                series: result.setName ?? '',
                identifier: result.localId,
                language: result.language,
                catalogueCardId: result.id,
                catalogueImageUrl: result.image ?? '',
                availableLanguages: [result.language],
                cardResults: [],
                searching: false,
              }
            : row,
        ),
      );
      return;
    }
    setPurchaseDrafts((rows) =>
      rows.map((row) => (row.key === draft.key ? { ...row, searching: true } : row)),
    );
    let name = result.name;
    let series = result.setName ?? draft.series;
    let identifier = result.localId;
    let image = result.image;
    const localizedDetails = await Promise.all(
      languages.map(async ({ id: language }) => {
        try {
          const response = await fetch(
            `https://api.tcgdex.net/v2/${language}/cards/${encodeURIComponent(result.id)}`,
          );
          if (!response.ok) return null;
          return {
            language,
            card: (await response.json()) as {
              name?: string;
              localId?: string;
              image?: string;
              set?: { name?: string };
            },
          };
        } catch {
          return null;
        }
      }),
    );
    const availableLanguages = localizedDetails
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .map((entry) => entry.language);
    const selected = localizedDetails.find((entry) => entry?.language === result.language)?.card;
    if (!current()) return;
    name = selected?.name ?? name;
    identifier = selected?.localId ?? identifier;
    series = selected?.set?.name ?? series;
    image = selected?.image ?? image;
    setPurchaseDrafts((rows) =>
      rows.map((row) =>
        row.key === draft.key
          ? {
              ...row,
              name,
              searching: false,
              series,
              identifier,
              language: result.language,
              catalogueCardId: result.id,
              availableLanguages: availableLanguages.length
                ? availableLanguages
                : [result.language],
              catalogueImageUrl: image ? `${image}/low.webp` : '',
              cardResults: [],
            }
          : row,
      ),
    );
  };
  const changeCardLanguage = async (draft: PurchaseDraft, language: CardLanguage) => {
    const current = beginCatalog(draft.key);
    if (draft.tcg === 'riftbound' && draft.catalogueCardId) return;
    if (!draft.catalogueCardId) {
      setPurchaseDrafts((rows) =>
        rows.map((row) => (row.key === draft.key ? { ...row, language } : row)),
      );
      return;
    }
    try {
      const response = await fetch(
        `https://api.tcgdex.net/v2/${language}/cards/${encodeURIComponent(draft.catalogueCardId)}`,
      );
      if (!response.ok) throw new Error('Cette édition n’est pas disponible dans cette langue.');
      const card = (await response.json()) as {
        name: string;
        localId: string;
        image?: string;
        set?: { name?: string };
      };
      if (!current()) return;
      setPurchaseDrafts((rows) =>
        rows.map((row) =>
          row.key === draft.key
            ? {
                ...row,
                language,
                name: card.name,
                series: card.set?.name ?? row.series,
                identifier: card.localId,
                catalogueImageUrl: card.image ? `${card.image}/low.webp` : '',
              }
            : row,
        ),
      );
    } catch (reason) {
      if (!current()) return;
      setError(reason instanceof Error ? reason.message : 'Version dans cette langue introuvable.');
    }
  };

  const submitPurchase = async () => {
    if (!clientId) return setError('Sélectionnez le client dans la liste.');
    const client = sellers.find((row) => row._id === clientId);
    if (!client) return setError('Client introuvable. Actualisez la liste.');
    const rows = purchaseDrafts.filter((row) => row.included);
    if (!rows.length) return setError('Ajoutez au moins une carte.');
    setBusy(true);
    setError('');
    try {
      const entries = rows.map((row) => {
        if (!row.name.trim()) throw new Error('Renseignez le nom de chaque carte ajoutée.');
        if (!row.marketValue.trim())
          throw new Error(`Saisissez la valeur actuelle de ${row.name}.`);
        if (!row.discountPercent.trim()) throw new Error(`Saisissez la décote de ${row.name}.`);
        const marketValue = Number(row.marketValue.replace(',', '.'));
        const discount = Number(row.discountPercent.replace(',', '.'));
        const asking = row.askingPriceTouched
          ? Number(row.askingPrice.replace(',', '.'))
          : marketValue;
        if (!Number.isFinite(marketValue) || marketValue < 0)
          throw new Error(`Valeur actuelle invalide pour ${row.name}.`);
        if (!Number.isFinite(discount) || discount < 0 || discount > 100)
          throw new Error(`Décote invalide pour ${row.name}.`);
        if (!Number.isFinite(asking) || asking < 0)
          throw new Error(`Prix de vente invalide pour ${row.name}.`);
        return {
          name: row.name.trim(),
          tcg: row.tcg ?? 'pokemon',
          series: row.series.trim() || undefined,
          identifier: row.identifier.trim() || undefined,
          marketValue,
          discountPercent: discount,
          askingPrice: asking,
          language: row.language,
          condition: row.condition,
          gradingCompany: row.gradingCompany,
          gradingGrade: row.gradingGrade?.trim() || undefined,
          gradingCertificate: row.gradingCertificate?.trim() || undefined,
          gradingNotes: row.gradingNotes?.trim() || undefined,
          catalogueImageUrl: row.catalogueImageUrl || undefined,
        };
      });
      const occurredAt = dateAtCurrentTime(purchaseDate);
      if (!Number.isFinite(occurredAt)) throw new Error('Date de rachat invalide.');
      const reference = `R-${new Date().getTime()}`;
      const result = await createPurchase(clientId, entries, occurredAt, reference);
      const failedPhotos: string[] = [];
      for (const [index, row] of rows.entries()) {
        if (!row.photo || !result.itemIds[index]) continue;
        try {
          await uploadItemAttachment(result.itemIds[index], row.photo);
        } catch {
          failedPhotos.push(row.name);
        }
      }
      await refresh();
      setClientId('');
      setPurchaseClientSearch('');
      setPurchaseDrafts(freshDraft());
      setPurchaseDate(localDateValue());
      setPage('history');
      const createdPurchase: Purchase = { _id: result.purchaseId, sellerId: clientId, sellerName: client.name, reference, occurredAt, status: 'pending', items: entries.map((entry, index) => ({ _id: result.itemIds[index] ?? String(index), name: entry.name, tcg: entry.tcg, series: entry.series, identifier: entry.identifier, language: entry.language, condition: entry.condition, gradingCompany: entry.gradingCompany, gradingGrade: entry.gradingGrade, gradingCertificate: entry.gradingCertificate, gradingNotes: entry.gradingNotes, marketValueCents: Math.round(entry.marketValue * 100), discountPercent: entry.discountPercent, purchasePriceCents: Math.round(entry.marketValue * entry.discountPercent), vatRegime: 'margin' })) };
      receiptRequest.current++;
      setReceiptLoading(false); setReceiptNotice('');
      setReceipt(mapPurchaseReceipt(createdPurchase, client));
      setReceiptPurchase(createdPurchase);
      setReceiptError('');
      const photoFailure = failedPhotos.length
        ? `Photo non envoyée : ${failedPhotos.join(', ')}.`
        : '';
      setError(
        [`Rachat ${reference} en attente de validation du client. Consultez le bordereau pour le voir ou le partager.`, photoFailure]
          .filter(Boolean)
          .join(' '),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Rachat impossible.');
    } finally {
      setBusy(false);
    }
  };

  const updatePurchaseDateAction = async (purchase: Purchase) => {
    const value = purchaseDateEdits[purchase._id] ?? localDateValue(new Date(purchase.occurredAt));
    const occurredAt = dateAtCurrentTime(value, new Date(purchase.occurredAt));
    if (!Number.isFinite(occurredAt)) return setError('Date invalide. Utilisez AAAA-MM-JJ.');
    setBusy(true);
    try {
      await updatePurchaseDate(purchase._id, occurredAt);
      await refresh();
      void openPurchaseReceipt({ ...purchase, occurredAt });
      setError('Date modifiée. Le bordereau actualisé est disponible.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Modification impossible.');
    } finally {
      setBusy(false);
    }
  };

  const confirmPendingPurchase = async (purchase: Purchase) => {
    setBusy(true);
    try {
      await validatePurchase(purchase._id);
      await refresh();
      setError(`Rachat ${purchase.reference} validé : les cartes sont maintenant dans le stock.`);
      const updated = { ...purchase, status: 'active' as const };
      void openPurchaseReceipt(updated);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Validation impossible.');
    } finally {
      setBusy(false);
    }
  };
  const openPurchaseReceipt = async (purchase: Purchase) => {
    const requestId = ++receiptRequest.current;
    setReceiptPurchase(purchase); setReceipt(null); setReceiptError(''); setReceiptNotice(''); setReceiptLoading(true);
    try {
      const full = await readRecord<Purchase & { hasMoreItems?: boolean }>('/purchases', purchase._id);
      const [client, allItems] = await Promise.all([
        readRecord<Seller>('/sellers', full.sellerId),
        completePurchaseItems(full, cursor => readPage<Purchase['items'][number]>('/stock', { purchaseId: full._id, status: 'all', cursor })),
      ]);
      if (requestId === receiptRequest.current) setReceipt(mapPurchaseReceipt(full, client, allItems));
    } catch (reason) {
      if (requestId === receiptRequest.current) setReceiptError(reason instanceof Error ? reason.message : 'Chargement du bordereau impossible.');
    } finally { if (requestId === receiptRequest.current) setReceiptLoading(false); }
  };
  const shareReceipt = async () => {
    if (!receipt || receiptShareLock.current) return;
    const requestId = receiptRequest.current;
    receiptShareLock.current = true; setReceiptSharing(true); setReceiptError('');
    try { await sharePurchaseReceipt(receipt); }
    catch (reason) { if (requestId === receiptRequest.current) setReceiptError(reason instanceof Error ? reason.message : 'Partage du PDF impossible.'); }
    finally { receiptShareLock.current = false; setReceiptSharing(false); }
  };
  const rejectPendingPurchase = async (purchase: Purchase) => {
    Alert.alert('Annuler ce rachat ?', 'Les cartes de ce rachat ne seront pas ajoutées au stock.', [
      { text: 'Garder en attente', style: 'cancel' },
      {
        text: 'Annuler le rachat',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void cancelPendingPurchase(purchase._id)
            .then(refresh)
            .then(() => setError(`Rachat ${purchase.reference} annulé.`))
            .catch((reason: unknown) =>
              setError(reason instanceof Error ? reason.message : 'Annulation impossible.'),
            )
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  const toggleSale = (item: Item) => {
    setItems(current => current.some(row => row._id === item._id) ? current : [...current, item]);
    setSelectedItemIds((ids) => {
      const exists = ids.includes(item._id);
      if (exists) return ids.filter((id) => id !== item._id);
      setSalePrices((prices) => ({
        ...prices,
        [item._id]:
          prices[item._id] ??
          (item.askingPriceCents === undefined ? '' : (item.askingPriceCents / 100).toFixed(2)),
      }));
      return [...ids, item._id];
    });
  };
  const submitSales = async () => {
    if (!selectedItems.length) return setError('Ajoutez des articles au panier.');
    setBusy(true);
    setError('');
    try {
      const saleRows = selectedItems.map((item) => {
        const value = (salePrices[item._id] ?? '').trim();
        const price = Number(value.replace(',', '.'));
        if (!/^\d+(?:[.,]\d{1,2})?$/.test(value) || !Number.isFinite(price) || price < 0)
          throw new Error(`Prix de vente invalide pour ${item.name}.`);
        const salePriceCents = Math.round(price * 100);
        if (item.origin === 'consignment' && salePriceCents < (item.agreedPriceCents ?? item.askingPriceCents ?? 0))
          throw new Error(`Le prix de ${item.name} est inférieur à l’accord. Enregistrez l’autorisation du déposant dans Dépôts.`);
        return { itemId: item._id, salePriceCents };
      });
      const settlement = buildSaleSettlement(salePayment, saleRows.reduce((sum, row) => sum + row.salePriceCents, 0));
      const signature = JSON.stringify({ saleRows, saleDate, settlement });
      if (saleAttempt.current?.signature !== signature) saleAttempt.current = { signature, operationId: Crypto.randomUUID(), occurredAt: dateAtCurrentTime(saleDate) };
      await createSales(saleRows, saleAttempt.current.occurredAt, settlement, saleAttempt.current.operationId);
      saleAttempt.current = null;
      setSalePayment(emptyPaymentDraft());
      setSelectedItemIds([]);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Vente impossible.');
    } finally {
      setBusy(false);
    }
  };
  const saveAskingPrice = async (itemId: string) => {
    const amount = Number(askingPriceEdits[itemId]?.replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0)
      return setError('Saisissez un prix de vente valide.');
    setBusy(true);
    try {
      await updateAskingPrice(itemId, Math.round(amount * 100));
      setAskingPriceEdits((edits) => {
        const next = { ...edits };
        delete next[itemId];
        return next;
      });
      await refresh();
      setError('Prix de vente enregistré pour le stock.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Modification du prix impossible.');
    } finally {
      setBusy(false);
    }
  };

  const loadPurchaseAttachments = async (purchaseId: string) => {
    try {
      const attachments = await listPurchaseAttachments(purchaseId);
      setPurchaseAttachments((current) => ({ ...current, [purchaseId]: attachments }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement des photos impossible.');
    }
  };
  const nav = (
    nextPage: Page,
    label: string,
    icon: React.ComponentProps<typeof Ionicons>['name'],
  ) => (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: (nextPage === 'stock' && ['stock'].includes(page)) || (nextPage === 'sales' && ['sales', 'saleSummary', 'salesHistory'].includes(page)) || (nextPage === 'history' && ['history', 'purchase'].includes(page)) || (nextPage === 'consignments' && page === 'consignments') || (nextPage === 'account' && ['account', 'clients'].includes(page)) }}
      disabled={busy}
      onPress={() => setPage(nextPage)}
      style={[styles.nav, ((nextPage === 'stock' && page === 'stock') || (nextPage === 'sales' && ['sales', 'saleSummary', 'salesHistory'].includes(page)) || (nextPage === 'history' && ['history', 'purchase'].includes(page)) || (nextPage === 'consignments' && page === 'consignments') || (nextPage === 'account' && ['account', 'clients'].includes(page))) && styles.active]}
    >
      <Ionicons name={icon} size={20} color={activeTab === nextPage ? '#164f73' : '#60727e'} />
      <Text style={[styles.navText, activeTab === nextPage && styles.activeText]}>{label}</Text>
    </Pressable>
  );

  const logout = async () => {
    setBusy(true);
    try {
      await revokeSession();
    } finally {
      await clearSession();
      closeReceipt();
      setAuthenticated(false);
      setItems([]);
      setSellers([]);
      setSales([]);
      setPurchases([]);
      setSelectedItemIds([]);
      setBusy(false);
    }
  };

  if (!ready)
    return (
      <SafeAreaView style={styles.page} onTouchStart={markUserActivity}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  if (!authenticated)
    return (
      <SafeAreaView style={styles.page} onTouchStart={markUserActivity}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.loginContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Espace vendeur</Text>
            <Text style={styles.subtitle}>Connectez-vous à votre instance</Text>
          </View>
          {!instanceReady ? <View style={styles.card}>
            <Text style={styles.heading}>Adresse de l’API</Text>
            <Field label="URL de l’API" value={instanceUrl} onChangeText={setInstanceUrl} placeholder="https://api.exemple.fr" />
            {!!instanceError && <Text style={styles.error}>{instanceError}</Text>}
            <ActionButton disabled={instanceBusy} label={instanceBusy ? 'Vérification…' : 'Vérifier et continuer'} onPress={() => { setInstanceBusy(true); setInstanceError(''); void changeInstance(instanceUrl).then(() => { setInstanceUrl(getApiBaseUrl() ?? instanceUrl); setInstanceReady(true); }).catch(e => setInstanceError(e instanceof Error ? e.message : 'Instance inaccessible.')).finally(() => setInstanceBusy(false)); }} />
          </View> : <><AuthScreen onAuthenticated={async () => setAuthenticated(true)} /><ActionButton secondary label="Modifier l’instance" onPress={() => { setInstanceReady(false); setInstanceError(''); }} /></>}
        </ScrollView>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.page} onTouchStart={markUserActivity}>
      <Modal visible={Boolean(receiptPurchase)} animationType="slide" onRequestClose={closeReceipt}>
        <SafeAreaView onTouchStart={markUserActivity} style={{ flex: 1, backgroundColor: '#f6f7f8' }}>
          <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between' }}><Text accessibilityRole="header" style={[styles.heading, { flex: 1 }]}>Bordereau de rachat</Text><Pressable accessibilityRole="button" accessibilityLabel="Fermer le bordereau" style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }} onPress={closeReceipt}><Text>Fermer</Text></Pressable></View>
          {receiptLoading ? <ActivityIndicator /> : receiptError && !receipt ? <View style={{padding:16}}><Text>{receiptError}</Text><ActionButton secondary label="Réessayer" onPress={() => receiptPurchase && void openPurchaseReceipt(receiptPurchase)} /></View> : receipt && <ScrollView contentContainerStyle={{padding:16, gap:8}}>
            <Text>Référence : {receipt.reference}</Text><Text>Date : {new Date(receipt.occurredAt).toLocaleString('fr-BE')}</Text><Text>Statut : {receipt.status === 'active' ? 'Validé' : receipt.status === 'cancelled' ? 'Annulé' : 'En attente'}</Text><Text>Client : {receipt.client.name}</Text>
            {receipt.client.email ? <Text>{receipt.client.email}</Text> : null}{receipt.client.phone ? <Text>{receipt.client.phone}</Text> : null}
            {receipt.items.map((item,index) => <View key={index} style={styles.historyCard}><Text style={styles.bold}>{index+1}. {item.name}</Text><Text>{item.series || '—'} · {item.identifier || '—'}</Text><Text>{item.language} · {item.condition}</Text>{item.gradingCompany ? <Text>Gradation : {item.gradingCompany} {item.gradingGrade} · Certificat {item.gradingCertificate || '—'}{item.gradingNotes ? ` · ${item.gradingNotes}` : ''}</Text> : null}<Text>Valeur {(item.marketValueCents/100).toFixed(2)} € · Décote {item.discountPercent}% · Rachat {(item.purchasePriceCents/100).toFixed(2)} €</Text></View>)}
            <Text style={styles.bold}>Total versé : {(receipt.items.reduce((sum,item)=>sum+item.purchasePriceCents,0)/100).toFixed(2)} €</Text>{receiptError ? <Text>{receiptError}</Text> : null}{receiptNotice ? <Text>{receiptNotice}</Text> : null}<ActionButton disabled={receiptSharing} label={receiptSharing ? 'Ouverture du partage…' : 'Partager le PDF'} onPress={() => void shareReceipt()} />
          </ScrollView>}
        </SafeAreaView>
      </Modal>
      <StatusBar style="dark" />
      {!!error && (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
        </View>
      )}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          ref={contentScroll}
          contentContainerStyle={{ paddingTop: 20, paddingBottom: 34 }}
        >
          <View style={styles.pageHeader}>
            <Text accessibilityRole="header" style={styles.pageTitle}>{pageHeaders[page][0]}</Text>
            <Text style={styles.pageDescription}>{pageHeaders[page][1]}</Text>
          </View>
          {page === 'clients' && (
            <View style={styles.card}>
              
              <Field
                label="Rechercher un client"
                value={clientSearch}
                onChangeText={setClientSearch}
                placeholder="Nom, e-mail ou téléphone"
              />
              <Pagination data={clientData} />
              {filteredClients.map((client) => (
                <View key={client._id} style={styles.listRow}>
                  <View style={styles.flex}>
                    <Text style={styles.bold}>{client.name}</Text>
                    <Text style={styles.muted}>
                      {[client.email, client.phone, client.address].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Pressable onPress={() => editClient(client)}>
                    <Text style={styles.link}>Modifier</Text>
                  </Pressable>
                </View>
              ))}
              <Text style={styles.subheading}>
                {editingClientId ? 'Modifier la fiche' : 'Créer une fiche client'}
              </Text>
              <Field label="Nom" value={clientName} onChangeText={setClientName} />
              <Field label="E-mail" value={clientEmail} onChangeText={setClientEmail} />
              <Field
                label="Téléphone"
                value={clientPhone}
                onChangeText={setClientPhone}
                keyboardType="phone-pad"
              />
              <Field label="Adresse" value={clientAddress} onChangeText={setClientAddress} />
              <ActionButton
                disabled={busy}
                label={editingClientId ? 'Enregistrer les modifications' : 'Créer la fiche client'}
                onPress={() => void saveClient()}
              />
              {editingClientId ? (
                <ActionButton secondary label="Annuler" onPress={clearClient} />
              ) : null}
            </View>
          )}

          {page === 'purchase' && (
            <View style={styles.card}>
              
              <ActionButton secondary label="Historique des rachats" onPress={() => setPage('history')} />
              <View style={styles.steps}>{['Client', 'Articles', 'Vérifier'].map((label, i) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: purchaseStep === i, disabled: i > 0 && (!clientId || i > purchaseStep + 1) }} disabled={i > 0 && (!clientId || i > purchaseStep + 1)} onPress={() => setPurchaseStep(i)} style={[styles.stepTab, purchaseStep === i && styles.stepTabActive, i > 0 && (!clientId || i > purchaseStep + 1) && styles.disabled]}><Text style={[styles.stepTabText, purchaseStep === i && styles.stepTabTextActive]}>{i + 1}. {label}</Text></Pressable>)}</View>
              <View style={purchaseStep === 0 ? undefined : { display: 'none' }}>
              <ClientPicker label="Client du rachat" clients={sellers} value={clientId} onChange={setClientId} onResolved={client => setSellers(rows => [...rows.filter(row => row._id !== client._id), client])} onCreate={() => setPage('clients')} />
              <Field
                label="Date du rachat (l’heure actuelle sera utilisée)"
                value={purchaseDate}
                onChangeText={setPurchaseDate}
                placeholder="AAAA-MM-JJ"
              />
              </View>
              <View style={purchaseStep === 1 ? undefined : { display: 'none' }}>
              <PurchaseEditor
                rows={purchaseDrafts}
                setRows={setPurchaseDrafts}
                fresh={emptyDraft}
                search={searchCards}
                select={chooseCard}
                changeTcg={changeTcg}
                changeLanguage={changeCardLanguage}
                photo={(key, file) => setPurchaseDrafts(rows => rows.map(row => row.key === key ? { ...row, photo: file } : row))}
              />
              </View>
              {purchaseStep === 2 && <View><Text style={styles.subheading}>Vérification</Text><Text>{selectedPurchaseClient?.name ?? 'Choisissez un client'}</Text>{purchaseDrafts.map(row => <Text key={row.key}>{row.name || 'Article à compléter'}</Text>)}</View>}
              {purchaseStep < 2 && <ActionButton label="Continuer" disabled={purchaseStep === 0 && !clientId} onPress={() => setPurchaseStep(step => step + 1)} />}
            </View>
          )}

          <View style={page === 'consignments' ? undefined : { display: 'none' }}><ConsignmentScreen active={page === 'consignments'} sellers={sellers} refreshStock={refresh} onCreateClient={() => { clearClient(); setPage('clients'); }} /></View>

          {page === 'stock' && (
            <StockScreen
              revision={historyRevision}
              items={items}
              sellers={sellers}
              selectedIds={selectedItemIds}
              salePrices={salePrices}
              onChangeSalePrice={(id, value) =>
                setSalePrices((prices) => ({ ...prices, [id]: value }))
              }
              askingPriceEdits={askingPriceEdits}
              onChangeAskingPrice={(id, value) =>
                setAskingPriceEdits((edits) => ({ ...edits, [id]: value }))
              }
              onSaveAskingPrice={(id) => void saveAskingPrice(id)}
              onToggle={toggleSale}
              onOpenSales={() => setPage('saleSummary')}
              onRefresh={refresh}
              onVisibilitySaved={(ids, hidden) => setItems(current => current.map(item => ids.includes(item._id) ? { ...item, hiddenFromCatalogue: hidden } : item))}
            />
          )}

          {page === 'sales' && (
            <View style={styles.card}>
              
              <Text style={styles.saleIntro}>
                Recherchez dans le stock et ajoutez les articles à vendre. Le caddie flottant ouvre le
                récapitulatif.
              </Text>
              <Field
                label="Rechercher un article"
                value={saleSearch}
                onChangeText={setSaleSearch}
                placeholder="Nom, série ou numéro"
              />
              <View style={styles.saleResultsHeading}>
                <Text style={styles.label}>Résultats</Text>
                <Text style={styles.resultCount}>{filteredSaleItems.length} article(s)</Text>
              </View>
              <ActionButton secondary label="Historique des ventes" onPress={() => setPage('salesHistory')} />
              <Pagination data={saleStockData} />
              {salePageItems.map((item) => {
                const selected = selectedItemIds.includes(item._id);
                return (
                  <View key={item._id} style={styles.saleResultCard}>
                    {item.catalogueImageUrl ? (
                      <Image
                        source={{ uri: item.catalogueImageUrl }}
                        style={styles.saleThumb}
                        resizeMode="contain"
                      />
                    ) : null}
                    <View style={styles.flex}>
                      <Text style={styles.bold}>{item.name}</Text>
                      <Text style={styles.muted}>
                        {[item.series, item.identifier].filter(Boolean).join(' · ') ||
                          'Sans référence'}
                      </Text>
                      {item.origin === 'consignment' && <Text style={styles.muted}>Dépôt-vente · {(item.commissionRateBps ?? 3000) / 100} % de commission</Text>}
                      <Text style={styles.salePrice}>
                        {item.askingPriceCents === undefined
                          ? 'Prix à définir'
                          : `${(item.askingPriceCents / 100).toFixed(2)} €`}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => toggleSale(item)}
                      style={[styles.addSaleButton, selected && styles.removeSaleButton]}
                    >
                      <Ionicons
                        name={selected ? 'checkmark' : 'add'}
                        size={20}
                        color={selected ? '#fff' : '#143d59'}
                      />
                      <Text style={[styles.addSaleText, selected && styles.removeSaleText]}>
                        {selected ? 'Ajoutée' : 'Ajouter'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
              {!salePageItems.length ? (
                <Text style={styles.muted}>Aucun article ne correspond à cette recherche.</Text>
              ) : null}
              {filteredSaleItems.length > saleResultPageSize ? (
                <View style={styles.salePagination}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={saleResultPage <= 1}
                    onPress={() => setSaleResultPage((value) => Math.max(1, value - 1))}
                    style={[styles.salePageButton, saleResultPage <= 1 && styles.salePageDisabled]}
                  >
                    <Text style={styles.salePageText}>‹</Text>
                  </Pressable>
                  <Text style={styles.resultCount}>
                    Page {saleResultPage} sur {saleResultPageCount}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={saleResultPage >= saleResultPageCount}
                    onPress={() =>
                      setSaleResultPage((value) => Math.min(saleResultPageCount, value + 1))
                    }
                    style={[
                      styles.salePageButton,
                      saleResultPage >= saleResultPageCount && styles.salePageDisabled,
                    ]}
                  >
                    <Text style={styles.salePageText}>›</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          )}

          {page === 'saleSummary' && (
            <View style={styles.card}>
              <View style={styles.saleHeader}>
                <View style={styles.flex}>
                  
                  <Text style={styles.saleIntro}>
                    {selectedItems.length} article(s) · vérifiez les prix avant validation.
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retour à la recherche d’articles"
                  onPress={() => setPage('sales')}
                  style={styles.cartIconButton}
                >
                  <Ionicons name="arrow-back-outline" size={23} color="#143d59" />
                </Pressable>
              </View>
              {!selectedItems.length ? (
                <Text style={styles.emptyCart}>
                  Le panier est vide. Revenez à la recherche pour ajouter des articles.
                </Text>
              ) : (
                <>
                  <View style={styles.cartSummary}>
                    <Text style={styles.cartSummaryTitle}>
                      {selectedItems.length} article(s) à vendre
                    </Text>
                    <Text style={styles.cartSummaryTotal}>
                      {formatEuros(
                        selectedItems.reduce(
                          (total, item) =>
                            total + (Number((salePrices[item._id] ?? '').replace(',', '.')) || 0),
                          0,
                        ),
                      )}
                    </Text>
                    <Text style={styles.muted}>
                      Modifiez ou retirez les articles avant de confirmer.
                    </Text>
                  </View>
                  {selectedItems.map((item) => (
                    <View key={item._id} style={styles.saleCartCard}>
                      <View style={styles.saleCartHeader}>
                        <View style={styles.flex}>
                          <Text style={styles.bold}>{item.name}</Text>
                          <Text style={styles.muted}>
                            {[item.series, item.identifier].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Retirer ${item.name} du panier`}
                          onPress={() => toggleSale(item)}
                          style={styles.removeIconButton}
                        >
                          <Ionicons name="close" size={18} color="#a12e25" />
                        </Pressable>
                      </View>
                      <Field
                        label="Prix vendu (€)"
                        value={salePrices[item._id] ?? ''}
                        onChangeText={(value) =>
                          setSalePrices((prices) => ({ ...prices, [item._id]: value }))
                        }
                        keyboardType="decimal-pad"
                      />
                      {item.origin === 'consignment' && (() => {
                        const cents = Math.round(Number((salePrices[item._id] ?? '').replace(',', '.')) * 100);
                        const commission = Math.round(cents * (item.commissionRateBps ?? 3000) / 10000);
                        return Number.isFinite(cents) && cents >= 0 ? <Text style={styles.muted}>Dépôt-vente · Commission {formatEuros(commission / 100)} · Déposant {formatEuros((cents - commission) / 100)}{cents < (item.agreedPriceCents ?? item.askingPriceCents ?? 0) ? ' · Prix inférieur à l’accord : autorisation nécessaire dans Dépôts.' : ''}</Text> : null;
                      })()}
                    </View>
                  ))}
                  <Field
                    label="Date de vente"
                    value={saleDate}
                    onChangeText={setSaleDate}
                    placeholder="AAAA-MM-JJ"
                  />
                  <Text style={styles.saleHint}>
                    L’heure actuelle sera utilisée lors de l’enregistrement.
                  </Text>
                  <SalePaymentFields value={salePayment} onChange={setSalePayment} disabled={busy} totalCents={selectedItems.reduce((total, item) => total + Math.round((Number((salePrices[item._id] ?? '').replace(',', '.')) || 0) * 100), 0)} />
                  <ActionButton
                    disabled={busy}
                    label={
                      busy
                        ? 'Enregistrement…'
                        : `Confirmer la vente · ${formatEuros(selectedItems.reduce((total, item) => total + (Number((salePrices[item._id] ?? '').replace(',', '.')) || 0), 0))}`
                    }
                    onPress={() =>
                      Alert.alert(
                        'Confirmer la vente ?',
                        `${selectedItems.length} article(s) · ${formatEuros(selectedItems.reduce((total, item) => total + (Number((salePrices[item._id] ?? '').replace(',', '.')) || 0), 0))}`,
                        [
                          { text: 'Revoir le panier', style: 'cancel' },
                          {
                            text: 'Confirmer',
                            style: 'destructive',
                            onPress: () => void submitSales(),
                          },
                        ],
                      )
                    }
                  />
                </>
              )}
            </View>
          )}

          {page === 'history' && (
            <View style={styles.card}>
              
              <View style={styles.inlineActions}>
                <ActionButton
                  secondary
                  label="Nouveau rachat"
                  onPress={() => { setPurchaseStep(0); setPage('purchase'); }}
                />
                <ActionButton
                  secondary
                  label="Historique des ventes"
                  onPress={() => setPage('salesHistory')}
                />
              </View>
              <Field
                label="Référence ou client"
                value={historySearch}
                  onChangeText={setHistorySearch}
              />
              <View style={styles.inlineActions}>
                {[
                  { id: 'all', label: 'Tous' },
                  { id: 'pending', label: 'En attente' },
                  { id: 'active', label: 'Validés' },
                  { id: 'cancelled', label: 'Annulés' },
                ].map((v) => (
                  <Choice
                    key={v.id}
                    label={v.label}
                    selected={historyStatus === v.id}
                    onPress={() => {
                      setHistoryStatus(v.id);
                    }}
                  />
                ))}
              </View>
              <Field
                label="Du (AAAA-MM-JJ)"
                value={historyFrom}
                onChangeText={(v) => {
                  setHistoryFrom(v);
                }}
              />
              <Field
                label="Au (AAAA-MM-JJ)"
                value={historyTo}
                onChangeText={(v) => {
                  setHistoryTo(v);
                }}
              />
              <ActionButton
                secondary
                label="Effacer les filtres"
                onPress={() => {
                  setHistorySearch('');
                  setHistoryStatus('all');
                  setHistoryFrom('');
                  setHistoryTo('');
                }}
              />
              <Text style={styles.muted}>Historique des rachats</Text>
              <Pagination data={purchaseHistory} />
              {!historyBusy &&
                !historyError &&
                purchases.map((purchase) => (
                  <View key={purchase._id} style={styles.historyCard}>
                    <View style={styles.receiptRow}>
                      <View style={styles.flex}>
                        <Text style={styles.bold}>{purchase.reference}</Text>
                        <Text style={styles.muted}>{purchase.sellerName}</Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Voir le bordereau PDF du rachat ${purchase.reference}, ${purchase.sellerName}`}
                        accessibilityHint="Ouvre le bordereau et son action de partage"
                        onPress={() => void openPurchaseReceipt(purchase)}
                        style={styles.receiptIcon}
                      >
                        <Ionicons name="document-text-outline" size={22} color="#164f73" />
                        <Text style={styles.receiptIconText}>PDF</Text>
                      </Pressable>
                    </View>
                    <Text
                      style={[
                        styles.purchaseStatus,
                        purchase.status === 'pending' && styles.purchaseStatusPending,
                      ]}
                    >
                      {purchase.status === 'pending'
                        ? 'En attente de validation client'
                        : purchase.status === 'cancelled'
                          ? 'Annulé'
                          : 'Validé'}
                    </Text>
                    <ActionButton
                      secondary
                      label={
                        expandedPurchase === purchase._id
                          ? 'Fermer les détails'
                          : `${purchase.items.length} article(s) · Voir les détails`
                      }
                      onPress={() =>
                        setExpandedPurchase(expandedPurchase === purchase._id ? null : purchase._id)
                      }
                    />
                    {expandedPurchase === purchase._id && (
                      <>
                        {purchase.status === 'pending' ? (
                          <View style={styles.inlineActions}>
                            <ActionButton
                              disabled={busy}
                              label="Valider le rachat et ajouter au stock"
                              onPress={() => void confirmPendingPurchase(purchase)}
                            />
                            <ActionButton
                              disabled={busy}
                              secondary
                              label="Annuler le rachat"
                              onPress={() => rejectPendingPurchase(purchase)}
                            />
                          </View>
                        ) : null}
                        <Field
                          label="Date du rachat (heure actuelle conservée)"
                          value={
                            purchaseDateEdits[purchase._id] ??
                            localDateValue(new Date(purchase.occurredAt))
                          }
                          onChangeText={(value) =>
                            setPurchaseDateEdits((dates) => ({ ...dates, [purchase._id]: value }))
                          }
                          placeholder="AAAA-MM-JJ"
                        />
                        <ActionButton
                          secondary
                          disabled={busy}
                          label="Enregistrer la date"
                          onPress={() => void updatePurchaseDateAction(purchase)}
                        />
                        {purchase.items.map((item) => (
                          <View key={item._id} style={styles.historyItem}>
                            <Text style={styles.muted}>
                              {item.name} · {languageName(item.language)} ·{' '}
                              {conditionName(item.condition)} ·{' '}
                              {(item.purchasePriceCents / 100).toFixed(2)} €
                            </Text>
                            {(item.photos ?? []).map((photo) => (
                              <Pressable
                                key={photo._id}
                                onPress={() =>
                                  void openAttachment(photo._id, photo.filename, photo.contentType)
                                }
                              >
                                <Text style={styles.attachmentLink}>Photo : {photo.filename}</Text>
                              </Pressable>
                            ))}
                          </View>
                        ))}
                        <Pressable
                          disabled={busy}
                          onPress={() => void loadPurchaseAttachments(purchase._id)}
                        >
                          <Text style={styles.link}>Photos et justificatifs</Text>
                        </Pressable>
                        {(purchaseAttachments[purchase._id] ?? []).map((attachment) => (
                          <Pressable
                            key={attachment._id}
                            disabled={busy}
                            onPress={() =>
                              void openAttachment(
                                attachment._id,
                                attachment.filename,
                                attachment.contentType,
                              )
                            }
                          >
                            <Text style={styles.attachmentLink}>{attachment.filename}</Text>
                          </Pressable>
                        ))}
                      </>
                    )}
                  </View>
                ))}
              {!historyBusy && !historyError && !purchases.length ? (
                <Text style={styles.muted}>Aucun rachat ne correspond aux filtres.</Text>
              ) : null}
            </View>
          )}
          {page === 'salesHistory' && (
            <View style={styles.card}>
              <Pagination data={saleData} />
              <ActionButton
                secondary
                label="Historique des rachats"
                onPress={() => setPage('history')}
              />
              {sales.map((sale) => (
                <View key={sale._id} style={styles.listRow}>
                  <View style={styles.flex}>
                    <Text style={styles.bold}>
                      {sale.itemName} · {(sale.salePriceCents / 100).toFixed(2)} €
                    </Text>
                    <Text style={styles.muted}>
                      {new Date(sale.occurredAt).toLocaleDateString('fr-BE')} ·{' '}
                      {sale.status === 'active' ? 'Vendue' : 'Annulée'}
                    </Text>
                    <SalePaymentHistory sale={sale} onChanged={refresh} />
                    {sale.origin === 'consignment' && <Text style={styles.muted}>Dépôt-vente · Commission {formatEuros((sale.commissionCents ?? 0) / 100)} · Déposant {formatEuros((sale.depositorAmountCents ?? 0) / 100)}{sale.status === 'cancelled' ? ' · Répartition annulée ; vérifiez les régularisations dans Dépôts.' : ''}</Text>}
                  </View>
                  {sale.status === 'active' ? (
                    <Pressable
                      disabled={busy}
                      onPress={() => void undoSale(sale._id, setBusy, setError, refresh)}
                    >
                      <Text style={styles.link}>Annuler</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          )}
          {page === 'account' && (
            <View>
            <View style={styles.card}>
              
              <ActionButton secondary label="Clients" onPress={() => setPage('clients')} />
              <ActionButton secondary label="Historique des rachats" onPress={() => setPage('history')} />
              <ActionButton secondary label="Historique des ventes" onPress={() => setPage('salesHistory')} />
              </View>
              <View style={styles.card}>
              <Text style={styles.subheading}>Instance connectée</Text>
              <Text style={styles.muted}>{getApiBaseUrl()}</Text>
              <ActionButton secondary disabled={busy} label="Changer d’instance" onPress={() => Alert.alert('Changer d’instance ?', 'Vous serez déconnecté et les saisies non enregistrées seront abandonnées.', [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Changer', style: 'destructive', onPress: () => { void logout().then(() => { setPurchaseDrafts(freshDraft()); setClientId(''); setPurchaseAttachments({}); setSalePrices({}); clearClient(); setPage('stock'); setInstanceReady(false); setInstanceUrl(''); setInstanceError(''); }); } },
              ])} />
              </View>
              <View style={styles.card}>
              <Text style={styles.subheading}>Session</Text>
              <Text style={styles.muted}>Gérez votre session vendeur sur cet appareil.</Text>
              <ActionButton
                disabled={busy}
                secondary
                label={busy ? 'Déconnexion…' : 'Se déconnecter'}
                onPress={() => void logout()}
              />
            </View>
            </View>
          )}
        </ScrollView>
        {page === 'purchase' && purchaseStep === 2 && (
          <PurchaseSummary
            rows={purchaseDrafts}
            busy={busy}
            hasClient={!!clientId}
            save={() => void submitPurchase()}
          />
        )}
      </KeyboardAvoidingView>
      {busy ? <ActivityIndicator style={styles.spinner} /> : null}
      <View accessibilityRole="tablist" style={styles.bottomNav}>
        {nav('stock', 'Stock', 'albums-outline')}
        {nav('sales', 'Vendre', 'cart-outline')}
        {nav('history', 'Rachats', 'add-circle-outline')}
        {nav('consignments', 'Dépôts', 'cube-outline')}
        {nav('account', 'Plus', 'ellipsis-horizontal-circle-outline')}
      </View>
      {authenticated &&
      selectedItemIds.length > 0 &&
      page !== 'saleSummary' &&
      page !== 'purchase' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ouvrir le résumé du panier, ${selectedItemIds.length} article(s)`}
          onPress={() => setPage('saleSummary')}
          style={styles.cartFab}
        >
          <Ionicons name="cart-outline" size={25} color="white" />
          <View style={styles.cartFabCount}>
            <Text style={styles.cartFabCountText}>{selectedItemIds.length}</Text>
          </View>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

function ActionButton({
  label,
  onPress,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, secondary && styles.secondaryAction, disabled && styles.disabled]}
    >
      <Text style={[styles.actionText, secondary && styles.secondaryText]}>{label}</Text>
    </Pressable>
  );
}
function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <Text style={styles.choiceText}>
        {selected ? '● ' : ''}
        {label}
      </Text>
    </Pressable>
  );
}
function pickItemPhoto(
  key: string,
  setter: React.Dispatch<React.SetStateAction<PurchaseDraft[]>>,
  setError: (value: string) => void,
) {
  return pickAttachment()
    .then(file => {
      if (!file) return;
      setter(rows => rows.map(row => row.key === key ? { ...row, photo: file } : row));
    })
    .catch(reason => setError(reason instanceof Error ? reason.message : 'Capture ou sélection impossible.'));

}
async function undoSale(
  saleId: string,
  setBusy: (value: boolean) => void,
  setError: (value: string) => void,
  refresh: () => Promise<void>,
) {
  setBusy(true);
  try {
    await cancelSale(saleId);
    await refresh();
  } catch (reason) {
    setError(reason instanceof Error ? reason.message : 'Annulation impossible.');
  } finally {
    setBusy(false);
  }
}

const styles = StyleSheet.create({
  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  receiptIcon: { minWidth: 44, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  receiptIconText: { fontSize: 9, fontWeight: '700', color: '#164f73' },
  pageHeader: { marginBottom: 20, gap: 7 },
  pageTitle: { fontSize: 25, fontWeight: '700', color: '#152b3a', letterSpacing: -0.5 },
  pageDescription: { fontSize: 14, lineHeight: 20, color: '#536b7a' },
  page: { flex: 1, backgroundColor: '#f2f5f7', paddingHorizontal: 16 },
  loginContent: { flexGrow: 1, paddingBottom: 24 },
  header: { paddingTop: 14, paddingBottom: 12 },
  title: { fontSize: 27, fontWeight: '700', color: '#152b3a' },
  subtitle: { color: '#5b6d78', marginTop: 4 },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    gap: 0,
    marginHorizontal: -16,
    marginTop: 4,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: '#d7e1e7',
    backgroundColor: 'white',
    minHeight: 58,
  },
  nav: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 5,
    minHeight: 48,
    borderRadius: 10,
  },
  active: { backgroundColor: '#e3edf3' },
  navText: { fontSize: 12, color: '#60727e', fontWeight: '600', textAlign: 'center' },
  activeText: { color: '#164f73', fontWeight: '800' },
  card: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7e1e7',
    marginBottom: 12,
  },
  heading: { fontSize: 20, fontWeight: '700', marginBottom: 14, color: '#152b3a' },
  steps: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  stepTab: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3, borderWidth: 1, borderColor: '#d7e1e7', borderRadius: 10, backgroundColor: 'white' },
  stepTabActive: { backgroundColor: '#164f73', borderColor: '#164f73' },
  stepTabText: { color: '#526875', fontSize: 12, fontWeight: '700' },
  stepTabTextActive: { color: 'white' },
  subheading: { fontSize: 16, fontWeight: '700', marginTop: 12, marginBottom: 9, color: '#152b3a' },
  label: { fontWeight: '600', marginBottom: 8, color: '#263238' },
  action: {
    backgroundColor: '#143d59',
    padding: 13,
    alignItems: 'center',
    borderRadius: 9,
    marginTop: 8,
  },
  actionText: { color: 'white', fontWeight: '700', textAlign: 'center' },
  secondaryAction: { backgroundColor: '#e3e9ed' },
  secondaryText: { color: '#164f73' },
  disabled: { opacity: 0.55 },
  choice: {
    padding: 9,
    backgroundColor: '#f4f7f9',
    marginBottom: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e3e8ec',
  },
  choiceSelected: { borderColor: '#164f73', backgroundColor: '#e8f1f6' },
  choiceText: { color: '#263238', fontSize: 12 },
  clientSearchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    minHeight: 48,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#cbd5dc',
    borderRadius: 10,
    backgroundColor: 'white',
  },
  clientSearchInput: { flex: 1, paddingVertical: 10, color: '#152b3a', fontSize: 15 },
  purchaseClientResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e3e8ec',
    borderRadius: 9,
    backgroundColor: '#fbfcfd',
  },
  selectedPurchaseClient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#adc6d4',
    borderRadius: 10,
    backgroundColor: '#edf5f9',
  },
  selectedClientMark: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: '#dbeaf2',
  },
  changeClientButton: {
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: 'white',
  },
  changeClientText: { color: '#164f73', fontSize: 12, fontWeight: '700' },
  clientSearchHint: { color: '#60727e', fontSize: 12, marginBottom: 12 },
  noClientResult: { color: '#60727e', paddingVertical: 10 },
  inlineActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 10 },
  conditionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 12 },
  draft: {
    borderWidth: 1,
    borderColor: '#dce5eb',
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
    backgroundColor: '#fbfcfd',
  },
  cardImage: { width: 150, height: 210, alignSelf: 'center', marginBottom: 12 },
  cardThumb: { width: 42, height: 58, marginRight: 10 },
  searchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 9,
    borderBottomWidth: 1,
    borderColor: '#edf0f2',
  },
  saleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  saleIntro: { color: '#60727e', lineHeight: 20, marginTop: -7 },
  cartIconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f1f6',
    borderRadius: 14,
  },
  cartCountBadge: {
    position: 'absolute',
    right: -3,
    top: -3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: '#a12e25',
  },
  cartCountText: { color: 'white', fontSize: 10, fontWeight: '800' },
  saleResultsHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  resultCount: { color: '#60727e', fontSize: 12, fontWeight: '600' },
  saleResultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#fbfcfd',
    borderWidth: 1,
    borderColor: '#e3e8ec',
    borderRadius: 10,
  },
  saleThumb: { width: 48, height: 64, borderRadius: 4, backgroundColor: '#f3f6f8' },
  salePrice: { color: '#143d59', fontWeight: '800', marginTop: 5 },
  addSaleButton: {
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: '#e3edf3',
  },
  removeSaleButton: { backgroundColor: '#143d59' },
  addSaleText: { color: '#143d59', fontSize: 11, fontWeight: '700' },
  removeSaleText: { color: 'white' },
  salePagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 8,
  },
  salePageButton: {
    width: 40,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f1f6',
    borderRadius: 9,
  },
  salePageDisabled: { opacity: 0.4 },
  salePageText: { color: '#143d59', fontSize: 22, fontWeight: '700' },
  cartFab: {
    position: 'absolute',
    right: 18,
    bottom: 88,
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 27,
    backgroundColor: '#143d59',
    elevation: 7,
    shadowColor: '#0a2434',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 10,
  },
  cartFabCount: {
    position: 'absolute',
    top: -2,
    right: -3,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#a12e25',
  },
  cartFabCountText: { color: 'white', fontSize: 10, fontWeight: '800' },
  cartSummary: { padding: 14, borderRadius: 10, backgroundColor: '#e8f1f6', marginBottom: 10 },
  cartSummaryTitle: { color: '#143d59', fontWeight: '800', fontSize: 15 },
  cartSummaryTotal: { color: '#143d59', fontWeight: '800', fontSize: 24, marginTop: 4 },
  saleCartCard: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e3e8ec',
    backgroundColor: '#fbfcfd',
  },
  saleCartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  removeIconButton: {
    position: 'absolute',
    right: 8,
    top: 8,
    zIndex: 1,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff0ee',
    borderRadius: 17,
  },
  emptyCart: {
    padding: 18,
    color: '#60727e',
    textAlign: 'center',
    backgroundColor: '#f3f6f8',
    borderRadius: 10,
  },
  saleHint: { color: '#60727e', fontSize: 12, marginTop: -8, marginBottom: 6 },
  flex: { flex: 1 },
  bold: { fontWeight: '700', color: '#152b3a' },
  muted: { color: '#60727e', marginTop: 3, lineHeight: 19 },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderColor: '#edf0f2',
  },
  cartItem: { paddingVertical: 12, borderBottomWidth: 1, borderColor: '#edf0f2' },
  historyCard: { paddingVertical: 12, borderBottomWidth: 1, borderColor: '#edf0f2', gap: 5 },
  purchaseStatus: {
    alignSelf: 'flex-start',
    backgroundColor: '#edf4f0',
    color: '#315c45',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 99,
    fontSize: 12,
    fontWeight: '700',
  },
  purchaseStatusPending: { backgroundColor: '#fff4d8', color: '#805600' },
  historyItem: { paddingVertical: 5 },
  link: { color: '#164f73', fontWeight: '700', paddingVertical: 4 },
  attachmentLink: { color: '#164f73', textDecorationLine: 'underline', paddingVertical: 4 },
  errorBox: {
    borderColor: '#e3aaa4',
    borderWidth: 1,
    backgroundColor: '#fff4f2',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  error: { color: '#a12e25', lineHeight: 20 },
  spinner: { marginVertical: 8 },
});
