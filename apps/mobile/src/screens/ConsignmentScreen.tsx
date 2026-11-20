import { useTheme, type ThemeColors } from "../theme/ThemeProvider";
import { ConsignmentDocuments } from "../components/ConsignmentDocuments";
import { ReceiptSigning } from "../components/ReceiptSigning";
import * as Crypto from "expo-crypto";
import {
  type ComponentRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActionSheetIOS,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ClientPicker } from "../components/ClientPicker";
import { Field } from "../components/Field";
import { Pagination } from "../components/Pagination";
import { AttachmentPreview } from "../components/AttachmentPreview";
import { pickAttachment } from "../data/pickAttachment";
import { usePagedData } from "../data/usePagedData";
import {
  type AttachmentFile,
  type Consignment,
  type ConsignmentBalance,
  type ConsignmentEntry,
  type ConsignmentPayment,
  createConsignment,
  type Item,
  listConsignmentBalances,
  listConsignments,
  readRecord,
  openAttachment,
  recordConsignmentPayment,
  returnConsignmentItem,
  type Seller,
  shareConsignmentReceipt,
  updateConsignmentTerms,
  uploadItemAttachment,
} from "../data/apiRepository";

const money = (cents: number) =>
  (cents / 100).toLocaleString("fr-BE", { style: "currency", currency: "EUR" });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
function dateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Saisissez une date au format AAAA-MM-JJ.");
  const d = new Date(`${value}T12:00:00`);
  if (
    !Number.isFinite(d.getTime()) ||
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` !==
      value
  )
    throw new Error("Cette date est invalide.");
  return d.getTime();
}
function amount(value: string, label: string, max = Number.MAX_SAFE_INTEGER) {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim()))
    throw new Error(`${label} invalide (deux décimales maximum).`);
  const cents = Math.round(Number(value.trim().replace(",", ".")) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > max)
    throw new Error(`${label} invalide.`);
  return cents;
}
type Draft = {
  key: string;
  name: string;
  productType: "card" | "sealed" | "other";
  description: string;
  series: string;
  identifier: string;
  language: "" | "fr" | "en" | "ja";
  tcg: "" | "pokemon" | "riftbound";
  condition: "" | NonNullable<ConsignmentEntry["condition"]>;
  gradingCompany: "" | NonNullable<ConsignmentEntry["gradingCompany"]>;
  gradingGrade: string;
  gradingCertificate: string;
  price: string;
  commission: string;
  photo: AttachmentFile | null;
};
const fresh = (): Draft => ({
  key: Crypto.randomUUID(),
  name: "",
  productType: "sealed",
  description: "",
  series: "",
  identifier: "",
  language: "",
  tcg: "",
  condition: "",
  gradingCompany: "",
  gradingGrade: "",
  gradingCertificate: "",
  price: "",
  commission: "30",
  photo: null,
});
function Button({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors, dark } = useTheme();
  const styles = createStyles(colors);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={[{ color: colors.text }, styles.buttonText]}>{label}</Text>
    </Pressable>
  );
}
function Choices<T extends string>({
  values,
  value,
  onChange,
}: {
  values: readonly (readonly [T, string])[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors, dark } = useTheme();
  const styles = createStyles(colors);

  return (
    <View style={styles.row}>
      {values.map(([id, label]) => (
        <Pressable
          key={id}
          accessibilityRole="button"
          accessibilityState={{ selected: id === value }}
          onPress={() => onChange(id)}
          style={[styles.chip, id === value && styles.selected]}
        >
          <Text style={[{ color: colors.text }, styles.chipText]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ConsignmentScreen({
  active,
  sellers,
  refreshStock,
  onCreateClient,
  onFilterControlChange,
  resetVersion = 0,
}: {
  active: boolean;
  resetVersion?: number;
  onFilterControlChange?: (
    control: { open: () => void; count: number } | null,
  ) => void;
  sellers: Seller[];
  refreshStock: () => Promise<void>;
  onCreateClient: () => void;
}) {
  const { colors, dark } = useTheme();
  const styles = createStyles(colors);

  const [focusedDeposit, setFocusedDeposit] = useState<string | null>(null);
  const [depositSnapshot, setDepositSnapshot] = useState<Consignment | null>(
    null,
  );
  const [editingDraft, setEditingDraft] = useState<string | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const [dossierError, setDossierError] = useState("");
  const [depositorBalance, setDepositorBalance] =
    useState<ConsignmentBalance | null>(null);
  const [balanceError, setBalanceError] = useState("");
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [dossierLoading, setDossierLoading] = useState(false);
  const creationScroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [tab, setTab] = useState<"history" | "new" | "payments">("history");
  const [deposits, setDeposits] = useState<Consignment[]>([]);
  const [balances, setBalances] = useState<ConsignmentBalance[]>([]);
  const [payments, setPayments] = useState<ConsignmentPayment[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [search, setSearch] = useState("");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [due, setDue] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [contractTerms, setContractTerms] = useState("");
  const [contractVersion, setContractVersion] = useState("1");
  const [rows, setRows] = useState<Draft[]>(() => [fresh()]);
  const [editing, setEditing] = useState<Item | null>(null);
  const [termPrice, setTermPrice] = useState("");
  const [termRate, setTermRate] = useState("");
  const [authorization, setAuthorization] = useState("");
  const [paymentSeller, setPaymentSeller] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [balanceFilter, setBalanceFilter] = useState<
    "due" | "settled" | "regularization" | "all"
  >("due");
  useEffect(() => {
    onFilterControlChange?.(
      active && tab !== "new" && !focusedDeposit
        ? {
            open: () => setFilterPanelOpen(true),
            count: tab === "payments" && balanceFilter !== "all" ? 1 : 0,
          }
        : null,
    );
    return () => onFilterControlChange?.(null);
  }, [active, tab, focusedDeposit, balanceFilter, onFilterControlChange]);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState("Virement");
  const [paymentReference, setPaymentReference] = useState("");
  // Retain request keys for an unchanged retry after a lost response.
  const attempts = useRef(new Map<string, string>());
  const running = useRef(false);
  const [revision, setRevision] = useState(0);
  const [step, setStep] = useState(0);
  const previousReset = useRef(resetVersion);
  useEffect(() => {
    if (previousReset.current === resetVersion) return;
    previousReset.current = resetVersion;
    setTab("history");
    setFocusedDeposit(null);
    setExpandedArticle(null);
    setFilterPanelOpen(false);
    setDocumentsOpen(false);
    setEditing(null);
    setEditingDraft(null);
    creationScroll.current?.scrollTo({ y: 0, animated: false });
  }, [resetVersion]);
  const historyData = usePagedData<Consignment>(
    "/consignments",
    { search },
    active && tab === "history",
    revision,
  );
  const balancesData = usePagedData<ConsignmentBalance>(
    "/consignments/balances",
    { search: paymentSearch, status: balanceFilter },
    active && tab === "payments",
    revision,
  );
  const paymentsData = usePagedData<ConsignmentPayment>(
    "/consignments/payments",
    {},
    active && tab === "payments",
    revision,
  );
  useEffect(() => {
    setDeposits(historyData.items);
    setDepositSnapshot(
      (previous) =>
        historyData.items.find((d) => d._id === focusedDeposit) ?? previous,
    );
  }, [historyData.items, focusedDeposit]);
  useEffect(() => {
    if (!focusedDeposit) return;
    let current = true;
    setDossierLoading(true);
    setDossierError("");
    setDepositorBalance(null);
    setBalanceError("");
    setDocumentsOpen(false);
    void readRecord<Consignment>("/consignments", focusedDeposit)
      .then(async (d) => {
        if (!current) return;
        setDepositSnapshot(d);
        try {
          const b = await readRecord<ConsignmentBalance>(
            "/consignments/balances",
            d.sellerId,
          );
          if (current) setDepositorBalance(b);
        } catch {
          if (current)
            setBalanceError("Solde indisponible. Consultez les reversements.");
        }
      })
      .catch((e) => {
        if (current)
          setDossierError(
            e instanceof Error ? e.message : "Chargement impossible.",
          );
      })
      .finally(() => {
        if (current) setDossierLoading(false);
      });
    return () => {
      current = false;
    };
  }, [focusedDeposit, revision]);
  useEffect(() => setBalances(balancesData.items), [balancesData.items]);
  useEffect(() => setPayments(paymentsData.items), [paymentsData.items]);

  const operation = (kind: string, input: unknown) => {
    const key = `${kind}:${JSON.stringify(input)}`;
    let id = attempts.current.get(key);
    if (!id) {
      id = Crypto.randomUUID();
      attempts.current.set(key, id);
    }
    return id;
  };
  const load = useCallback(async () => {
    setRevision((value) => value + 1);
  }, []);
  const run = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Opération impossible.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const patch = (key: string, update: Partial<Draft>) =>
    setRows((current) =>
      current.map((r) => (r.key === key ? { ...r, ...update } : r)),
    );
  const refresh = async () => {
    await Promise.all([load(), refreshStock()]);
  };
  const submit = () =>
    run(async () => {
      if (!sellerId) throw new Error("Choisissez le déposant.");
      if (!reference.trim())
        throw new Error("Saisissez une référence de dépôt.");
      if (!contractTerms.trim() || !contractVersion.trim()) throw new Error("Renseignez les conditions réellement convenues et leur version.");
      const occurredAt = dateValue(date);
      const dueAt = due ? dateValue(due) : undefined;
      if (dueAt !== undefined && dueAt < occurredAt)
        throw new Error("L’échéance ne peut pas précéder le dépôt.");
      const items: ConsignmentEntry[] = rows.map((r) => {
        if (!r.name.trim())
          throw new Error("Chaque article doit avoir un nom.");
        return {
          operationId: r.key,
          name: r.name.trim(),
          productType: r.productType,
          description: r.description.trim() || undefined,
          series: r.series.trim() || undefined,
          identifier: r.identifier.trim() || undefined,
          language: r.language || undefined,
          tcg: r.tcg || undefined,
          ...(r.productType === "card"
            ? {
                condition: r.condition || undefined,
                gradingCompany: r.gradingCompany || undefined,
                gradingGrade: r.gradingGrade.trim() || undefined,
                gradingCertificate: r.gradingCertificate.trim() || undefined,
              }
            : {}),
          askingPriceCents: amount(r.price, "Prix"),
          commissionRateBps: amount(r.commission, "Commission", 10000),
        };
      });
      const input = {
        sellerId,
        flowVersion: 2 as const,
        contractTerms: {version:contractVersion.trim(),text:contractTerms.trim()},
        occurredAt,
        dueAt,
        reference: reference.trim(),
        notes: notes.trim() || undefined,
        items,
      };
      const result = await createConsignment({
        ...input,
        operationId: operation("deposit", input),
      });
      // Clear the saved draft before optional uploads: an upload failure must never duplicate the deposit.
      const photos = rows
        .map((r, i) => ({ file: r.photo, id: result.itemIds[i] }))
        .filter((r) => r.file);
      setRows([fresh()]);
      setStep(0);
      setSellerId("");
      setDate(today());
      setEditingDraft(null);
      setFocusedDeposit(result.consignmentId);
      setDepositSnapshot(null);
      setSearch("");
      setReference("");
      setNotes("");
      setContractTerms("");
      setDue("");
      setTab("history");
      let failures = 0;
      for (const photo of photos) {
        try {
          if (photo.file) await uploadItemAttachment(photo.id, photo.file);
        } catch {
          failures++;
        }
      }
      await refresh();
      setMessage(
        failures
          ? `Dépôt enregistré. ${failures} pièce(s) non téléversée(s) : utilisez « Ajouter une pièce » dans l’historique.`
          : "Dépôt enregistré. Lisez et signez le contrat pour rendre les articles disponibles à la vente.",
      );
    });
  function advance(next: number) {
    try {
      if (next > 0) {
        if (!sellerId) throw new Error("Choisissez le déposant.");
        if (!reference.trim())
          throw new Error("Saisissez la référence du dépôt.");
        const occurred = dateValue(date);
        if (due && dateValue(due) < occurred)
          throw new Error("L’échéance ne peut pas précéder le dépôt.");
      }
      if (next > 1) {
        if (!rows.length) throw new Error("Ajoutez un article.");
        rows.forEach((r) => {
          if (!r.name.trim())
            throw new Error("Chaque article doit avoir un nom.");
          amount(r.price, "Prix");
          amount(r.commission, "Commission", 10000);
        });
      }
      if (next > 2 && (!contractTerms.trim() || !contractVersion.trim())) throw new Error("Complétez les conditions du contrat et leur version.");
      setMessage("");
      setStep(next);
      creationScroll.current?.scrollTo({ y: 0, animated: false });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Vérifiez les informations.");
    }
  }
  function finishArticle(row: Draft) {
    try {
      if (!row.name.trim()) throw new Error("Indiquez le nom de l’article.");
      amount(row.price, "Prix");
      amount(row.commission, "Commission", 10000);
      setMessage("");
      setEditingDraft(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Vérifiez les informations.");
    }
  }
  const pick = () => pickAttachment(true);
  const shareReceipt = (deposit: Consignment) =>
    shareConsignmentReceipt(
      deposit,
      sellers.find((client) => client._id === deposit.sellerId),
    );
  return (
    <View>
      <Button
        label={
          reference || rows.some((r) => r.name || r.price) || sellerId
            ? "Reprendre le dépôt"
            : "Nouveau dépôt"
        }
        onPress={() => setTab("new")}
      />
      <View style={styles.segments}>
        {(
          [
            ["history", "Dépôts"],
            ["payments", "À reverser"],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: tab === value }}
            style={[styles.segment, tab === value && styles.segmentActive]}
            onPress={() => setTab(value)}
          >
            <Text style={[{ color: colors.text }, styles.segmentText]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Modal
        visible={filterPanelOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setFilterPanelOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.sheetOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fermer les filtres"
            style={StyleSheet.absoluteFill}
            onPress={() => setFilterPanelOpen(false)}
          />
          <SafeAreaView edges={["bottom"]} style={styles.filterSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Rechercher et filtrer</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setFilterPanelOpen(false)}
                style={styles.inlineAction}
              >
                <Text style={styles.chipText}>Fermer</Text>
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingBottom: 12,
              }}
            >
              <View style={styles.searchBar}>
                <Text style={styles.searchIcon}>⌕</Text>
                <TextInput
                  accessibilityLabel={
                    tab === "payments"
                      ? "Rechercher un déposant"
                      : "Rechercher un dépôt"
                  }
                  placeholder={
                    tab === "payments"
                      ? "Nom, e-mail ou téléphone"
                      : "Client ou référence"
                  }
                  placeholderTextColor={colors.secondary}
                  value={tab === "payments" ? paymentSearch : search}
                  onChangeText={
                    tab === "payments" ? setPaymentSearch : setSearch
                  }
                  clearButtonMode="while-editing"
                  style={styles.searchInput}
                  returnKeyType="search"
                  keyboardAppearance={dark ? "dark" : "light"}
                />
              </View>
              {tab === "payments" && (
                <Pressable
                  accessibilityRole="button"
                  style={styles.filterFormRow}
                  onPress={() => {
                    const choices = [
                      ["all", "Tous"],
                      ["due", "À payer"],
                      ["settled", "Réglés"],
                      ["regularization", "Régularisations"],
                    ] as const;
                    if (Platform.OS === "ios")
                      ActionSheetIOS.showActionSheetWithOptions(
                        {
                          title: "État du solde",
                          options: [
                            ...choices.map(([, label]) => label),
                            "Annuler",
                          ],
                          cancelButtonIndex: choices.length,
                          userInterfaceStyle: dark ? "dark" : "light",
                        },
                        (index) => {
                          if (index < choices.length)
                            setBalanceFilter(choices[index][0]);
                        },
                      );
                    else
                      Alert.alert("État du solde", undefined, [
                        ...choices.map(([key, label]) => ({
                          text: label,
                          onPress: () => setBalanceFilter(key),
                        })),
                        { text: "Annuler", style: "cancel" },
                      ]);
                  }}
                >
                  <Text style={styles.filterFormLabel}>État du solde</Text>
                  <Text style={styles.filterFormValue}>
                    {
                      {
                        all: "Tous",
                        due: "À payer",
                        settled: "Réglés",
                        regularization: "Régularisations",
                      }[balanceFilter]
                    }{" "}
                    ›
                  </Text>
                </Pressable>
              )}
              {tab === "payments" && (
                <Pressable
                  accessibilityRole="button"
                  style={styles.inlineAction}
                  onPress={() => setBalanceFilter("all")}
                >
                  <Text style={styles.chipText}>Réinitialiser les filtres</Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                style={styles.sheetPrimary}
                onPress={() => setFilterPanelOpen(false)}
              >
                <Text style={styles.sheetPrimaryText}>
                  {(() => {
                    const data =
                      tab === "payments" ? balancesData : historyData;
                    return data.loading || data.error
                      ? "Afficher les résultats"
                      : `Afficher ${data.items.length} résultat${data.items.length === 1 ? "" : "s"}${data.nextCursor || data.hasPrevious ? " sur cette page" : ""}`;
                  })()}
                </Text>
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
      {message ? (
        <Text
          accessibilityRole="alert"
          style={[{ color: colors.text }, styles.message]}
        >
          {message}
        </Text>
      ) : null}
      {busy ? (
        <Text style={[{ color: colors.text }, styles.hint]}>
          Enregistrement…
        </Text>
      ) : null}
      <View pointerEvents={busy ? "none" : "auto"}>
        {tab === "new" && (
          <Modal
            visible
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={() => {
              if (!busy) setTab("history");
            }}
          >
            <SafeAreaView style={styles.screen}>
              <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
              >
                <View style={styles.header}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => setTab("history")}
                    style={styles.chip}
                  >
                    <Text style={[{ color: colors.text }, styles.chipText]}>
                      ‹ Dépôts
                    </Text>
                  </Pressable>
                  <Text style={[{ color: colors.text }, styles.title]}>
                    Nouveau dépôt
                  </Text>
                </View>
                <ScrollView
                  ref={creationScroll}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ padding: 20 }}
                >
                  {!!message && (
                    <Text
                      accessibilityRole="alert"
                      style={[{ color: colors.text }, styles.message]}
                    >
                      {message}
                    </Text>
                  )}
                  <View style={styles.card}>
                    <Choices
                      value={String(step)}
                      onChange={(value) => advance(Number(value))}
                      values={[
                        ["0", "Client"],
                        ["1", "Articles"],
                        ["2", "Conditions"],
                        ["3", "Vérifier"],
                      ]}
                    />
                    <View style={step === 0 ? undefined : { display: "none" }}>
                      <Text style={[{ color: colors.text }, styles.step]}>
                        01 · DÉPOSANT
                      </Text>
                      <ClientPicker
                        clients={sellers}
                        value={sellerId}
                        onChange={setSellerId}
                        onCreate={onCreateClient}
                      />
                      <Field
                        label="Référence du dépôt"
                        value={reference}
                        onChangeText={setReference}
                      />
                      <Field
                        label="Date du dépôt (AAAA-MM-JJ)"
                        value={date}
                        onChangeText={setDate}
                      />
                      <Field
                        label="Échéance facultative (AAAA-MM-JJ)"
                        value={due}
                        onChangeText={setDue}
                      />
                      <Field
                        label="Conditions et notes"
                        value={notes}
                        onChangeText={setNotes}
                      />
                    </View>
                    <View style={step === 1 ? undefined : { display: "none" }}>
                      <Text style={[{ color: colors.text }, styles.step]}>
                        02 · ARTICLES CONFIÉS
                      </Text>
                      {rows.map((r, index) => (
                        <View key={r.key}>
                          <Pressable
                            accessibilityRole="button"
                            style={styles.listRow}
                            onPress={() => {
                              setMessage("");
                              setEditingDraft(r.key);
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[{ color: colors.text }, styles.title]}
                              >
                                {r.name || `Article ${index + 1}`}
                              </Text>
                              <Text
                                style={[{ color: colors.text }, styles.hint]}
                              >
                                {r.price
                                  ? `${r.price} € · Commission ${r.commission} %`
                                  : "Compléter les informations"}
                              </Text>
                            </View>
                            <Text
                              style={[{ color: colors.text }, styles.chipText]}
                            >
                              ›
                            </Text>
                          </Pressable>
                          {editingDraft === r.key && (
                            <Modal
                              visible
                              animationType="slide"
                              presentationStyle="fullScreen"
                              onRequestClose={() => setEditingDraft(null)}
                            >
                              <SafeAreaView style={styles.screen}>
                                <KeyboardAvoidingView
                                  style={{ flex: 1 }}
                                  behavior={
                                    Platform.OS === "ios"
                                      ? "padding"
                                      : undefined
                                  }
                                >
                                  <View style={styles.header}>
                                    <Pressable
                                      accessibilityRole="button"
                                      style={styles.chip}
                                      onPress={() => setEditingDraft(null)}
                                    >
                                      <Text
                                        style={[
                                          { color: colors.text },
                                          styles.chipText,
                                        ]}
                                      >
                                        ‹ Articles
                                      </Text>
                                    </Pressable>
                                    <Text
                                      style={[
                                        { color: colors.text },
                                        styles.title,
                                      ]}
                                    >
                                      Article {index + 1}
                                    </Text>
                                  </View>
                                  <ScrollView
                                    keyboardShouldPersistTaps="handled"
                                    contentContainerStyle={{ padding: 20 }}
                                  >
                                    {!!message && (
                                      <Text
                                        accessibilityRole="alert"
                                        style={[
                                          { color: colors.text },
                                          styles.message,
                                        ]}
                                      >
                                        {message}
                                      </Text>
                                    )}
                                    <Text
                                      style={[
                                        { color: colors.text },
                                        styles.title,
                                      ]}
                                    >
                                      Article confié
                                    </Text>
                                    <Choices
                                      value={r.productType}
                                      onChange={(productType) =>
                                        patch(r.key, { productType })
                                      }
                                      values={[
                                        ["sealed", "Scellé"],
                                        ["card", "Carte"],
                                        ["other", "Autre"],
                                      ]}
                                    />
                                    <Field
                                      label="Nom de l’article"
                                      value={r.name}
                                      onChangeText={(name) =>
                                        patch(r.key, { name })
                                      }
                                    />
                                    <Field
                                      label="Description"
                                      value={r.description}
                                      onChangeText={(description) =>
                                        patch(r.key, { description })
                                      }
                                    />
                                    <Field
                                      label="Série (facultatif)"
                                      value={r.series}
                                      onChangeText={(series) =>
                                        patch(r.key, { series })
                                      }
                                    />
                                    <Field
                                      label="Référence ou numéro (facultatif)"
                                      value={r.identifier}
                                      onChangeText={(identifier) =>
                                        patch(r.key, { identifier })
                                      }
                                    />
                                    <Choices
                                      value={r.language}
                                      onChange={(language) =>
                                        patch(r.key, { language })
                                      }
                                      values={[
                                        ["", "Langue libre"],
                                        ["fr", "FR"],
                                        ["en", "EN"],
                                        ["ja", "JA"],
                                      ]}
                                    />
                                    <Choices
                                      value={r.tcg}
                                      onChange={(tcg) => patch(r.key, { tcg })}
                                      values={[
                                        ["", "Sans jeu"],
                                        ["pokemon", "Pokémon"],
                                        ["riftbound", "Riftbound"],
                                      ]}
                                    />
                                    {r.productType === "card" && (
                                      <>
                                        <Choices
                                          value={r.condition}
                                          onChange={(condition) =>
                                            patch(r.key, { condition })
                                          }
                                          values={[
                                            "",
                                            "M",
                                            "NM",
                                            "EX",
                                            "GD",
                                            "LP",
                                            "PL",
                                            "PO",
                                          ].map(
                                            (v) =>
                                              [
                                                v as Draft["condition"],
                                                v || "État libre",
                                              ] as const,
                                          )}
                                        />
                                        <Choices
                                          value={r.gradingCompany}
                                          onChange={(gradingCompany) =>
                                            patch(r.key, { gradingCompany })
                                          }
                                          values={[
                                            "",
                                            "PSA",
                                            "CollectAura",
                                            "PCA",
                                            "CCC",
                                          ].map(
                                            (v) =>
                                              [
                                                v as Draft["gradingCompany"],
                                                v || "Non gradée",
                                              ] as const,
                                          )}
                                        />
                                        {r.gradingCompany ? (
                                          <>
                                            <Field
                                              label="Note de gradation"
                                              value={r.gradingGrade}
                                              onChangeText={(gradingGrade) =>
                                                patch(r.key, { gradingGrade })
                                              }
                                            />
                                            <Field
                                              label="Certificat"
                                              value={r.gradingCertificate}
                                              onChangeText={(
                                                gradingCertificate,
                                              ) =>
                                                patch(r.key, {
                                                  gradingCertificate,
                                                })
                                              }
                                            />
                                          </>
                                        ) : null}
                                      </>
                                    )}
                                    <Field
                                      label="Prix de vente convenu (€)"
                                      value={r.price}
                                      onChangeText={(price) =>
                                        patch(r.key, { price })
                                      }
                                      keyboardType="decimal-pad"
                                    />
                                    <Field
                                      label="Commission convenue (%) · repère 15–30 %"
                                      value={r.commission}
                                      onChangeText={(commission) =>
                                        patch(r.key, { commission })
                                      }
                                      keyboardType="decimal-pad"
                                    />
                                    {(() => {
                                      try {
                                        const price = amount(r.price, "Prix");
                                        const rate = amount(
                                          r.commission,
                                          "Commission",
                                          10000,
                                        );
                                        const commission = Math.round(
                                          (price * rate) / 10000,
                                        );
                                        return (
                                          <Text
                                            style={[
                                              { color: colors.text },
                                              styles.hint,
                                            ]}
                                          >
                                            Commission : {money(commission)} ·
                                            Déposant :{" "}
                                            {money(price - commission)}
                                          </Text>
                                        );
                                      } catch {
                                        return null;
                                      }
                                    })()}
                                    <AttachmentPreview
                                      current={r.photo}
                                      allowPdf
                                      onUse={(photo) => patch(r.key, { photo })}
                                    />
                                    {rows.length > 1 && (
                                      <Button
                                        label="Retirer cet article"
                                        onPress={() => {
                                          setRows((current) =>
                                            current.filter(
                                              (item) => item.key !== r.key,
                                            ),
                                          );
                                          setEditingDraft(null);
                                        }}
                                      />
                                    )}
                                  </ScrollView>
                                  <View style={styles.footer}>
                                    <Button
                                      label="Enregistrer l’article"
                                      onPress={() => finishArticle(r)}
                                    />
                                  </View>
                                </KeyboardAvoidingView>
                              </SafeAreaView>
                            </Modal>
                          )}
                        </View>
                      ))}
                      <Button
                        label="Ajouter un article"
                        onPress={() => {
                          const row = fresh();
                          setRows((current) => [...current, row]);
                          setEditingDraft(row.key);
                        }}
                      />
                    </View>
                    <View style={step === 2 ? undefined : { display: "none" }}>
                      <Text style={styles.title}>Conditions convenues</Text>
                      <Text style={styles.hint}>Renseignez le texte effectivement convenu avec le déposant : propriété, durée, modalités et délai de versement, restitution et garde des articles. Aucun texte juridique ou régime TVA n’est appliqué automatiquement.</Text>
                      <Field label="Version des conditions" value={contractVersion} onChangeText={setContractVersion}/>
                      <Field label="Conditions du contrat" value={contractTerms} onChangeText={setContractTerms} multiline maxLength={10000}/>
                      <Text style={styles.hint}>La commission est déduite du prix effectivement vendu. Aucun frais supplémentaire n’est ajouté par l’application. Une remise sous le prix convenu exige un nouvel accord.</Text>
                    </View>
                    <View style={step === 3 ? undefined : { display: "none" }}>
                      <Text style={[{ color: colors.text }, styles.title]}>
                        Vérifier le contrat
                      </Text>
                      <Text style={[{ color: colors.text }, styles.hint]}>
                        {sellers.find((s) => s._id === sellerId)?.name ||
                          "Déposant sélectionné"}{" "}
                        · {reference}
                      </Text>
                      <Text style={[{ color: colors.text }, styles.hint]}>
                        Dépôt : {date}
                        {due ? ` · Échéance : ${due}` : ""}
                      </Text>
                      {rows.map((row) => (
                        <Text key={row.key} style={{ color: colors.text }}>
                          {row.name} · {row.price} € · {row.commission} %
                        </Text>
                      ))}
                      <Text style={[{ color: colors.text }, styles.hint]}>
                        La commission porte sur le prix de vente. Les articles
                        restent distincts des rachats à la marge.
                      </Text>
                      <Text style={[{ color: colors.text }, styles.title]}>
                        Prix convenus :{" "}
                        {money(
                          rows.reduce(
                            (sum, r) =>
                              sum +
                              Math.round(
                                Number(r.price.replace(",", ".")) * 100 || 0,
                              ),
                            0,
                          ),
                        )}
                      </Text>
                      <Text style={[{ color: colors.text }, styles.hint]}>
                        Part prévisionnelle déposant :{" "}
                        {money(
                          rows.reduce((sum, r) => {
                            const price = Math.round(
                              Number(r.price.replace(",", ".")) * 100 || 0,
                            );
                            return (
                              sum +
                              price -
                              Math.round(
                                (price *
                                  Number(r.commission.replace(",", "."))) /
                                  100,
                              )
                            );
                          }, 0),
                        )}
                      </Text>
                      <Text style={styles.hint}>Conditions version {contractVersion} : {contractTerms}</Text>
                      <Text style={styles.hint}>Aucun versement n’est attesté. Après enregistrement : lecture du contrat, signatures, puis mise en vente.</Text>
                    </View>
                  </View>
                </ScrollView>
                <View style={styles.footer}>
                  <Button
                    label={
                      busy
                        ? "Enregistrement…"
                        : step === 3
                          ? "Préparer le contrat"
                          : "Continuer"
                    }
                    disabled={busy}
                    onPress={() =>
                      step === 3 ? void submit() : advance(step + 1)
                    }
                  />
                </View>
              </KeyboardAvoidingView>
            </SafeAreaView>
          </Modal>
        )}
        {tab === "history" && (
          <>
            <Pagination data={historyData} />
            {focusedDeposit &&
              !depositSnapshot &&
              !deposits.some((d) => d._id === focusedDeposit) && (
                <View style={styles.card}>
                  <Text style={[{ color: colors.text }, styles.hint]}>
                    {dossierLoading
                      ? "Chargement du dossier…"
                      : dossierError || "Dossier non présent sur cette page."}
                  </Text>
                  <Button label="Réessayer" onPress={() => void load()} />
                  <Button
                    label="Retour aux dépôts"
                    onPress={() => setFocusedDeposit(null)}
                  />
                </View>
              )}
            <View
              style={
                !focusedDeposit && deposits.length ? styles.group : undefined
              }
            >
              {(focusedDeposit
                ? [
                    depositSnapshot ??
                      deposits.find((d) => d._id === focusedDeposit),
                  ].filter((d): d is Consignment => Boolean(d))
                : deposits
              )
                .filter((d) =>
                  [d.reference, d.sellerName, ...d.items.map((i) => i.name)]
                    .join(" ")
                    .toLocaleLowerCase()
                    .includes(focusedDeposit ? "" : search.toLocaleLowerCase()),
                )
                .map((d) =>
                  !focusedDeposit ? (
                    <Pressable
                      key={d._id}
                      accessibilityRole="button"
                      onPress={() => {
                        setDepositSnapshot(d);
                        setFocusedDeposit(d._id);
                        setExpandedArticle(null);
                      }}
                      style={styles.depositRow}
                    >
                      <View style={styles.avatar}>
                        <Text
                          style={[{ color: colors.text }, styles.avatarText]}
                        >
                          {(d.sellerName || d.reference)
                            .split(" ")
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((part) => part[0])
                            .join("")
                            .toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={[{ color: colors.text }, styles.rowTitle]}>
                          {d.sellerName || d.reference}
                        </Text>
                        <Text
                          style={[{ color: colors.text }, styles.rowSubtitle]}
                        >
                          {d.items.length} article(s) ·{" "}
                          {
                            d.items.filter((item) => item.status === "sold")
                              .length
                          }{" "}
                          vendu(s)
                        </Text>
                        <Text
                          style={[{ color: colors.text }, styles.rowSubtitle]}
                        >
                          {d.reference}
                          {d.dueAt
                            ? ` · ${new Date(d.dueAt).toLocaleDateString("fr-BE")}`
                            : ""}
                        </Text>
                      </View>
                      <Text style={[{ color: colors.text }, styles.tag]}>
                        {d.flowVersion === 2 && d.contractStatus !== "signed" ? "À signer" : d.items.some((item) => item.status === "available")
                          ? "En cours"
                          : "Clôturé"}
                      </Text>
                      <Text style={[{ color: colors.text }, styles.chevron]}>
                        ›
                      </Text>
                    </Pressable>
                  ) : (
                    <Modal
                      key={d._id}
                      visible
                      animationType="slide"
                      presentationStyle="fullScreen"
                      onRequestClose={() => setFocusedDeposit(null)}
                    >
                      <SafeAreaView style={styles.screen}>
                        <KeyboardAvoidingView
                          style={{ flex: 1 }}
                          behavior={
                            Platform.OS === "ios" ? "padding" : undefined
                          }
                        >
                          <View style={styles.detailNav}>
                            <Pressable
                              accessibilityRole="button"
                              style={styles.inlineAction}
                              onPress={() => setFocusedDeposit(null)}
                            >
                              <Text style={styles.detailBack}>‹ Dépôts</Text>
                            </Pressable>
                            <Text style={styles.detailNavTitle}>
                              {d.reference}
                            </Text>
                            <View style={{ width: 65 }} />
                          </View>
                          <ScrollView
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={{ padding: 20 }}
                          >
                            <Text style={styles.detailTitle}>
                              {d.sellerName || "Dossier de dépôt"}
                            </Text>
                            <Text style={styles.detailSubtitle}>
                              {d.reference} ·{" "}
                              {new Date(d.occurredAt).toLocaleDateString(
                                "fr-BE",
                              )}
                              {d.dueAt
                                ? ` · Échéance ${new Date(d.dueAt).toLocaleDateString("fr-BE")}`
                                : ""}
                            </Text>
                            {!!message && (
                              <Text
                                accessibilityRole="alert"
                                style={[{ color: colors.text }, styles.message]}
                              >
                                {message}
                              </Text>
                            )}
                            {dossierLoading && (
                              <Text
                                style={[{ color: colors.text }, styles.hint]}
                              >
                                Actualisation du dossier…
                              </Text>
                            )}
                            {!!dossierError && (
                              <View style={styles.card}>
                                <Text
                                  accessibilityRole="alert"
                                  style={[
                                    { color: colors.text },
                                    styles.message,
                                  ]}
                                >
                                  {dossierError}
                                </Text>
                                <Button
                                  label="Actualiser le dossier"
                                  onPress={() => void load()}
                                />
                              </View>
                            )}
                            <View style={styles.hero}>
                              <Text
                                style={[{ color: colors.text }, styles.hint]}
                              >
                                Solde du déposant · tous ses dépôts
                              </Text>
                              <Text
                                style={[
                                  { color: colors.text },
                                  styles.heroAmount,
                                ]}
                              >
                                {depositorBalance
                                  ? money(depositorBalance.balanceCents)
                                  : balanceError
                                    ? "—"
                                    : "…"}
                              </Text>
                              <Text
                                style={[{ color: colors.text }, styles.tag]}
                              >
                                {balanceError ||
                                  (depositorBalance
                                    ? depositorBalance.balanceCents > 0
                                      ? "À reverser"
                                      : depositorBalance.balanceCents < 0
                                        ? "Régularisation"
                                        : "À jour"
                                    : "Chargement")}
                              </Text>
                            </View>
                            <Text style={styles.detailSubtitle}>
                              {
                                d.items.filter((item) => item.status === "sold")
                                  .length
                              }{" "}
                              vendu(s) ·{" "}
                              {
                                d.items.filter(
                                  (item) => item.status === "available",
                                ).length
                              }{" "}
                              disponible(s) ·{" "}
                              {
                                d.items.filter(
                                  (item) => item.status === "returned",
                                ).length
                              }{" "}
                              restitué(s)
                            </Text>
                            {!!d.notes && (
                              <Text style={styles.detailSubtitle}>
                                {d.notes}
                              </Text>
                            )}
                            <View style={styles.card}>
                              <Text
                                style={[{ color: colors.text }, styles.title]}
                              >
                                Articles confiés
                              </Text>
                              {d.items.map((item) => (
                                <View key={item._id} style={styles.article}>
                                  <Pressable
                                    accessibilityRole="button"
                                    onPress={() =>
                                      setExpandedArticle(
                                        expandedArticle === item._id
                                          ? null
                                          : item._id,
                                      )
                                    }
                                  >
                                    <Text
                                      style={[
                                        { color: colors.text },
                                        styles.title,
                                      ]}
                                    >
                                      {item.name}{" "}
                                      {expandedArticle === item._id ? "⌄" : "›"}
                                    </Text>
                                  </Pressable>
                                  <Text
                                    style={[
                                      { color: colors.text },
                                      styles.hint,
                                    ]}
                                  >
                                    {item.productType === "sealed"
                                      ? "Scellé"
                                      : item.productType === "other"
                                        ? "Autre article"
                                        : "Carte"}{" "}
                                    ·{" "}
                                    {item.status === "sold"
                                      ? "Vendu"
                                      : item.status === "returned"
                                        ? "Restitué"
                                        : "Disponible"}
                                  </Text>
                                  {expandedArticle === item._id && (
                                    <>
                                      {item.description ? (
                                        <Text
                                          style={[
                                            { color: colors.text },
                                            styles.hint,
                                          ]}
                                        >
                                          {item.description}
                                        </Text>
                                      ) : null}
                                      <Text
                                        style={[
                                          { color: colors.text },
                                          styles.hint,
                                        ]}
                                      >
                                        Prix convenu{" "}
                                        {money(
                                          item.agreedPriceCents ??
                                            item.askingPriceCents ??
                                            0,
                                        )}{" "}
                                        · Commission{" "}
                                        {(item.commissionRateBps ?? 3000) / 100}{" "}
                                        %
                                      </Text>
                                      {item.events?.map((event) => (
                                        <Text
                                          key={event._id}
                                          style={[
                                            { color: colors.text },
                                            styles.hint,
                                          ]}
                                        >
                                          {new Date(
                                            event.occurredAt,
                                          ).toLocaleDateString("fr-BE")}{" "}
                                          ·{" "}
                                          {event.kind === "return"
                                            ? "Restitution au déposant"
                                            : `Accord : ${money(event.askingPriceCents ?? 0)}, commission ${(event.commissionRateBps ?? 0) / 100} % · ${event.authorizationNote ?? ""}`}
                                        </Text>
                                      ))}
                                      {item.photos?.map((p) => (
                                        <Button
                                          key={p._id}
                                          label={p.filename}
                                          onPress={() =>
                                            void run(() =>
                                              openAttachment(
                                                p._id,
                                                p.filename,
                                                p.contentType,
                                              ),
                                            )
                                          }
                                        />
                                      ))}
                                      <AttachmentPreview
                                        current={null}
                                        allowPdf
                                        onUse={(photo) => {
                                          if (photo)
                                            void run(async () => {
                                              await uploadItemAttachment(
                                                item._id,
                                                photo,
                                              );
                                              await load();
                                            });
                                        }}
                                      />
                                      {item.status === "available" && (
                                        <>
                                          <Button
                                            label="Modifier l’accord"
                                            onPress={() => {
                                              setEditing(item);
                                              setTermPrice(
                                                (
                                                  (item.agreedPriceCents ??
                                                    item.askingPriceCents ??
                                                    0) / 100
                                                ).toFixed(2),
                                              );
                                              setTermRate(
                                                String(
                                                  (item.commissionRateBps ??
                                                    3000) / 100,
                                                ),
                                              );
                                              setAuthorization("");
                                            }}
                                          />
                                          <Button label="Préparer une restitution signée" onPress={()=>{setDocumentsOpen(true);setMessage("Sélectionnez les articles dans Documents et restitution.");}} />
                                        </>
                                      )}
                                      {editing?._id === item._id && (
                                        <View>
                                          <Field
                                            label="Nouveau prix convenu (€)"
                                            value={termPrice}
                                            onChangeText={setTermPrice}
                                            keyboardType="decimal-pad"
                                          />
                                          <Field
                                            label="Commission convenue (%)"
                                            value={termRate}
                                            onChangeText={setTermRate}
                                            keyboardType="decimal-pad"
                                          />
                                          <Field
                                            label="Autorisation du déposant (date et accord)"
                                            value={authorization}
                                            onChangeText={setAuthorization}
                                          />
                                          <Button
                                            label="Enregistrer l’accord autorisé"
                                            onPress={() =>
                                              void run(async () => {
                                                if (!authorization.trim())
                                                  throw new Error(
                                                    "Indiquez l’autorisation du déposant.",
                                                  );
                                                const input = {
                                                  itemId: item._id,
                                                  askingPriceCents: amount(
                                                    termPrice,
                                                    "Prix",
                                                  ),
                                                  commissionRateBps: amount(
                                                    termRate,
                                                    "Commission",
                                                    10000,
                                                  ),
                                                  authorizationNote:
                                                    authorization.trim(),
                                                };
                                                await updateConsignmentTerms({
                                                  ...input,
                                                  operationId: operation(
                                                    "terms",
                                                    input,
                                                  ),
                                                });
                                                attempts.current.delete(
                                                  `terms:${JSON.stringify(input)}`,
                                                );
                                                setEditing(null);
                                                await refresh();
                                              })
                                            }
                                          />
                                          <Button
                                            label="Fermer"
                                            onPress={() => setEditing(null)}
                                          />
                                        </View>
                                      )}
                                    </>
                                  )}
                                </View>
                              ))}
                            </View>
                            {d.flowVersion === 2 && d.contractStatus !== "signed" && <View style={styles.card}><Text style={styles.rowTitle}>Contrat à signer · révision {d.contractRevision ?? 1}</Text><Text style={styles.hint}>Les articles ne sont pas encore proposés à la vente. Après modification d’accord, préparez une nouvelle version dans les options du document.</Text><ReceiptSigning kind="consignment" targetId={d._id} onSigned={()=>{void refresh();}}/></View>}
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ expanded: documentsOpen }}
                              onPress={() => setDocumentsOpen(!documentsOpen)}
                              style={styles.documentRow}
                            >
                              <Text
                                style={[
                                  { color: colors.text },
                                  styles.rowTitle,
                                ]}
                              >
                                Contrat et documents
                              </Text>
                              <Text
                                style={[{ color: colors.text }, styles.chevron]}
                              >
                                {documentsOpen ? "⌄" : "›"}
                              </Text>
                            </Pressable>
                            {documentsOpen && (
                              <View style={styles.card}>
                                {" "}
                                <ReceiptSigning
                                  kind="consignment"
                                  targetId={d._id}
                                  onSigned={()=>{void refresh();}}
                                />
                                <ConsignmentDocuments deposit={d} onChanged={refresh}/>
                                <Pressable
                                  accessibilityRole="button"
                                  style={styles.chip}
                                  onPress={() =>
                                    void run(() => shareReceipt(d))
                                  }
                                >
                                  <Text
                                    style={[
                                      { color: colors.text },
                                      styles.chipText,
                                    ]}
                                  >
                                    Partager une copie non signée
                                  </Text>
                                </Pressable>
                                <Text
                                  style={[{ color: colors.text }, styles.hint]}
                                >
                                  Les reversements sont regroupés par déposant,
                                  pour l’ensemble de ses dépôts.
                                </Text>
                              </View>
                            )}
                          </ScrollView>
                          <View style={styles.footer}>
                            {" "}
                            <Button
                              label="Voir le solde du déposant"
                              onPress={() => {
                                setPaymentSearch(d.sellerName || "");
                                setBalanceFilter("all");
                                setFocusedDeposit(null);
                                setTab("payments");
                              }}
                            />
                          </View>
                        </KeyboardAvoidingView>
                      </SafeAreaView>
                    </Modal>
                  ),
                )}
            </View>
            {!historyData.loading &&
              !historyData.error &&
              !focusedDeposit &&
              !deposits.length && (
                <Text style={[{ color: colors.text }, styles.hint]}>
                  Aucun dépôt enregistré. Créez le premier dans Nouveau.
                </Text>
              )}
          </>
        )}
        {tab === "payments" && (
          <>
            <Text style={[{ color: colors.text }, styles.hint]}>
              Retrouvez les déposants à payer après encaissement de leurs
              ventes, puis marquez le versement effectué. Les ventes
              explicitement « À encaisser » ne sont pas encore dues. Les anciens
              encaissements non renseignés gardent leur traitement précédent.
            </Text>
            <View style={styles.card}>
              <Text style={[{ color: colors.text }, styles.title]}>
                {money(
                  balances.reduce(
                    (sum, b) => sum + Math.max(0, b.balanceCents),
                    0,
                  ),
                )}{" "}
                à reverser sur cette page
              </Text>
              <Text style={[{ color: colors.text }, styles.hint]}>
                {balances.filter((b) => b.balanceCents > 0).length} déposant(s)
                sur cette page
              </Text>
            </View>
            <Pagination data={balancesData} />
            {balances
              .filter(
                (b) =>
                  balanceFilter === "all" ||
                  (balanceFilter === "due"
                    ? b.balanceCents > 0
                    : balanceFilter === "regularization"
                      ? b.balanceCents < 0
                      : b.balanceCents === 0 &&
                        (b.earnedCents > 0 || b.paidCents > 0)),
              )
              .filter((b) => {
                const client = sellers.find((s) => s._id === b.sellerId);
                return [b.sellerName, client?.email, client?.phone]
                  .filter(Boolean)
                  .join(" ")
                  .toLocaleLowerCase("fr")
                  .includes(paymentSearch.trim().toLocaleLowerCase("fr"));
              })
              .map((b) => (
                <View key={b.sellerId} style={styles.card}>
                  <Text style={[{ color: colors.text }, styles.title]}>
                    {b.sellerName}
                  </Text>
                  <Text style={[{ color: colors.text }, styles.hint]}>
                    Part déposant exigible : {money(b.earnedCents)}
                  </Text>
                  <Text style={[{ color: colors.text }, styles.hint]}>
                    Déjà versé : {money(b.paidCents)}
                  </Text>
                  <Text style={[{ color: colors.text }, styles.title]}>
                    {b.balanceCents < 0
                      ? `Régularisation à récupérer : ${money(-b.balanceCents)}`
                      : `À reverser : ${money(b.balanceCents)}`}
                  </Text>
                  {b.balanceCents > 0 && (
                    <Button
                      label="Marquer payé"
                      onPress={() => {
                        setMessage("");
                        setPaymentSeller(b.sellerId);
                        setPaymentAmount((b.balanceCents / 100).toFixed(2));
                        setPaymentReference("");
                        setPaymentDate(today());
                        setPaymentMethod("Virement");
                      }}
                    />
                  )}
                </View>
              ))}
            {!balancesData.loading &&
              !balancesData.error &&
              balanceFilter === "due" &&
              !balances.some((b) => b.balanceCents > 0) && (
                <Text style={[{ color: colors.text }, styles.hint]}>
                  Tous les déposants sont à jour : aucune somme à reverser.
                </Text>
              )}
            {paymentSeller && (
              <Modal
                visible
                animationType="slide"
                transparent
                onRequestClose={() => {
                  if (!busy) setPaymentSeller("");
                }}
              >
                <View style={styles.modalBackdrop}>
                  <View style={styles.modalCard}>
                    <ScrollView
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={styles.modalContent}
                    >
                      <Text style={[{ color: colors.text }, styles.title]}>
                        Versement à{" "}
                        {
                          balances.find((b) => b.sellerId === paymentSeller)
                            ?.sellerName
                        }
                      </Text>
                      {!!message && (
                        <Text
                          accessibilityRole="alert"
                          style={[{ color: colors.text }, styles.message]}
                        >
                          {message}
                        </Text>
                      )}
                      <Field
                        label="Montant versé (€)"
                        value={paymentAmount}
                        onChangeText={setPaymentAmount}
                        keyboardType="decimal-pad"
                      />
                      <Field
                        label="Date du versement (AAAA-MM-JJ)"
                        value={paymentDate}
                        onChangeText={setPaymentDate}
                      />
                      <Text style={[{ color: colors.text }, styles.title]}>
                        Mode du versement effectué
                      </Text>
                      <Choices
                        value={paymentMethod}
                        onChange={setPaymentMethod}
                        values={[
                          ["Virement", "Virement"],
                          ["Espèces", "Espèces"],
                        ]}
                      />
                      <Field
                        label="Référence du paiement"
                        value={paymentReference}
                        onChangeText={setPaymentReference}
                      />
                      <Text style={[{ color: colors.text }, styles.hint]}>
                        Enregistrez uniquement un paiement déjà effectué. Vous
                        pouvez réduire le montant pour un versement partiel ;
                        aucun transfert d’argent n’est déclenché.
                      </Text>
                      <Button
                        disabled={busy}
                        label={
                          busy ? "Enregistrement…" : "Confirmer : je l’ai payé"
                        }
                        onPress={() =>
                          void run(async () => {
                            const amountCents = amount(
                              paymentAmount,
                              "Montant",
                            );
                            if (
                              amountCents <= 0 ||
                              amountCents >
                                (balances.find(
                                  (b) => b.sellerId === paymentSeller,
                                )?.balanceCents ?? 0)
                            )
                              throw new Error(
                                "Le montant doit être positif et ne pas dépasser le solde.",
                              );
                            if (!paymentMethod.trim())
                              throw new Error("Indiquez le mode de paiement.");
                            const input = {
                              sellerId: paymentSeller,
                              amountCents,
                              occurredAt: dateValue(paymentDate),
                              method: paymentMethod.trim(),
                              reference: paymentReference.trim() || undefined,
                            };
                            await recordConsignmentPayment({
                              ...input,
                              operationId: operation("payment", input),
                            });
                            attempts.current.delete(
                              `payment:${JSON.stringify(input)}`,
                            );
                            setPaymentSeller("");
                            await load();
                            setMessage("Versement enregistré.");
                          })
                        }
                      />
                      <Button
                        disabled={busy}
                        label="Annuler"
                        onPress={() => setPaymentSeller("")}
                      />
                    </ScrollView>
                  </View>
                </View>
              </Modal>
            )}
            <Text style={[{ color: colors.text }, styles.title]}>
              Historique des versements
            </Text>
            <Pagination data={paymentsData} />
            {payments.map((p) => (
              <View key={p._id} style={styles.card}>
                <Text style={[{ color: colors.text }, styles.title]}>
                  {p.sellerName} · {money(p.amountCents)}
                </Text>
                <Text style={[{ color: colors.text }, styles.hint]}>
                  {new Date(p.occurredAt).toLocaleDateString("fr-BE")} ·{" "}
                  {p.method}
                  {p.reference ? ` · ${p.reference}` : ""}
                </Text>
              </View>
            ))}
          </>
        )}
      </View>
    </View>
  );
}
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    sheetOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: colors.overlay,
    },
    filterSheet: {
      maxHeight: "85%",
      backgroundColor: colors.background,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      overflow: "hidden",
    },
    sheetHandle: {
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.placeholder,
      alignSelf: "center",
      marginTop: 10,
    },
    filterFormRow: {
      minHeight: 49,
      paddingHorizontal: 15,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 15,
    },
    filterFormLabel: { fontSize: 15, color: colors.text, flex: 1 },
    filterFormValue: { fontSize: 14, color: colors.secondary },
    sheetPrimary: {
      minHeight: 49,
      borderRadius: 13,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 6,
    },
    sheetPrimaryText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.onAccent,
    },
    detailNav: {
      height: 51,
      paddingHorizontal: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    detailBack: { fontSize: 15, color: colors.accent },
    detailNavTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.text,
      flex: 1,
      textAlign: "center",
    },
    detailTitle: {
      fontSize: 32,
      fontWeight: "700",
      letterSpacing: -1,
      color: colors.text,
      marginBottom: 7,
    },
    detailSubtitle: { fontSize: 13, color: colors.secondary, marginBottom: 18 },
    sheetHeader: {
      height: 56,
      paddingHorizontal: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sheetTitle: { fontSize: 19, fontWeight: "700", color: colors.text },
    inlineAction: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 44,
      backgroundColor: colors.border,
      borderRadius: 11,
      paddingHorizontal: 12,
      marginBottom: 18,
    },
    searchInput: { flex: 1, minHeight: 44, fontSize: 15, color: colors.text },
    searchIcon: { fontSize: 22, color: colors.secondary },
    sectionLabel: {
      fontSize: 12,
      color: colors.secondary,
      marginBottom: 10,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    segments: {
      flexDirection: "row",
      padding: 3,
      borderRadius: 9,
      backgroundColor: colors.border,
      marginTop: 15,
      marginBottom: 12,
    },
    segment: {
      flex: 1,
      minHeight: 32,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 7,
    },
    segmentActive: {
      backgroundColor: colors.surface,
      shadowColor: colors.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 2,
      shadowOffset: { width: 0, height: 1 },
    },
    segmentText: { fontSize: 12, color: colors.text },
    group: {
      borderRadius: 15,
      overflow: "hidden",
      backgroundColor: colors.surface,
      marginVertical: 12,
    },
    depositRow: {
      flexDirection: "row",
      gap: 11,
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 15,
      minHeight: 72,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    avatar: {
      height: 41,
      width: 41,
      borderRadius: 21,
      backgroundColor: colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { fontSize: 14, fontWeight: "600", color: colors.accent },
    rowTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
    rowSubtitle: { fontSize: 12, color: colors.secondary },
    tag: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.accent,
      backgroundColor: colors.accentSoft,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 7,
    },
    chevron: { fontSize: 21, color: colors.secondary },
    hero: {
      alignItems: "center",
      padding: 20,
      borderRadius: 16,
      backgroundColor: colors.surface,
      marginVertical: 12,
      gap: 7,
    },
    heroAmount: {
      fontSize: 34,
      fontWeight: "700",
      letterSpacing: -1,
      color: colors.text,
    },
    documentRow: {
      minHeight: 57,
      paddingHorizontal: 15,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderRadius: 15,
      backgroundColor: colors.surface,
      marginVertical: 12,
    },
    screen: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      backgroundColor: colors.surface,
    },
    footer: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 18,
      backgroundColor: colors.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    listRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      padding: 20,
      justifyContent: "center",
    },
    modalCard: {
      maxHeight: "85%",
      backgroundColor: colors.surface,
      borderRadius: 14,
    },
    modalContent: { padding: 20 },
    step: {
      color: colors.secondary,
      fontSize: 12,
      fontWeight: "700",
      marginVertical: 12,
    },
    heading: {
      fontSize: 25,
      fontWeight: "700",
      color: colors.accent,
      marginBottom: 12,
    },
    title: {
      fontSize: 17,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 6,
    },
    card: {
      padding: 16,
      backgroundColor: colors.surface,
      borderRadius: 16,
      marginVertical: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    article: {
      borderTopWidth: 1,
      borderColor: colors.border,
      paddingTop: 14,
      marginTop: 14,
    },
    hint: {
      color: colors.secondary,
      fontSize: 13,
      lineHeight: 18,
      marginVertical: 4,
    },
    message: {
      color: colors.accent,
      backgroundColor: colors.infoSoft,
      padding: 12,
      marginVertical: 8,
      borderRadius: 8,
    },
    row: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
    chip: {
      minHeight: 44,
      justifyContent: "center",
      padding: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      backgroundColor: colors.surface,
    },
    selected: { backgroundColor: colors.infoSoft, borderColor: colors.accent },
    chipText: { color: colors.accent, fontWeight: "600" },
    button: {
      minHeight: 49,
      justifyContent: "center",
      padding: 14,
      marginVertical: 5,
      backgroundColor: colors.accent,
      borderRadius: 13,
      alignItems: "center",
    },
    buttonText: { color: colors.onAccent, fontWeight: "600" },
    disabled: { opacity: 0.5 },
  });
