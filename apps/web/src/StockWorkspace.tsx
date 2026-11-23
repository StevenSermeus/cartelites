import { SeriesFilter, useSeriesOptions } from './SeriesInput';
import { useEffect, useRef, useState } from 'react';
import {
  FiArrowRight,
  FiCheck,
  FiChevronLeft,
  FiChevronRight,
  FiEdit2,
  FiEye,
  FiEyeOff,
  FiFilter,
  FiImage,
  FiMinus,
  FiPackage,
  FiPlus,
  FiSearch,
  FiShoppingBag,
  FiShoppingCart,
  FiX,
} from 'react-icons/fi';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog';
import { ItemThumbnail } from './ItemThumbnail';
import { currencySymbol, formatDate, formatMoney } from './shopFormat';
import './stock-workspace.css';
import {MarketPrices} from './MarketPrices';
import {StockTraceability} from './StockTraceability';
import type {Request} from './GradingCompanies';

export type StockWorkspaceItem = {
  _id: string;
  name: string;
  quantity?: number;
  status: string;
  hiddenFromCatalogue?: boolean;
  description?: string;
  origin?: 'purchase' | 'consignment' | 'supplier';
  productType?: 'card' | 'sealed' | 'other';
  tcg?: 'pokemon' | 'riftbound' | 'other';
  series?: string;
  identifier?: string;
  serialNumber?: string;
  catalogueImageUrl?: string;
  language?: string;
  condition?: string;
  gradingCompany?: string;
  gradingGrade?: string;
  gradingCertificate?: string;
  gradingNotes?: string;
  purchasePriceCents?: number|null;
  askingPriceCents?: number;
  agreedPriceCents?: number;
  commissionRateBps?: number;
  purchaseOccurredAt?: number;
  sellerName?: string;
  purchaseReference?: string;
  coverPhotoId?: string;
  photos?: { _id: string; filename: string; contentType?: string }[];
};
export type StockFilters = {
  tcg: 'all' | 'pokemon' | 'riftbound' | 'other';
  series: string;
  search: string;
  origin: string;
  visibility: 'all' | 'visible' | 'hidden';
  gradingStatus: 'all' | 'graded' | 'ungraded';
  gradingCompany: string;
  gradingGrade: string;
};
export type StockWorkspaceProps<T extends StockWorkspaceItem = StockWorkspaceItem> = {
  items: readonly T[];
  apiBase: string;
  request:Request;
  filters: StockFilters;
  onFiltersChange: (filters: StockFilters) => void;
  gradingCompanies: readonly { id: string; name: string }[];
  loading?: boolean;
  busy?: boolean;
  error?: string;
  notice?: string;
  visibilityBusy?: boolean;
  visibilitySelection: readonly string[];
  onVisibilitySelectionChange: (ids: string[]) => void;
  onSetVisibility: (ids: string[], hidden: boolean) => void;
  basketQuantities: Readonly<Record<string, number>>;
  basketCount: number;
  basketTotalCents: number;
  onBasketQuantityChange: (item: T, quantity: number) => void;
  onAddPageToBasket: () => void;
  onClearBasket: () => void;
  onOpenBasket: () => void;
  priceDrafts: Readonly<Record<string, string>>;
  onPriceDraftChange: (item: T, value: string) => void;
  onSaveAskingPrice: (item: T) => void;
  onEditProduct: (item: T) => void;
  onOpenConsignments: () => void;
  onAddStock: () => void;
  pagination: {
    number: number;
    hasPrevious: boolean;
    hasNext: boolean;
    previous: () => void;
    next: () => void;
    reload: () => void;
  };
};
const originLabel = (item: StockWorkspaceItem) =>
  item.origin === 'supplier'
    ? 'Fournisseur'
    : item.origin === 'consignment'
      ? 'Dépôt-vente'
      : 'Rachat';
const languageLabel = (value?: string) =>
  ({ fr: 'FR', en: 'EN', ja: 'JP', zh: 'CN' })[value ?? ''] ?? value?.toUpperCase();
