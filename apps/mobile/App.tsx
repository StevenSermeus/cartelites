import { ItemThumbnail } from './src/components/ItemThumbnail';
import { SaleTicket } from './src/components/SaleTicket';
import { NativeTabs, type RootTab } from "./src/navigation/NativeTabs";
import { PageTransition } from "./src/components/PageTransition";
import { useLocalPurchaseDrafts } from "./src/data/useLocalPurchaseDrafts";
import { SwipeToDelete } from './src/components/SwipeToDelete';
import {
  AppearanceSettings,
  useTheme,
  type ThemeColors,
} from "./src/theme/ThemeProvider";
import { loadReceiptDocument } from "./src/data/receiptDocument";
import { dateFilters } from "./src/data/dateFilters";
import {
  MobileNavigation,
  activeTab,
  MobileHeader,
  type Page,
} from "./src/navigation/MobileNavigation";
import {
  ReceiptPdfViewer,
  ReceiptPdfPreview,
} from "./src/components/ReceiptPdfViewer";
import { ReceiptSigning } from "./src/components/ReceiptSigning";
import { SignatorySettings } from "./src/components/SignatorySettings";
import { markUserActivity, setSessionForeground } from "./src/auth/session";
import * as Crypto from "expo-crypto";
import {
  SalePaymentFields,
  SalePaymentHistory,
  emptyPaymentDraft,
  buildSaleSettlement,
} from "./src/components/SalePaymentFields";
import { ConsignmentScreen } from "./src/screens/ConsignmentScreen";
import {
  PurchaseEditor,
  PurchaseSummary,
} from "./src/components/PurchaseEditor";
import { searchRiftbound, type Tcg } from "../../packages/domain/src/riftbound";
import { pickAttachment } from "./src/data/pickAttachment";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  clearSession,
  readSession,
  revokeSession,
  readInstanceUrl,
  changeInstance,
  getApiBaseUrl,
} from "./src/auth/session";
import { Field } from "./src/components/Field";
import { ClientPicker } from "./src/components/ClientPicker";
import { usePagedData } from "./src/data/usePagedData";
import { Pagination } from "./src/components/Pagination";
import {
  type Attachment,
  type GradingCompany,
  cancelSale,
  cancelPendingPurchase,
  createPurchase,
  createSales,
  createSeller,
  request,
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
  purchaseReceiptPdf,
  updatePurchaseDate,
  validatePurchase,
  updateAskingPrice,
  updateSeller,
  uploadItemAttachment,
  uploadAttachment,
} from "./src/data/apiRepository";
import {
  completePurchaseItems,
  mapPurchaseReceipt,
  type ReceiptInput,
} from "./src/data/purchaseReceipt";
import { AuthScreen } from "./src/screens/AuthScreen";
import { StockScreen } from "./src/screens/StockScreen";

type CardLanguage = "fr" | "en" | "ja" | "zh";
type CardCondition = "M" | "NM" | "EX" | "GD" | "LP" | "PL" | "PO";
const gradingCompanies: { id: GradingCompany; label: string }[] = [
  { id: "PSA", label: "PSA" },
  { id: "CollectAura", label: "Collect Aura" },
  { id: "PCA", label: "PCA" },
  { id: "CCC", label: "CCC Grading" },
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
  { id: "fr", label: "Français" },
  { id: "en", label: "Anglais" },
  { id: "ja", label: "Japonais" },
];
const conditions: { id: CardCondition; label: string }[] = [
  { id: "M", label: "Mint (M)" },
  { id: "NM", label: "Near Mint (NM)" },
  { id: "EX", label: "Excellent (EX)" },
  { id: "GD", label: "Good (GD)" },
  { id: "LP", label: "Light Played (LP)" },
  { id: "PL", label: "Played (PL)" },
  { id: "PO", label: "Poor (PO)" },
];
const languageName = (id?: string) =>
  id === "zh" ? "Chinois" : languages.find((row) => row.id === id)?.label ?? "Français";
const conditionName = (id?: string) =>
  conditions.find((row) => row.id === id)?.label ?? "Near Mint (NM)";
