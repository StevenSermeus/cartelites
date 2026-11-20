import { useTheme, type ThemeColors } from "../theme/ThemeProvider";
import * as Crypto from "expo-crypto";
import { usePagedData } from "../data/usePagedData";
import { Pagination } from "../components/Pagination";
import { ItemThumbnail } from "../components/ItemThumbnail";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Image,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  type GradingCompany,
  type Item,
  type Seller,
  updateStockVisibility,
} from "../data/apiRepository";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");

const conditionLabels: Record<string, string> = {
  M: "Mint",
  NM: "Near Mint",
  EX: "Excellent",
  GD: "Good",
  LP: "Light Played",
  PL: "Played",
  PO: "Poor",
};
const languageLabels: Record<string, string> = {
  fr: "Français",
  en: "Anglais",
  ja: "Japonais",
};
const companyLabels: Record<GradingCompany, string> = {
  PSA: "PSA",
  CollectAura: "Collect Aura",
  PCA: "PCA",
  CCC: "CCC Grading",
};
const gradingLogos: Record<GradingCompany, string> = {
  PSA: "https://cdn.shopify.com/s/files/1/0618/5998/7608/files/psa-logo-2.png?v=1768810462",
  CollectAura: "https://status.collectaura.com/collectaura-logo.png",
  PCA: "https://primary.jwwb.nl/public/r/b/j/temp-profycumnjgwqpqpzroz/pca_logo-high.png?crop=1.6667%3A1&enable=upscale&enable-io=true&width=800",
  CCC: "https://s3-eu-west-1.amazonaws.com/tpd/logos/6214fd59aa75da9ec8d9ba3d/0x0.png",
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
  const { colors, dark } = useTheme();
  const styles = createStyles(colors);

  const label = companyLabels[company];
  const companyStyle =
    company === "PSA"
      ? styles.gradingBadgePSA
      : company === "CollectAura"
        ? styles.gradingBadgeCollectAura
        : company === "PCA"
          ? styles.gradingBadgePCA
          : styles.gradingBadgeCCC;
  return (
    <View
      style={[styles.gradingBadge, companyStyle]}
      accessibilityLabel={`${label}, gradée ${grade || "note non renseignée"}${certificate ? `, certificat ${certificate}` : ""}`}
    >
      <View style={company === "CCC" ? styles.cccLogoPlate : undefined}>
        <Image
          accessibilityLabel={label}
          source={{ uri: gradingLogos[company] }}
          style={[
            styles.gradingCompanyLogo,
            company === "CCC" && styles.cccCompanyLogo,
          ]}
          resizeMode="contain"
        />
      </View>
      <View style={styles.gradingScore}>
        <Text style={[{ color: colors.text }, styles.gradingCaption]}>
          GRADÉE
        </Text>
        <Text style={[{ color: colors.text }, styles.gradingValue]}>
          {grade || "—"}
        </Text>
      </View>
      {certificate ? (
        <Text style={[{ color: colors.text }, styles.gradingCertificate]}>
          Cert. {certificate}
        </Text>
      ) : null}
    </View>
  );
}