const conditionLabel = (item: StockWorkspaceItem) =>
  item.productType === 'sealed'
    ? 'Scellé'
    : item.productType === 'other'
      ? 'Autre article'
      : (item.condition ?? 'Non précisé');
const availableQuantity = (item: StockWorkspaceItem) =>
  item.status === 'available'
    ? item.origin === 'supplier'
      ? Math.max(0, item.quantity ?? 0)
      : 1
    : 0;

function PageCheckbox({
  checked,
  mixed,
  disabled,
  onChange,
}: {
  checked: boolean;
  mixed: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label="Sélectionner cette page pour modifier la visibilité"
    />
  );
}
function ProductGallery({ item, apiBase }: { item: StockWorkspaceItem; apiBase: string }) {
  const photos = (item.photos ?? []).filter(
    (photo) =>
      photo.contentType?.startsWith('image/') ||
      /\.(jpe?g|png|webp|heic|avif)$/i.test(photo.filename),
  );
  const ordered = [...photos].sort(
    (a, b) => Number(b._id === item.coverPhotoId) - Number(a._id === item.coverPhotoId),
  );
  const sources = ordered.map((photo) => ({
    key: photo._id,
    url: `${apiBase}/attachments/${encodeURIComponent(photo._id)}/download`,
    label: photo.filename,
  }));
  if (!sources.length && item.catalogueImageUrl)
    sources.push({ key: 'catalogue', url: item.catalogueImageUrl, label: 'Image du catalogue' });
  const [selected, setSelected] = useState(0),
    [failed, setFailed] = useState<string[]>([]);
  const current = sources[selected] ?? sources[0];
  return (
    <div className="sw-gallery">
      <div className="sw-gallery-image">
        {current && !failed.includes(current.key) ? (
          <img
            src={current.url}
            alt={`${item.name} — ${current.label}`}
            onError={() => setFailed((previous) => [...previous, current.key])}
          />
        ) : (
          <div className="sw-no-photo">
            <FiImage aria-hidden="true" />
            <span>Photo indisponible</span>
          </div>
        )}
      </div>
      {sources.length > 1 && (
        <div className="sw-gallery-controls" role="group" aria-label="Photos de l’article">
          {sources.map((photo, index) => (
            <Button
              key={photo.key}
              type="button"
              size="sm"
              variant={index === selected ? 'default' : 'secondary'}
              aria-label={`Afficher la photo ${index + 1} : ${photo.label}`}
              aria-pressed={index === selected}
              onClick={() => setSelected(index)}
            >
              {index + 1}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export function StockWorkspace<T extends StockWorkspaceItem>(props: StockWorkspaceProps<T>) {
  const { items, filters, loading = false, busy = false, visibilityBusy = false } = props;
  const series = useSeriesOptions(filters.tcg);
  const [advanced, setAdvanced] = useState(false),
    [inspected, setInspected] = useState<T | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const detail = inspected ? (items.find((item) => item._id === inspected._id) ?? inspected) : null;
  const selection = new Set(props.visibilitySelection);
  const selectedOnPage = items.filter((item) => selection.has(item._id)).length;
  const advancedCount =
    Number(filters.gradingStatus !== 'all') +
    Number(filters.gradingCompany !== 'all' && filters.gradingCompany !== '') +
    Number(Boolean(filters.gradingGrade.trim()));
  const hasFilters = Boolean(
    filters.tcg !== 'all' || filters.series || filters.search || filters.origin !== 'all' || filters.visibility !== 'all' || advancedCount,
  );
  const blocked = busy || visibilityBusy;
  function updateFilter<K extends keyof StockFilters>(key: K, value: StockFilters[K]) {
    props.onFiltersChange({ ...filters, [key]: value });
  }
  function clearFilters() {
    props.onFiltersChange({
      search: '',
      tcg: 'all',
      series: '',
      origin: 'all',
      visibility: 'all',
      gradingStatus: 'all',
      gradingCompany: 'all',
      gradingGrade: '',
    });
  }
  function inspect(item: T) {
    trigger.current = document.activeElement as HTMLElement | null;
    setInspected(item);
  }
  function toggleSelection(item: T) {
    const next = new Set(props.visibilitySelection);
    if (next.has(item._id)) next.delete(item._id);
    else if (next.size < 500) next.add(item._id);
    props.onVisibilitySelectionChange([...next]);
  }
  function togglePage() {
    const next = new Set(props.visibilitySelection);
    if (items.length && selectedOnPage === items.length)
      for (const item of items) next.delete(item._id);
    else
      for (const item of items) {
        if (next.size >= 500) break;
        next.add(item._id);
      }
    props.onVisibilitySelectionChange([...next]);
  }
  function basketControl(item: T) {
    const quantity = props.basketQuantities[item._id] ?? 0,
      available = availableQuantity(item);
    return (
      <div className="sw-quantity" role="group" aria-label={`Quantité au panier : ${item.name}`}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy || quantity === 0}
          aria-label={`Retirer une unité de ${item.name}`}
          onClick={() => props.onBasketQuantityChange(item, Math.max(0, quantity - 1))}
        >
          <FiMinus aria-hidden="true" />
        </Button>
        <span aria-live="polite" aria-atomic="true" aria-label={`${quantity} au panier`}>
          {quantity > 0 && <FiCheck aria-hidden="true" />}
          <span>{quantity}</span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy || quantity >= available}
          aria-label={`Ajouter une unité de ${item.name}`}
          onClick={() => props.onBasketQuantityChange(item, Math.min(available, quantity + 1))}
        >
          <FiPlus aria-hidden="true" />
        </Button>
      </div>
    );
  }
  return (
    <section className="stock-workspace" aria-label="Inventaire de la boutique">
      <div className="sw-toolbar">
        <label className="sw-search">
          <FiSearch aria-hidden="true" />
          <span className="sw-sr-only">Rechercher dans le stock</span>
          <Input
            type="search"
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
            placeholder="Nom, numéro, série, contact ou certificat…"
          />
        </label>
        <label className="sw-filter"><span className="sw-sr-only">Jeu</span>
          <select aria-label="Jeu" value={filters.tcg} onChange={event => props.onFiltersChange({ ...filters, tcg: event.target.value as StockFilters['tcg'], series: '' })}>
            <option value="all">Tous les jeux</option><option value="pokemon">Pokémon</option><option value="riftbound">Riftbound</option><option value="other">Autres</option>
          </select>
        </label>
        <div className="sw-filter"><SeriesFilter value={filters.series} onChange={value => updateFilter('series', value)} options={series.options} loading={series.loading} error={series.error} onRetry={series.reload} /></div>
        <label className="sw-filter">
          <span className="sw-sr-only">Origine</span>
          <select
            aria-label="Origine des articles"
            value={filters.origin}
            onChange={(event) => updateFilter('origin', event.target.value)}
          >
            <option value="all">Toutes les origines</option>
            <option value="purchase">Rachats</option>
            <option value="supplier">Fournisseurs</option>
            <option value="consignment">Dépôts-ventes</option>
          </select>
        </label>
        <label className="sw-filter">
          <span className="sw-sr-only">Visibilité au catalogue public</span>
          <select
            aria-label="Visibilité au catalogue public"
            value={filters.visibility}
            disabled={visibilityBusy}
            onChange={(event) =>
              updateFilter('visibility', event.target.value as StockFilters['visibility'])
            }
          >
            <option value="all">Toute visibilité</option>
            <option value="visible">Visible au catalogue</option>
            <option value="hidden">Masqué du catalogue</option>
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          className="sw-filter-button"
          aria-expanded={advanced}
          aria-controls="stock-grading-filters"
          onClick={() => setAdvanced((value) => !value)}
        >
          <FiFilter aria-hidden="true" /> Gradation
          {advancedCount > 0 && <span className="sw-filter-count">{advancedCount}</span>}
        </Button>
        {hasFilters && (
          <Button
            type="button"
            variant="ghost"
            className="sw-reset"
            onClick={clearFilters}
            aria-label="Effacer tous les filtres"
          >
            <FiX aria-hidden="true" />
          </Button>
        )}
      </div>
      {advanced && (
        <div id="stock-grading-filters" className="sw-advanced">
          <label>
            Gradation
            <select
              value={filters.gradingStatus}
              onChange={(event) =>
                updateFilter('gradingStatus', event.target.value as StockFilters['gradingStatus'])
              }
            >
              <option value="all">Tous les articles</option>
              <option value="graded">Gradés</option>
              <option value="ungraded">Non gradés</option>
            </select>
          </label>
          <label>
            Société
            <select
              value={filters.gradingCompany}
              onChange={(event) => updateFilter('gradingCompany', event.target.value)}
            >
              <option value="all">Toutes les sociétés</option>
              {props.gradingCompanies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Note ou mention
            <Input
              value={filters.gradingGrade}
              onChange={(event) => updateFilter('gradingGrade', event.target.value)}
              placeholder="10, 9.5, Authentic…"
            />
          </label>
        </div>
      )}
      <div className="sw-list-meta">
        <span>
          <strong>{items.length}</strong> article{items.length === 1 ? '' : 's'} sur cette page
        </span>
        <div>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || loading || !items.length}
            onClick={props.onAddPageToBasket}
          >
            <FiPlus aria-hidden="true" />
            Ajouter la page au panier
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={props.pagination.reload}
            disabled={loading}
          >
            Actualiser
          </Button>
        </div>
      </div>
      {props.error && (
        <div className="sw-message sw-error" role="alert">
          <span>{props.error}</span>
          <Button type="button" variant="secondary" onClick={props.pagination.reload}>
            Réessayer
          </Button>
        </div>
      )}
      {props.notice && (
        <p className="sw-message" role="status">
          {props.notice}
        </p>
      )}
      <div className="sw-bulk" aria-label="Visibilité groupée">
        <span className="sw-bulk-caption" role="status">
          {selection.size
            ? `${selection.size} sélectionné${selection.size > 1 ? 's' : ''}`
            : 'Sélectionnez des articles pour modifier leur visibilité.'}
        </span>
        <div className="sw-bulk-actions">
          <Button
            type="button"
            variant="ghost"
            disabled={blocked || !selection.size}
            onClick={() => props.onSetVisibility([...selection], false)}
          >
            <FiEye aria-hidden="true" />
            Publier
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={blocked || !selection.size}
            onClick={() => props.onSetVisibility([...selection], true)}
          >
            <FiEyeOff aria-hidden="true" />
            Masquer
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={blocked || !selection.size}
            aria-label="Effacer la sélection de visibilité"
            onClick={() => props.onVisibilitySelectionChange([])}
          >
            <FiX aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="sw-table-wrap" aria-busy={loading}>
        <table className="sw-table">
          <caption className="sw-sr-only">
            Articles du stock, prix, provenance, visibilité publique et quantité au panier
          </caption>
          <thead>
            <tr>
              <th className="sw-select-cell" scope="col">
                <PageCheckbox
                  checked={items.length > 0 && selectedOnPage === items.length}
                  mixed={selectedOnPage > 0 && selectedOnPage < items.length}
                  disabled={blocked || loading || !items.length}
                  onChange={togglePage}
                />
              </th>
              <th scope="col">Article</th>
              <th scope="col">Provenance</th>
              <th scope="col">État / gradation</th>
              <th className="sw-price-cell" scope="col">
                Prix demandé
              </th>
              <th scope="col">Catalogue</th>
              <th className="sw-basket-cell" scope="col">
                Panier
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && !items.length
              ? Array.from({ length: 5 }, (_, index) => (
                  <tr className="sw-skeleton-row" key={index} aria-hidden="true">
                    <td>
                      <span />
                    </td>
                    <td>
                      <span />
                    </td>
                    <td>
                      <span />
                    </td>
                    <td>
                      <span />
                    </td>
                    <td>
                      <span />
                    </td>
                    <td>
                      <span />
                    </td>
                    <td>
                      <span />
                    </td>
                  </tr>
                ))
              : items.map((item) => {
                  const inBasket = (props.basketQuantities[item._id] ?? 0) > 0;
                  return (
                    <tr
                      key={item._id}
                      className={`${inBasket ? 'sw-in-basket' : ''} ${selection.has(item._id) ? 'sw-checked' : ''}`}
                    >
                      <td className="sw-select-cell">
                        <input
                          type="checkbox"
                          checked={selection.has(item._id)}
                          disabled={blocked || (!selection.has(item._id) && selection.size >= 500)}
                          aria-label={`Sélectionner ${item.name} pour sa visibilité`}
                          onChange={() => toggleSelection(item)}
                        />
                      </td>
                      <td className="sw-product-cell">
                        <button
                          type="button"
                          className="sw-product"
                          data-product-id={item._id}
                          onClick={() => inspect(item)}
                          aria-label={`Ouvrir la fiche de ${item.name}`}
                        >
                          <ItemThumbnail
                            name={item.name}
                            photos={item.photos}
                            catalogueImageUrl={item.catalogueImageUrl}
                            apiBase={props.apiBase}
                          />
                          <span className="sw-product-text">
                            <strong>{item.name}</strong>
                            <span>
                              {[item.identifier, item.series].filter(Boolean).join(' · ') ||
                                'Référence non renseignée'}
                            </span>
                            <span className="sw-product-meta">
                              {languageLabel(item.language) && (
                                <span>{languageLabel(item.language)}</span>
                              )}
                              <span>
                                {availableQuantity(item)} disponible
                                {availableQuantity(item) > 1 ? 's' : ''}
                              </span>
                            </span>
                          </span>
                          <FiChevronRight className="sw-row-arrow" aria-hidden="true" />
                        </button>
                      </td>
                      <td className="sw-origin-cell" data-label="Provenance">
                        <span className={`sw-origin sw-origin-${item.origin ?? 'purchase'}`}>
                          {originLabel(item)}
                        </span>
                        <small>
                          {item.origin === 'consignment'
                            ? item.sellerName || 'Déposant non renseigné'
                            : item.purchaseReference || 'Référence non renseignée'}
                        </small>
                      </td>
                      <td className="sw-condition-cell" data-label="État">
                        <span>
                          {item.gradingCompany
                            ? `${item.gradingCompany} ${item.gradingGrade || '—'}`
                            : conditionLabel(item)}
                        </span>
                        <small>
                          {item.gradingCompany
                            ? conditionLabel(item)
                            : item.productType === 'sealed'
                              ? 'Emballage d’origine'
                              : 'Non gradé'}
                        </small>
                      </td>
                      <td className="sw-price-cell" data-label="Prix">
                        <button
                          type="button"
                          className="sw-price-button"
                          onClick={() => inspect(item)}
                          aria-label={`Modifier le prix de ${item.name}`}
                        >
                          <span>
                            {item.askingPriceCents === undefined
                              ? 'À définir'
                              : formatMoney(item.askingPriceCents)}
                          </span>
                          <FiEdit2 aria-hidden="true" />
                        </button>
                      </td>
                      <td className="sw-catalogue-cell" data-label="Catalogue">
                        <Button
                          type="button"
                          className="sw-visibility"
                          variant="ghost"
                          aria-pressed={!item.hiddenFromCatalogue}
                          disabled={blocked}
                          aria-label={`${item.hiddenFromCatalogue ? 'Afficher' : 'Masquer'} ${item.name} dans le catalogue public`}
                          onClick={() =>
                            props.onSetVisibility([item._id], !item.hiddenFromCatalogue)
                          }
                        >
                          {item.hiddenFromCatalogue ? (
                            <FiEyeOff aria-hidden="true" />
                          ) : (
                            <FiEye aria-hidden="true" />
                          )}
                          <span>{item.hiddenFromCatalogue ? 'Masqué' : 'Visible'}</span>
                        </Button>
                      </td>
                      <td className="sw-basket-cell" data-label="Panier">
                        {basketControl(item)}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
        {loading && (
          <span className="sw-sr-only" role="status">
            Chargement du stock…
          </span>
        )}
        {!loading && !props.error && !items.length && (
          <div className="sw-empty">
            <FiPackage aria-hidden="true" />
            <h3>
              {hasFilters
                ? 'Aucun article ne correspond'
                : 'Votre stock est prêt à accueillir ses premiers articles'}
            </h3>
            <p>
              {hasFilters
                ? 'Ajustez votre recherche ou effacez les filtres. Le panier reste conservé.'
                : 'Enregistrez un rachat, une réception fournisseur ou un dépôt-vente.'}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={hasFilters ? clearFilters : props.onAddStock}
            >
              {hasFilters ? 'Effacer les filtres' : 'Ajouter au stock'}
            </Button>
          </div>
        )}
      </div>
      <div className="sw-pagination">
        <span>
          Page {props.pagination.number}
          <small>La visibilité ne modifie pas la disponibilité interne.</small>
        </span>
        <nav aria-label="Pagination du stock">
          <Button
            type="button"
            variant="outline"
            disabled={loading || !props.pagination.hasPrevious}
            onClick={props.pagination.previous}
          >
            <FiChevronLeft aria-hidden="true" />
            Précédent
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={loading || !props.pagination.hasNext}
            onClick={props.pagination.next}
          >
            Suivant
            <FiChevronRight aria-hidden="true" />
          </Button>
        </nav>
      </div>
      <div className={`sw-basket-bar ${props.basketCount ? 'sw-basket-active' : ''}`}>
        <div className="sw-basket-summary">
          <FiShoppingBag aria-hidden="true" />
          <div>
            <strong>
              {props.basketCount
                ? `${props.basketCount} article${props.basketCount > 1 ? 's' : ''} au panier`
                : 'Votre panier est vide'}
            </strong>
            <span>
              {props.basketCount
                ? formatMoney(props.basketTotalCents)
                : 'Ajoutez des articles avec les boutons +.'}
            </span>
          </div>
        </div>
        <div className="sw-basket-actions">
          <Button
            type="button"
            variant="ghost"
            disabled={busy || !props.basketCount}
            onClick={props.onClearBasket}
          >
            Vider
          </Button>
          <Button type="button" disabled={!props.basketCount} onClick={props.onOpenBasket}>
            Voir le panier
            <FiArrowRight aria-hidden="true" />
          </Button>
        </div>
      </div>
      {detail && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setInspected(null);
          }}
        >
          <DialogContent
            className="stock-workspace-detail"
            data-stock-workspace-dialog
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              trigger.current?.focus();
            }}
          >
            <div className="sw-detail-heading">
              <span className="sw-detail-eyebrow">Fiche de stock</span>
              <DialogTitle>{detail.name}</DialogTitle>
              <DialogDescription>
                {[detail.series, detail.identifier, detail.serialNumber]
                  .filter(Boolean)
                  .join(' · ') || 'Article sans référence'}
              </DialogDescription>
            </div>
            <ProductGallery key={detail._id} item={detail} apiBase={props.apiBase} />
            <div className="sw-detail-primary">
              <strong>
                {detail.askingPriceCents === undefined
                  ? 'Prix à définir'
                  : formatMoney(detail.askingPriceCents)}
              </strong>
              <span>{availableQuantity(detail)} disponible(s)</span>
              {basketControl(detail)}
            </div>
            <div className="sw-detail-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setInspected(null);
                  props.onEditProduct(detail);
                }}
              >
                <FiEdit2 aria-hidden="true" />
                Modifier la fiche et les photos
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={blocked}
                onClick={() => props.onSetVisibility([detail._id], !detail.hiddenFromCatalogue)}
              >
                {detail.hiddenFromCatalogue ? (
                  <FiEyeOff aria-hidden="true" />
                ) : (
                  <FiEye aria-hidden="true" />
                )}
                {detail.hiddenFromCatalogue ? 'Publier au catalogue' : 'Masquer du catalogue'}
              </Button>
            </div>
            {detail.description && (
              <section className="sw-detail-section">
                <h3>Description</h3>
                <p className="sw-description">{detail.description}</p>
              </section>
            )}
            <section className="sw-detail-section">
              <h3>Caractéristiques</h3>
              <dl>
                <div>
                  <dt>Langue</dt>
                  <dd>{languageLabel(detail.language) || 'Non renseignée'}</dd>
                </div>
                <div>
                  <dt>État</dt>
                  <dd>{conditionLabel(detail)}</dd>
                </div>
                <div>
                  <dt>Gradation</dt>
                  <dd>
                    {detail.gradingCompany
                      ? `${detail.gradingCompany} · ${detail.gradingGrade || 'Note non renseignée'}`
                      : 'Non gradé'}
                  </dd>
                </div>
                {detail.gradingCertificate && (
                  <div>
                    <dt>Certificat</dt>
                    <dd>{detail.gradingCertificate}</dd>
                  </div>
                )}
              </dl>
              {detail.gradingNotes && (
                <p>
                  <strong>Notes internes de gradation</strong>
                  <br />
                  {detail.gradingNotes}
                </p>
              )}
            </section>
            <section className="sw-detail-section">
              <h3>Provenance · informations internes</h3>
              <dl>
                <div>
                  <dt>Origine</dt>
                  <dd>{originLabel(detail)}</dd>
                </div>
                {detail.sellerName && (
                  <div>
                    <dt>{detail.origin === 'consignment' ? 'Déposant' : 'Contact'}</dt>
                    <dd>{detail.sellerName}</dd>
                  </div>
                )}
                {detail.purchaseReference && (
                  <div>
                    <dt>Référence</dt>
                    <dd>{detail.purchaseReference}</dd>
                  </div>
                )}
                {detail.purchaseOccurredAt !== undefined && (
                  <div>
                    <dt>Date d’acquisition</dt>
                    <dd>{formatDate(detail.purchaseOccurredAt)}</dd>
                  </div>
                )}
                {detail.origin !== 'consignment' && (
                  <div>
                    <dt>Coût historique de la ligne d’achat</dt>
                    <dd>
                      {detail.purchasePriceCents == null
                        ? 'Non renseigné'
                        : formatMoney(detail.purchasePriceCents)}
                    </dd>
                  </div>
                )}
                {detail.origin === 'consignment' && (
                  <>
                    <div>
                      <dt>Prix convenu</dt>
                      <dd>
                        {detail.agreedPriceCents==null?'Non renseigné':formatMoney(detail.agreedPriceCents)}
                      </dd>
                    </div>
                    <div>
                      <dt>Commission</dt>
                      <dd>{detail.commissionRateBps==null?'Non renseignée':`${detail.commissionRateBps/100} %`}</dd>
                    </div>
                  </>
                )}
              </dl>
              {detail.origin === 'consignment' && (
                <Button
                  type="button"
                  variant="link"
                  onClick={() => {
                    setInspected(null);
                    props.onOpenConsignments();
                  }}
                >
                  Ouvrir l’accord de dépôt-vente
                  <FiArrowRight aria-hidden="true" />
                </Button>
              )}
            </section>
            <section className="sw-detail-section">
              <h3>Prix demandé</h3>
              <p>
                Ce prix est proposé au catalogue. Le prix final de vente se vérifie dans le panier.
              </p>
              <form
                className="sw-price-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  props.onSaveAskingPrice(detail);
                }}
              >
                <label>
                  Montant ({currencySymbol})
                  <Input
                    inputMode="decimal"
                    required
                    aria-label={`Prix demandé pour ${detail.name}`}
                    value={
                      props.priceDrafts[detail._id] ??
                      (detail.askingPriceCents === undefined
                        ? ''
                        : (detail.askingPriceCents / 100).toFixed(2))
                    }
                    onChange={(event) => props.onPriceDraftChange(detail, event.target.value)}
                  />
                </label>
                <Button type="submit" disabled={busy}>
                  Enregistrer
                </Button>
              </form>
            </section>
            <StockTraceability key={detail._id} request={props.request} itemId={detail._id}/>
            <MarketPrices request={props.request} item={detail}/>
            {Boolean(detail.photos?.length) && (
              <section className="sw-detail-section">
                <h3>Fichiers et photos</h3>
                <ul className="sw-file-list">
                  {detail.photos?.map((photo) => (
                    <li key={photo._id}>
                      <a
                        href={`${props.apiBase}/attachments/${encodeURIComponent(photo._id)}/download`}
                      >
                        {photo.filename}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {props.error && (
              <p className="sw-message sw-error" role="alert">
                {props.error}
              </p>
            )}
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
