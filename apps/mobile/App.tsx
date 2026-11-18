import * as DocumentPicker from 'expo-document-picker';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { clearSession, readSession, revokeSession } from './src/auth/session';
import { Field } from './src/components/Field';
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
  listPurchases,
  listSales,
  listSellers,
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
import { AuthScreen } from './src/screens/AuthScreen';
import { StockScreen } from './src/screens/StockScreen';

type Page = 'clients' | 'purchase' | 'stock' | 'sales' | 'saleSummary' | 'history' | 'account';
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
const conditionName = (id?: string) => conditions.find((row) => row.id === id)?.label ?? 'Near Mint (NM)';
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
  return new Date(year, month - 1, day, timeSource.getHours(), timeSource.getMinutes(), timeSource.getSeconds(), timeSource.getMilliseconds()).getTime();
}
function freshDraft() {
  return [emptyDraft()];
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<Page>('stock');
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
  const [purchaseDateEdits, setPurchaseDateEdits] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const [stock, sellerRows, saleRows, purchaseRows] = await Promise.all([
      listStock(),
      listSellers(),
      listSales(),
      listPurchases(),
    ]);
    setItems(stock);
    setSellers(sellerRows);
    setSales(saleRows);
    setPurchases(purchaseRows);
    setError('');
  }, []);

  useEffect(() => {
    void (async () => {
      setAuthenticated(Boolean(await readSession()));
      setReady(true);
    })().catch((reason) => setError(String(reason)));
  }, []);
  useEffect(
    () => onSessionExpired(() => {
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

  const filteredClients = useMemo(
    () =>
      sellers.filter((seller) =>
        [seller.name, seller.email, seller.phone, seller.address]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('fr')
          .includes(clientSearch.trim().toLocaleLowerCase('fr')),
      ),
    [clientSearch, sellers],
  );
  const filteredPurchaseClients = useMemo(() => {
    const term = purchaseClientSearch.trim().toLocaleLowerCase('fr');
    if (!term) return [];
    return sellers.filter((client) =>
      [client.name, client.email, client.phone]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('fr')
        .includes(term),
    ).slice(0, 8);
  }, [purchaseClientSearch, sellers]);
  const selectedPurchaseClient = sellers.find((client) => client._id === clientId);
  const filteredSaleItems = useMemo(
    () =>
      items.filter((item) =>
        [item.name, item.series, item.identifier, item.serialNumber, item.sellerName]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('fr')
          .includes(saleSearch.trim().toLocaleLowerCase('fr')),
      ),
    [items, saleSearch],
  );
  const saleResultPageSize = 10;
  const saleResultPageCount = Math.max(1, Math.ceil(filteredSaleItems.length / saleResultPageSize));
  const salePageItems = filteredSaleItems.slice((saleResultPage - 1) * saleResultPageSize, saleResultPage * saleResultPageSize);
  useEffect(() => setSaleResultPage(1), [saleSearch]);
  useEffect(() => setSaleResultPage((current) => Math.min(current, saleResultPageCount)), [saleResultPageCount]);
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
    setError('');
    setPurchaseDrafts((rows) => rows.map((row) => row.key === draft.key ? { ...row, searching: true } : row));
    try {
      const localized = await Promise.all(languages.map(async ({ id: language }) => {
        const filters = [`name=${encodeURIComponent(term)}`];
        const localNumber = term.match(/^(?:[A-Za-z0-9-]+\s+)?([A-Za-z0-9-]+)\/(?:[A-Za-z0-9-]+)$/)?.[1] ?? (/^\d+$/.test(term) ? term : undefined);
        if (localNumber) filters.push(`localId=${encodeURIComponent(localNumber)}`);
        const responses = await Promise.all(filters.map((filter) => fetch(
          `https://api.tcgdex.net/v2/${language}/cards?${filter}&pagination:page=1&pagination:itemsPerPage=10`,
        )));
        if (responses.some((response) => !response.ok)) throw new Error('Le catalogue Pokémon est momentanément indisponible.');
        const resultLists = await Promise.all(responses.map((response) => response.json() as Promise<Omit<CardResult, 'language'>[]>));
        const unique = new Map(resultLists.flat().map((result) => [result.id, result]));
        return [...unique.values()].slice(0, 15).map((result) => ({ ...result, language }));
      }));
      const results = localized.flat();
      const availableById = new Map<string, CardLanguage[]>();
      for (const result of results) {
        const found = availableById.get(result.id) ?? [];
        if (!found.includes(result.language)) found.push(result.language);
        availableById.set(result.id, found);
      }
      const matches = results.map((result) => ({
        ...result,
        availableLanguages: availableById.get(result.id) ?? [result.language],
      }));
      setPurchaseDrafts((rows) => rows.map((row) => row.key === draft.key ? { ...row, cardResults: matches, searching: false } : row));
    } catch (reason) {
      setPurchaseDrafts((rows) => rows.map((row) => row.key === draft.key ? { ...row, searching: false } : row));
      setError(reason instanceof Error ? reason.message : 'Recherche de carte impossible.');
    }
  };
  const chooseCard = async (draft: PurchaseDraft, result: CardResult) => {
    let name = result.name;
    let series = result.setName ?? draft.series;
    let identifier = result.localId;
    let image = result.image;
    const localizedDetails = await Promise.all(languages.map(async ({ id: language }) => {
      try {
        const response = await fetch(`https://api.tcgdex.net/v2/${language}/cards/${encodeURIComponent(result.id)}`);
        if (!response.ok) return null;
        return { language, card: await response.json() as { name?: string; localId?: string; image?: string; set?: { name?: string } } };
      } catch {
        return null;
      }
    }));
    const availableLanguages = localizedDetails
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .map((entry) => entry.language);
    const selected = localizedDetails.find((entry) => entry?.language === result.language)?.card;
    name = selected?.name ?? name;
    identifier = selected?.localId ?? identifier;
    series = selected?.set?.name ?? series;
    image = selected?.image ?? image;
    setPurchaseDrafts((rows) => rows.map((row) => row.key === draft.key ? {
      ...row,
      name,
      series,
      identifier,
      language: result.language,
      catalogueCardId: result.id,
      availableLanguages: availableLanguages.length ? availableLanguages : [result.language],
      catalogueImageUrl: image ? `${image}/low.webp` : '',
      cardResults: [],
    } : row));
  };
  const changeCardLanguage = async (draft: PurchaseDraft, language: CardLanguage) => {
    if (!draft.catalogueCardId) {
      setPurchaseDrafts((rows) => rows.map((row) => row.key === draft.key ? { ...row, language } : row));
      return;
    }
    try {
      const response = await fetch(`https://api.tcgdex.net/v2/${language}/cards/${encodeURIComponent(draft.catalogueCardId)}`);
      if (!response.ok) throw new Error('Cette édition n’est pas disponible dans cette langue.');
      const card = (await response.json()) as { name: string; localId: string; image?: string; set?: { name?: string } };
      setPurchaseDrafts((rows) => rows.map((row) => row.key === draft.key ? {
        ...row,
        language,
        name: card.name,
        series: card.set?.name ?? row.series,
        identifier: card.localId,
        catalogueImageUrl: card.image ? `${card.image}/low.webp` : '',
      } : row));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Version dans cette langue introuvable.');
    }
  };

  const submitPurchase = async () => {
    if (!clientId) return setError('Sélectionnez le client dans la liste.');
    const client = sellers.find((row) => row._id === clientId);
    if (!client) return setError('Client introuvable. Actualisez la liste.');
    const rows = purchaseDrafts.filter((row) => row.name.trim());
    if (!rows.length) return setError('Ajoutez au moins une carte.');
    setBusy(true);
    setError('');
    try {
      const entries = rows.map((row) => {
        if (!row.marketValue.trim()) throw new Error(`Saisissez la valeur actuelle de ${row.name}.`);
        if (!row.discountPercent.trim()) throw new Error(`Saisissez la décote de ${row.name}.`);
        const marketValue = Number(row.marketValue.replace(',', '.'));
        const discount = Number(row.discountPercent.replace(',', '.'));
        const asking = row.askingPriceTouched ? Number(row.askingPrice.replace(',', '.')) : marketValue;
        if (!Number.isFinite(marketValue) || marketValue < 0) throw new Error(`Valeur actuelle invalide pour ${row.name}.`);
        if (!Number.isFinite(discount) || discount < 0 || discount > 100) throw new Error(`Décote invalide pour ${row.name}.`);
        if (!Number.isFinite(asking) || asking < 0) throw new Error(`Prix de vente invalide pour ${row.name}.`);
        return {
          name: row.name.trim(),
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
      let receiptFailure = '';
      try {
        await sharePurchaseReceipt({
          reference,
          occurredAt,
          status: 'pending',
          client,
          items: entries.map((entry) => ({
            name: entry.name,
            series: entry.series ?? '',
            identifier: entry.identifier ?? '',
            language: languageName(entry.language),
            condition: conditionName(entry.condition),
            gradingCompany: entry.gradingCompany,
            gradingGrade: entry.gradingGrade,
            gradingCertificate: entry.gradingCertificate,
            gradingNotes: entry.gradingNotes,
            marketValueCents: Math.round(entry.marketValue * 100),
            discountPercent: entry.discountPercent,
            purchasePriceCents: Math.round(entry.marketValue * entry.discountPercent),
          })),
        });
      } catch {
        receiptFailure = 'Le rachat est enregistré, mais le reçu PDF n’a pas pu être ouvert.';
      }
      const photoFailure = failedPhotos.length
        ? `Photo non envoyée : ${failedPhotos.join(', ')}.`
        : '';
      setError([`Rachat ${reference} en attente de validation du client.`, receiptFailure, photoFailure].filter(Boolean).join(' '));
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
      const client = sellers.find((row) => row._id === purchase.sellerId);
      if (client) {
        await sharePurchaseReceipt({
          reference: purchase.reference,
          occurredAt,
          status: purchase.status,
          client,
          items: purchase.items.map((item) => ({
            name: item.name,
            series: item.series ?? '',
            identifier: item.identifier ?? '',
            language: languageName(item.language),
            condition: conditionName(item.condition),
            gradingCompany: item.gradingCompany,
            gradingGrade: item.gradingGrade,
            gradingCertificate: item.gradingCertificate,
            gradingNotes: item.gradingNotes,
            marketValueCents:
              item.marketValueCents ??
              (item.discountPercent
                ? Math.round(item.purchasePriceCents / (item.discountPercent / 100))
                : item.purchasePriceCents),
            discountPercent: item.discountPercent ?? 70,
            purchasePriceCents: item.purchasePriceCents,
          })),
        });
      }
      setError('Date modifiée. Le reçu PDF actualisé est prêt à partager.');
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Validation impossible.');
    } finally {
      setBusy(false);
    }
  };
  const rejectPendingPurchase = async (purchase: Purchase) => {
    Alert.alert('Annuler ce rachat ?', 'Les cartes de ce rachat ne seront pas ajoutées au stock.', [
      { text: 'Garder en attente', style: 'cancel' },
      { text: 'Annuler le rachat', style: 'destructive', onPress: () => {
        setBusy(true);
        void cancelPendingPurchase(purchase._id)
          .then(refresh)
          .then(() => setError(`Rachat ${purchase.reference} annulé.`))
          .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Annulation impossible.'))
          .finally(() => setBusy(false));
      } },
    ]);
  };

  const toggleSale = (item: Item) => {
    setSelectedItemIds((ids) => {
      const exists = ids.includes(item._id);
      if (exists) return ids.filter((id) => id !== item._id);
      setSalePrices((prices) => ({
        ...prices,
        [item._id]: prices[item._id] ?? (item.askingPriceCents === undefined ? '' : (item.askingPriceCents / 100).toFixed(2)),
      }));
      return [...ids, item._id];
    });
  };
  const submitSales = async () => {
    if (!selectedItems.length) return setError('Ajoutez des cartes au panier.');
    const saleRows = selectedItems.map((item) => {
      const price = Number((salePrices[item._id] ?? '').replace(',', '.'));
      if (!Number.isFinite(price) || price < 0) throw new Error(`Prix de vente invalide pour ${item.name}.`);
      return { itemId: item._id, salePriceCents: Math.round(price * 100) };
    });
    setBusy(true);
    setError('');
    try {
      await createSales(saleRows, dateAtCurrentTime(saleDate));
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
    if (!Number.isFinite(amount) || amount < 0) return setError('Saisissez un prix de vente valide.');
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
  const nav = (nextPage: Page, label: string, icon: React.ComponentProps<typeof Ionicons>['name']) => (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: page === nextPage }}
      disabled={busy}
      onPress={() => setPage(nextPage)}
      style={[styles.nav, page === nextPage && styles.active]}
    >
      <Ionicons name={icon} size={20} color={page === nextPage ? '#143d59' : '#60727e'} />
      <Text style={[styles.navText, page === nextPage && styles.activeText]}>{label}</Text>
    </Pressable>
  );

  const logout = async () => {
    setBusy(true);
    try {
      await revokeSession();
    } finally {
      await clearSession();
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
    return <SafeAreaView style={styles.page}><ActivityIndicator /></SafeAreaView>;
  if (!authenticated)
    return (
      <SafeAreaView style={styles.page}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.loginContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>TVA sur marge</Text>
            <Text style={styles.subtitle}>Application vendeur · connexion requise</Text>
          </View>
          <AuthScreen onAuthenticated={async () => setAuthenticated(true)} />
        </ScrollView>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar style="dark" />
      {!!error && <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.error}>{error}</Text></View>}
      <ScrollView contentContainerStyle={{ paddingTop: 14, paddingBottom: 34 }}>
        {page === 'clients' && (
          <View style={styles.card}>
            <Text style={styles.heading}>Clients</Text>
            <Field label="Rechercher un client" value={clientSearch} onChangeText={setClientSearch} placeholder="Nom, e-mail ou téléphone" />
            {filteredClients.map((client) => (
              <View key={client._id} style={styles.listRow}>
                <View style={styles.flex}>
                  <Text style={styles.bold}>{client.name}</Text>
                  <Text style={styles.muted}>{[client.email, client.phone, client.address].filter(Boolean).join(' · ')}</Text>
                </View>
                <Pressable onPress={() => editClient(client)}><Text style={styles.link}>Modifier</Text></Pressable>
              </View>
            ))}
            <Text style={styles.subheading}>{editingClientId ? 'Modifier la fiche' : 'Créer une fiche client'}</Text>
            <Field label="Nom" value={clientName} onChangeText={setClientName} />
            <Field label="E-mail" value={clientEmail} onChangeText={setClientEmail} />
            <Field label="Téléphone" value={clientPhone} onChangeText={setClientPhone} keyboardType="phone-pad" />
            <Field label="Adresse" value={clientAddress} onChangeText={setClientAddress} />
            <ActionButton disabled={busy} label={editingClientId ? 'Enregistrer les modifications' : 'Créer la fiche client'} onPress={() => void saveClient()} />
            {editingClientId ? <ActionButton secondary label="Annuler" onPress={clearClient} /> : null}
          </View>
        )}

        {page === 'purchase' && (
          <View style={styles.card}>
            <Text style={styles.heading}>Nouveau rachat</Text>
            <Text style={styles.label}>Client du rachat</Text>
            {selectedPurchaseClient ? (
              <View style={styles.selectedPurchaseClient}>
                <View style={styles.selectedClientMark}><Ionicons name="person" size={17} color="#143d59" /></View>
                <View style={styles.flex}>
                  <Text style={styles.bold}>{selectedPurchaseClient.name}</Text>
                  <Text style={styles.muted}>{[selectedPurchaseClient.email, selectedPurchaseClient.phone].filter(Boolean).join(' · ') || 'Coordonnées non renseignées'}</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => { setClientId(''); setPurchaseClientSearch(''); }} style={styles.changeClientButton}>
                  <Text style={styles.changeClientText}>Changer</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.clientSearchField}>
                  <Ionicons name="search-outline" size={19} color="#60727e" />
                  <TextInput
                    accessibilityLabel="Rechercher un client pour le rachat"
                    value={purchaseClientSearch}
                    onChangeText={setPurchaseClientSearch}
                    placeholder="Nom, e-mail ou téléphone"
                    autoCapitalize="none"
                    style={styles.clientSearchInput}
                  />
                  {purchaseClientSearch ? <Pressable accessibilityRole="button" accessibilityLabel="Effacer la recherche client" onPress={() => setPurchaseClientSearch('')}><Ionicons name="close-circle" size={19} color="#60727e" /></Pressable> : null}
                </View>
                {filteredPurchaseClients.map((client) => (
                  <Pressable key={client._id} accessibilityRole="button" onPress={() => { setClientId(client._id); setPurchaseClientSearch(''); }} style={styles.purchaseClientResult}>
                    <View style={styles.flex}>
                      <Text style={styles.bold}>{client.name}</Text>
                      <Text style={styles.muted}>{[client.email, client.phone].filter(Boolean).join(' · ')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#60727e" />
                  </Pressable>
                ))}
                {purchaseClientSearch.trim() && !filteredPurchaseClients.length ? <Text style={styles.noClientResult}>Aucun client trouvé.</Text> : null}
                {!sellers.length || (purchaseClientSearch.trim() && !filteredPurchaseClients.length) ? <ActionButton secondary label="Créer une fiche client" onPress={() => setPage('clients')} /> : null}
                {!purchaseClientSearch.trim() && sellers.length > 0 ? <Text style={styles.clientSearchHint}>{sellers.length} clients disponibles · commencez à saisir pour rechercher</Text> : null}
              </>
            )}
            <Field label="Date du rachat (l’heure actuelle sera utilisée)" value={purchaseDate} onChangeText={setPurchaseDate} placeholder="AAAA-MM-JJ" />
            {purchaseDrafts.map((draft, index) => {
              const marketValue = Number(draft.marketValue.replace(',', '.')) || 0;
              const discount = Number(draft.discountPercent.replace(',', '.')) || 0;
              return (
                <View key={draft.key} style={styles.draft}>
                  <Text style={styles.subheading}>Carte {index + 1}</Text>
                  <Field label="Recherche catalogue Pokémon (nom ou numéro)" value={draft.cardSearch} onChangeText={(value) => setPurchaseDrafts((rows) => rows.map((row) => row.key === draft.key ? { ...row, cardSearch: value } : row))} placeholder="Pikachu, 151/165…" />
                  <ActionButton secondary disabled={draft.searching} label={draft.searching ? 'Recherche…' : 'Rechercher la carte'} onPress={() => void searchCards(draft)} />
                  {draft.cardResults.map((result) => <Pressable key={`${result.language}-${result.id}`} onPress={() => void chooseCard(draft, result)} style={styles.searchResult}>
                    {result.image ? <Image source={{ uri: `${result.image}/low.webp` }} style={styles.cardThumb} /> : null}
                    <View style={styles.flex}><Text style={styles.bold}>{result.name}</Text><Text style={styles.muted}>{result.setName ?? result.id} · {result.localId} · {languageName(result.language)}</Text></View>
                  </Pressable>)}
                  {draft.catalogueImageUrl ? <Image source={{ uri: draft.catalogueImageUrl }} style={styles.cardImage} resizeMode="contain" /> : null}
                  <Field label="Nom de la carte" value={draft.name} onChangeText={(value) => setPurchaseDrafts((rows) => rows.map((row) => row.key === draft.key ? { ...row, name: value } : row))} />
                  <Field label="Série" value={draft.series} onChangeText={(value) => setPurchaseDrafts((rows) => rows.map((row) => row.key === draft.key ? { ...row, series: value } : row))} />
                  <Field label="Numéro d’identification" value={draft.identifier} onChangeText={(value) => setPurchaseDrafts((rows) => rows.map((row) => row.key === draft.key ? { ...row, identifier: value } : row))} />
                  <Text style={styles.label}>Langue de la carte</Text>
                  <View style={styles.inlineActions}>{languages.filter((language) => !draft.catalogueCardId || draft.availableLanguages?.includes(language.id)).map((language) => <Choice key={language.id} selected={draft.language === language.id} label={language.label} onPress={() => void changeCardLanguage(draft, language.id)} />)}</View>
                  <Text style={styles.label}>État de la carte (ordre Cardmarket)</Text>
                  <View style={styles.conditionGrid}>{conditions.map((condition) => <Choice key={condition.id} selected={draft.condition === condition.id} label={condition.label} onPress={() => setPurchaseDrafts((rows) => rows.map((row) => row.key === draft.key ? { ...row, condition: condition.id } : row))} />)}</View>
                  <Text style={styles.label}>Gradation (facultative)</Text>
                  <View style={styles.inlineActions}><Choice selected={!draft.gradingCompany} label="Non gradée" onPress={() => setPurchaseDrafts((rows) => rows.map((row) => row.key === draft.key ? { ...row, gradingCompany: undefined, gradingGrade: '', gradingCertificate: '', gradingNotes: '' } : row))} />{gradingCompanies.map((company) => <Choice key={company.id} selected={draft.gradingCompany === company.id} label={company.label} onPress={() => setPurchaseDrafts((rows) => rows.map((row) => row.key === draft.key ? { ...row, gradingCompany: company.id } : row))} />)}</View>
                  {draft.gradingCompany ? <>
                    <Field label="Note de gradation" value={draft.gradingGrade ?? ''} onChangeText={(value) => setPurchaseDrafts((rows) => rows.map((row) => row.key === draft.key ? { ...row, gradingGrade: value } : row))} placeholder="10, Gem Mint, 9.5…" />
                    <Field label="Numéro de certification" value={draft.gradingCertificate ?? ''} onChangeText={(value) => setPurchaseDrafts((rows) => rows.map((row) => row.key === draft.key ? { ...row, gradingCertificate: value } : row))} />
                    <Field label="Notes / sous-notes de gradation" value={draft.gradingNotes ?? ''} onChangeText={(value) => setPurchaseDrafts((rows) => rows.map((row) => row.key === draft.key ? { ...row, gradingNotes: value } : row))} placeholder="Centrage, coins, bords, surface…" />
                  </> : null}
                  <Field label="Valeur actuelle (€)" value={draft.marketValue} onChangeText={(value) => setPurchaseDrafts((rows) => rows.map((row) => row.key === draft.key ? { ...row, marketValue: value, askingPrice: row.askingPriceTouched ? row.askingPrice : value } : row))} keyboardType="decimal-pad" />
                  <Field label="Décote (%)" value={draft.discountPercent} onChangeText={(value) => setPurchaseDrafts((rows) => rows.map((row) => row.key === draft.key ? { ...row, discountPercent: value } : row))} keyboardType="decimal-pad" />
                  <Field label="Prix de rachat calculé (€)" value={(marketValue * discount / 100).toFixed(2)} onChangeText={() => undefined} editable={false} />
                  <Field label="Prix de vente proposé (€)" value={draft.askingPriceTouched ? draft.askingPrice : draft.marketValue} onChangeText={(value) => setPurchaseDrafts((rows) => rows.map((row) => row.key === draft.key ? { ...row, askingPrice: value, askingPriceTouched: true } : row))} keyboardType="decimal-pad" />
                  <ActionButton secondary label={draft.photo?.name ?? 'Ajouter une photo de cette carte (facultatif)'} onPress={() => void pickItemPhoto(draft.key, setPurchaseDrafts, setError)} />
                  {draft.photo ? <Text style={styles.muted}>Photo personnelle : {draft.photo.name}</Text> : null}
                  {purchaseDrafts.length > 1 ? <ActionButton secondary label="Retirer cette carte" onPress={() => setPurchaseDrafts((rows) => rows.filter((row) => row.key !== draft.key))} /> : null}
                </View>
              );
            })}
            <ActionButton secondary label="+ Ajouter une carte au rachat" onPress={() => setPurchaseDrafts((rows) => [...rows, emptyDraft()])} />
            <ActionButton disabled={busy} label={busy ? 'Enregistrement…' : 'Mettre en attente et partager le bordereau PDF'} onPress={() => void submitPurchase()} />
          </View>
        )}

        {page === 'stock' && <StockScreen items={items} sellers={sellers} selectedIds={selectedItemIds} salePrices={salePrices} onChangeSalePrice={(id, value) => setSalePrices((prices) => ({ ...prices, [id]: value }))} askingPriceEdits={askingPriceEdits} onChangeAskingPrice={(id, value) => setAskingPriceEdits((edits) => ({ ...edits, [id]: value }))} onSaveAskingPrice={(id) => void saveAskingPrice(id)} onToggle={toggleSale} onOpenSales={() => setPage('saleSummary')} />}

        {page === 'sales' && (
          <View style={styles.card}>
            <Text style={styles.heading}>Ventes</Text>
            <Text style={styles.saleIntro}>Recherchez dans le stock et ajoutez les cartes à vendre. Le caddie flottant ouvre le récapitulatif.</Text>
            <Field label="Rechercher une carte" value={saleSearch} onChangeText={setSaleSearch} placeholder="Nom, série ou numéro" />
            <View style={styles.saleResultsHeading}>
              <Text style={styles.label}>Résultats</Text>
              <Text style={styles.resultCount}>{filteredSaleItems.length} carte(s)</Text>
            </View>
            {salePageItems.map((item) => {
              const selected = selectedItemIds.includes(item._id);
              return <View key={item._id} style={styles.saleResultCard}>
                {item.catalogueImageUrl ? <Image source={{ uri: item.catalogueImageUrl }} style={styles.saleThumb} resizeMode="contain" /> : null}
                <View style={styles.flex}>
                  <Text style={styles.bold}>{item.name}</Text>
                  <Text style={styles.muted}>{[item.series, item.identifier].filter(Boolean).join(' · ') || 'Sans référence'}</Text>
                  <Text style={styles.salePrice}>{item.askingPriceCents === undefined ? 'Prix à définir' : `${(item.askingPriceCents / 100).toFixed(2)} €`}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={() => toggleSale(item)} style={[styles.addSaleButton, selected && styles.removeSaleButton]}>
                  <Ionicons name={selected ? 'checkmark' : 'add'} size={20} color={selected ? '#fff' : '#143d59'} />
                  <Text style={[styles.addSaleText, selected && styles.removeSaleText]}>{selected ? 'Ajoutée' : 'Ajouter'}</Text>
                </Pressable>
              </View>;
            })}
            {!salePageItems.length ? <Text style={styles.muted}>Aucune carte ne correspond à cette recherche.</Text> : null}
            {filteredSaleItems.length > saleResultPageSize ? <View style={styles.salePagination}>
              <Pressable accessibilityRole="button" disabled={saleResultPage <= 1} onPress={() => setSaleResultPage((value) => Math.max(1, value - 1))} style={[styles.salePageButton, saleResultPage <= 1 && styles.salePageDisabled]}><Text style={styles.salePageText}>‹</Text></Pressable>
              <Text style={styles.resultCount}>Page {saleResultPage} sur {saleResultPageCount}</Text>
              <Pressable accessibilityRole="button" disabled={saleResultPage >= saleResultPageCount} onPress={() => setSaleResultPage((value) => Math.min(saleResultPageCount, value + 1))} style={[styles.salePageButton, saleResultPage >= saleResultPageCount && styles.salePageDisabled]}><Text style={styles.salePageText}>›</Text></Pressable>
            </View> : null}
          </View>
        )}

        {page === 'saleSummary' && (
          <View style={styles.card}>
            <View style={styles.saleHeader}>
              <View style={styles.flex}>
                <Text style={styles.heading}>Résumé du panier</Text>
                <Text style={styles.saleIntro}>{selectedItems.length} carte(s) · vérifiez les prix avant validation.</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Retour à la recherche de cartes" onPress={() => setPage('sales')} style={styles.cartIconButton}>
                <Ionicons name="arrow-back-outline" size={23} color="#143d59" />
              </Pressable>
            </View>
            {!selectedItems.length ? <Text style={styles.emptyCart}>Le panier est vide. Revenez à la recherche pour ajouter des cartes.</Text> : <>
              <View style={styles.cartSummary}>
                <Text style={styles.cartSummaryTitle}>{selectedItems.length} carte(s) à vendre</Text>
                <Text style={styles.cartSummaryTotal}>{formatEuros(selectedItems.reduce((total, item) => total + (Number((salePrices[item._id] ?? '').replace(',', '.')) || 0), 0))}</Text>
                <Text style={styles.muted}>Modifiez ou retirez les cartes avant de confirmer.</Text>
              </View>
              {selectedItems.map((item) => <View key={item._id} style={styles.saleCartCard}>
                <View style={styles.saleCartHeader}>
                  <View style={styles.flex}>
                    <Text style={styles.bold}>{item.name}</Text>
                    <Text style={styles.muted}>{[item.series, item.identifier].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Retirer ${item.name} du panier`} onPress={() => toggleSale(item)} style={styles.removeIconButton}><Ionicons name="close" size={18} color="#a12e25" /></Pressable>
                </View>
                <Field label="Prix vendu (€)" value={salePrices[item._id] ?? ''} onChangeText={(value) => setSalePrices((prices) => ({ ...prices, [item._id]: value }))} keyboardType="decimal-pad" />
              </View>)}
              <Field label="Date de vente" value={saleDate} onChangeText={setSaleDate} placeholder="AAAA-MM-JJ" />
              <Text style={styles.saleHint}>L’heure actuelle sera utilisée lors de l’enregistrement.</Text>
              <ActionButton disabled={busy} label={busy ? 'Enregistrement…' : `Confirmer la vente · ${formatEuros(selectedItems.reduce((total, item) => total + (Number((salePrices[item._id] ?? '').replace(',', '.')) || 0), 0))}`} onPress={() => Alert.alert('Confirmer la vente ?', `${selectedItems.length} carte(s) · ${formatEuros(selectedItems.reduce((total, item) => total + (Number((salePrices[item._id] ?? '').replace(',', '.')) || 0), 0))}`, [{ text: 'Revoir le panier', style: 'cancel' }, { text: 'Confirmer', style: 'destructive', onPress: () => void submitSales() }])} />
            </>}
          </View>
        )}

        {page === 'history' && (
          <View style={styles.card}>
            <Text style={styles.heading}>Historique des rachats</Text>
            {purchases.map((purchase) => (
              <View key={purchase._id} style={styles.historyCard}>
                <Text style={styles.bold}>{purchase.reference} · {purchase.sellerName}</Text>
                <Text style={[styles.purchaseStatus, purchase.status === 'pending' && styles.purchaseStatusPending]}>{purchase.status === 'pending' ? 'En attente de validation client' : purchase.status === 'cancelled' ? 'Annulé' : 'Validé'}</Text>
                {purchase.status === 'pending' ? <View style={styles.inlineActions}>
                  <ActionButton disabled={busy} label="Valider le rachat et ajouter au stock" onPress={() => void confirmPendingPurchase(purchase)} />
                  <ActionButton disabled={busy} secondary label="Annuler le rachat" onPress={() => rejectPendingPurchase(purchase)} />
                </View> : null}
                <Field label="Date du rachat (heure actuelle conservée)" value={purchaseDateEdits[purchase._id] ?? localDateValue(new Date(purchase.occurredAt))} onChangeText={(value) => setPurchaseDateEdits((dates) => ({ ...dates, [purchase._id]: value }))} placeholder="AAAA-MM-JJ" />
                <ActionButton secondary disabled={busy} label="Enregistrer la date" onPress={() => void updatePurchaseDateAction(purchase)} />
                {purchase.items.map((item) => <View key={item._id} style={styles.historyItem}>
                  <Text style={styles.muted}>{item.name} · {languageName(item.language)} · {conditionName(item.condition)} · {(item.purchasePriceCents / 100).toFixed(2)} €</Text>
                  {(item.photos ?? []).map((photo) => <Pressable key={photo._id} onPress={() => void openAttachment(photo._id, photo.filename, photo.contentType)}><Text style={styles.attachmentLink}>Photo : {photo.filename}</Text></Pressable>)}
                </View>)}
                <Pressable disabled={busy} onPress={() => void loadPurchaseAttachments(purchase._id)}><Text style={styles.link}>Photos et justificatifs</Text></Pressable>
                {(purchaseAttachments[purchase._id] ?? []).map((attachment) => <Pressable key={attachment._id} disabled={busy} onPress={() => void openAttachment(attachment._id, attachment.filename, attachment.contentType)}><Text style={styles.attachmentLink}>{attachment.filename}</Text></Pressable>)}
              </View>
            ))}
            {!purchases.length ? <Text style={styles.muted}>Aucun rachat enregistré.</Text> : null}
            <Text style={styles.subheading}>Historique des ventes</Text>
            {sales.map((sale) => <View key={sale._id} style={styles.listRow}>
              <View style={styles.flex}><Text style={styles.bold}>{sale.itemName} · {(sale.salePriceCents / 100).toFixed(2)} €</Text><Text style={styles.muted}>{new Date(sale.occurredAt).toLocaleDateString('fr-BE')} · {sale.status === 'active' ? 'Vendue' : 'Annulée'}</Text></View>
              {sale.status === 'active' ? <Pressable disabled={busy} onPress={() => void undoSale(sale._id, setBusy, setError, refresh)}><Text style={styles.link}>Annuler</Text></Pressable> : null}
            </View>)}
          </View>
        )}
        {page === 'account' && (
          <View style={styles.card}>
            <Text style={styles.heading}>Compte</Text>
            <Text style={styles.muted}>Gérez votre session vendeur sur cet appareil.</Text>
            <ActionButton disabled={busy} secondary label={busy ? 'Déconnexion…' : 'Se déconnecter'} onPress={() => void logout()} />
          </View>
        )}
      </ScrollView>
      {busy ? <ActivityIndicator style={styles.spinner} /> : null}
      <View style={styles.bottomNav}>
        {nav('clients', 'Clients', 'people-outline')}
        {nav('purchase', 'Rachat', 'add-circle-outline')}
        {nav('stock', 'Stock', 'albums-outline')}
        {nav('sales', 'Ventes', 'cart-outline')}
        {nav('history', 'Historique', 'time-outline')}
        {nav('account', 'Compte', 'person-circle-outline')}
      </View>
      {authenticated && selectedItemIds.length > 0 && page !== 'saleSummary' ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Ouvrir le résumé du panier, ${selectedItemIds.length} carte(s)`} onPress={() => setPage('saleSummary')} style={styles.cartFab}>
          <Ionicons name="cart-outline" size={25} color="white" />
          <View style={styles.cartFabCount}><Text style={styles.cartFabCountText}>{selectedItemIds.length}</Text></View>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

function ActionButton({ label, onPress, disabled = false, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, secondary && styles.secondaryAction, disabled && styles.disabled]}><Text style={[styles.actionText, secondary && styles.secondaryText]}>{label}</Text></Pressable>;
}
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}><Text style={styles.choiceText}>{selected ? '● ' : ''}{label}</Text></Pressable>;
}
function pickItemPhoto(key: string, setter: React.Dispatch<React.SetStateAction<PurchaseDraft[]>>, setError: (value: string) => void) {
  return DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png'], copyToCacheDirectory: true }).then((result) => {
    if (result.canceled) return;
    const file = result.assets[0];
    setter((rows) => rows.map((row) => row.key === key ? { ...row, photo: { uri: file.uri, name: file.name, mimeType: file.mimeType ?? 'image/jpeg' } } : row));
  }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Sélection de photo impossible.'));
}
async function undoSale(saleId: string, setBusy: (value: boolean) => void, setError: (value: string) => void, refresh: () => Promise<void>) {
  setBusy(true);
  try { await cancelSale(saleId); await refresh(); }
  catch (reason) { setError(reason instanceof Error ? reason.message : 'Annulation impossible.'); }
  finally { setBusy(false); }
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f3f6f8', paddingHorizontal: 22 },
  loginContent: { flexGrow: 1, paddingBottom: 24 },
  header: { paddingTop: 14, paddingBottom: 12 },
  title: { fontSize: 27, fontWeight: '700', color: '#152b3a' },
  subtitle: { color: '#5b6d78', marginTop: 4 },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    gap: 0,
    marginHorizontal: -22,
    marginTop: 4,
    paddingHorizontal: 16,
    paddingTop: 7,
    paddingBottom: 5,
    borderTopWidth: 1,
    borderTopColor: '#dce4e9',
    backgroundColor: '#f3f6f8',
  },
  nav: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 5, borderRadius: 10 },
  active: { backgroundColor: '#e3edf3' },
  navText: { fontSize: 9, color: '#60727e', fontWeight: '600', textAlign: 'center' },
  activeText: { color: '#143d59', fontWeight: '800' },
  card: { backgroundColor: 'white', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e3e8ec', marginBottom: 12 },
  heading: { fontSize: 20, fontWeight: '700', marginBottom: 14, color: '#152b3a' },
  subheading: { fontSize: 16, fontWeight: '700', marginTop: 12, marginBottom: 9, color: '#152b3a' },
  label: { fontWeight: '600', marginBottom: 8, color: '#263238' },
  action: { backgroundColor: '#143d59', padding: 13, alignItems: 'center', borderRadius: 9, marginTop: 8 },
  actionText: { color: 'white', fontWeight: '700', textAlign: 'center' },
  secondaryAction: { backgroundColor: '#e3e9ed' },
  secondaryText: { color: '#164f73' },
  disabled: { opacity: 0.55 },
  choice: { padding: 9, backgroundColor: '#f4f7f9', marginBottom: 5, borderRadius: 8, borderWidth: 1, borderColor: '#e3e8ec' },
  choiceSelected: { borderColor: '#164f73', backgroundColor: '#e8f1f6' },
  choiceText: { color: '#263238', fontSize: 12 },
  clientSearchField: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, minHeight: 48, marginBottom: 8, borderWidth: 1, borderColor: '#cbd5dc', borderRadius: 10, backgroundColor: 'white' },
  clientSearchInput: { flex: 1, paddingVertical: 10, color: '#152b3a', fontSize: 15 },
  purchaseClientResult: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#e3e8ec', borderRadius: 9, backgroundColor: '#fbfcfd' },
  selectedPurchaseClient: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#adc6d4', borderRadius: 10, backgroundColor: '#edf5f9' },
  selectedClientMark: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#dbeaf2' },
  changeClientButton: { paddingVertical: 7, paddingHorizontal: 9, borderRadius: 8, backgroundColor: 'white' },
  changeClientText: { color: '#164f73', fontSize: 12, fontWeight: '700' },
  clientSearchHint: { color: '#60727e', fontSize: 12, marginBottom: 12 },
  noClientResult: { color: '#60727e', paddingVertical: 10 },
  inlineActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 10 },
  conditionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 12 },
  draft: { borderWidth: 1, borderColor: '#dce5eb', borderRadius: 10, padding: 12, marginVertical: 8, backgroundColor: '#fbfcfd' },
  cardImage: { width: 150, height: 210, alignSelf: 'center', marginBottom: 12 },
  cardThumb: { width: 42, height: 58, marginRight: 10 },
  searchResult: { flexDirection: 'row', alignItems: 'center', padding: 9, borderBottomWidth: 1, borderColor: '#edf0f2' },
  saleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  saleIntro: { color: '#60727e', lineHeight: 20, marginTop: -7 },
  cartIconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e8f1f6', borderRadius: 14 },
  cartCountBadge: { position: 'absolute', right: -3, top: -3, minWidth: 18, height: 18, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#a12e25' },
  cartCountText: { color: 'white', fontSize: 10, fontWeight: '800' },
  saleResultsHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  resultCount: { color: '#60727e', fontSize: 12, fontWeight: '600' },
  saleResultCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, marginBottom: 8, backgroundColor: '#fbfcfd', borderWidth: 1, borderColor: '#e3e8ec', borderRadius: 10 },
  saleThumb: { width: 48, height: 64, borderRadius: 4, backgroundColor: '#f3f6f8' },
  salePrice: { color: '#143d59', fontWeight: '800', marginTop: 5 },
  addSaleButton: { minWidth: 72, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 9, backgroundColor: '#e3edf3' },
  removeSaleButton: { backgroundColor: '#143d59' },
  addSaleText: { color: '#143d59', fontSize: 11, fontWeight: '700' },
  removeSaleText: { color: 'white' },
  salePagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, paddingVertical: 8 },
  salePageButton: { width: 40, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e8f1f6', borderRadius: 9 },
  salePageDisabled: { opacity: 0.4 },
  salePageText: { color: '#143d59', fontSize: 22, fontWeight: '700' },
  cartFab: { position: 'absolute', right: 18, bottom: 88, width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 27, backgroundColor: '#143d59', elevation: 7, shadowColor: '#0a2434', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, zIndex: 10 },
  cartFabCount: { position: 'absolute', top: -2, right: -3, minWidth: 19, height: 19, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#a12e25' },
  cartFabCountText: { color: 'white', fontSize: 10, fontWeight: '800' },
  cartSummary: { padding: 14, borderRadius: 10, backgroundColor: '#e8f1f6', marginBottom: 10 },
  cartSummaryTitle: { color: '#143d59', fontWeight: '800', fontSize: 15 },
  cartSummaryTotal: { color: '#143d59', fontWeight: '800', fontSize: 24, marginTop: 4 },
  saleCartCard: { padding: 12, marginBottom: 8, borderRadius: 10, borderWidth: 1, borderColor: '#e3e8ec', backgroundColor: '#fbfcfd' },
  saleCartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  removeIconButton: { position: 'absolute', right: 8, top: 8, zIndex: 1, width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff0ee', borderRadius: 17 },
  emptyCart: { padding: 18, color: '#60727e', textAlign: 'center', backgroundColor: '#f3f6f8', borderRadius: 10 },
  saleHint: { color: '#60727e', fontSize: 12, marginTop: -8, marginBottom: 6 },
  flex: { flex: 1 },
  bold: { fontWeight: '700', color: '#152b3a' },
  muted: { color: '#60727e', marginTop: 3, lineHeight: 19 },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderColor: '#edf0f2' },
  cartItem: { paddingVertical: 12, borderBottomWidth: 1, borderColor: '#edf0f2' },
  historyCard: { paddingVertical: 12, borderBottomWidth: 1, borderColor: '#edf0f2', gap: 5 },
  purchaseStatus: { alignSelf: 'flex-start', backgroundColor: '#edf4f0', color: '#315c45', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99, fontSize: 12, fontWeight: '700' },
  purchaseStatusPending: { backgroundColor: '#fff4d8', color: '#805600' },
  historyItem: { paddingVertical: 5 },
  link: { color: '#164f73', fontWeight: '700', paddingVertical: 4 },
  attachmentLink: { color: '#164f73', textDecorationLine: 'underline', paddingVertical: 4 },
  errorBox: { borderColor: '#e3aaa4', borderWidth: 1, backgroundColor: '#fff4f2', padding: 10, borderRadius: 8, marginBottom: 10 },
  error: { color: '#a12e25', lineHeight: 20 },
  spinner: { marginVertical: 8 },
});