export function StockScreen({
  items,
  sellers,
  selectedIds,
  salePrices,
  onChangeSalePrice,
  askingPriceEdits,
  onChangeAskingPrice,
  onSaveAskingPrice,
  onToggle,
  onOpenSales,
  onRefresh,
  onVisibilitySaved,
  revision = 0,
  onFilterControlChange,
}: {
  revision?: number;
  onFilterControlChange?: (
    control: { open: () => void; count: number } | null,
  ) => void;
  items: Item[];
  sellers: Seller[];
  selectedIds: string[];
  salePrices: Record<string, string>;
  onChangeSalePrice: (itemId: string, value: string) => void;
  askingPriceEdits: Record<string, string>;
  onChangeAskingPrice: (itemId: string, value: string) => void;
  onSaveAskingPrice: (itemId: string) => Promise<void>;
  onToggle: (item: Item) => void;
  onOpenSales: () => void;
  onRefresh: () => Promise<void>;
  onVisibilitySaved: (itemIds: string[], hidden: boolean) => void;
}) {
  const { colors, dark } = useTheme();
  const styles = createStyles(colors);

  const [focusedItem, setFocusedItem] = useState<Item | null>(null);
  const [priceSaving, setPriceSaving] = useState(false);
  const [priceMessage, setPriceMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibilityToolsOpen, setVisibilityToolsOpen] = useState(false);
  const [visibility, setVisibility] = useState<"all" | "visible" | "hidden">(
    "all",
  );
  const [visibilityIds, setVisibilityIds] = useState<string[]>([]);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [visibilityMessage, setVisibilityMessage] = useState("");
  const [visibilityError, setVisibilityError] = useState("");
  const visibilityRunning = useRef(false);
  const visibilityAttempt = useRef<{
    signature: string;
    operationId: string;
  } | null>(null);
  async function setHidden(itemIds: string[], hidden: boolean) {
    if (visibilityRunning.current || !itemIds.length || itemIds.length > 500)
      return;
    visibilityRunning.current = true;
    setVisibilityBusy(true);
    setVisibilityError("");
    setVisibilityMessage("");
    let saved = false;
    try {
      const ids = [...new Set(itemIds)].sort();
      const signature = JSON.stringify({ itemIds: ids, hidden });
      if (visibilityAttempt.current?.signature !== signature)
        visibilityAttempt.current = {
          signature,
          operationId: Crypto.randomUUID(),
        };
      const result = await updateStockVisibility({
        itemIds: ids,
        hidden,
        operationId: visibilityAttempt.current.operationId,
      });
      saved = true;
      setFocusedItem((item) =>
        item && ids.includes(item._id)
          ? { ...item, hiddenFromCatalogue: hidden }
          : item,
      );
      onVisibilitySaved(ids, hidden);
      visibilityAttempt.current = null;
      setVisibilityIds([]);
      await onRefresh();
      data.reload();
      setVisibilityMessage(
        `${result.updatedCount} article(s) ${hidden ? "masqué(s) du" : "visible(s) dans le"} catalogue public.`,
      );
    } catch (error) {
      setVisibilityError(
        saved
          ? "Visibilité enregistrée, mais le stock n’a pas pu être actualisé. Actualisez avant de continuer."
          : error instanceof Error
            ? error.message
            : "La visibilité n’a pas pu être mise à jour. Réessayez.",
      );
    } finally {
      setVisibilityBusy(false);
      visibilityRunning.current = false;
    }
  }

  const [origin, setOrigin] = useState<"all" | "purchase" | "consignment">(
    "all",
  );
  const [productType, setProductType] = useState<
    "all" | "card" | "sealed" | "other"
  >("all");
  const [gradingStatus, setGradingStatus] = useState<
    "all" | "graded" | "ungraded"
  >("all");
  const [gradingCompany, setGradingCompany] = useState<"all" | GradingCompany>(
    "all",
  );
  const [gradingText, setGradingText] = useState("");

  const filterCount =
    Number(productType !== "all") +
    Number(origin !== "all") +
    Number(visibility !== "all") +
    Number(gradingStatus !== "all") +
    Number(gradingCompany !== "all") +
    Number(Boolean(gradingText.trim()));
  useEffect(() => {
    onFilterControlChange?.(
      focusedItem
        ? null
        : { open: () => setFiltersOpen(true), count: filterCount },
    );
    return () => onFilterControlChange?.(null);
  }, [onFilterControlChange, filterCount, focusedItem]);
  const [pageSize, setPageSize] = useState(20);
  const data = usePagedData<Item>(
    "/stock",
    {
      search,
      visibility,
      origin,
      productType,
      gradingStatus,
      gradingCompany,
      gradingText,
      size: pageSize,
    },
    true,
    revision,
  );
  const filtered = data.items;
  const pageItems = data.items;
  const filterKey = JSON.stringify([
    search,
    productType,
    gradingStatus,
    gradingCompany,
    gradingText,
    pageSize,
    origin,
    visibility,
  ]);
  const previousFilter = useRef(filterKey);
  useEffect(() => {
    if (previousFilter.current !== filterKey) {
      previousFilter.current = filterKey;

      setVisibilityIds([]);
    }
  }, [filterKey]);
  const selectedVisibilityIds = visibilityIds.filter((id) =>
    filtered.some((item) => item._id === id),
  );
  function toggleVisibilitySelection(id: string) {
    setVisibilityIds((ids) =>
      ids.includes(id)
        ? ids.filter((value) => value !== id)
        : ids.length < 500
          ? [...ids, id]
          : ids,
    );
  }

  function filterChoice<T extends string>(
    title: string,
    value: T,
    choices: readonly (readonly [T, string])[],
    change: (value: T) => void,
  ) {
    const choose = () => {
      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title,
            options: [...choices.map(([, label]) => label), "Annuler"],
            cancelButtonIndex: choices.length,
            userInterfaceStyle: dark ? "dark" : "light",
          },
          (index) => {
            if (index < choices.length) change(choices[index][0]);
          },
        );
      } else
        Alert.alert(title, undefined, [
          ...choices.map(([key, label]) => ({
            text: label,
            onPress: () => change(key),
          })),
          { text: "Annuler", style: "cancel" },
        ]);
    };
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title} : ${choices.find(([key]) => key === value)?.[1] ?? value}`}
        onPress={choose}
        style={styles.filterFormRow}
      >
        <Text style={styles.filterFormLabel}>{title}</Text>
        <Text style={styles.filterFormValue}>
          {choices.find(([key]) => key === value)?.[1] ?? value} ›
        </Text>
      </Pressable>
    );
  }
  const pagination = () =>
    data.loading || data.error || data.hasPrevious || data.nextCursor ? (
      <Pagination data={data} />
    ) : null;
  return (
    <View pointerEvents={visibilityBusy ? "none" : "auto"}>
      <Modal
        visible={filtersOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setFiltersOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.sheetOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fermer les filtres"
            style={StyleSheet.absoluteFill}
            onPress={() => setFiltersOpen(false)}
          />
          <SafeAreaView edges={["bottom"]} style={styles.filterSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Rechercher et filtrer</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setFiltersOpen(false)}
                style={styles.inlineAction}
              >
                <Text style={styles.inlineActionText}>Fermer</Text>
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
                  accessibilityLabel="Rechercher le stock"
                  placeholder="Carte, référence ou client"
                  placeholderTextColor={colors.secondary}
                  value={search}
                  onChangeText={setSearch}
                  style={styles.search}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                  keyboardAppearance={dark ? "dark" : "light"}
                />
              </View>
              <View style={styles.filterFormGroup}>
                {filterChoice(
                  "Type",
                  productType,
                  [
                    ["all", "Tous"],
                    ["card", "Cartes"],
                    ["sealed", "Scellé"],
                    ["other", "Autres"],
                  ] as const,
                  setProductType,
                )}
                {filterChoice(
                  "Visibilité",
                  visibility,
                  [
                    ["all", "Tous"],
                    ["visible", "Visibles"],
                    ["hidden", "Masqués"],
                  ] as const,
                  setVisibility,
                )}
                {filterChoice(
                  "Origine",
                  origin,
                  [
                    ["all", "Toutes"],
                    ["purchase", "Rachats"],
                    ["consignment", "Dépôts-ventes"],
                  ] as const,
                  setOrigin,
                )}
                {filterChoice(
                  "Gradation",
                  gradingStatus,
                  [
                    ["all", "Toutes"],
                    ["graded", "Gradées"],
                    ["ungraded", "Non gradées"],
                  ] as const,
                  setGradingStatus,
                )}
                {filterChoice(
                  "Société",
                  gradingCompany,
                  [
                    ["all", "Toutes"],
                    ["PSA", "PSA"],
                    ["CollectAura", "CollectAura"],
                    ["PCA", "PCA"],
                    ["CCC", "CCC"],
                  ] as const,
                  setGradingCompany,
                )}
                <View style={styles.filterFormRow}>
                  <TextInput
                    accessibilityLabel="Note ou numéro de certification"
                    placeholder="Note ou certificat"
                    value={gradingText}
                    onChangeText={setGradingText}
                    style={styles.filterFormInput}
                    keyboardAppearance={dark ? "dark" : "light"}
                    placeholderTextColor={colors.placeholder}
                  />
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                style={styles.inlineAction}
                onPress={() => {
                  setVisibility("all");
                  setOrigin("all");
                  setProductType("all");
                  setGradingStatus("all");
                  setGradingCompany("all");
                  setGradingText("");
                }}
              >
                <Text style={styles.inlineActionText}>
                  Réinitialiser les filtres
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.sheetPrimary}
                onPress={() => setFiltersOpen(false)}
              >
                <Text style={styles.sheetPrimaryText}>
                  {data.loading || data.error
                    ? "Afficher les résultats"
                    : `Afficher ${data.items.length} résultat${data.items.length === 1 ? "" : "s"}${data.nextCursor || data.hasPrevious ? " sur cette page" : ""}`}
                </Text>
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
      {!focusedItem && (
        <>
          <View style={styles.filterRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: visibilityToolsOpen }}
              onPress={() => setVisibilityToolsOpen((value) => !value)}
              style={styles.inlineAction}
            >
              <Text style={[{ color: colors.text }, styles.inlineActionText]}>
                Visibilité en lot
                {selectedVisibilityIds.length
                  ? ` · ${selectedVisibilityIds.length}`
                  : ""}
              </Text>
            </Pressable>
          </View>
          <View
            style={[
              styles.visibilityToolbar,
              !visibilityToolsOpen && { display: "none" },
            ]}
          >
            <Text style={[{ color: colors.text }, styles.title]}>
              Visibilité en lot · {selectedVisibilityIds.length} sélectionné(s)
            </Text>
            <View style={styles.filterRow}>
              <Pressable
                accessibilityRole="button"
                disabled={!pageItems.length}
                style={styles.pageButton}
                onPress={() =>
                  setVisibilityIds(pageItems.map((item) => item._id))
                }
              >
                <Text style={[{ color: colors.text }, styles.pageButtonText]}>
                  Sélectionner cette page
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!selectedVisibilityIds.length}
                style={styles.pageButton}
                onPress={() => setVisibilityIds([])}
              >
                <Text style={[{ color: colors.text }, styles.pageButtonText]}>
                  Effacer la sélection
                </Text>
              </Pressable>
            </View>
            {filtered.length > 500 && (
              <Text style={[{ color: colors.text }, styles.details]}>
                Maximum 500 articles par opération. Affinez la recherche ou
                sélectionnez une page.
              </Text>
            )}
            <View style={styles.filterRow}>
              <Pressable
                accessibilityRole="button"
                disabled={!selectedVisibilityIds.length || visibilityBusy}
                style={[
                  styles.button,
                  (!selectedVisibilityIds.length || visibilityBusy) &&
                    styles.pageButtonDisabled,
                ]}
                onPress={() => void setHidden(selectedVisibilityIds, true)}
              >
                <Text style={[{ color: colors.text }, styles.buttonText]}>
                  Masquer la sélection
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!selectedVisibilityIds.length || visibilityBusy}
                style={[
                  styles.button,
                  (!selectedVisibilityIds.length || visibilityBusy) &&
                    styles.pageButtonDisabled,
                ]}
                onPress={() => void setHidden(selectedVisibilityIds, false)}
              >
                <Text style={[{ color: colors.text }, styles.buttonText]}>
                  Afficher la sélection
                </Text>
              </Pressable>
            </View>
            <Text style={[{ color: colors.text }, styles.details]}>
              Cette sélection est indépendante du panier de vente. Changer les
              filtres l’efface.
            </Text>
            {visibilityBusy && (
              <Text style={[{ color: colors.text }, styles.details]}>
                Mise à jour de la visibilité…
              </Text>
            )}
            {!!visibilityMessage && (
              <Text
                accessibilityRole="alert"
                style={[{ color: colors.text }, styles.details]}
              >
                {visibilityMessage}
              </Text>
            )}
            {!!visibilityError && (
              <View>
                <Text
                  accessibilityRole="alert"
                  style={[{ color: colors.text }, styles.visibilityError]}
                >
                  {visibilityError}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  style={styles.pageButton}
                  onPress={() =>
                    void onRefresh()
                      .then(() => setVisibilityError(""))
                      .catch((error) =>
                        setVisibilityError(
                          error instanceof Error
                            ? error.message
                            : "Actualisation impossible.",
                        ),
                      )
                  }
                >
                  <Text style={[{ color: colors.text }, styles.pageButtonText]}>
                    Actualiser le stock
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
          {selectedIds.length > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={onOpenSales}
              style={styles.cart}
            >
              <Text style={[{ color: colors.text }, styles.cartText]}>
                Panier · {selectedIds.length} article(s) ›
              </Text>
              <Text style={[{ color: colors.text }, styles.details]}>
                Voir les prix et passer au paiement
              </Text>
            </Pressable>
          )}
        </>
      )}
      <View style={!focusedItem && pageItems.length ? styles.group : undefined}>
        {(focusedItem ? [focusedItem] : pageItems).map((item) => {
          if (!focusedItem)
            return (
              <Pressable
                key={item._id}
                accessibilityRole="button"
                accessibilityLabel={`Ouvrir ${item.name}`}
                onPress={() => {
                  if (visibilityToolsOpen) toggleVisibilitySelection(item._id);
                  else {
                    setPriceMessage("");
                    setVisibilityMessage("");
                    setVisibilityError("");
                    setFocusedItem(item);
                  }
                }}
                style={styles.compactRow}
              >
                {visibilityToolsOpen && (
                  <Text
                    accessibilityLabel={
                      selectedVisibilityIds.includes(item._id)
                        ? "Sélectionné"
                        : "Non sélectionné"
                    }
                    style={{ color: colors.text }}
                  >
                    {selectedVisibilityIds.includes(item._id) ? "☑" : "☐"}
                  </Text>
                )}
                <ItemThumbnail item={item} style={{ width: 46, height: 64 }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[{ color: colors.text }, styles.title]}>
                    {item.name}
                  </Text>
                  <Text style={[{ color: colors.text }, styles.details]}>
                    {[item.series, item.identifier].filter(Boolean).join(" · ")}
                  </Text>
                  <Text style={[{ color: colors.text }, styles.details]}>
                    {item.gradingCompany
                      ? `${item.gradingCompany} ${item.gradingGrade ?? ""}`
                      : `${languageLabels[item.language ?? "fr"]} · ${conditionLabels[item.condition ?? "NM"]}`}
                    {item.origin === "consignment" ? " · Dépôt" : ""}
                    {item.hiddenFromCatalogue ? " · Masqué" : " · En ligne"}
                  </Text>
                </View>
                <Text style={[{ color: colors.text }, styles.rowPrice]}>
                  {item.askingPriceCents === undefined
                    ? "—"
                    : (item.askingPriceCents / 100).toLocaleString("fr-BE", {
                        style: "currency",
                        currency: "EUR",
                      })}{" "}
                  ›
                </Text>
              </Pressable>
            );
          const selected = selectedIds.includes(item._id);
          return (
            <Modal
              key={item._id}
              visible
              animationType="slide"
              presentationStyle="fullScreen"
              onRequestClose={() => setFocusedItem(null)}
            >
              <SafeAreaView
                style={{ flex: 1, backgroundColor: colors.background }}
              >
                <KeyboardAvoidingView
                  style={{ flex: 1 }}
                  behavior={Platform.OS === "ios" ? "padding" : undefined}
                >
                  <View style={styles.detailHeader}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setFocusedItem(null)}
                      style={styles.back}
                    >
                      <Text
                        style={[{ color: colors.text }, styles.pageButtonText]}
                      >
                        ‹ Stock
                      </Text>
                    </Pressable>
                    <Text style={[{ color: colors.text }, styles.title]}>
                      Fiche article
                    </Text>
                  </View>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ padding: 20 }}
                  >
                    <Text style={[{ color: colors.text }, styles.detailTitle]}>
                      {item.name}
                    </Text>
                    <View style={styles.hero}>
                      <ItemThumbnail item={item} style={styles.cardImage} />
                      <Text style={[{ color: colors.text }, styles.heroTitle]}>
                        {[item.name, item.identifier]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                      <Text style={[{ color: colors.text }, styles.tag]}>
                        Disponible
                      </Text>
                    </View>
                    <View style={styles.card}>
                      <View style={styles.formRow}>
                        <Text
                          style={[{ color: colors.text }, styles.formLabel]}
                        >
                          Visible sur le site
                        </Text>
                        <Switch
                          accessibilityLabel="Visible sur le site"
                          value={!item.hiddenFromCatalogue}
                          disabled={visibilityBusy}
                          trackColor={{ true: colors.accent }}
                          onValueChange={(visible) =>
                            void setHidden([item._id], !visible)
                          }
                        />
                      </View>
                      <Text
                        style={[
                          { color: colors.text },
                          item.hiddenFromCatalogue
                            ? styles.hiddenBadge
                            : styles.details,
                        ]}
                      >
                        {item.hiddenFromCatalogue
                          ? "Masqué du catalogue"
                          : "Visible dans le catalogue"}
                      </Text>
                      {item.origin === "consignment" && (
                        <Text
                          style={[{ color: colors.text }, styles.filterText]}
                        >
                          Dépôt-vente ·{" "}
                          {item.productType === "sealed"
                            ? "Scellé"
                            : item.productType === "other"
                              ? "Autre article"
                              : "Carte"}
                        </Text>
                      )}
                      <Text style={[{ color: colors.text }, styles.details]}>
                        {[item.series, item.identifier, item.serialNumber]
                          .filter(Boolean)
                          .join(" · ") || "Sans référence"}
                      </Text>
                      {item.gradingCompany ? (
                        <GradingBadge
                          company={item.gradingCompany}
                          grade={item.gradingGrade}
                          certificate={item.gradingCertificate}
                        />
                      ) : null}
                      {item.gradingCompany && item.gradingNotes ? (
                        <Text style={[{ color: colors.text }, styles.details]}>
                          Notes : {item.gradingNotes}
                        </Text>
                      ) : null}
                      {!!visibilityMessage && (
                        <Text
                          accessibilityRole="alert"
                          style={[{ color: colors.text }, styles.details]}
                        >
                          {visibilityMessage}
                        </Text>
                      )}
                      {!!visibilityError && (
                        <Text
                          accessibilityRole="alert"
                          style={[
                            { color: colors.text },
                            styles.visibilityError,
                          ]}
                        >
                          {visibilityError}
                        </Text>
                      )}
                      <View style={styles.formRow}>
                        <Text
                          style={[{ color: colors.text }, styles.formLabel]}
                        >
                          Prix de vente (€)
                        </Text>
                        <TextInput
                          accessibilityLabel={`Prix de vente demandé pour ${item.name}`}
                          keyboardType="decimal-pad"
                          value={
                            askingPriceEdits[item._id] ??
                            (item.askingPriceCents === undefined
                              ? ""
                              : (item.askingPriceCents / 100).toFixed(2))
                          }
                          onChangeText={(value) =>
                            onChangeAskingPrice(item._id, value)
                          }
                          placeholder="Saisir un prix"
                          style={[{ color: colors.text }, styles.priceInput]}
                          keyboardAppearance={dark ? "dark" : "light"}
                          placeholderTextColor={colors.placeholder}
                        />
                      </View>
                      {askingPriceEdits[item._id] !== undefined && (
                        <Pressable
                          accessibilityRole="button"
                          disabled={
                            priceSaving ||
                            askingPriceEdits[item._id] === undefined ||
                            askingPriceEdits[item._id] ===
                              (item.askingPriceCents === undefined
                                ? ""
                                : (item.askingPriceCents / 100).toFixed(2))
                          }
                          onPress={() => {
                            setPriceSaving(true);
                            setPriceMessage("");
                            void onSaveAskingPrice(item._id)
                              .then(() => {
                                setPriceMessage("Prix enregistré.");
                                setFocusedItem((current) =>
                                  current
                                    ? {
                                        ...current,
                                        askingPriceCents: Math.round(
                                          Number(
                                            askingPriceEdits[item._id].replace(
                                              ",",
                                              ".",
                                            ),
                                          ) * 100,
                                        ),
                                      }
                                    : current,
                                );
                                data.reload();
                              })
                              .catch((e) =>
                                setPriceMessage(
                                  e instanceof Error
                                    ? e.message
                                    : "Enregistrement impossible.",
                                ),
                              )
                              .finally(() => setPriceSaving(false));
                          }}
                          style={[
                            styles.priceSave,
                            askingPriceEdits[item._id] === undefined &&
                              styles.pageButtonDisabled,
                          ]}
                        >
                          <Text
                            style={[
                              { color: colors.text },
                              styles.priceSaveText,
                            ]}
                          >
                            {priceSaving
                              ? "Enregistrement…"
                              : "Enregistrer le prix"}
                          </Text>
                        </Pressable>
                      )}
                      {!!priceMessage && (
                        <Text
                          accessibilityRole="alert"
                          style={[{ color: colors.text }, styles.details]}
                        >
                          {priceMessage}
                        </Text>
                      )}
                      <Text style={[{ color: colors.text }, styles.details]}>
                        {(item.productType ?? "card") === "card"
                          ? `${languageLabels[item.language ?? "fr"]} · ${conditionLabels[item.condition ?? "NM"]} · `
                          : item.language
                            ? `${languageLabels[item.language]} · `
                            : ""}
                        {item.sellerName ||
                          sellers.find((seller) => seller._id === item.sellerId)
                            ?.name ||
                          "Client"}{" "}
                        {item.origin === "consignment"
                          ? ` · Commission ${(item.commissionRateBps ?? 3000) / 100} % · Vente `
                          : ` · Rachat ${(item.purchasePriceCents / 100).toFixed(2)} € · Vente `}
                        {item.askingPriceCents === undefined
                          ? "Prix non défini"
                          : (item.askingPriceCents / 100).toLocaleString(
                              "fr-BE",
                              {
                                style: "currency",
                                currency: "EUR",
                              },
                            )}
                      </Text>
                      {item.origin === "consignment" && (
                        <Text style={[{ color: colors.text }, styles.details]}>
                          Prix convenu{" "}
                          {(
                            (item.agreedPriceCents ??
                              item.askingPriceCents ??
                              0) / 100
                          ).toFixed(2)}{" "}
                          €. Les modifications de l’accord se font dans Dépôts.
                        </Text>
                      )}
                      {item.marketValueCents !== undefined && (
                        <Text style={[{ color: colors.text }, styles.details]}>
                          Valeur actuelle{" "}
                          {(item.marketValueCents / 100).toFixed(2)} € · reprise
                          à {item.discountPercent ?? 0}%
                        </Text>
                      )}
                    </View>
                  </ScrollView>
                  <View style={styles.footer}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => onToggle(item)}
                      style={[styles.button, selected && styles.selectedButton]}
                    >
                      <Text style={[{ color: colors.text }, styles.buttonText]}>
                        {selected
                          ? "Retirer du panier"
                          : "Ajouter au panier de vente"}
                      </Text>
                    </Pressable>
                    {selected && (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setFocusedItem(null);
                          onOpenSales();
                        }}
                        style={styles.back}
                      >
                        <Text
                          style={[
                            { color: colors.text },
                            styles.pageButtonText,
                          ]}
                        >
                          Voir le panier ›
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </KeyboardAvoidingView>
              </SafeAreaView>
            </Modal>
          );
        })}
      </View>
      {!focusedItem && pagination()}
      {!focusedItem && !data.loading && !data.error && !filtered.length && (
        <Text style={[{ color: colors.text }, styles.hint]}>
          Aucun article disponible trouvé.
        </Text>
      )}
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
      maxHeight: "88%",
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
    filterFormGroup: {
      borderRadius: 15,
      backgroundColor: colors.surface,
      overflow: "hidden",
      marginTop: 16,
    },
    filterFormRow: {
      minHeight: 49,
      paddingHorizontal: 15,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    filterFormLabel: { fontSize: 15, color: colors.text, flex: 1 },
    filterFormValue: { fontSize: 14, color: colors.secondary },
    filterFormInput: {
      minHeight: 49,
      fontSize: 15,
      color: colors.text,
      flex: 1,
    },
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
    sheetHeader: {
      height: 56,
      paddingHorizontal: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sheetTitle: { fontSize: 19, fontWeight: "700", color: colors.text },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 44,
      backgroundColor: colors.border,
      borderRadius: 11,
      paddingHorizontal: 12,
      marginTop: 10,
      marginBottom: 0,
    },
    searchIcon: { fontSize: 22, color: colors.secondary },
    segments: {
      flexDirection: "row",
      backgroundColor: colors.border,
      borderRadius: 9,
      padding: 3,
      marginTop: 15,
      marginBottom: 5,
    },
    segment: {
      flex: 1,
      minHeight: 32,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: 7,
      paddingHorizontal: 2,
    },
    segmentActive: {
      backgroundColor: colors.surface,
      shadowColor: colors.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 2,
      shadowOffset: { width: 0, height: 1 },
    },
    segmentText: { fontSize: 12, color: colors.secondary },
    segmentTextActive: { color: colors.text, fontWeight: "600" },
    inlineAction: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    inlineActionText: { fontSize: 13, color: colors.accent },
    group: {
      borderRadius: 15,
      overflow: "hidden",
      backgroundColor: colors.surface,
      marginVertical: 12,
    },
    detailTitle: {
      fontSize: 32,
      fontWeight: "700",
      letterSpacing: -1,
      color: colors.text,
      marginBottom: 10,
    },
    hero: {
      padding: 20,
      borderRadius: 16,
      backgroundColor: colors.surface,
      alignItems: "center",
      gap: 8,
      marginBottom: 15,
    },
    heroTitle: { fontSize: 21, fontWeight: "700", color: colors.text },
    tag: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.accent,
      backgroundColor: colors.accentSoft,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 7,
    },
    formRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 52,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginBottom: 8,
    },
    formLabel: { fontSize: 14, color: colors.text },
    detailHeader: {
      paddingHorizontal: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: 24,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    footer: {
      paddingHorizontal: 20,
      paddingTop: 2,
      paddingBottom: 18,
      backgroundColor: colors.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    compactRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 15,
      minHeight: 76,
      backgroundColor: colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    rowPrice: { fontWeight: "600", color: colors.text },
    back: { minHeight: 48, justifyContent: "center", marginBottom: 12 },
    visibilityToolbar: {
      padding: 12,
      backgroundColor: colors.raised,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      marginVertical: 12,
    },
    visibilitySelect: { paddingVertical: 12 },
    hiddenBadge: {
      color: colors.warning,
      backgroundColor: colors.warningSoft,
      alignSelf: "flex-start",
      padding: 6,
      borderRadius: 6,
      fontWeight: "700",
      marginVertical: 5,
    },
    visibilityError: { color: colors.danger, paddingVertical: 8 },
    search: {
      flex: 1,
      minHeight: 44,
      fontSize: 15,
      paddingVertical: 10,
      color: colors.text,
    },
    filterLabel: { color: colors.text, fontWeight: "700", marginBottom: 6 },
    filterRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 8,
    },
    filterChip: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      backgroundColor: colors.surface,
    },
    filterChipActive: {
      borderColor: colors.accent,
      backgroundColor: colors.infoSoft,
    },
    filterText: { color: colors.secondary, fontSize: 12, fontWeight: "600" },
    filterTextActive: { color: colors.accent },
    pagination: {
      backgroundColor: colors.infoSoft,
      borderRadius: 10,
      padding: 10,
      marginBottom: 10,
    },
    paginationSummary: {
      color: colors.accent,
      fontWeight: "700",
      textAlign: "center",
      marginBottom: 8,
    },
    paginationRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 5,
    },
    pageButton: {
      backgroundColor: colors.surface,
      paddingHorizontal: 9,
      paddingVertical: 9,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pageButtonDisabled: { opacity: 0.4 },
    pageButtonText: { color: colors.accent, fontWeight: "700", fontSize: 12 },
    pageSizes: { flexDirection: "row", gap: 5 },
    pageSize: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pageSizeActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    pageSizeText: { color: colors.secondary, fontWeight: "700", fontSize: 12 },
    pageSizeTextActive: { color: colors.onAccent },
    pageSizeHint: {
      color: colors.secondary,
      fontSize: 11,
      textAlign: "center",
      marginTop: 5,
    },
    card: {
      padding: 16,
      backgroundColor: colors.surface,
      borderRadius: 12,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: {
      fontSize: 15,
      fontWeight: "600",
      marginBottom: 0,
      color: colors.text,
    },
    cardImage: {
      height: 120,
      width: 90,
      alignSelf: "center",
      marginBottom: 10,
    },
    details: {
      color: colors.secondary,
      fontSize: 12,
      marginTop: 3,
      lineHeight: 17,
    },
    priceLabel: {
      color: colors.text,
      fontWeight: "600",
      marginTop: 12,
      marginBottom: 4,
    },
    priceInput: {
      textAlign: "right",
      minWidth: 90,
      padding: 10,
      fontSize: 15,
    },
    priceSave: {
      backgroundColor: colors.background,
      padding: 10,
      alignItems: "center",
      borderRadius: 8,
      marginTop: 7,
    },
    priceSaveText: { color: colors.accent, fontWeight: "700" },
    cart: {
      padding: 14,
      marginBottom: 12,
      borderRadius: 10,
      backgroundColor: colors.infoSoft,
    },
    cartText: { color: colors.text, fontWeight: "700" },
    cartRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    cartName: { flex: 1 },
    cartPrice: {
      width: 84,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 7,
      padding: 8,
      fontSize: 15,
    },
    remove: { color: colors.danger, fontWeight: "700", padding: 5 },
    gradingBadge: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      maxWidth: "100%",
      paddingHorizontal: 9,
      paddingVertical: 7,
      borderWidth: 1,
      borderLeftWidth: 3,
      borderRadius: 9,
      marginVertical: 5,
    },
    gradingBadgePSA: {
      backgroundColor: colors.infoSoft,
      borderColor: colors.border,
    },
    gradingBadgeCollectAura: {
      backgroundColor: colors.successSoft,
      borderColor: colors.border,
    },
    gradingBadgePCA: {
      backgroundColor: colors.warningSoft,
      borderColor: colors.border,
    },
    gradingBadgeCCC: {
      backgroundColor: colors.raised,
      borderColor: colors.border,
    },
    gradingCompanyLogo: { width: 72, height: 23 },
    cccLogoPlate: {
      minWidth: 80,
      height: 24,
      justifyContent: "center",
      paddingHorizontal: 3,
      borderRadius: 5,
      backgroundColor: colors.info,
    },
    cccCompanyLogo: { width: 74, height: 18 },
    gradingScore: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 2,
      paddingHorizontal: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 5,
      backgroundColor: colors.surface,
    },
    gradingCaption: {
      color: colors.secondary,
      fontSize: 7,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    gradingValue: { color: colors.text, fontSize: 12, fontWeight: "800" },
    gradingCertificate: {
      color: colors.secondary,
      fontSize: 9,
      fontWeight: "600",
    },
    button: {
      minHeight: 49,
      justifyContent: "center",
      backgroundColor: colors.accent,
      padding: 14,
      alignItems: "center",
      borderRadius: 13,
      marginTop: 10,
    },
    selectedButton: { backgroundColor: colors.secondary },
    buttonText: { color: colors.onAccent, fontWeight: "600" },
    hint: { padding: 18, color: colors.secondary },
  });
