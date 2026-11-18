import * as Crypto from 'expo-crypto';
import { usePagedData } from '../data/usePagedData';
import { Pagination } from '../components/Pagination';
import { ItemThumbnail } from '../components/ItemThumbnail';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  type GradingCompany,
  type Item,
  type Seller,
  updateStockVisibility,
} from '../data/apiRepository';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');

const conditionLabels: Record<string, string> = {
  M: 'Mint',
  NM: 'Near Mint',
  EX: 'Excellent',
  GD: 'Good',
  LP: 'Light Played',
  PL: 'Played',
  PO: 'Poor',
};
const languageLabels: Record<string, string> = { fr: 'Français', en: 'Anglais', ja: 'Japonais' };
const companyLabels: Record<GradingCompany, string> = {
  PSA: 'PSA',
  CollectAura: 'Collect Aura',
  PCA: 'PCA',
  CCC: 'CCC Grading',
};
const gradingLogos: Record<GradingCompany, string> = {
  PSA: 'https://cdn.shopify.com/s/files/1/0618/5998/7608/files/psa-logo-2.png?v=1768810462',
  CollectAura: 'https://status.collectaura.com/collectaura-logo.png',
  PCA: 'https://primary.jwwb.nl/public/r/b/j/temp-profycumnjgwqpqpzroz/pca_logo-high.png?crop=1.6667%3A1&enable=upscale&enable-io=true&width=800',
  CCC: 'https://s3-eu-west-1.amazonaws.com/tpd/logos/6214fd59aa75da9ec8d9ba3d/0x0.png',
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
  const label = companyLabels[company];
  const companyStyle =
    company === 'PSA'
      ? styles.gradingBadgePSA
      : company === 'CollectAura'
        ? styles.gradingBadgeCollectAura
        : company === 'PCA'
          ? styles.gradingBadgePCA
          : styles.gradingBadgeCCC;
  return (
    <View
      style={[styles.gradingBadge, companyStyle]}
      accessibilityLabel={`${label}, gradée ${grade || 'note non renseignée'}${certificate ? `, certificat ${certificate}` : ''}`}
    >
      <View style={company === 'CCC' ? styles.cccLogoPlate : undefined}>
        <Image
          accessibilityLabel={label}
          source={{ uri: gradingLogos[company] }}
          style={[styles.gradingCompanyLogo, company === 'CCC' && styles.cccCompanyLogo]}
          resizeMode="contain"
        />
      </View>
      <View style={styles.gradingScore}>
        <Text style={styles.gradingCaption}>GRADÉE</Text>
        <Text style={styles.gradingValue}>{grade || '—'}</Text>
      </View>
      {certificate ? <Text style={styles.gradingCertificate}>Cert. {certificate}</Text> : null}
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
}: {
  revision?: number;
  items: Item[];
  sellers: Seller[];
  selectedIds: string[];
  salePrices: Record<string, string>;
  onChangeSalePrice: (itemId: string, value: string) => void;
  askingPriceEdits: Record<string, string>;
  onChangeAskingPrice: (itemId: string, value: string) => void;
  onSaveAskingPrice: (itemId: string) => void;
  onToggle: (item: Item) => void;
  onOpenSales: () => void;
  onRefresh: () => Promise<void>;
  onVisibilitySaved: (itemIds: string[], hidden: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibilityToolsOpen, setVisibilityToolsOpen] = useState(false);
  const [visibility, setVisibility] = useState<'all' | 'visible' | 'hidden'>('all');
  const [visibilityIds, setVisibilityIds] = useState<string[]>([]);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [visibilityMessage, setVisibilityMessage] = useState('');
  const [visibilityError, setVisibilityError] = useState('');
  const visibilityRunning = useRef(false);
  const visibilityAttempt = useRef<{ signature: string; operationId: string } | null>(null);
  async function setHidden(itemIds: string[], hidden: boolean) {
    if (visibilityRunning.current || !itemIds.length || itemIds.length > 500) return;
    visibilityRunning.current = true;
    setVisibilityBusy(true);
    setVisibilityError('');
    setVisibilityMessage('');
    let saved = false;
    try {
      const ids = [...new Set(itemIds)].sort();
      const signature = JSON.stringify({ itemIds: ids, hidden });
      if (visibilityAttempt.current?.signature !== signature)
        visibilityAttempt.current = { signature, operationId: Crypto.randomUUID() };
      const result = await updateStockVisibility({
        itemIds: ids,
        hidden,
        operationId: visibilityAttempt.current.operationId,
      });
      saved = true;
      onVisibilitySaved(ids, hidden);
      visibilityAttempt.current = null;
      setVisibilityIds([]);
      await onRefresh();
      data.reload();
      setVisibilityMessage(
        `${result.updatedCount} article(s) ${hidden ? 'masqué(s) du' : 'visible(s) dans le'} catalogue public.`,
      );
    } catch (error) {
      setVisibilityError(
        saved
          ? 'Visibilité enregistrée, mais le stock n’a pas pu être actualisé. Actualisez avant de continuer.'
          : error instanceof Error
            ? error.message
            : 'La visibilité n’a pas pu être mise à jour. Réessayez.',
      );
    } finally {
      setVisibilityBusy(false);
      visibilityRunning.current = false;
    }
  }

  const [origin, setOrigin] = useState<'all' | 'purchase' | 'consignment'>('all');
  const [gradingStatus, setGradingStatus] = useState<'all' | 'graded' | 'ungraded'>('all');
  const [gradingCompany, setGradingCompany] = useState<'all' | GradingCompany>('all');
  const [gradingText, setGradingText] = useState('');

  const [pageSize, setPageSize] = useState(20);
  const data = usePagedData<Item>('/stock', { search, visibility, origin, gradingStatus, gradingCompany, gradingText, size: pageSize }, true, revision);
  const filtered = data.items;
  const pageItems = data.items;
  const filterKey = JSON.stringify([
    search,
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

  const pagination = () => <Pagination data={data} />;
  return (
    <View pointerEvents={visibilityBusy ? 'none' : 'auto'}>
      <TextInput
        accessibilityLabel="Rechercher le stock"
        placeholder="Nom, description, référence, numéro ou client"
        value={search}
        onChangeText={setSearch}
        style={styles.search}
      />
      <View style={styles.filterRow}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: filtersOpen }} onPress={() => setFiltersOpen(value => !value)} style={styles.filterChip}><Text style={styles.filterText}>{filtersOpen ? 'Fermer les filtres' : 'Filtres'}{visibility !== 'all' || origin !== 'all' || gradingStatus !== 'all' || gradingCompany !== 'all' || gradingText ? ' · actifs' : ''}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: visibilityToolsOpen }} onPress={() => setVisibilityToolsOpen(value => !value)} style={styles.filterChip}><Text style={styles.filterText}>Visibilité en lot{selectedVisibilityIds.length ? ` · ${selectedVisibilityIds.length}` : ''}</Text></Pressable>
      </View>
      <View style={filtersOpen ? undefined : { display: 'none' }}>
      <Text style={styles.filterLabel}>Visibilité du catalogue</Text>
      <View style={styles.filterRow}>
        {(
          [
            ['all', 'Tous'],
            ['visible', 'Visibles'],
            ['hidden', 'Masqués'],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: visibility === value }}
            onPress={() => setVisibility(value)}
            style={[styles.filterChip, visibility === value && styles.filterChipActive]}
          >
            <Text style={styles.filterText}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.details}>
        Les articles masqués restent dans votre stock et peuvent être vendus.
      </Text>
      <Text style={styles.filterLabel}>Origine</Text>
      <View style={styles.filterRow}>
        {(
          [
            ['all', 'Tous'],
            ['purchase', 'Rachats'],
            ['consignment', 'Dépôts-ventes'],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: origin === value }}
            onPress={() => setOrigin(value)}
            style={[styles.filterChip, origin === value && styles.filterChipActive]}
          >
            <Text style={styles.filterText}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.filterLabel}>Gradation</Text>
      <View style={styles.filterRow}>
        {(
          [
            ['all', 'Toutes'],
            ['graded', 'Gradées'],
            ['ungraded', 'Non gradées'],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: gradingStatus === value }}
            onPress={() => setGradingStatus(value)}
            style={[styles.filterChip, gradingStatus === value && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, gradingStatus === value && styles.filterTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.filterRow}>
        {(['all', 'PSA', 'CollectAura', 'PCA', 'CCC'] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: gradingCompany === value }}
            onPress={() => setGradingCompany(value)}
            style={[styles.filterChip, gradingCompany === value && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, gradingCompany === value && styles.filterTextActive]}>
              {value === 'all' ? 'Toutes sociétés' : companyLabels[value]}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        accessibilityLabel="Filtrer par note ou numéro de certification"
        placeholder="Note ou numéro de certification"
        value={gradingText}
        onChangeText={setGradingText}
        style={styles.search}
      />
      </View>
      <View style={[styles.visibilityToolbar, !visibilityToolsOpen && { display: 'none' }]}>
        <Text style={styles.title}>
          Visibilité en lot · {selectedVisibilityIds.length} sélectionné(s)
        </Text>
        <View style={styles.filterRow}>
          <Pressable
            accessibilityRole="button"
            disabled={!pageItems.length}
            style={styles.pageButton}
            onPress={() => setVisibilityIds(pageItems.map((item) => item._id))}
          >
            <Text style={styles.pageButtonText}>Sélectionner cette page</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!selectedVisibilityIds.length}
            style={styles.pageButton}
            onPress={() => setVisibilityIds([])}
          >
            <Text style={styles.pageButtonText}>Effacer la sélection</Text>
          </Pressable>
        </View>
        {filtered.length > 500 && (
          <Text style={styles.details}>
            Maximum 500 articles par opération. Affinez la recherche ou sélectionnez une page.
          </Text>
        )}
        <View style={styles.filterRow}>
          <Pressable
            accessibilityRole="button"
            disabled={!selectedVisibilityIds.length || visibilityBusy}
            style={[
              styles.button,
              (!selectedVisibilityIds.length || visibilityBusy) && styles.pageButtonDisabled,
            ]}
            onPress={() => void setHidden(selectedVisibilityIds, true)}
          >
            <Text style={styles.buttonText}>Masquer la sélection</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!selectedVisibilityIds.length || visibilityBusy}
            style={[
              styles.button,
              (!selectedVisibilityIds.length || visibilityBusy) && styles.pageButtonDisabled,
            ]}
            onPress={() => void setHidden(selectedVisibilityIds, false)}
          >
            <Text style={styles.buttonText}>Afficher la sélection</Text>
          </Pressable>
        </View>
        <Text style={styles.details}>
          Cette sélection est indépendante du panier de vente. Changer les filtres l’efface.
        </Text>
        {visibilityBusy && <Text style={styles.details}>Mise à jour de la visibilité…</Text>}
        {!!visibilityMessage && (
          <Text accessibilityRole="alert" style={styles.details}>
            {visibilityMessage}
          </Text>
        )}
        {!!visibilityError && (
          <View>
            <Text accessibilityRole="alert" style={styles.visibilityError}>
              {visibilityError}
            </Text>
            <Pressable
              accessibilityRole="button"
              style={styles.pageButton}
              onPress={() =>
                void onRefresh()
                  .then(() => setVisibilityError(''))
                  .catch((error) =>
                    setVisibilityError(
                      error instanceof Error ? error.message : 'Actualisation impossible.',
                    ),
                  )
              }
            >
              <Text style={styles.pageButtonText}>Actualiser le stock</Text>
            </Pressable>
          </View>
        )}
      </View>
      {filtered.length > 0 ? pagination() : null}
      {selectedIds.length > 0 && (
        <View style={styles.cart}>
          <Text style={styles.cartText}>Panier de vente · {selectedIds.length} article(s)</Text>
          <Text style={styles.details}>
            Le panier reste visible ici, même si vous parcourez le stock. Ajustez les prix ou
            retirez des articles avant la validation.
          </Text>
          {selectedIds.map((id) => {
            const item = items.find((row) => row._id === id);
            if (!item) return null;
            return (
              <View key={id} style={styles.cartRow}>
                <View style={styles.cartName}>
                  <Text style={styles.title}>{item.name}</Text>
                  <Text style={styles.details}>
                    {[item.series, item.identifier].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <TextInput
                  accessibilityLabel={`Prix de vente dans le panier pour ${item.name}`}
                  keyboardType="decimal-pad"
                  value={
                    salePrices[id] ??
                    (item.askingPriceCents === undefined
                      ? ''
                      : (item.askingPriceCents / 100).toFixed(2))
                  }
                  onChangeText={(value) => onChangeSalePrice(id, value)}
                  style={styles.cartPrice}
                />
                <Pressable accessibilityRole="button" onPress={() => onToggle(item)}>
                  <Text style={styles.remove}>Retirer</Text>
                </Pressable>
              </View>
            );
          })}
          <Pressable accessibilityRole="button" onPress={onOpenSales} style={styles.button}>
            <Text style={styles.buttonText}>Continuer vers la validation</Text>
          </Pressable>
        </View>
      )}
      {pageItems.map((item) => {
        const selected = selectedIds.includes(item._id);
        return (
          <View key={item._id} style={styles.card}>
            <ItemThumbnail item={item} style={styles.cardImage} />
            <Text style={styles.title}>{item.name}</Text>
            <Text style={item.hiddenFromCatalogue ? styles.hiddenBadge : styles.details}>
              {item.hiddenFromCatalogue ? 'Masqué du catalogue' : 'Visible dans le catalogue'}
            </Text>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{
                checked: selectedVisibilityIds.includes(item._id),
                disabled:
                  visibilityBusy ||
                  (!selectedVisibilityIds.includes(item._id) &&
                    selectedVisibilityIds.length >= 500),
              }}
              disabled={
                visibilityBusy ||
                (!selectedVisibilityIds.includes(item._id) && selectedVisibilityIds.length >= 500)
              }
              onPress={() => toggleVisibilitySelection(item._id)}
              style={styles.visibilitySelect}
            >
              <Text style={styles.pageButtonText}>
                {selectedVisibilityIds.includes(item._id) ? '☑' : '☐'} Sélectionner pour la
                visibilité
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={visibilityBusy}
              style={styles.priceSave}
              onPress={() => void setHidden([item._id], !item.hiddenFromCatalogue)}
            >
              <Text style={styles.priceSaveText}>
                {item.hiddenFromCatalogue ? 'Afficher dans le catalogue' : 'Masquer du catalogue'}
              </Text>
            </Pressable>
            {item.origin === 'consignment' && (
              <Text style={styles.filterText}>
                Dépôt-vente ·{' '}
                {item.productType === 'sealed'
                  ? 'Scellé'
                  : item.productType === 'other'
                    ? 'Autre article'
                    : 'Carte'}
              </Text>
            )}
            <Text style={styles.details}>
              {[item.series, item.identifier, item.serialNumber].filter(Boolean).join(' · ') ||
                'Sans référence'}
            </Text>
            {item.gradingCompany ? (
              <GradingBadge
                company={item.gradingCompany}
                grade={item.gradingGrade}
                certificate={item.gradingCertificate}
              />
            ) : null}
            {item.gradingCompany && item.gradingNotes ? (
              <Text style={styles.details}>Notes : {item.gradingNotes}</Text>
            ) : null}
            <Text style={styles.priceLabel}>Prix de vente demandé (€)</Text>
            <TextInput
              accessibilityLabel={`Prix de vente demandé pour ${item.name}`}
              keyboardType="decimal-pad"
              value={
                askingPriceEdits[item._id] ??
                (item.askingPriceCents === undefined
                  ? ''
                  : (item.askingPriceCents / 100).toFixed(2))
              }
              onChangeText={(value) => onChangeAskingPrice(item._id, value)}
              placeholder="Saisir un prix"
              style={styles.priceInput}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => onSaveAskingPrice(item._id)}
              style={styles.priceSave}
            >
              <Text style={styles.priceSaveText}>Enregistrer le prix</Text>
            </Pressable>
            <Text style={styles.details}>
              {(item.productType ?? 'card') === 'card'
                ? `${languageLabels[item.language ?? 'fr']} · ${conditionLabels[item.condition ?? 'NM']} · `
                : item.language
                  ? `${languageLabels[item.language]} · `
                  : ''}
              {item.sellerName ||
                sellers.find((seller) => seller._id === item.sellerId)?.name ||
                'Client'}{' '}
              {item.origin === 'consignment'
                ? ` · Commission ${(item.commissionRateBps ?? 3000) / 100} % · Vente `
                : ` · Rachat ${(item.purchasePriceCents / 100).toFixed(2)} € · Vente `}
              {item.askingPriceCents === undefined
                ? 'Prix non défini'
                : `${(item.askingPriceCents / 100).toFixed(2)} €`}
            </Text>
            {item.origin === 'consignment' && (
              <Text style={styles.details}>
                Prix convenu{' '}
                {((item.agreedPriceCents ?? item.askingPriceCents ?? 0) / 100).toFixed(2)} €. Les
                modifications de l’accord se font dans Dépôts.
              </Text>
            )}
            {item.marketValueCents !== undefined && (
              <Text style={styles.details}>
                Valeur actuelle {(item.marketValueCents / 100).toFixed(2)} € · décote{' '}
                {item.discountPercent ?? 0}%
              </Text>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onToggle(item)}
              style={[styles.button, selected && styles.selectedButton]}
            >
              <Text style={styles.buttonText}>
                {selected ? 'Retirer du panier' : 'Ajouter au panier de vente'}
              </Text>
            </Pressable>
          </View>
        );
      })}
      {pagination()}
      {!filtered.length && <Text style={styles.hint}>Aucun article disponible trouvé.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  visibilityToolbar: {
    padding: 12,
    backgroundColor: '#f2f6f8',
    borderWidth: 1,
    borderColor: '#cbd5dc',
    borderRadius: 10,
    marginVertical: 12,
  },
  visibilitySelect: { paddingVertical: 12 },
  hiddenBadge: {
    color: '#805600',
    backgroundColor: '#fff1d6',
    alignSelf: 'flex-start',
    padding: 6,
    borderRadius: 6,
    fontWeight: '700',
    marginVertical: 5,
  },
  visibilityError: { color: '#a12e25', paddingVertical: 8 },
  search: {
    minHeight: 48,
    fontSize: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5dc',
    backgroundColor: 'white',
    marginBottom: 12,
  },
  filterLabel: { color: '#263238', fontWeight: '700', marginBottom: 6 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  filterChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#cbd5dc',
    borderRadius: 18,
    backgroundColor: 'white',
  },
  filterChipActive: { borderColor: '#164f73', backgroundColor: '#e8f1f6' },
  filterText: { color: '#526875', fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: '#143d59' },
  pagination: { backgroundColor: '#e8f1f6', borderRadius: 10, padding: 10, marginBottom: 10 },
  paginationSummary: { color: '#143d59', fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5,
  },
  pageButton: {
    backgroundColor: 'white',
    paddingHorizontal: 9,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5dc',
  },
  pageButtonDisabled: { opacity: 0.4 },
  pageButtonText: { color: '#143d59', fontWeight: '700', fontSize: 12 },
  pageSizes: { flexDirection: 'row', gap: 5 },
  pageSize: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#cbd5dc',
  },
  pageSizeActive: { backgroundColor: '#143d59', borderColor: '#143d59' },
  pageSizeText: { color: '#526875', fontWeight: '700', fontSize: 12 },
  pageSizeTextActive: { color: 'white' },
  pageSizeHint: { color: '#60727e', fontSize: 11, textAlign: 'center', marginTop: 5 },
  card: {
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e3e8ec',
  },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 5, color: '#152b3a' },
  cardImage: { height: 120, width: 90, alignSelf: 'center', marginBottom: 10 },
  details: { color: '#526875', marginTop: 3, lineHeight: 20 },
  priceLabel: { color: '#263238', fontWeight: '600', marginTop: 12, marginBottom: 4 },
  priceInput: {
    borderWidth: 1,
    borderColor: '#cbd5dc',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
  },
  priceSave: {
    backgroundColor: '#e3e9ed',
    padding: 10,
    alignItems: 'center',
    borderRadius: 8,
    marginTop: 7,
  },
  priceSaveText: { color: '#164f73', fontWeight: '700' },
  cart: {
    padding: 14,
    marginBottom: 12,
    borderRadius: 10,
    backgroundColor: '#e8f1f6',
  },
  cartText: { color: '#152b3a', fontWeight: '700' },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#cbd9e0',
  },
  cartName: { flex: 1 },
  cartPrice: {
    width: 84,
    borderWidth: 1,
    borderColor: '#cbd5dc',
    backgroundColor: 'white',
    borderRadius: 7,
    padding: 8,
    fontSize: 15,
  },
  remove: { color: '#8c3830', fontWeight: '700', padding: 5 },
  gradingBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 9,
    marginVertical: 5,
  },
  gradingBadgePSA: { backgroundColor: '#f0f6fb', borderColor: '#c7d7e5' },
  gradingBadgeCollectAura: { backgroundColor: '#f0f7f3', borderColor: '#cfe0d6' },
  gradingBadgePCA: { backgroundColor: '#faf6ed', borderColor: '#e3d6bd' },
  gradingBadgeCCC: { backgroundColor: '#f1f6f8', borderColor: '#cbd9df' },
  gradingCompanyLogo: { width: 72, height: 23 },
  cccLogoPlate: {
    minWidth: 80,
    height: 24,
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderRadius: 5,
    backgroundColor: '#324e60',
  },
  cccCompanyLogo: { width: 74, height: 18 },
  gradingScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#dce4e9',
    borderRadius: 5,
    backgroundColor: 'white',
  },
  gradingCaption: { color: '#75838b', fontSize: 7, fontWeight: '800', letterSpacing: 0.5 },
  gradingValue: { color: '#213743', fontSize: 12, fontWeight: '800' },
  gradingCertificate: { color: '#667983', fontSize: 9, fontWeight: '600' },
  button: {
    backgroundColor: '#143d59',
    padding: 11,
    alignItems: 'center',
    borderRadius: 8,
    marginTop: 10,
  },
  selectedButton: { backgroundColor: '#526875' },
  buttonText: { color: 'white', fontWeight: '600' },
  hint: { padding: 18, color: '#61717c' },
});