const emptyDraft = (): PurchaseDraft => ({
  key: `${Date.now()}-${Math.random()}`,
  name: "",
  series: "",
  identifier: "",
  marketValue: "",
  discountPercent: "70",
  askingPrice: "",
  askingPriceTouched: false,
  photo: null,
  language: "fr",
  condition: "NM",
  catalogueImageUrl: "",
  cardSearch: "",
  cardResults: [],
  availableLanguages: ["fr"],
});
function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function formatEuros(value: number) {
  return new Intl.NumberFormat("fr-BE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}
function dateAtCurrentTime(value: string, timeSource = new Date()) {
  const [year, month, day] = value.split("-").map(Number);
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
  const { colors, dark } = useTheme();
  const styles = createStyles(colors);

  const catalogRequests = useRef(new Map<string, number>());
  function beginCatalog(key: string) {
    const token = (catalogRequests.current.get(key) ?? 0) + 1;
    catalogRequests.current.set(key, token);
    return () => catalogRequests.current.get(key) === token;
  }
  function changeTcg(draft: PurchaseDraft, tcg: Tcg, reset = false) {
    if (!reset && (draft.tcg ?? "pokemon") === tcg) return;
    beginCatalog(draft.key);
    setError("");
    setPurchaseDrafts((rows) =>
      rows.map((row) =>
        row.key === draft.key
          ? {
              ...row,
              tcg,
              name: "",
              series: "",
              identifier: "",
              cardResults: [],
              searching: false,
              catalogueCardId: undefined,
              catalogueImageUrl: "",
              availableLanguages: undefined,
              language: tcg === "riftbound" ? "en" : "fr",
            }
          : row,
      ),
    );
  }

  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => {
    setSessionForeground(authenticated && AppState.currentState === "active");
    const listener = AppState.addEventListener("change", (state) =>
      setSessionForeground(authenticated && state === "active"),
    );
    return () => {
      listener.remove();
      setSessionForeground(false);
    };
  }, [authenticated]);

  const [instanceReady, setInstanceReady] = useState(false);
  const [instanceUrl, setInstanceUrl] = useState("");
  const [instanceError, setInstanceError] = useState("");
  const [instanceBusy, setInstanceBusy] = useState(false);
  const [instanceSettings, setInstanceSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<Page>("stock");
  const [historyFiltersOpen, setHistoryFiltersOpen] = useState(false);
  type FilterControl = { open: () => void; count: number } | null;
  const [stockFilterControl, setStockFilterControl] = useState<FilterControl>(null);
  const [depositFilterControl, setDepositFilterControl] = useState<FilterControl>(null);
  const filterControl = page === "stock" ? stockFilterControl : page === "consignments" ? depositFilterControl : null;
  const [purchaseDateEditing, setPurchaseDateEditing] = useState(false);
  const [purchaseOperationsOpen, setPurchaseOperationsOpen] = useState(false);
  const [saleDateEditing, setSaleDateEditing] = useState(false);
  const [clientEditorOpen, setClientEditorOpen] = useState(false);
  const [accountEditing, setAccountEditing] = useState(false);
  const [accountDetailsOpen, setAccountDetailsOpen] = useState(false);
  const [focusedSale, setFocusedSale] = useState<string | null>(null);
  const contentScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    contentScroll.current?.scrollTo({ y: 0, animated: false });
  }, [page]);
  const [items, setItems] = useState<Item[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseAttachments, setPurchaseAttachments] = useState<
    Record<string, Attachment[]>
  >({});
  const [error, setError] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [purchaseClientSearch, setPurchaseClientSearch] = useState("");
  const localPurchases = useLocalPurchaseDrafts(authenticated, freshDraft, localDateValue);
  const [purchaseEdit, setPurchaseEdit] = useState<{ purchase: Purchase; expectedDigest: string; originalIds: string[]; lockedCount: number } | null>(null);
  const [editRows, setEditRows] = useState<PurchaseDraft[]>([]);
  const [editBusy, setEditBusy] = useState(false), [editError, setEditError] = useState('');
  const [editSaved, setEditSaved] = useState<{ itemIds: string[] } | null>(null);
  const editAttempts = useRef(new Map<string, string>()), editUploads = useRef(new Set<string>()), editLock = useRef(false);
  const { clientId, date: purchaseDate, step: purchaseStep, buyerNote = "", sellerNote = "" } = localPurchases.active;
  const purchaseDrafts = purchaseEdit ? editRows : localPurchases.active.rows;
  const { setClientId, setDate: setPurchaseDate, setStep: setPurchaseStep } = localPurchases;
  const setPurchaseDrafts: React.Dispatch<React.SetStateAction<PurchaseDraft[]>> = purchaseEdit ? setEditRows : localPurchases.setRows;

  const draftClientName = sellers.find(seller => seller._id === clientId)?.name;
  useEffect(() => {
    if (draftClientName && draftClientName !== localPurchases.active.clientName) localPurchases.setClientName(draftClientName);
  }, [draftClientName, localPurchases.active.id, localPurchases.active.clientName]);
  const [editingClientId, setEditingClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [saleQuantities, setSaleQuantities] = useState<Record<string, string>>({});
  const [completedSaleIds, setCompletedSaleIds] = useState<string[]>([]);
  const [salePrices, setSalePrices] = useState<Record<string, string>>({});
  const [askingPriceEdits, setAskingPriceEdits] = useState<
    Record<string, string>
  >({});
  const [saleSearch, setSaleSearch] = useState("");
  const [saleResultPage, setSaleResultPage] = useState(1);
  const [saleDate, setSaleDate] = useState(localDateValue());
  const [salePayment, setSalePayment] = useState(emptyPaymentDraft);
  const saleAttempt = useRef<{
    signature: string;
    operationId: string;
    occurredAt: number;
  } | null>(null);
  const [purchaseDateEdits, setPurchaseDateEdits] = useState<
    Record<string, string>
  >({});

  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyRevision, setHistoryRevision] = useState(0);
  const [expandedPurchase, setExpandedPurchase] = useState<string | null>(null);
  useEffect(() => {
    contentScroll.current?.scrollTo({ y: 0, animated: false });
  }, [expandedPurchase, clientEditorOpen]);
  const [receipt, setReceipt] = useState<ReceiptInput | null>(null);
  const [receiptPurchase, setReceiptPurchase] = useState<Purchase | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const [receiptNotice, setReceiptNotice] = useState("");
  const [receiptArchived, setReceiptArchived] = useState(false);
  const [saleCompleted, setSaleCompleted] = useState({
    count: 0,
    cents: 0,
    pending: false,
  });
  const purchaseLock = useRef(false);
  const saleLock = useRef(false);
  const [receiptPdf, setReceiptPdf] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState(false);
  const [receiptSharing, setReceiptSharing] = useState(false);
  const receiptRequest = useRef(0);
  const receiptShareLock = useRef(false);
  const closeReceipt = () => {
    receiptRequest.current++;
    setReceiptPurchase(null);
    setReceipt(null);
    setReceiptPdf(null);
    setReceiptPreview(false);
    setReceiptLoading(false);
    setReceiptError("");
    setReceiptNotice("");
  };
  const [tabResetVersion, setTabResetVersion] = useState<Partial<Record<Page, number>>>({});
  const resetTab = (target: Page) => {
    setAccountDetailsOpen(false);
    setExpandedPurchase(null);
    setPurchaseDateEditing(false);
    setPurchaseOperationsOpen(false);
    setHistoryFiltersOpen(false);
    setFocusedSale(null);
    setTabResetVersion((current) => ({ ...current, [target]: (current[target] ?? 0) + 1 }));
    setPage(target === "sales" ? "saleSummary" : target);
    contentScroll.current?.scrollTo({ y: 0, animated: true });
  };
  const clientData = usePagedData<Seller>(
    "/sellers",
    { search: clientSearch },
    authenticated && page === "clients",
    historyRevision,
  );
  const saleData = usePagedData<Sale>(
    "/sales",
    {},
    authenticated && page === "salesHistory",
    historyRevision,
  );
  const saleStockData = usePagedData<Item>(
    "/stock",
    { search: saleSearch },
    authenticated && page === "sales",
    historyRevision,
  );
  const historyDates = dateFilters(historyFrom, historyTo);
  const purchaseHistory = usePagedData<Purchase>(
    "/purchases",
    {
      search: historySearch.trim(),
      status: historyStatus,
      from: historyDates.from,
      to: historyDates.to,
    },
    authenticated && page === "history",
    historyRevision,
  );
  useEffect(() => setPurchases(purchaseHistory.items), [purchaseHistory.items]);
  useEffect(() => {
    if (page === "salesHistory") setSales(saleData.items);
  }, [saleData.items, page]);

  const historyBusy = purchaseHistory.loading;
  const historyError = purchaseHistory.error;
  const refresh = useCallback(async () => {
    setHistoryRevision((value) => value + 1);
    setError("");
  }, []);

  useEffect(() => {
    void (async () => {
      const saved = await readInstanceUrl();
      setInstanceUrl(saved ?? "");
      setInstanceReady(Boolean(saved));
      setAuthenticated(Boolean(saved && (await readSession())));
      setReady(true);
    })().catch((reason) => {
      setError(String(reason));
      setInstanceError(String(reason));
      setReady(true);
    });
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
        setSaleQuantities({});
        setCompletedSaleIds([]);
        setError("");
      }),
    [],
  );
  useEffect(() => {
    if (authenticated)
      void refresh().catch((reason) => setError(String(reason)));
  }, [authenticated, refresh]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && authenticated)
        void refresh().catch((reason) => setError(String(reason)));
    });
    return () => subscription.remove();
  }, [authenticated, refresh]);
  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(() => {
      if (AppState.currentState === "active")
        void refresh().catch((reason) => setError(String(reason)));
    }, 60_000);
    return () => clearInterval(interval);
  }, [authenticated, refresh]);

  const filteredClients = clientData.items;
  const filteredPurchaseClients = useMemo(() => {
    const term = purchaseClientSearch.trim().toLocaleLowerCase("fr");
    if (!term) return [];
    return sellers
      .filter((client) =>
        [client.name, client.email, client.phone]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("fr")
          .includes(term),
      )
      .slice(0, 8);
  }, [purchaseClientSearch, sellers]);
  const selectedPurchaseClient = sellers.find(
    (client) => client._id === clientId,
  );
  const filteredSaleItems = saleStockData.items;
  const salePageItems = saleStockData.items;
  const saleResultPageSize = 25;
  const saleResultPageCount = saleStockData.page;
  const selectedItems = selectedItemIds
    .map((id) => items.find((item) => item._id === id))
    .filter((item): item is Item => Boolean(item));

  const saveClient = async () => {
    if (!clientName.trim())
      return setError("Le nom du client est obligatoire.");
    setBusy(true);
    setError("");
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
      setEditingClientId("");
      setClientName("");
      setClientEmail("");
      setClientPhone("");
      setClientAddress("");
      setError("");
      setClientEditorOpen(false);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Enregistrement impossible.",
      );
    } finally {
      setBusy(false);
    }
  };
  const editClient = (client: Seller) => {
    setEditingClientId(client._id);
    setClientName(client.name);
    setClientEmail(client.email ?? "");
    setClientPhone(client.phone ?? "");
    setClientAddress(client.address ?? "");
    setError("");
  };
  const clearClient = () => {
    setEditingClientId("");
    setClientName("");
    setClientEmail("");
    setClientPhone("");
    setClientAddress("");
  };

  const searchCards = async (draft: PurchaseDraft) => {
    const term = draft.cardSearch.trim();
    if (!term)
      return setError(
        "Saisissez le nom ou le numéro d’une carte à rechercher.",
      );
    const current = beginCatalog(draft.key);
    setError("");
    setPurchaseDrafts((rows) =>
      rows.map((row) =>
        row.key === draft.key ? { ...row, searching: true } : row,
      ),
    );
    try {
      if (draft.tcg === "riftbound") {
        const results = await searchRiftbound(term);
        if (!current()) return;
        setPurchaseDrafts((rows) =>
          rows.map((row) =>
            row.key === draft.key
              ? { ...row, cardResults: results, searching: false }
              : row,
          ),
        );
        if (!results.length)
          setError(`Aucune carte Riftbound trouvée pour « ${term} » (FR/EN).`);
        return;
      }
      const localized = await Promise.all(
        languages.map(async ({ id: language }) => {
          const filters = [`name=${encodeURIComponent(term)}`];
          const localNumber =
            term.match(
              /^(?:[A-Za-z0-9-]+\s+)?([A-Za-z0-9-]+)\/(?:[A-Za-z0-9-]+)$/,
            )?.[1] ?? (/^\d+$/.test(term) ? term : undefined);
          if (localNumber)
            filters.push(`localId=${encodeURIComponent(localNumber)}`);
          const responses = await Promise.all(
            filters.map((filter) =>
              fetch(
                `https://api.tcgdex.net/v2/${language}/cards?${filter}&pagination:page=1&pagination:itemsPerPage=10`,
              ),
            ),
          );
          if (responses.some((response) => !response.ok))
            throw new Error(
              "Le catalogue Pokémon est momentanément indisponible.",
            );
          const resultLists = await Promise.all(
            responses.map(
              (response) =>
                response.json() as Promise<Omit<CardResult, "language">[]>,
            ),
          );
          const unique = new Map(
            resultLists.flat().map((result) => [result.id, result]),
          );
          return [...unique.values()]
            .slice(0, 15)
            .map((result) => ({ ...result, language }));
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
          row.key === draft.key
            ? { ...row, cardResults: matches, searching: false }
            : row,
        ),
      );
    } catch (reason) {
      if (!current()) return;
      setPurchaseDrafts((rows) =>
        rows.map((row) =>
          row.key === draft.key ? { ...row, searching: false } : row,
        ),
      );
      setError(
        reason instanceof Error
          ? reason.message
          : "Recherche de carte impossible.",
      );
    }
  };
  const chooseCard = async (draft: PurchaseDraft, result: CardResult) => {
    const current = beginCatalog(draft.key);
    if (draft.tcg === "riftbound") {
      setPurchaseDrafts((rows) =>
        rows.map((row) =>
          row.key === draft.key
            ? {
                ...row,
                name: result.name,
                series: result.setName ?? "",
                identifier: result.localId,
                language: result.language,
                catalogueCardId: result.id,
                catalogueImageUrl: result.image ?? "",
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
      rows.map((row) =>
        row.key === draft.key ? { ...row, searching: true } : row,
      ),
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
    const selected = localizedDetails.find(
      (entry) => entry?.language === result.language,
    )?.card;
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
              catalogueImageUrl: image ? `${image}/low.webp` : "",
              cardResults: [],
            }
          : row,
      ),
    );
  };
  const changeCardLanguage = async (
    draft: PurchaseDraft,
    language: CardLanguage,
  ) => {
    const current = beginCatalog(draft.key);
    if (draft.tcg === "riftbound" && draft.catalogueCardId) return;
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
      if (!response.ok)
        throw new Error(
          "Cette édition n’est pas disponible dans cette langue.",
        );
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
                catalogueImageUrl: card.image ? `${card.image}/low.webp` : "",
              }
            : row,
        ),
      );
    } catch (reason) {
      if (!current()) return;
      setError(
        reason instanceof Error
          ? reason.message
          : "Version dans cette langue introuvable.",
      );
    }
  };

  async function startPurchaseEdit(purchase: Purchase) {
    if (editLock.current) return;
    editLock.current = true; setBusy(true); setError('');
    try {
      const result = await request<{ purchase: Purchase; items: Item[]; lockedIds: string[]; expectedDigest: string }>(`/purchases/${purchase._id}/edit`);
      const editable = result.items.filter(item => !result.lockedIds.includes(item._id));
      setEditRows([...editable.map(item => ({ ...emptyDraft(), key: item._id, included: true, name: item.name, tcg: item.tcg,
        series: item.series ?? '', identifier: item.identifier ?? '', language: item.language ?? 'fr', condition: item.condition ?? 'NM',
        catalogueImageUrl: item.catalogueImageUrl ?? '', availableLanguages: undefined, gradingCompany: item.gradingCompany, gradingGrade: item.gradingGrade,
        gradingCertificate: item.gradingCertificate, gradingNotes: item.gradingNotes,
        marketValue: ((item.marketValueCents ?? item.purchasePriceCents) / 100).toFixed(2),
        discountPercent: String(item.marketValueCents === undefined ? 100 : item.discountPercent ?? (item.marketValueCents ? item.purchasePriceCents / item.marketValueCents * 100 : 100)),
        askingPrice: item.askingPriceCents === undefined ? '' : (item.askingPriceCents / 100).toFixed(2), askingPriceTouched: true,
      })), emptyDraft()]);
      setEditSaved(null); setEditError(''); editAttempts.current.clear(); editUploads.current.clear();
      setPurchaseEdit({ purchase: result.purchase, expectedDigest: result.expectedDigest, originalIds: editable.map(i => i._id), lockedCount: result.lockedIds.length });
    } catch (e) { setError(e instanceof Error ? e.message : 'Chargement du rachat impossible.'); }
    finally { setBusy(false); editLock.current = false; }
  }
  function closePurchaseEdit() {
    if (editLock.current) return;
    if (editSaved) { setPurchaseEdit(null); return; }
    Alert.alert('Fermer la modification ?', 'Les changements non enregistrés seront abandonnés. Vos brouillons de nouveaux rachats sont conservés.', [
      { text: 'Continuer', style: 'cancel' }, { text: 'Fermer', style: 'destructive', onPress: () => setPurchaseEdit(null) },
    ]);
  }
  async function savePurchaseEdit() {
    if (!purchaseEdit || editLock.current) return;
    editLock.current = true; setEditBusy(true); setEditError('');
    const selected = editRows.filter(row => row.included);
    const keyFor = (key: string) => { if (!editAttempts.current.has(key)) editAttempts.current.set(key, Crypto.randomUUID()); return editAttempts.current.get(key)!; };
    try {
      let result = editSaved;
      if (!result) {
        if (editRows.some(row => !row.included && (row.name.trim() || row.cardSearch.trim() || row.marketValue.trim()))) throw new Error('Ajoutez ou annulez la carte en cours avant d’enregistrer.');
        const money = (value: string) => { if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) throw new Error('Vérifiez les valeurs et pourcentages : deux décimales maximum.'); const n = Math.round(Number(value.replace(',', '.')) * 100); if (!Number.isSafeInteger(n)) throw new Error('Montant trop élevé.'); return n; };
        const items = selected.map(row => {
          const discountPercent = money(row.discountPercent) / 100;
          if (discountPercent > 100 || !row.name.trim()) throw new Error('Vérifiez le nom et le pourcentage de chaque carte.');
          return { itemId: purchaseEdit.originalIds.includes(row.key) ? row.key : undefined, operationId: keyFor(row.key), name: row.name, tcg: row.tcg,
            series: row.series, identifier: row.identifier, language: row.language, condition: row.condition,
            catalogueImageUrl: row.catalogueImageUrl || undefined, gradingCompany: row.gradingCompany, gradingGrade: row.gradingCompany ? row.gradingGrade || undefined : undefined,
            gradingCertificate: row.gradingCertificate || undefined, gradingNotes: row.gradingNotes || undefined,
            marketValueCents: money(row.marketValue), discountPercent, askingPriceCents: row.askingPrice.trim() ? money(row.askingPrice) : undefined };
        });
        const body = { expectedDigest: purchaseEdit.expectedDigest, items, removedIds: purchaseEdit.originalIds.filter(id => !selected.some(row => row.key === id)) };
        result = await request<{ itemIds: string[] }>(`/purchases/${purchaseEdit.purchase._id}/edit`, { ...body, operationId: keyFor(JSON.stringify(body)) });
        setEditSaved(result);
      }
      for (const [index, row] of selected.entries()) if (row.photo && !editUploads.current.has(row.key)) {
        await uploadAttachment('itemId', result.itemIds[index], row.photo, keyFor('photo:' + row.key)); editUploads.current.add(row.key);
      }
      await refresh(); setPurchaseEdit(null); setEditRows([]); setEditSaved(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Modification impossible.';
      setEditError(message.includes('PURCHASE_CHANGED') ? 'Le rachat a changé depuis son ouverture. Fermez puis rouvrez la modification pour charger la dernière version.' : message.includes('PURCHASE_ITEM_LOCKED') ? 'Une carte a déjà été vendue ou donnée et ne peut plus être modifiée.' : message);
    } finally { setEditBusy(false); editLock.current = false; }
  }
  const submitPurchase = async () => {
    if (purchaseLock.current) return;
    if (!clientId) return setError("Sélectionnez le client dans la liste.");
    const client = sellers.find((row) => row._id === clientId);
    if (!client) return setError("Client introuvable. Actualisez la liste.");
    const rows = purchaseDrafts.filter((row) => row.included);
    if (!rows.length) return setError("Ajoutez au moins une carte.");
    purchaseLock.current = true;
    setBusy(true);
    setError("");
    try {
      const entries = rows.map((row) => {
        if (!row.name.trim())
          throw new Error("Renseignez le nom de chaque carte ajoutée.");
        if (!row.marketValue.trim())
          throw new Error(`Saisissez la valeur actuelle de ${row.name}.`);
        if (!row.discountPercent.trim())
          throw new Error(`Saisissez le taux de reprise de ${row.name}.`);
        const marketValue = Number(row.marketValue.replace(",", "."));
        const discount = Number(row.discountPercent.replace(",", "."));
        const asking = row.askingPriceTouched
          ? Number(row.askingPrice.replace(",", "."))
          : marketValue;
        if (!Number.isFinite(marketValue) || marketValue < 0)
          throw new Error(`Valeur actuelle invalide pour ${row.name}.`);
        if (!Number.isFinite(discount) || discount < 0 || discount > 100)
          throw new Error(`Taux de reprise invalide pour ${row.name}.`);
        if (!Number.isFinite(asking) || asking < 0)
          throw new Error(`Prix de vente invalide pour ${row.name}.`);
        return {
          name: row.name.trim(),
          tcg: row.tcg ?? "pokemon",
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
      if (!Number.isFinite(occurredAt))
        throw new Error("Date de rachat invalide.");
      const reference = `R-${new Date().getTime()}`;
      const result = await createPurchase(
        clientId,
        entries,
        occurredAt,
        reference,
        { buyerNote, sellerNote },
      );
      const failedPhotos: string[] = [];
      for (const [index, row] of rows.entries()) {
        if (!row.photo || !result.itemIds[index]) continue;
        try {
          await uploadItemAttachment(result.itemIds[index], row.photo);
        } catch {
          failedPhotos.push(row.name);
        }
      }
      localPurchases.remove(localPurchases.active.id);
      setPurchaseClientSearch("");
      setPage("history");
      await refresh();
      const createdPurchase: Purchase = {
        buyerNote, sellerNote,
        _id: result.purchaseId,
        sellerId: clientId,
        sellerName: client.name,
        reference,
        occurredAt,
        status: "pending",
        items: entries.map((entry, index) => ({
          _id: result.itemIds[index] ?? String(index),
          name: entry.name,
          tcg: entry.tcg,
          series: entry.series,
          identifier: entry.identifier,
          language: entry.language,
          condition: entry.condition,
          gradingCompany: entry.gradingCompany,
          gradingGrade: entry.gradingGrade,
          gradingCertificate: entry.gradingCertificate,
          gradingNotes: entry.gradingNotes,
          marketValueCents: Math.round(entry.marketValue * 100),
          discountPercent: entry.discountPercent,
          purchasePriceCents: Math.round(
            entry.marketValue * entry.discountPercent,
          ),
          vatRegime: "margin",
        })),
      };
      await openPurchaseReceipt(createdPurchase);
      const photoFailure = failedPhotos.length
        ? `Photo non envoyée : ${failedPhotos.join(", ")}.`
        : "";
      setError(
        [
          `Rachat ${reference} en attente de validation du client. Consultez le bordereau pour le voir ou le partager.`,
          photoFailure,
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Rachat impossible.");
    } finally {
      purchaseLock.current = false;
      setBusy(false);
    }
  };

  const updatePurchaseDateAction = async (purchase: Purchase) => {
    const value =
      purchaseDateEdits[purchase._id] ??
      localDateValue(new Date(purchase.occurredAt));
    const occurredAt = dateAtCurrentTime(value, new Date(purchase.occurredAt));
    if (!Number.isFinite(occurredAt))
      return setError("Date invalide. Utilisez AAAA-MM-JJ.");
    setBusy(true);
    try {
      await updatePurchaseDate(purchase._id, occurredAt);
      await refresh();
      void openPurchaseReceipt({ ...purchase, occurredAt });
      setError("Date modifiée. Le bordereau actualisé est disponible.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Modification impossible.",
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmPendingPurchase = async (purchase: Purchase) => {
    setBusy(true);
    try {
      await validatePurchase(purchase._id);
      await refresh();
      setError("");
      const updated = { ...purchase, status: "active" as const };
      void openPurchaseReceipt(updated);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Validation impossible.",
      );
    } finally {
      setBusy(false);
    }
  };
  const openPurchaseReceipt = async (purchase: Purchase) => {
    const requestId = ++receiptRequest.current;
    setReceiptArchived(false);
    setReceiptPurchase(purchase);
    setReceipt(null);
    setReceiptPdf(null);
    setReceiptError("");
    setReceiptNotice("");
    setReceiptLoading(true);
    try {
      const full = await readRecord<Purchase & { hasMoreItems?: boolean }>(
        "/purchases",
        purchase._id,
      );
      const [client, allItems] = await Promise.all([
        readRecord<Seller>("/sellers", full.sellerId),
        completePurchaseItems(full, (cursor) =>
          readPage<Purchase["items"][number]>("/stock", {
            purchaseId: full._id,
            status: "all",
            cursor,
          }),
        ),
      ]);
      const mapped = mapPurchaseReceipt(full, client, allItems);
      const document = await loadReceiptDocument(
        () =>
          request(
            `/receipts?kind=purchase&targetId=${encodeURIComponent(purchase._id)}`,
          ),
        (id) => request(`/receipts/${id}/pdf`),
        () => purchaseReceiptPdf(mapped),
      );
      if (requestId === receiptRequest.current) {
        setReceiptPurchase(full);
        setReceipt(mapped);
        setReceiptPdf(document.pdf);
        setReceiptArchived(document.archived);
      }
    } catch (reason) {
      if (requestId === receiptRequest.current)
        setReceiptError(
          reason instanceof Error
            ? reason.message
            : "Chargement du bordereau impossible.",
        );
    } finally {
      if (requestId === receiptRequest.current) setReceiptLoading(false);
    }
  };
  const shareReceipt = async () => {
    if (!receipt || receiptShareLock.current) return;
    const requestId = receiptRequest.current;
    receiptShareLock.current = true;
    setReceiptSharing(true);
    setReceiptError("");
    try {
      await sharePurchaseReceipt(receipt, receiptPdf ?? undefined);
    } catch (reason) {
      if (requestId === receiptRequest.current)
        setReceiptError(
          reason instanceof Error
            ? reason.message
            : "Partage du PDF impossible.",
        );
    } finally {
      receiptShareLock.current = false;
      setReceiptSharing(false);
    }
  };
  const removePendingPurchase = async (purchase: Purchase) => {
    if (busy || purchase.status !== "pending") return;
    setBusy(true);
    try {
      await cancelPendingPurchase(purchase._id);
      await refresh();
      setError(`Rachat ${purchase.reference} retiré des rachats à terminer.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Suppression impossible.");
    } finally { setBusy(false); }
  };
  const rejectPendingPurchase = async (purchase: Purchase) => {
    Alert.alert(
      "Annuler ce rachat ?",
      "Les cartes de ce rachat ne seront pas ajoutées au stock.",
      [
        { text: "Garder en attente", style: "cancel" },
        {
          text: "Annuler le rachat",
          style: "destructive",
          onPress: () => void removePendingPurchase(purchase),
        },
      ],
    );
  };

  const toggleSale = (item: Item) => {
    setItems((current) =>
      current.some((row) => row._id === item._id)
        ? current.map(row => row._id === item._id ? item : row)
        : [...current, item],
    );
    setSelectedItemIds((ids) => {
      const exists = ids.includes(item._id);
      if (exists) return ids.filter((id) => id !== item._id);
      setSalePrices((prices) => ({
        ...prices,
        [item._id]:
          prices[item._id] ??
          (item.askingPriceCents === undefined
            ? ""
            : (item.askingPriceCents / 100).toFixed(2)),
      }));
      return [...ids, item._id];
    });
  };
  const saleTotalCents = selectedItems.reduce((sum, item) => sum + Math.round((Number((salePrices[item._id] ?? '').replace(',', '.')) || 0) * 100) * (Number(saleQuantities[item._id] ?? '1') || 0), 0);
  const submitSales = async () => {
    if (saleLock.current) return;
    if (!selectedItems.length)
      return setError("Ajoutez des articles au panier.");
    saleLock.current = true;
    setBusy(true);
    setError("");
    try {
      const saleRows = selectedItems.map((item) => {
        const value = (salePrices[item._id] ?? "").trim();
        const price = Number(value.replace(",", "."));
        if (
          !/^\d+(?:[.,]\d{1,2})?$/.test(value) ||
          !Number.isFinite(price) ||
          price < 0
        )
          throw new Error(`Prix de vente invalide pour ${item.name}.`);
        const quantity = Number(saleQuantities[item._id] ?? '1');
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > (item.quantity ?? 1)) throw new Error(`Quantité indisponible pour ${item.name}.`);
        const salePriceCents = Math.round(price * 100) * quantity;
        if (
          item.origin === "consignment" &&
          salePriceCents < (item.agreedPriceCents ?? item.askingPriceCents ?? 0)
        )
          throw new Error(
            `Le prix de ${item.name} est inférieur à l’accord. Enregistrez l’autorisation du déposant dans Dépôts.`,
          );
        return { itemId: item._id, salePriceCents, quantity };
      });
      const settlement = buildSaleSettlement(
        salePayment,
        saleRows.reduce((sum, row) => sum + row.salePriceCents, 0),
      );
      const signature = JSON.stringify({ saleRows, saleDate, settlement });
      if (saleAttempt.current?.signature !== signature)
        saleAttempt.current = {
          signature,
          operationId: Crypto.randomUUID(),
          occurredAt: dateAtCurrentTime(saleDate),
        };
      const saleResult = await createSales(
        saleRows,
        saleAttempt.current.occurredAt,
        settlement,
        saleAttempt.current.operationId,
      );
      setCompletedSaleIds(saleResult.ids);
      setSaleCompleted({
        pending: salePayment.mode === "pending",
        count: saleRows.reduce((n,row)=>n+row.quantity,0),
        cents: saleRows.reduce((sum, row) => sum + row.salePriceCents, 0),
      });
      setPage("saleComplete");
      saleAttempt.current = null;
      setSalePayment(emptyPaymentDraft());
      setSelectedItemIds([]);
      setSaleQuantities({});
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Vente impossible.");
    } finally {
      saleLock.current = false;
      setBusy(false);
    }
  };
  const saveAskingPrice = async (itemId: string) => {
    const existing = items.find(
      (item) => item._id === itemId,
    )?.askingPriceCents;
    const amount = Number(
      (
        askingPriceEdits[itemId] ??
        (existing === undefined ? "" : String(existing / 100))
      ).replace(",", "."),
    );
    if (!Number.isFinite(amount) || amount < 0)
      throw new Error("Saisissez un prix de vente valide.");
    setBusy(true);
    try {
      await updateAskingPrice(itemId, Math.round(amount * 100));
      setAskingPriceEdits((edits) => {
        const next = { ...edits };
        delete next[itemId];
        return next;
      });
      await refresh();
      setError("");
    } catch (reason) {
      throw reason;
    } finally {
      setBusy(false);
    }
  };

  const loadPurchaseAttachments = async (purchaseId: string) => {
    try {
      const attachments = await listPurchaseAttachments(purchaseId);
      setPurchaseAttachments((current) => ({
        ...current,
        [purchaseId]: attachments,
      }));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Chargement des photos impossible.",
      );
    }
  };
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
      setSaleQuantities({});
      setCompletedSaleIds([]);
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
        <StatusBar style={dark ? "light" : "dark"} />
        <ScrollView
          contentContainerStyle={styles.loginContent}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={[{ color: colors.text }, styles.title]}>
              Espace vendeur
            </Text>
            <Text style={[{ color: colors.text }, styles.subtitle]}>
              Connectez-vous à votre instance
            </Text>
          </View>
          {!instanceReady ? (
            <View style={styles.card}>
              <Text style={[{ color: colors.text }, styles.heading]}>
                Adresse de l’API
              </Text>
              <Field
                label="URL de l’API"
                value={instanceUrl}
                onChangeText={setInstanceUrl}
                placeholder="https://api.exemple.fr"
              />
              {!!instanceError && (
                <Text style={[{ color: colors.text }, styles.error]}>
                  {instanceError}
                </Text>
              )}
              <ActionButton
                disabled={instanceBusy}
                label={instanceBusy ? "Vérification…" : "Vérifier et continuer"}
                onPress={() => {
                  setInstanceBusy(true);
                  setInstanceError("");
                  void changeInstance(instanceUrl)
                    .then(() => {
                      setInstanceUrl(getApiBaseUrl() ?? instanceUrl);
                      setInstanceReady(true);
                    })
                    .catch((e) =>
                      setInstanceError(
                        e instanceof Error
                          ? e.message
                          : "Instance inaccessible.",
                      ),
                    )
                    .finally(() => setInstanceBusy(false));
                }}
              />
            </View>
          ) : (
            <>
              <AuthScreen
                onAuthenticated={async () => setAuthenticated(true)}
              />
              <ActionButton
                secondary
                label="Modifier l’instance"
                onPress={() => {
                  setInstanceReady(false);
                  setInstanceError("");
                }}
              />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );

  if (receiptPurchase) {
    if (receiptPreview && receiptPdf)
      return (
        <ReceiptPdfViewer
          embedded
          base64={receiptPdf}
          backLabel="Revenir au bordereau"
          onClose={() => setReceiptPreview(false)}
        />
      );
    return (
      <SafeAreaView
        onTouchStart={markUserActivity}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <View style={styles.flowNav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fermer le bordereau"
            style={styles.navSide}
            onPress={closeReceipt}
          >
            <Ionicons name="chevron-back" size={20} color={colors.accent} />
            <Text style={styles.navLink}>Rachats</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.navTitle}>
            Document
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Partager le document"
            disabled={receiptSharing || !receiptPdf}
            style={[styles.navSide, { justifyContent: "flex-end" }]}
            onPress={() => void shareReceipt()}
          >
            <Ionicons
              name="share-outline"
              size={21}
              color={
                receiptSharing || !receiptPdf
                  ? colors.placeholder
                  : colors.accent
              }
            />
          </Pressable>
        </View>
        {receiptLoading ? (
          <ActivityIndicator />
        ) : receiptError && !receipt ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: colors.text }}>{receiptError}</Text>
            <ActionButton
              secondary
              label="Réessayer"
              onPress={() =>
                receiptPurchase && void openPurchaseReceipt(receiptPurchase)
              }
            />
          </View>
        ) : (
          receipt && (
            <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
              <Text style={[{ color: colors.text }, styles.rowSubtitle]}>
                {receipt.reference} · {receipt.client.name}
              </Text>
              <Text style={[{ color: colors.text }, styles.smallTag]}>
                {receiptArchived
                  ? "Original signé et archivé"
                  : "Document à signer"}
              </Text>
              {receiptPdf && (
                <>
                  <ReceiptPdfPreview base64={receiptPdf} />
                  <Pressable
                    accessibilityRole="button"
                    style={styles.inlineLink}
                    onPress={() => setReceiptPreview(true)}
                  >
                    <Ionicons
                      name="expand-outline"
                      size={17}
                      color={colors.accent}
                    />
                    <Text style={[{ color: colors.text }, styles.link]}>
                      Agrandir le document
                    </Text>
                  </Pressable>
                </>
              )}
              {receiptPurchase && (
                <ReceiptSigning
                  key={receiptPurchase._id}
                  kind="purchase"
                  targetId={receiptPurchase._id}
                  allowSigning={receipt.status !== "cancelled"}
                  onSignedPending={() => {
                    setReceiptPdf("");
                    setReceiptArchived(true);
                  }}
                  onSigned={(pdf) => {
                    setReceiptPdf(pdf);
                    setReceiptArchived(true);
                  }}
                />
              )}
              {receiptArchived && !receiptPdf && (
                <View style={styles.card}>
                  <Text style={{ color: colors.text }}>
                    Le document est signé. Rechargez l’original archivé pour le
                    lire ou le partager.
                  </Text>
                  <ActionButton
                    label="Recharger l’original signé"
                    onPress={() =>
                      receiptPurchase &&
                      void openPurchaseReceipt(receiptPurchase)
                    }
                  />
                </View>
              )}

              {receiptError ? (
                <Text style={{ color: colors.text }}>{receiptError}</Text>
              ) : null}
            </ScrollView>
          )
        )}
      </SafeAreaView>
    );
  }

  const renderPageContent = (page: Page, isActive: boolean) => (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
      {(page === "purchase" || page === "history") && (
        <Text accessibilityLiveRegion="polite" style={{ color: localPurchases.error ? colors.danger : colors.secondary, paddingHorizontal: 20, paddingVertical: 6 }}>
          {localPurchases.error || (!localPurchases.ready ? "Chargement des brouillons…" : localPurchases.saving ? "Sauvegarde sur cet appareil…" : "Brouillons sauvegardés sur cet appareil")}
        </Text>
      )}
        <ScrollView
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          ref={(node) => { if (isActive && node) contentScroll.current = node; }}
          contentContainerStyle={{ paddingTop: 0, paddingBottom: 100 }}
        >
          <PageTransition transitionKey={`${page}:${page === "purchase" ? purchaseStep : ""}:${expandedPurchase ?? ""}:${accountDetailsOpen}:${accountEditing}:${focusedSale ?? ""}`}>

          {page === "purchase" ? (
            <>
              <View style={[styles.flowNav, { paddingHorizontal: 0 }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Revenir à l’étape précédente"
                  style={styles.navSide}
                  onPress={() => {
                    purchaseStep
                      ? setPurchaseStep((step) => step - 1)
                      : setPage("history");
                    contentScroll.current?.scrollTo({ y: 0, animated: false });
                  }}
                >
                  <Ionicons
                    name="chevron-back"
                    size={20}
                    color={colors.accent}
                  />
                  <Text style={styles.navLink}>Retour</Text>
                </Pressable>
                <Text style={styles.navTitle}>Nouveau rachat</Text>
                <Pressable
                  accessibilityRole="button"
                  style={[styles.navSide, { justifyContent: "flex-end" }]}
                  onPress={() => setPage("history")}
                >
                  <Text style={styles.navLink}>Fermer</Text>
                </Pressable>
              </View>
              <Text accessibilityRole="header" style={styles.flowTitle}>
                {
                  [
                    "À qui rachetez-vous ?",
                    "Cartes à reprendre",
                    "Vérifier le rachat",
                  ][purchaseStep]
                }
              </Text>
            </>
          ) : (
            <MobileHeader
              page={page}
              title={
                page === "history" && expandedPurchase
                  ? "Dossier de rachat"
                  : undefined
              }
              subtitle={
                page === "saleSummary"
                  ? `Panier en cours · ${selectedItems.length} article(s)`
                  : undefined
              }
            />
          )}
          {page === "clients" && (
            <View>
              <ActionButton
                secondary
                label={clientEditorOpen ? "‹ Clients" : "‹ Compte"}
                onPress={() =>
                  clientEditorOpen
                    ? setClientEditorOpen(false)
                    : setPage("account")
                }
              />
              {!clientEditorOpen && (
                <>
                  <ActionButton
                    label="Nouveau client"
                    onPress={() => {
                      clearClient();
                      setClientEditorOpen(true);
                    }}
                  />
                  <SearchField
                    value={clientSearch}
                    onChange={setClientSearch}
                    placeholder="Nom, e-mail ou téléphone"
                  />
                  <Pagination data={clientData} />
                  <View style={styles.group}>
                    {filteredClients.map((client) => (
                      <MenuRow
                        key={client._id}
                        title={client.name}
                        subtitle={[client.email, client.phone]
                          .filter(Boolean)
                          .join(" · ")}
                        onPress={() => {
                          editClient(client);
                          setClientEditorOpen(true);
                        }}
                      />
                    ))}
                  </View>
                  {!clientData.loading &&
                    !clientData.error &&
                    !filteredClients.length && (
                      <Text style={[{ color: colors.text }, styles.muted]}>
                        Aucun client trouvé.
                      </Text>
                    )}
                </>
              )}
              {clientEditorOpen && (
                <>
                  <Text style={[{ color: colors.text }, styles.subheading]}>
                    {editingClientId
                      ? "Modifier la fiche"
                      : "Créer une fiche client"}
                  </Text>
                  <Field
                    label="Nom"
                    value={clientName}
                    onChangeText={setClientName}
                  />
                  <Field
                    keyboardType="email-address"
                    label="E-mail"
                    value={clientEmail}
                    onChangeText={setClientEmail}
                  />
                  <Field
                    label="Téléphone"
                    value={clientPhone}
                    onChangeText={setClientPhone}
                    keyboardType="phone-pad"
                  />
                  <Field
                    label="Adresse"
                    value={clientAddress}
                    onChangeText={setClientAddress}
                  />
                  <ActionButton
                    disabled={busy}
                    label={
                      editingClientId
                        ? "Enregistrer les modifications"
                        : "Créer la fiche client"
                    }
                    onPress={() => void saveClient()}
                  />
                  {editingClientId ? (
                    <ActionButton
                      secondary
                      label="Annuler"
                      onPress={() => {
                        clearClient();
                        setClientEditorOpen(false);
                      }}
                    />
                  ) : null}
                </>
              )}
            </View>
          )}

          {page === "purchase" && (
            <View>
              <Text style={[{ color: colors.text }, styles.stepCaption]}>
                {purchaseStep + 1} sur 5 ·{" "}
                {
                  ["Client", "Cartes et estimation", "Récapitulatif"][
                    purchaseStep
                  ]
                }
              </Text>
              <View
                style={purchaseStep === 0 ? undefined : { display: "none" }}
              >
                <ClientPicker
                  label="Client du rachat"
                  clients={sellers}
                  value={clientId}
                  onChange={setClientId}
                  onResolved={(client) =>
                    setSellers((rows) => [
                      ...rows.filter((row) => row._id !== client._id),
                      client,
                    ])
                  }
                  onCreate={() => setPage("clients")}
                />
                <Pressable
                  style={styles.inlineLink}
                  onPress={() => setPurchaseDateEditing(!purchaseDateEditing)}
                >
                  <Text style={[{ color: colors.text }, styles.rowSubtitle]}>
                    Date du rachat : {purchaseDate} · Modifier
                  </Text>
                </Pressable>
                {purchaseDateEditing && (
                  <Field
                    label="Date du rachat"
                    value={purchaseDate}
                    onChangeText={setPurchaseDate}
                    placeholder="AAAA-MM-JJ"
                  />
                )}
              </View>
              <View style={purchaseStep === 2 ? { gap: 8 } : { display: "none" }}>
                <Text style={{ color: colors.secondary }}>Notes et conditions facultatives, reprises sur le bordereau. Précisez les cartes et la note attendue pour un complément après gradation.</Text>
                <Field label="Note de l’acheteur (facultative)" value={buyerNote} onChangeText={localPurchases.setBuyerNote} multiline maxLength={2000} placeholder="Ex. : complément de 100 € par carte si la note convenue est obtenue." />
                <Field label="Note du vendeur (facultative)" value={sellerNote} onChangeText={localPurchases.setSellerNote} multiline maxLength={2000} />
              </View>
              <View
                style={purchaseStep === 1 ? undefined : { display: "none" }}
              >
                <PurchaseEditor
                  rows={purchaseDrafts}
                  setRows={setPurchaseDrafts}
                  fresh={emptyDraft}
                  search={searchCards}
                  select={chooseCard}
                  changeTcg={changeTcg}
                  changeLanguage={changeCardLanguage}
                  photo={(key, file) =>
                    setPurchaseDrafts((rows) =>
                      rows.map((row) =>
                        row.key === key ? { ...row, photo: file } : row,
                      ),
                    )
                  }
                />
              </View>
              {purchaseStep === 2 && (
                <View>
                  <View style={styles.hero}>
                    <Text style={[{ color: colors.text }, styles.rowSubtitle]}>
                      Total à payer au vendeur
                    </Text>
                    <Text style={[{ color: colors.text }, styles.heroAmount]}>
                      {formatEuros(
                        purchaseDrafts
                          .filter((row) => row.included)
                          .reduce(
                            (sum, row) =>
                              sum +
                              Math.round(
                                Number(row.marketValue.replace(",", ".")) *
                                  Number(row.discountPercent.replace(",", ".")),
                              ),
                            0,
                          ) / 100,
                      )}
                    </Text>
                    <Text style={[{ color: colors.text }, styles.smallTag]}>
                      {purchaseDrafts.filter((row) => row.included).length}{" "}
                      cartes · Rachat ferme
                    </Text>
                  </View>
                  <View style={styles.group}>
                    <MenuRow
                      title={selectedPurchaseClient?.name || "Client"}
                      subtitle={
                        selectedPurchaseClient?.email ||
                        "Copie à remettre par partage"
                      }
                      onPress={() => {
                        setPurchaseStep(0);
                        contentScroll.current?.scrollTo({
                          y: 0,
                          animated: false,
                        });
                      }}
                    />
                    <MenuRow
                      title={`${purchaseDrafts.filter((row) => row.included).length} cartes estimées`}
                      subtitle="Voir ou modifier les prix"
                      onPress={() => {
                        setPurchaseStep(1);
                        contentScroll.current?.scrollTo({
                          y: 0,
                          animated: false,
                        });
                      }}
                    />
                    <View style={styles.compactRow}>
                      <View style={styles.flex}>
                        <Text style={[{ color: colors.text }, styles.rowTitle]}>
                          Bordereau de rachat
                        </Text>
                        <Text
                          style={[{ color: colors.text }, styles.rowSubtitle]}
                        >
                          Le client consulte le document avant de signer.
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Text style={[{ color: colors.text }, styles.muted]}>
                    Le dossier sera enregistré en attente. La signature et
                    l’ajout au stock sont deux actions distinctes.
                  </Text>
                </View>
              )}
            </View>
          )}

          {page === "consignments" && <View>
            <ConsignmentScreen
              resetVersion={tabResetVersion.consignments ?? 0}
              onFilterControlChange={setDepositFilterControl}
              active={isActive && page === "consignments"}
              sellers={sellers}
              refreshStock={refresh}
              onCreateClient={() => {
                clearClient();
                setPage("clients");
              }}
            />
          </View>}

          {page === "stock" && (
            <StockScreen
              resetVersion={tabResetVersion.stock ?? 0}
              onFilterControlChange={setStockFilterControl}
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
              onSaveAskingPrice={saveAskingPrice}
              onToggle={toggleSale}
              onOpenSales={() => setPage("saleSummary")}
              onRefresh={refresh}
              onVisibilitySaved={(ids, hidden) =>
                setItems((current) =>
                  current.map((item) =>
                    ids.includes(item._id)
                      ? { ...item, hiddenFromCatalogue: hidden }
                      : item,
                  ),
                )
              }
            />
          )}

          {page === "sales" && (
            <View>
              <Text style={[{ color: colors.text }, styles.saleIntro]}>
                Recherchez dans le stock et ajoutez les articles à vendre. Le
                caddie flottant ouvre le récapitulatif.
              </Text>
              <SearchField
                value={saleSearch}
                onChange={setSaleSearch}
                placeholder="Nom, série ou numéro"
              />
              <View style={styles.saleResultsHeading}>
                <Text style={[{ color: colors.text }, styles.label]}>
                  Résultats
                </Text>
                <Text style={[{ color: colors.text }, styles.resultCount]}>
                  {filteredSaleItems.length} article(s)
                </Text>
              </View>
              <ActionButton
                secondary
                label="Historique des ventes"
                onPress={() => setPage("salesHistory")}
              />
              <Pagination data={saleStockData} />
              {salePageItems.map((item) => {
                const selected = selectedItemIds.includes(item._id);
                return (
                  <View key={item._id} style={styles.saleResultCard}>
                    <ItemThumbnail item={item} style={styles.saleThumb} />
                    <View style={styles.flex}>
                      <Text style={[{ color: colors.text }, styles.bold]}>
                        {item.name}
                      </Text>
                      {item.origin === 'supplier' && <Text style={styles.muted}>{item.quantity ?? 0} disponible(s) · Fournisseur</Text>}
                      <Text style={[{ color: colors.text }, styles.muted]}>
                        {[item.series, item.identifier]
                          .filter(Boolean)
                          .join(" · ") || "Sans référence"}
                      </Text>
                      {item.origin === "consignment" && (
                        <Text style={[{ color: colors.text }, styles.muted]}>
                          Dépôt-vente · {(item.commissionRateBps ?? 3000) / 100}{" "}
                          % de commission
                        </Text>
                      )}
                      <Text style={[{ color: colors.text }, styles.salePrice]}>
                        {item.askingPriceCents === undefined
                          ? "Prix à définir"
                          : `${(item.askingPriceCents / 100).toFixed(2)} €`}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => toggleSale(item)}
                      style={[
                        styles.addSaleButton,
                        selected && styles.removeSaleButton,
                      ]}
                    >
                      <Ionicons
                        name={selected ? "checkmark" : "add"}
                        size={20}
                        color={selected ? colors.onAccent : colors.accent}
                      />
                      <Text
                        style={[
                          { color: colors.text },
                          [
                            styles.addSaleText,
                            selected && styles.removeSaleText,
                          ],
                        ]}
                      >
                        {selected ? "Ajoutée" : "Ajouter"}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
              {!saleStockData.loading &&
              !saleStockData.error &&
              !salePageItems.length ? (
                <Text style={[{ color: colors.text }, styles.muted]}>
                  Aucun article ne correspond à cette recherche.
                </Text>
              ) : null}
            </View>
          )}

          {(page === "saleSummary" || page === "salePayment") && (
            <View>
              {page === "salePayment" && (
                <Pressable
                  style={styles.inlineLink}
                  onPress={() => setPage("saleSummary")}
                >
                  <Text style={[{ color: colors.text }, styles.link]}>
                    ‹ Panier
                  </Text>
                </Pressable>
              )}
              {!selectedItems.length ? (
                <View>
                  <View style={styles.emptyState}>
                    <Ionicons
                      name="cart-outline"
                      size={42}
                      color={colors.placeholder}
                    />
                    <Text style={[{ color: colors.text }, styles.rowTitle]}>
                      Votre panier est vide
                    </Text>
                    <Text style={[{ color: colors.text }, styles.muted]}>
                      Ajoutez des articles depuis votre stock.
                    </Text>
                  </View>
                  <ActionButton
                    label="Ajouter des articles"
                    onPress={() => setPage("sales")}
                  />
                </View>
              ) : (
                <>
                  {page === "salePayment" && (
                    <View style={styles.hero}>
                      <Text
                        style={[{ color: colors.text }, styles.rowSubtitle]}
                      >
                        Montant de la vente
                      </Text>
                      <Text style={[{ color: colors.text }, styles.heroAmount]}>
                        {formatEuros(
                          (saleTotalCents / 100),
                        )}
                      </Text>
                    </View>
                  )}
                  {page === "saleSummary" && (
                    <ActionButton
                      secondary
                      label="Ajouter depuis le stock"
                      onPress={() => setPage("sales")}
                    />
                  )}
                  {page === "saleSummary" &&
                    selectedItems.map((item) => (
                      <View key={item._id} style={styles.saleCartCard}>
                        <View style={styles.saleCartHeader}>
                          <View style={styles.flex}>
                            <Text style={[{ color: colors.text }, styles.bold]}>
                              {item.name}
                            </Text>
                            <Text
                              style={[{ color: colors.text }, styles.muted]}
                            >
                              {[item.series, item.identifier]
                                .filter(Boolean)
                                .join(" · ")}
                            </Text>
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Retirer ${item.name} du panier`}
                            onPress={() => toggleSale(item)}
                            style={styles.removeIconButton}
                          >
                            <Ionicons
                              name="close"
                              size={18}
                              color={colors.danger}
                            />
                          </Pressable>
                        </View>
                        {item.origin === 'supplier' && <Field label={`Quantité · ${item.quantity ?? 0} disponible(s)`} value={saleQuantities[item._id] ?? '1'} onChangeText={value => setSaleQuantities(current => ({...current, [item._id]: value}))} keyboardType="decimal-pad" />}
                        <View style={styles.priceLine}>
                          <Text
                            style={[{ color: colors.text }, styles.rowSubtitle]}
                          >
                            Prix unitaire TTC
                          </Text>
                          <TextInput
                            accessibilityLabel={`Prix vendu de ${item.name}`}
                            value={salePrices[item._id] ?? ""}
                            onChangeText={(value) =>
                              setSalePrices((prices) => ({
                                ...prices,
                                [item._id]: value,
                              }))
                            }
                            keyboardType="decimal-pad"
                            style={[{ color: colors.text }, styles.priceInput]}
                            keyboardAppearance={dark ? "dark" : "light"}
                            placeholderTextColor={colors.placeholder}
                          />
                          <Text
                            style={[{ color: colors.text }, styles.rowAmount]}
                          >
                            €
                          </Text>
                        </View>
                        {item.origin === "consignment" &&
                          (() => {
                            const cents = Math.round(
                              Number(
                                (salePrices[item._id] ?? "").replace(",", "."),
                              ) * 100,
                            );
                            const commission = Math.round(
                              (cents * (item.commissionRateBps ?? 3000)) /
                                10000,
                            );
                            return Number.isFinite(cents) && cents >= 0 ? (
                              <Text
                                style={[{ color: colors.text }, styles.muted]}
                              >
                                Dépôt-vente · Commission{" "}
                                {formatEuros(commission / 100)} · Déposant{" "}
                                {formatEuros((cents - commission) / 100)}
                                {cents <
                                (item.agreedPriceCents ??
                                  item.askingPriceCents ??
                                  0)
                                  ? " · Prix inférieur à l’accord : autorisation nécessaire dans Dépôts."
                                  : ""}
                              </Text>
                            ) : null;
                          })()}
                      </View>
                    ))}
                  {page === "salePayment" && (
                    <>
                      <Pressable
                        onPress={() => setSaleDateEditing(!saleDateEditing)}
                      >
                        <Text style={[{ color: colors.text }, styles.link]}>
                          Date de vente : {saleDate} · Modifier
                        </Text>
                      </Pressable>
                      {saleDateEditing && (
                        <Field
                          label="Date de vente"
                          value={saleDate}
                          onChangeText={setSaleDate}
                          placeholder="AAAA-MM-JJ"
                        />
                      )}

                      <SalePaymentFields
                        value={salePayment}
                        onChange={setSalePayment}
                        disabled={busy}
                        totalCents={saleTotalCents}
                      />
                    </>
                  )}
                </>
              )}
            </View>
          )}

          {page === "saleComplete" && completedSaleIds.length > 0 && <SaleTicket key={completedSaleIds.join(',')} saleIds={completedSaleIds} autoCreate />}
          {page === "saleComplete" && (
            <View style={styles.card}>
              <Ionicons
                name="checkmark-circle"
                size={52}
                color={colors.success}
              />
              <Text style={[{ color: colors.text }, styles.cartSummaryTotal]}>
                {formatEuros(saleCompleted.cents / 100)}
              </Text>
              <Text style={[{ color: colors.text }, styles.muted]}>
                {saleCompleted.count} article(s) ·{" "}
                {saleCompleted.pending
                  ? "Paiement en attente"
                  : "Paiement reçu"}
              </Text>
              <ActionButton
                label="Nouvelle vente"
                onPress={() => setPage("saleSummary")}
              />
              <ActionButton
                secondary
                label="Voir les ventes"
                onPress={() => setPage("salesHistory")}
              />
            </View>
          )}

          {page === "history" && (
            <View>
              {!expandedPurchase ? (
                <>
                  <ActionButton
                    label="Nouveau rachat"
                    disabled={busy || !localPurchases.ready}
                    onPress={() => {
                      localPurchases.start();
                      setPurchaseClientSearch("");
                      setPurchaseDateEditing(false);
                      setPage("purchase");
                    }}
                  />
                  {localPurchases.drafts.length > 0 && (
                    <>
                      <Text style={[{ color: colors.text }, styles.sectionTitle]}>
                        À terminer sur cet appareil · {localPurchases.drafts.length}
                      </Text>
                      <View style={styles.group}>
                        {localPurchases.drafts.filter(draft => {
                          const name = sellers.find(seller => seller._id === draft.clientId)?.name ?? draft.clientName ?? "Nouveau rachat";
                          return `${name} ${draft.rows.map(row => row.name).join(" ")}`.toLocaleLowerCase().includes(historySearch.trim().toLocaleLowerCase());
                        }).map(draft => {
                          const name = sellers.find(seller => seller._id === draft.clientId)?.name ?? draft.clientName ?? "Nouveau rachat";
                          const count = draft.rows.filter(row => row.included).length;
                          return <SwipeToDelete key={draft.id} label={`Supprimer le brouillon de ${name}`} disabled={busy || !localPurchases.ready}
                            onDelete={() => localPurchases.remove(draft.id)}>
                            <MenuRow title={name}
                              subtitle={`${count} carte${count > 1 ? "s" : ""} · ${draft.date} · ${["Client", "Cartes", "Vérification"][draft.step]}`}
                              onPress={() => {
                                if (!localPurchases.ready) return;
                                localPurchases.resume(draft.id);
                                setPurchaseClientSearch("");
                                setPurchaseDateEditing(false);
                                setPage("purchase");
                              }} />
                          </SwipeToDelete>;
                        })}
                      </View>
                    </>
                  )}
                  <Pagination data={purchaseHistory} />
                  {!historyBusy && !historyError && (
                    <>
                      {[
                        ["pending", "À terminer"],
                        ["documents", "Derniers documents"],
                      ].map(([section, title]) => {
                        const rows = purchases.filter((p) =>
                          section === "pending"
                            ? p.status === "pending"
                            : p.status !== "pending",
                        );
                        return rows.length ? (
                          <View key={section}>
                            <Text
                              style={[
                                { color: colors.text },
                                styles.sectionTitle,
                              ]}
                            >
                              {title}
                            </Text>
                            <View style={styles.group}>
                              {rows.map((purchase) => (
                                <SwipeToDelete
                                  key={purchase._id}
                                  enabled={purchase.status === "pending"}
                                  disabled={busy}
                                  label={`Supprimer le rachat à terminer ${purchase.reference}`}
                                  onDelete={() => void removePendingPurchase(purchase)}
                                >
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`Ouvrir le rachat ${purchase.reference} de ${purchase.sellerName}`}
                                  onPress={() => {
                                    setPurchaseDateEditing(false);
                                    setExpandedPurchase(purchase._id);
                                  }}
                                  style={styles.compactRow}
                                >
                                  <View style={styles.avatar}>
                                    <Text
                                      style={[
                                        { color: colors.text },
                                        styles.avatarText,
                                      ]}
                                    >
                                      {purchase.sellerName
                                        .split(" ")
                                        .filter(Boolean)
                                        .slice(0, 2)
                                        .map((v) => v[0])
                                        .join("")}
                                    </Text>
                                  </View>
                                  <View style={styles.flex}>
                                    <Text
                                      style={[
                                        { color: colors.text },
                                        styles.rowTitle,
                                      ]}
                                    >
                                      {purchase.sellerName}
                                    </Text>
                                    <Text
                                      style={[
                                        { color: colors.text },
                                        styles.rowSubtitle,
                                      ]}
                                    >
                                      {purchase.reference} ·{" "}
                                      {new Date(
                                        purchase.occurredAt,
                                      ).toLocaleDateString("fr-BE", {
                                        day: "numeric",
                                        month: "short",
                                      })}
                                    </Text>
                                  </View>
                                  <View
                                    style={{ alignItems: "flex-end", gap: 4 }}
                                  >
                                    <Text
                                      style={[
                                        { color: colors.text },
                                        styles.rowAmount,
                                      ]}
                                    >
                                      {formatEuros(
                                        purchase.items.reduce(
                                          (sum, item) =>
                                            sum + item.purchasePriceCents,
                                          0,
                                        ) / 100,
                                      )}
                                    </Text>
                                    {purchase.status === "pending" ? (
                                      <Text
                                        style={[
                                          { color: colors.text },
                                          styles.smallTag,
                                        ]}
                                      >
                                        À finaliser
                                      </Text>
                                    ) : purchase.status === "cancelled" ? (
                                      <Text
                                        style={[
                                          { color: colors.text },
                                          styles.rowSubtitle,
                                        ]}
                                      >
                                        Annulé
                                      </Text>
                                    ) : null}
                                  </View>
                                  <Ionicons
                                    name="chevron-forward"
                                    size={16}
                                    color={colors.placeholder}
                                  />
                                </Pressable>
                                </SwipeToDelete>
                              ))}
                            </View>
                          </View>
                        ) : null;
                      })}
                      {!purchases.length && (
                        <View style={styles.emptyState}>
                          <Ionicons
                            name="search-outline"
                            size={30}
                            color={colors.placeholder}
                          />
                          <Text
                            style={[{ color: colors.text }, styles.rowTitle]}
                          >
                            {historySearch
                              ? "Aucun rachat trouvé"
                              : "Aucun rachat pour le moment"}
                          </Text>
                          <Text style={[{ color: colors.text }, styles.muted]}>
                            {historySearch
                              ? "Essayez un autre client ou une autre référence."
                              : "Créez votre premier dossier avec Nouveau rachat."}
                          </Text>
                          {!!historySearch && (
                            <Pressable
                              style={styles.inlineLink}
                              onPress={() => setHistorySearch("")}
                            >
                              <Text
                                style={[{ color: colors.text }, styles.link]}
                              >
                                Effacer la recherche
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <Pressable
                    style={styles.inlineLink}
                    onPress={() => setExpandedPurchase(null)}
                  >
                    <Text style={[{ color: colors.text }, styles.link]}>
                      ‹ Tous les rachats
                    </Text>
                  </Pressable>
                  {purchases
                    .filter((p) => p._id === expandedPurchase)
                    .map((purchase) => (
                      <View key={purchase._id}>
                        <View style={styles.hero}>
                          <Text
                            style={[{ color: colors.text }, styles.rowTitle]}
                          >
                            {purchase.sellerName}
                          </Text>
                          <Text
                            style={[{ color: colors.text }, styles.rowSubtitle]}
                          >
                            {purchase.reference} ·{" "}
                            {new Date(purchase.occurredAt).toLocaleDateString(
                              "fr-BE",
                            )}
                          </Text>
                          <Text
                            style={[{ color: colors.text }, styles.heroAmount]}
                          >
                            {formatEuros(
                              purchase.items.reduce(
                                (sum, item) => sum + item.purchasePriceCents,
                                0,
                              ) / 100,
                            )}
                          </Text>
                          <Text
                            style={[{ color: colors.text }, styles.smallTag]}
                          >
                            {purchase.status === "pending"
                              ? "À finaliser"
                              : purchase.status === "cancelled"
                                ? "Annulé"
                                : "Validé"}
                          </Text>
                        </View>
                        {purchase.status !== "cancelled" && <ActionButton label="Modifier les cartes et les %" onPress={() => void startPurchaseEdit(purchase)} />}
                        <ActionButton
                          label="Consulter le document"
                          onPress={() => void openPurchaseReceipt(purchase)}
                        />
                        <View style={styles.group}>
                          <MenuRow
                            title={`${purchase.items.length} article(s)`}
                            subtitle="Détail et opérations du rachat"
                            onPress={() =>
                              setPurchaseOperationsOpen(!purchaseOperationsOpen)
                            }
                          />
                        </View>
                        {purchaseOperationsOpen && (
                          <View style={styles.card}>
                            {purchase.status === "pending" ? (
                              <View style={styles.inlineActions}>
                                <ActionButton
                                  disabled={busy}
                                  label="Valider le rachat et ajouter au stock"
                                  onPress={() =>
                                    void confirmPendingPurchase(purchase)
                                  }
                                />
                                <ActionButton
                                  disabled={busy}
                                  secondary
                                  label="Annuler le rachat"
                                  onPress={() =>
                                    rejectPendingPurchase(purchase)
                                  }
                                />
                              </View>
                            ) : null}
                            <ActionButton
                              secondary
                              label={
                                purchaseDateEditing
                                  ? "Fermer la modification de date"
                                  : "Modifier la date"
                              }
                              onPress={() =>
                                setPurchaseDateEditing(!purchaseDateEditing)
                              }
                            />
                            {purchaseDateEditing && (
                              <>
                                <Field
                                  label="Date du rachat (heure actuelle conservée)"
                                  value={
                                    purchaseDateEdits[purchase._id] ??
                                    localDateValue(
                                      new Date(purchase.occurredAt),
                                    )
                                  }
                                  onChangeText={(value) =>
                                    setPurchaseDateEdits((dates) => ({
                                      ...dates,
                                      [purchase._id]: value,
                                    }))
                                  }
                                  placeholder="AAAA-MM-JJ"
                                />
                                <ActionButton
                                  secondary
                                  disabled={busy}
                                  label="Enregistrer la date"
                                  onPress={() =>
                                    void updatePurchaseDateAction(purchase)
                                  }
                                />
                              </>
                            )}
                            {purchase.items.map((item) => (
                              <View key={item._id} style={styles.historyItem}>
                                <Text
                                  style={[{ color: colors.text }, styles.muted]}
                                >
                                  {item.name} · {languageName(item.language)} ·{" "}
                                  {conditionName(item.condition)} ·{" "}
                                  {(item.purchasePriceCents / 100).toFixed(2)} €
                                </Text>
                                {(item.photos ?? []).map((photo) => (
                                  <Pressable
                                    key={photo._id}
                                    onPress={() =>
                                      void openAttachment(
                                        photo._id,
                                        photo.filename,
                                        photo.contentType,
                                      )
                                    }
                                  >
                                    <Text
                                      style={[
                                        { color: colors.text },
                                        styles.attachmentLink,
                                      ]}
                                    >
                                      Photo : {photo.filename}
                                    </Text>
                                  </Pressable>
                                ))}
                              </View>
                            ))}
                            <Pressable
                              disabled={busy}
                              onPress={() =>
                                void loadPurchaseAttachments(purchase._id)
                              }
                            >
                              <Text
                                style={[{ color: colors.text }, styles.link]}
                              >
                                Photos et justificatifs
                              </Text>
                            </Pressable>
                            {(purchaseAttachments[purchase._id] ?? []).map(
                              (attachment) => (
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
                                  <Text
                                    style={[
                                      { color: colors.text },
                                      styles.attachmentLink,
                                    ]}
                                  >
                                    {attachment.filename}
                                  </Text>
                                </Pressable>
                              ),
                            )}
                          </View>
                        )}
                      </View>
                    ))}
                  {!!historyError && (
                    <Text
                      accessibilityRole="alert"
                      style={[{ color: colors.text }, styles.error]}
                    >
                      {historyError}
                    </Text>
                  )}
                </>
              )}
              <Modal
                visible={historyFiltersOpen}
                transparent
                animationType="slide"
                onRequestClose={() => setHistoryFiltersOpen(false)}
              >
                <KeyboardAvoidingView
                  behavior={Platform.OS === "ios" ? "padding" : undefined}
                  style={styles.sheetOverlay}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Fermer la recherche"
                    style={StyleSheet.absoluteFill}
                    onPress={() => setHistoryFiltersOpen(false)}
                  />
                  <SafeAreaView edges={["bottom"]} style={styles.filterSheet}>
                    <View style={styles.sheetHandle} />
                    <View style={styles.sheetHeading}>
                      <Text
                        accessibilityRole="header"
                        style={styles.sheetTitle}
                      >
                        Recherche et filtres
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Fermer les filtres"
                        style={styles.sheetClose}
                        onPress={() => setHistoryFiltersOpen(false)}
                      >
                        <Ionicons
                          name="close"
                          size={21}
                          color={colors.secondary}
                        />
                      </Pressable>
                    </View>
                    <ScrollView
                      keyboardShouldPersistTaps="handled"
                      automaticallyAdjustKeyboardInsets
                      style={{ flexGrow: 0 }}
                      contentContainerStyle={{
                        paddingTop: 12,
                        paddingBottom: 4,
                      }}
                    >
                      <SearchField
                        value={historySearch}
                        onChange={setHistorySearch}
                        placeholder="Client ou référence"
                      />
                      <View style={styles.sheetGroup}>
                        <View style={styles.sheetStatusRow}>
                          <Text style={styles.sheetLabel}>Statut</Text>
                          <View style={styles.sheetSegments}>
                            {[
                              { id: "all", label: "Tous" },
                              { id: "pending", label: "À terminer" },
                              { id: "active", label: "Validés" },
                              { id: "cancelled", label: "Annulés" },
                            ].map((status) => (
                              <Pressable
                                key={status.id}
                                accessibilityRole="button"
                                accessibilityState={{
                                  selected: historyStatus === status.id,
                                }}
                                onPress={() => setHistoryStatus(status.id)}
                                style={[
                                  styles.sheetSegment,
                                  historyStatus === status.id &&
                                    styles.sheetSegmentActive,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.sheetSegmentLabel,
                                    historyStatus === status.id && {
                                      color: colors.accent,
                                    },
                                  ]}
                                >
                                  {status.label}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                        <View style={styles.sheetFormRow}>
                          <Text style={styles.sheetLabel}>Du</Text>
                          <TextInput
                            accessibilityLabel="Date de début"
                            placeholder="AAAA-MM-JJ"
                            placeholderTextColor={colors.placeholder}
                            value={historyFrom}
                            onChangeText={setHistoryFrom}
                            autoCorrect={false}
                            autoCapitalize="none"
                            keyboardType="numbers-and-punctuation"
                            style={styles.sheetDate}
                          />
                        </View>
                        <View
                          style={[
                            styles.sheetFormRow,
                            { borderBottomWidth: 0 },
                          ]}
                        >
                          <Text style={styles.sheetLabel}>Au</Text>
                          <TextInput
                            accessibilityLabel="Date de fin"
                            placeholder="AAAA-MM-JJ"
                            placeholderTextColor={colors.placeholder}
                            value={historyTo}
                            onChangeText={setHistoryTo}
                            autoCorrect={false}
                            autoCapitalize="none"
                            keyboardType="numbers-and-punctuation"
                            style={styles.sheetDate}
                          />
                        </View>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        style={styles.inlineLink}
                        onPress={() => {
                          setHistoryStatus("all");
                          setHistoryFrom("");
                          setHistoryTo("");
                        }}
                      >
                        <Text style={styles.navLink}>
                          Réinitialiser les filtres
                        </Text>
                      </Pressable>
                    </ScrollView>
                    {!!historyDates.error && (
                      <Text
                        accessibilityRole="alert"
                        style={{ color: colors.danger, marginBottom: 10 }}
                      >
                        {historyDates.error}
                      </Text>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      disabled={!!historyDates.error}
                      style={[
                        styles.sheetApply,
                        historyDates.error ? { opacity: 0.5 } : null,
                      ]}
                      onPress={() => setHistoryFiltersOpen(false)}
                    >
                      <Text style={styles.sheetApplyText}>
                        {historyBusy
                          ? "Afficher les résultats"
                          : `Afficher ${purchases.length}${purchaseHistory.nextCursor ? "+" : ""} résultat${purchases.length === 1 && !purchaseHistory.nextCursor ? "" : "s"}`}
                      </Text>
                    </Pressable>
                  </SafeAreaView>
                </KeyboardAvoidingView>
              </Modal>
            </View>
          )}
          {page === "salesHistory" && (
            <View style={styles.card}>
              <Pagination data={saleData} />
              <ActionButton
                secondary
                label="‹ Vente"
                onPress={() => setPage("saleSummary")}
              />
              {!saleData.loading && !saleData.error && !sales.length && (
                <Text style={[{ color: colors.text }, styles.muted]}>
                  Aucune vente enregistrée.
                </Text>
              )}
              {sales.map((sale) => (
                <View key={sale._id} style={styles.listRow}>
                  <View style={styles.flex}>
                    <Text style={[{ color: colors.text }, styles.bold]}>
                      {sale.itemName} · {(sale.salePriceCents / 100).toFixed(2)}{" "}
                      €
                    </Text>
                    <Text style={[{ color: colors.text }, styles.muted]}>
                      {new Date(sale.occurredAt).toLocaleDateString("fr-BE")} ·{" "}
                      {sale.status === "active" ? "Vendue" : "Annulée"}
                    </Text>
                    <Pressable
                      onPress={() =>
                        setFocusedSale(
                          focusedSale === sale._id ? null : sale._id,
                        )
                      }
                    >
                      <Text style={[{ color: colors.text }, styles.link]}>
                        {focusedSale === sale._id
                          ? "Fermer le détail"
                          : "Voir le règlement et les détails"}
                      </Text>
                    </Pressable>
                    {focusedSale === sale._id && (
                      <><SalePaymentHistory sale={sale} onChanged={refresh} /><SaleTicket saleIds={[sale._id]} /></>
                    )}
                    {sale.origin === "consignment" && (
                      <Text style={[{ color: colors.text }, styles.muted]}>
                        Dépôt-vente · Commission{" "}
                        {formatEuros((sale.commissionCents ?? 0) / 100)} ·
                        Déposant{" "}
                        {formatEuros((sale.depositorAmountCents ?? 0) / 100)}
                        {sale.status === "cancelled"
                          ? " · Répartition annulée ; vérifiez les régularisations dans Dépôts."
                          : ""}
                      </Text>
                    )}
                  </View>
                  {focusedSale === sale._id && sale.status === "active" ? (
                    <Pressable
                      disabled={busy}
                      onPress={() =>
                        void undoSale(sale._id, setBusy, setError, refresh)
                      }
                    >
                      <Text style={[{ color: colors.text }, styles.link]}>
                        Annuler
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          )}
          {page === "account" && (
            <View>
              <SignatorySettings onEditingChange={setAccountEditing} />
              <AppearanceSettings />
              <View
                style={styles.group}
                pointerEvents={accountEditing ? "none" : "auto"}
              >
                <MenuRow
                  title="Clients"
                  subtitle="Coordonnées et historique"
                  onPress={() => setPage("clients")}
                />
                <MenuRow
                  title="Documents"
                  subtitle="Bordereaux de rachat"
                  onPress={() => setPage("history")}
                />
                <MenuRow
                  title="Ventes"
                  subtitle="Historique et encaissements"
                  onPress={() => setPage("salesHistory")}
                />
                <MenuRow
                  title="Environnement"
                  subtitle={getApiBaseUrl()}
                  onPress={() => setAccountDetailsOpen(!accountDetailsOpen)}
                />
              </View>
              {accountDetailsOpen && (
                <>
                  <View style={styles.card}>
                    <Text style={[{ color: colors.text }, styles.subheading]}>
                      Instance connectée
                    </Text>
                    <Text style={[{ color: colors.text }, styles.muted]}>
                      {getApiBaseUrl()}
                    </Text>
                    <ActionButton
                      secondary
                      disabled={busy || accountEditing}
                      label="Changer d’instance"
                      onPress={() =>
                        Alert.alert(
                          "Changer d’instance ?",
                          "Vous serez déconnecté. Les brouillons de rachat sauvegardés restent associés à cette boutique et à votre compte.",
                          [
                            { text: "Annuler", style: "cancel" },
                            {
                              text: "Changer",
                              style: "destructive",
                              onPress: () => {
                                void logout().then(() => {
                                  setPurchaseAttachments({});
                                  setSalePrices({});
                                  clearClient();
                                  setPage("stock");
                                  setInstanceReady(false);
                                  setInstanceUrl("");
                                  setInstanceError("");
                                });
                              },
                            },
                          ],
                        )
                      }
                    />
                  </View>
                  <View style={styles.card}>
                    <Text style={[{ color: colors.text }, styles.subheading]}>
                      Session
                    </Text>
                    <Text style={[{ color: colors.text }, styles.muted]}>
                      Gérez votre session vendeur sur cet appareil.
                    </Text>
                    <ActionButton
                      disabled={busy || accountEditing}
                      secondary
                      label={busy ? "Déconnexion…" : "Se déconnecter"}
                      onPress={() => void logout()}
                    />
                  </View>
                </>
              )}
            </View>
          )}
          </PageTransition>
        </ScrollView>
        {["saleSummary", "salePayment"].includes(page) &&
          selectedItems.length > 0 && (
            <View style={styles.flowFooter}>
              <Text style={[{ color: colors.text }, styles.cartSummaryTotal]}>
                {formatEuros(
                  (saleTotalCents / 100),
                )}
              </Text>
              {page === "saleSummary" ? (
                <ActionButton
                  label="Passer au paiement"
                  onPress={() => {
                    const invalid = selectedItems.some(
                      (item) =>
                        !Number.isSafeInteger(Number(saleQuantities[item._id] ?? '1')) || Number(saleQuantities[item._id] ?? '1') < 1 || Number(saleQuantities[item._id] ?? '1') > (item.quantity ?? 1) ||
                        !/^\d+(?:[.,]\d{1,2})?$/.test(
                          (salePrices[item._id] ?? "").trim(),
                        ),
                    );
                    if (invalid) {
                      setError(
                        "Vérifiez le prix de chaque article avant de continuer.",
                      );
                      return;
                    }
                    setError("");
                    setPage("salePayment");
                  }}
                />
              ) : (
                <ActionButton
                  disabled={busy}
                  label={
                    busy
                      ? "Enregistrement…"
                      : `Confirmer la vente · ${formatEuros((saleTotalCents / 100))}`
                  }
                  onPress={() =>
                    Alert.alert(
                      "Confirmer la vente ?",
                      `${selectedItems.length} article(s) · ${formatEuros((saleTotalCents / 100))}`,
                      [
                        { text: "Revoir le panier", style: "cancel" },
                        {
                          text: "Confirmer",
                          style: "destructive",
                          onPress: () => void submitSales(),
                        },
                      ],
                    )
                  }
                />
              )}
            </View>
          )}
        {page === "purchase" && purchaseStep < 2 && (
          <View style={styles.flowFooter}>
            <ActionButton
              label={
                purchaseStep === 0
                  ? "Continuer vers les cartes"
                  : "Vérifier le rachat"
              }
              disabled={
                purchaseStep === 0
                  ? !clientId
                  : !purchaseDrafts.some((row) => row.included) ||
                    purchaseDrafts.some(
                      (row) => !row.included && Boolean(row.name.trim()),
                    )
              }
              onPress={() => {
                setPurchaseStep((step) => step + 1);
                contentScroll.current?.scrollTo({ y: 0, animated: false });
              }}
            />
          </View>
        )}
        {page === "purchase" && purchaseStep === 2 && (
          <PurchaseSummary
            rows={purchaseDrafts}
            busy={busy}
            hasClient={!!clientId}
            save={() => void submitPurchase()}
          />
        )}
      </KeyboardAvoidingView>
  );

  return (
    <SafeAreaView style={styles.page} onTouchStart={markUserActivity}>
      <StatusBar style={dark ? "light" : "dark"} />
      {purchaseEdit && <Modal visible animationType="slide" onRequestClose={closePurchaseEdit}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} onTouchStart={markUserActivity}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ padding: 16, gap: 8 }}><Text style={{ color: colors.text, fontWeight: '700', fontSize: 22 }}>Modifier le rachat</Text><Text style={{ color: colors.secondary }}>{purchaseEdit.purchase.reference}</Text></View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12 }}>
              {!!editError && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{editError}</Text>}
              {purchaseEdit.lockedCount > 0 && <Text style={{ color: colors.secondary }}>{purchaseEdit.lockedCount} carte(s) avec vente ou don conservées sans modification. Les totaux ci-dessous concernent les cartes modifiables.</Text>}
              <Text style={{ color: colors.secondary }}>Les documents déjà archivés sont conservés. Vos brouillons de nouveaux rachats restent séparés.</Text>
              {editSaved ? <Text style={{ color: colors.text }}>Modifications enregistrées. Terminez l’envoi des photos restantes.</Text> : <View pointerEvents={editBusy ? 'none' : 'auto'}><PurchaseEditor rows={editRows} setRows={setEditRows} fresh={emptyDraft} search={searchCards} select={chooseCard} changeTcg={changeTcg} changeLanguage={changeCardLanguage} photo={(key, file) => setEditRows(rows => rows.map(row => row.key === key ? { ...row, photo: file } : row))} /></View>}
            </ScrollView>
            <View style={{ padding: 16, gap: 8, backgroundColor: colors.surface }}>
              <ActionButton label={editBusy ? 'Enregistrement…' : editSaved ? 'Réessayer les photos' : 'Enregistrer le rachat'} disabled={editBusy} onPress={() => void savePurchaseEdit()} />
              <ActionButton label="Fermer" secondary disabled={editBusy} onPress={closePurchaseEdit} />
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>}

      {!!error && (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <Text style={[{ color: colors.text }, styles.error]}>{error}</Text>
        </View>
      )}
      <NativeTabs active={activeTab(page) as RootTab} onChange={tab => setPage(tab === "sales" ? "saleSummary" : tab)} renderScene={tab => {
        const scenePage = tab === activeTab(page) ? page : tab === "sales" ? "saleSummary" : tab;
        return renderPageContent(scenePage, tab === activeTab(page));
      }} />
      {busy ? <ActivityIndicator style={styles.spinner} /> : null}
      {page !== "purchase" && (
        <MobileNavigation
          page={page}
          onReset={resetTab}
          onChange={(next) => setPage(next === "sales" ? "saleSummary" : next)}
          disabled={busy || accountEditing}
        />
      )}
      {((page === "history" && !expandedPurchase) ||
        (["stock", "consignments"].includes(page) && filterControl)) && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Recherche et filtres, ${page === "history" ? Number(historyStatus !== "all") + Number(Boolean(historyFrom)) + Number(Boolean(historyTo)) : (filterControl?.count ?? 0)} filtres actifs`}
          onPress={() =>
            page === "history"
              ? setHistoryFiltersOpen(true)
              : filterControl?.open()
          }
          style={styles.filterDock}
        >
          <Ionicons name="search-outline" size={20} color={colors.accent} />
          <Text style={[{ color: colors.text }, styles.filterDockText]}>
            Rechercher
          </Text>
          <Ionicons name="options-outline" size={18} color={colors.accent} />
          {(page === "history"
            ? Number(historyStatus !== "all") +
              Number(Boolean(historyFrom)) +
              Number(Boolean(historyTo))
            : (filterControl?.count ?? 0)) > 0 && (
            <View style={styles.filterBadge}>
              <Text style={[{ color: colors.text }, styles.filterBadgeText]}>
                {page === "history"
                  ? Number(historyStatus !== "all") +
                    Number(Boolean(historyFrom)) +
                    Number(Boolean(historyTo))
                  : filterControl?.count}
              </Text>
            </View>
          )}
        </Pressable>
      )}
      {authenticated &&
      selectedItemIds.length > 0 &&
      !["saleSummary", "salePayment", "saleComplete"].includes(page) &&
      page !== "purchase" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ouvrir le résumé du panier, ${selectedItemIds.length} article(s)`}
          onPress={() => setPage("saleSummary")}
          style={[styles.cartFab, { left: 20, right: undefined }]}
        >
          <Ionicons name="cart-outline" size={25} color={colors.onAccent} />
          <View style={styles.cartFabCount}>
            <Text style={[{ color: colors.text }, styles.cartFabCountText]}>
              {selectedItemIds.length}
            </Text>
          </View>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const { colors, dark } = useTheme();
  const styles = createStyles(colors);

  return (
    <View style={styles.searchBar}>
      <Ionicons name="search" size={18} color={colors.placeholder} />
      <TextInput
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        value={value}
        onChangeText={onChange}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        returnKeyType="search"
        style={[{ color: colors.text }, styles.searchInput]}
        keyboardAppearance={dark ? "dark" : "light"}
      />
      {!!value && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Effacer la recherche"
          onPress={() => onChange("")}
          hitSlop={10}
        >
          <Ionicons name="close-circle" size={18} color={colors.placeholder} />
        </Pressable>
      )}
    </View>
  );
}
function MenuRow({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const { colors, dark } = useTheme();
  const styles = createStyles(colors);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.compactRow}
    >
      <View style={styles.flex}>
        <Text style={[{ color: colors.text }, styles.rowTitle]}>{title}</Text>
        {!!subtitle && (
          <Text style={[{ color: colors.text }, styles.rowSubtitle]}>
            {subtitle}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.placeholder} />
    </Pressable>
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
  const { colors, dark } = useTheme();
  const styles = createStyles(colors);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={[
        styles.action,
        secondary && styles.secondaryAction,
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={[
          { color: colors.text },
          [styles.actionText, secondary && styles.secondaryText],
        ]}
      >
        {label}
      </Text>
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
  const { colors, dark } = useTheme();
  const styles = createStyles(colors);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <Text style={[{ color: colors.text }, styles.choiceText]}>
        {selected ? "● " : ""}
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
    .then((file) => {
      if (!file) return;
      setter((rows) =>
        rows.map((row) => (row.key === key ? { ...row, photo: file } : row)),
      );
    })
    .catch((reason) =>
      setError(
        reason instanceof Error
          ? reason.message
          : "Capture ou sélection impossible.",
      ),
    );
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
    setError(
      reason instanceof Error ? reason.message : "Annulation impossible.",
    );
  } finally {
    setBusy(false);
  }
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flowNav: {
      height: 51,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      gap: 6,
    },
    navSide: {
      minWidth: 76,
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 1,
    },
    navTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.text,
      textAlign: "center",
      flex: 1,
    },
    navLink: { fontSize: 14, color: colors.accent },
    flowTitle: {
      fontSize: 32,
      fontWeight: "700",
      letterSpacing: -1,
      color: colors.text,
      marginTop: 9,
      marginBottom: 10,
    },
    sheetOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: colors.overlay,
    },
    filterSheet: {
      maxHeight: "88%",
      backgroundColor: colors.background,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: 10,
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    sheetHandle: {
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.secondary,
      opacity: 0.4,
      alignSelf: "center",
      marginBottom: 12,
    },
    sheetHeading: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sheetTitle: { fontSize: 19, fontWeight: "700", color: colors.text },
    sheetClose: {
      width: 44,
      height: 44,
      alignItems: "flex-end",
      justifyContent: "center",
    },
    sheetGroup: {
      backgroundColor: colors.surface,
      borderRadius: 15,
      overflow: "hidden",
      marginBottom: 4,
    },
    sheetFormRow: {
      minHeight: 49,
      paddingHorizontal: 15,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    sheetStatusRow: {
      paddingHorizontal: 15,
      paddingTop: 12,
      paddingBottom: 7,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: 6,
    },
    sheetLabel: { fontSize: 14, color: colors.text },
    sheetDate: {
      minHeight: 49,
      textAlign: "right",
      fontSize: 16,
      color: colors.text,
      paddingVertical: 10,
      minWidth: 150,
    },
    sheetSegments: { flexDirection: "row", gap: 3 },
    sheetSegment: {
      flex: 1,
      minHeight: 36,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 7,
      paddingHorizontal: 3,
    },
    sheetSegmentActive: { backgroundColor: colors.accentSoft },
    sheetSegmentLabel: { fontSize: 12, color: colors.secondary },
    sheetApply: {
      height: 49,
      borderRadius: 13,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
    },
    sheetApplyText: { fontSize: 16, fontWeight: "600", color: colors.onAccent },

    filterDock: {
      position: "absolute",
      bottom: 100,
      right: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      minHeight: 48,
      borderRadius: 25,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      shadowColor: colors.shadow,
      shadowOpacity: 0.12,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
    },
    filterDockText: { fontSize: 14, fontWeight: "600", color: colors.accent },
    filterBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    filterBadgeText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "600",
    },
    group: {
      backgroundColor: colors.surface,
      borderRadius: 15,
      overflow: "hidden",
      marginVertical: 12,
    },
    compactRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      paddingHorizontal: 15,
      paddingVertical: 14,
      minHeight: 57,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowTitle: { fontSize: 16, fontWeight: "600", color: colors.text },
    rowSubtitle: {
      fontSize: 12,
      color: colors.secondary,
      marginTop: 4,
      lineHeight: 17,
    },
    rowAmount: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    sectionHeading: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 12,
    },
    sectionTitle: {
      fontSize: 21,
      fontWeight: "700",
      letterSpacing: -0.4,
      color: colors.text,
      marginTop: 16,
      marginBottom: 0,
    },
    inlineLink: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingVertical: 10,
    },
    avatar: {
      width: 41,
      height: 41,
      borderRadius: 21,
      backgroundColor: colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { fontSize: 14, fontWeight: "600", color: colors.accent },
    smallTag: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.accent,
      backgroundColor: colors.accentSoft,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 7,
      alignSelf: "flex-start",
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 44,
      paddingHorizontal: 12,
      backgroundColor: colors.border,
      borderRadius: 11,
      marginTop: 2,
      marginBottom: 14,
    },
    searchInput: {
      flex: 1,
      minHeight: 44,
      fontSize: 15,
      color: colors.text,
      paddingVertical: 10,
    },
    emptyState: {
      alignItems: "center",
      gap: 10,
      paddingVertical: 32,
      paddingHorizontal: 16,
    },
    hero: {
      alignItems: "center",
      padding: 20,
      backgroundColor: colors.surface,
      borderRadius: 16,
      marginVertical: 15,
      gap: 6,
    },
    heroAmount: {
      fontSize: 34,
      fontWeight: "700",
      letterSpacing: -1,
      color: colors.text,
      marginVertical: 7,
    },
    stepCaption: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.accent,
      marginBottom: 9,
    },
    priceLine: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 8,
    },
    priceInput: {
      marginLeft: "auto",
      minWidth: 72,
      textAlign: "right",
      fontSize: 16,
      color: colors.text,
      paddingVertical: 10,
    },

    flowFooter: {
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    receiptRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    receiptIcon: {
      minWidth: 44,
      minHeight: 48,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: 8,
    },
    receiptIconText: { fontSize: 9, fontWeight: "700", color: colors.accent },
    pageHeader: { marginBottom: 20, gap: 7 },
    pageTitle: {
      fontSize: 34,
      fontWeight: "700",
      color: colors.text,
      letterSpacing: -0.5,
    },
    pageDescription: { fontSize: 14, lineHeight: 20, color: colors.secondary },
    page: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 16,
    },
    loginContent: { flexGrow: 1, paddingBottom: 24 },
    header: { paddingTop: 14, paddingBottom: 12 },
    title: { fontSize: 27, fontWeight: "700", color: colors.text },
    subtitle: { color: colors.secondary, marginTop: 4 },
    bottomNav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-around",
      gap: 0,
      marginHorizontal: -4,
      borderRadius: 26,
      marginTop: 4,
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 4,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
      minHeight: 58,
    },
    nav: {
      flex: 1,
      minWidth: 0,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      paddingVertical: 5,
      minHeight: 48,
      borderRadius: 20,
    },
    active: { backgroundColor: colors.accentSoft },
    navText: {
      fontSize: 12,
      color: colors.secondary,
      fontWeight: "600",
      textAlign: "center",
    },
    activeText: { color: colors.accent, fontWeight: "800" },
    card: {
      backgroundColor: colors.surface,
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
    },
    heading: {
      fontSize: 20,
      fontWeight: "700",
      marginBottom: 14,
      color: colors.text,
    },
    steps: { flexDirection: "row", gap: 6, marginBottom: 16 },
    stepTab: {
      flex: 1,
      minHeight: 44,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 3,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.surface,
    },
    stepTabActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    stepTabText: { color: colors.secondary, fontSize: 12, fontWeight: "700" },
    stepTabTextActive: { color: colors.onAccent },
    subheading: {
      fontSize: 16,
      fontWeight: "700",
      marginTop: 12,
      marginBottom: 9,
      color: colors.text,
    },
    label: { fontWeight: "600", marginBottom: 8, color: colors.text },
    action: {
      backgroundColor: colors.accent,
      paddingVertical: 14,
      paddingHorizontal: 16,
      minHeight: 49,
      alignItems: "center",
      borderRadius: 13,
      marginTop: 8,
    },
    actionText: {
      color: colors.onAccent,
      fontSize: 16,
      fontWeight: "700",
      textAlign: "center",
    },
    secondaryAction: { backgroundColor: colors.raised },
    secondaryText: { color: colors.accent },
    disabled: { opacity: 0.55 },
    choice: {
      padding: 9,
      backgroundColor: colors.raised,
      marginBottom: 5,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    choiceSelected: {
      borderColor: colors.accent,
      backgroundColor: colors.infoSoft,
    },
    choiceText: { color: colors.text, fontSize: 12 },
    clientSearchField: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingHorizontal: 12,
      minHeight: 48,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.surface,
    },
    clientSearchInput: {
      flex: 1,
      paddingVertical: 10,
      color: colors.text,
      fontSize: 15,
    },
    purchaseClientResult: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 12,
      marginBottom: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 9,
      backgroundColor: colors.raised,
    },
    selectedPurchaseClient: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 12,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.accentSoft,
    },
    selectedClientMark: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 17,
      backgroundColor: colors.accentSoft,
    },
    changeClientButton: {
      paddingVertical: 7,
      paddingHorizontal: 9,
      borderRadius: 8,
      backgroundColor: colors.surface,
    },
    changeClientText: { color: colors.accent, fontSize: 12, fontWeight: "700" },
    clientSearchHint: {
      color: colors.secondary,
      fontSize: 12,
      marginBottom: 12,
    },
    noClientResult: { color: colors.secondary, paddingVertical: 10 },
    inlineActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 5,
      marginBottom: 10,
    },
    conditionGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 5,
      marginBottom: 12,
    },
    draft: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      marginVertical: 8,
      backgroundColor: colors.raised,
    },
    cardImage: {
      width: 150,
      height: 210,
      alignSelf: "center",
      marginBottom: 12,
    },
    cardThumb: { width: 42, height: 58, marginRight: 10 },
    searchResult: {
      flexDirection: "row",
      alignItems: "center",
      padding: 9,
      borderBottomWidth: 1,
      borderColor: colors.raised,
    },
    saleHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },
    saleIntro: { color: colors.secondary, lineHeight: 20, marginTop: -7 },
    cartIconButton: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.infoSoft,
      borderRadius: 14,
    },
    cartCountBadge: {
      position: "absolute",
      right: -3,
      top: -3,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 9,
      backgroundColor: colors.danger,
    },
    cartCountText: { color: colors.onAccent, fontSize: 10, fontWeight: "800" },
    saleResultsHeading: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 2,
    },
    resultCount: { color: colors.secondary, fontSize: 12, fontWeight: "600" },
    saleResultCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 10,
      marginBottom: 8,
      backgroundColor: colors.raised,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
    },
    saleThumb: {
      width: 48,
      height: 64,
      borderRadius: 4,
      backgroundColor: colors.raised,
    },
    salePrice: { color: colors.accent, fontWeight: "800", marginTop: 5 },
    addSaleButton: {
      minWidth: 72,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderRadius: 9,
      backgroundColor: colors.accentSoft,
    },
    removeSaleButton: { backgroundColor: colors.accent },
    addSaleText: { color: colors.accent, fontSize: 11, fontWeight: "700" },
    removeSaleText: { color: colors.onAccent },
    salePagination: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 20,
      paddingVertical: 8,
    },
    salePageButton: {
      width: 40,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.infoSoft,
      borderRadius: 9,
    },
    salePageDisabled: { opacity: 0.4 },
    salePageText: { color: colors.accent, fontSize: 22, fontWeight: "700" },
    cartFab: {
      position: "absolute",
      right: 18,
      bottom: 88,
      width: 54,
      height: 54,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 27,
      backgroundColor: colors.accent,
      elevation: 7,
      shadowColor: colors.shadow,
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      zIndex: 10,
    },
    cartFabCount: {
      position: "absolute",
      top: -2,
      right: -3,
      minWidth: 19,
      height: 19,
      paddingHorizontal: 4,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      backgroundColor: colors.danger,
    },
    cartFabCountText: {
      color: colors.onAccent,
      fontSize: 10,
      fontWeight: "800",
    },
    cartSummary: {
      padding: 14,
      borderRadius: 10,
      backgroundColor: colors.infoSoft,
      marginBottom: 10,
    },
    cartSummaryTitle: { color: colors.accent, fontWeight: "800", fontSize: 15 },
    cartSummaryTotal: {
      color: colors.accent,
      fontWeight: "800",
      fontSize: 24,
      marginTop: 4,
    },
    saleCartCard: {
      padding: 15,
      backgroundColor: colors.surface,
      borderRadius: 15,
      marginTop: 12,
    },

    saleCartHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
    removeIconButton: {
      position: "absolute",
      right: 8,
      top: 8,
      zIndex: 1,
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.dangerSoft,
      borderRadius: 17,
    },
    emptyCart: {
      padding: 18,
      color: colors.secondary,
      textAlign: "center",
      backgroundColor: colors.raised,
      borderRadius: 10,
    },
    saleHint: {
      color: colors.secondary,
      fontSize: 12,
      marginTop: -8,
      marginBottom: 6,
    },
    flex: { flex: 1 },
    bold: { fontWeight: "700", color: colors.text },
    muted: { color: colors.secondary, marginTop: 3, lineHeight: 19 },
    listRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderColor: colors.raised,
    },
    cartItem: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderColor: colors.raised,
    },
    historyCard: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderColor: colors.raised,
      gap: 5,
    },
    purchaseStatus: {
      alignSelf: "flex-start",
      backgroundColor: colors.successSoft,
      color: colors.success,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 99,
      fontSize: 12,
      fontWeight: "700",
    },
    purchaseStatusPending: {
      backgroundColor: colors.warningSoft,
      color: colors.warning,
    },
    historyItem: { paddingVertical: 5 },
    link: { color: colors.accent, fontWeight: "600", fontSize: 14 },
    attachmentLink: {
      color: colors.accent,
      textDecorationLine: "underline",
      paddingVertical: 4,
    },
    errorBox: {
      borderColor: colors.border,
      borderWidth: 1,
      backgroundColor: colors.dangerSoft,
      padding: 10,
      borderRadius: 8,
      marginBottom: 10,
    },
    error: { color: colors.danger, lineHeight: 20 },
    spinner: { marginVertical: 8 },
  });
