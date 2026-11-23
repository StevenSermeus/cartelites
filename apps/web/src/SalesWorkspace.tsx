import { SeriesFilter, useSeriesOptions } from './SeriesInput';
import { useRef, useState } from 'react';
import {
  FiArrowLeft,
  FiArrowRight,
  FiCheck,
  FiChevronLeft,
  FiChevronRight,
  FiMinus,
  FiPlus,
  FiSearch,
  FiShoppingBag,
  FiShoppingCart,
  FiTrash2,
  FiX,
} from 'react-icons/fi';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog';
import { ItemThumbnail } from './ItemThumbnail';
import { SalePaymentEditor, paymentPayload, type PaymentDraft } from './SalePaymentEditor';
import { currencySymbol, formatMoney } from './shopFormat';
import type { StockWorkspaceItem } from './StockWorkspace';
import './sales-workspace.css';

export type SalesWorkspaceProps<T extends StockWorkspaceItem = StockWorkspaceItem> = {
  mode: 'selection' | 'review';
  items: readonly T[];
  basketItems: readonly T[];
  basketQuantities: Readonly<Record<string, number>>;
  lineTotals: Readonly<Record<string, string>>;
  totalCents: number;
  apiBase: string;
  search: string;
  tcg: string;
  series: string;
  onTcgChange: (tcg: string) => void;
  onSeriesChange: (series: string) => void;
  origin: string;
  onSearchChange: (search: string) => void;
  onOriginChange: (origin: string) => void;
  onQuantityChange: (item: T, quantity: number) => void;
  onLineTotalChange: (item: T, amount: string) => void;
  onRemoveItem: (item: T) => void;
  onClearBasket: () => void;
  onReviewBasket: () => void;
  onContinueShopping: () => void;
  paymentDraft: PaymentDraft;
  onPaymentChange: (draft: PaymentDraft) => void;
  confirmOpen: boolean;
  onConfirmOpenChange: (open: boolean) => void;
  onConfirmSale: () => void;
  loading?: boolean;
  submitting?: boolean;
  error?: string;
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
  item.origin === 'consignment'
    ? 'Dépôt-vente'
    : item.origin === 'supplier'
      ? 'Fournisseur'
      : 'Rachat';
const available = (item: StockWorkspaceItem) =>
  item.status === 'available'
    ? item.origin === 'supplier'
      ? Math.max(0, item.quantity ?? 0)
      : 1
    : 0;
const parseCents = (value: string) =>
  /^\d+(?:[.,]\d{1,2})?$/.test(value.trim())
    ? Math.round(Number(value.replace(',', '.')) * 100)
    : Number.NaN;

export function SalesWorkspace<T extends StockWorkspaceItem>(props: SalesWorkspaceProps<T>) {
  const { submitting = false, loading = false } = props;
  const series = useSeriesOptions(props.tcg, false, props.mode === 'selection');
  const [validationError, setValidationError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);
  const reviewButton = useRef<HTMLButtonElement>(null);
  const unitCount = props.basketItems.reduce(
    (sum, item) => sum + (props.basketQuantities[item._id] ?? 1),
    0,
  );
  const hasFilters = Boolean(props.search.trim() || props.origin !== 'all' || props.tcg !== 'all' || props.series);
  const getQuantity = (item: T) => props.basketQuantities[item._id] ?? 0;
  const lineText = (item: T) =>
    props.lineTotals[item._id] ??
    (item.askingPriceCents === undefined
      ? ''
      : ((item.askingPriceCents * (props.basketQuantities[item._id] ?? 1)) / 100).toFixed(2));
  const lineCents = (item: T) => parseCents(lineText(item));
  function quantityControl(item: T) {
    const quantity = getQuantity(item);
    return (
      <div className="sales-quantity" role="group" aria-label={`Quantité de ${item.name}`}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={submitting || quantity <= 0}
          aria-label={`Retirer une unité de ${item.name}`}
          onClick={() => props.onQuantityChange(item, Math.max(0, quantity - 1))}
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
          disabled={submitting || quantity >= available(item)}
          aria-label={`Ajouter une unité de ${item.name}`}
          onClick={() => props.onQuantityChange(item, Math.min(available(item), quantity + 1))}
        >
          <FiPlus aria-hidden="true" />
        </Button>
      </div>
    );
  }
  function validate() {
    if (!props.basketItems.length) throw new Error('Ajoutez au moins un article au panier.');
    let total = 0;
    for (const item of props.basketItems) {
      const quantity = props.basketQuantities[item._id] ?? 1;
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > available(item))
        throw new Error(
          `La quantité de « ${item.name} » n’est plus disponible. Ajustez le panier.`,
        );
      const amount = lineCents(item);
      if (!Number.isSafeInteger(amount) || amount < 0)
        throw new Error(
          `Indiquez un total de ligne valide pour « ${item.name} » (deux décimales maximum).`,
        );
      if (
        item.origin === 'consignment' &&
        amount < (item.agreedPriceCents ?? item.askingPriceCents ?? 0)
      )
        throw new Error(
          `Le prix de « ${item.name} » est inférieur à l’accord du déposant. Faites modifier l’accord avant la vente.`,
        );
      total += amount;
    }
    if (!Number.isSafeInteger(total) || total !== props.totalCents)
      throw new Error('Le total du panier a changé. Vérifiez les montants avant de confirmer.');
    return paymentPayload(props.paymentDraft, total);
  }
  function reviewSale() {
    setValidationError('');
    try {
      validate();
      props.onConfirmOpenChange(true);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Vérifiez le panier.');
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }
  function confirmSale() {
    setValidationError('');
    try {
      validate();
      props.onConfirmSale();
    } catch (error) {
      props.onConfirmOpenChange(false);
      setValidationError(error instanceof Error ? error.message : 'Vérifiez le panier.');
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }
  function economics(item: T) {
    const amount = lineCents(item);
    if (!Number.isSafeInteger(amount))
      return 'Renseignez un total de ligne pour calculer le résultat.';
    if (item.origin === 'consignment') {
      if(item.commissionRateBps==null||!Number.isSafeInteger(item.commissionRateBps))return 'Commission non renseignée : répartition non calculable.';
      const commission = Math.round((amount * item.commissionRateBps) / 10000);
      return `Commission boutique ${formatMoney(commission)} · Part déposant ${formatMoney(amount - commission)}`;
    }
    if (item.origin === 'supplier' || (item.quantity??1)>1)
      return 'Le coût des lots sera alloué en FIFO lors de la confirmation.';
    return item.purchasePriceCents == null
      ? 'Coût d’acquisition non renseigné.'
      : `Coût d’achat ${formatMoney(item.purchasePriceCents)} · Écart théorique ${formatMoney(amount - item.purchasePriceCents)}, avant TVA et frais`;
  }
  return (
    <section
      className={`sales-workspace sales-workspace-${props.mode}`}
      aria-label={
        props.mode === 'selection'
          ? 'Sélection des articles à vendre'
          : 'Vérification du panier et du règlement'
      }
    >
      {props.mode === 'selection' ? (
        <>
          <div className="sales-selection-toolbar">
            <label className="sales-search">
              <FiSearch aria-hidden="true" />
              <span className="sales-sr-only">Rechercher dans le stock</span>
              <Input
                type="search"
                value={props.search}
                placeholder="Nom, série ou numéro de carte…"
                onChange={(event) => props.onSearchChange(event.target.value)}
              />
            </label>
            <label className="sales-origin-filter"><span className="sales-sr-only">Jeu</span>
              <select aria-label="Jeu" value={props.tcg} onChange={event => props.onTcgChange(event.target.value)}>
                <option value="all">Tous les jeux</option><option value="pokemon">Pokémon</option><option value="riftbound">Riftbound</option><option value="other">Autres</option>
              </select>
            </label>
            <div className="sales-origin-filter"><SeriesFilter value={props.series} onChange={props.onSeriesChange} options={series.options} loading={series.loading} error={series.error} onRetry={series.reload} /></div>
            <label className="sales-origin-filter">
              <span className="sales-sr-only">Origine des articles</span>
              <select
                aria-label="Origine des articles"
                value={props.origin}
                onChange={(event) => props.onOriginChange(event.target.value)}
              >
                <option value="all">Toutes les origines</option>
                <option value="purchase">Rachats</option>
                <option value="supplier">Fournisseurs</option>
                <option value="consignment">Dépôts-ventes</option>
              </select>
            </label>
            {hasFilters && (
              <Button
                type="button"
                variant="ghost"
                className="sales-reset"
                aria-label="Effacer les filtres"
                onClick={() => {
                  props.onSearchChange('');
                  props.onOriginChange('all');
                  props.onTcgChange('all');
                  props.onSeriesChange('');
                }}
              >
                <FiX aria-hidden="true" />
              </Button>
            )}
          </div>
          <div className="sales-list-caption">
            <span>
              {props.items.length} article{props.items.length > 1 ? 's' : ''} sur cette page
            </span>
            <span>Le panier reste conservé pendant la recherche.</span>
          </div>
          {props.error && (
            <div className="sales-feedback sales-feedback-error" role="alert">
              <span>{props.error}</span>
              <Button type="button" variant="secondary" onClick={props.pagination.reload}>
                Réessayer
              </Button>
            </div>
          )}
          <div className="sales-picker" aria-busy={loading}>
            <div className="sales-picker-heading" aria-hidden="true">
              <span>Article</span>
              <span>Origine</span>
              <span>Prix unitaire</span>
              <span>Au panier</span>
            </div>
            <ul className="sales-picker-list" aria-label="Articles disponibles">
              {loading && !props.items.length
                ? Array.from({ length: 5 }, (_, index) => (
                    <li className="sales-skeleton" key={index} aria-hidden="true">
                      <span />
                      <span />
                      <span />
                      <span />
                    </li>
                  ))
                : props.items.map((item) => (
                    <li
                      key={item._id}
                      className={`sales-picker-row ${getQuantity(item) ? 'sales-selected' : ''}`}
                    >
                      <div className="sales-product">
                        <ItemThumbnail
                          name={item.name}
                          photos={item.photos}
                          catalogueImageUrl={item.catalogueImageUrl}
                          apiBase={props.apiBase}
                        />
                        <div>
                          <strong>{item.name}</strong>
                          <span>
                            {[item.identifier, item.series].filter(Boolean).join(' · ') ||
                              'Référence non renseignée'}
                          </span>
                          <small>
                            {[
                              item.language?.toUpperCase(),
                              item.gradingCompany
                                ? `${item.gradingCompany} ${item.gradingGrade ?? ''}`
                                : item.condition,
                              `${available(item)} disponible(s)`,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </small>
                        </div>
                      </div>
                      <span className="sales-picker-origin">{originLabel(item)}</span>
                      <strong className="sales-picker-price">
                        {item.askingPriceCents === undefined
                          ? 'À définir'
                          : formatMoney(item.askingPriceCents)}
                      </strong>
                      {quantityControl(item)}
                    </li>
                  ))}
            </ul>
            {loading && (
              <p className="sales-sr-only" role="status">
                Chargement du stock…
              </p>
            )}
            {!loading && !props.error && !props.items.length && (
              <div className="sales-empty">
                <FiShoppingBag aria-hidden="true" />
                <h3>{hasFilters ? 'Aucun article ne correspond' : 'Aucun article disponible'}</h3>
                <p>
                  {hasFilters
                    ? 'Modifiez votre recherche pour retrouver les articles disponibles.'
                    : 'Les articles disponibles apparaîtront ici après leur entrée en stock.'}
                </p>
                {hasFilters && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      props.onSearchChange('');
                      props.onOriginChange('all');
                  props.onTcgChange('all');
                  props.onSeriesChange('');
                    }}
                  >
                    Effacer les filtres
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="sales-pagination">
            <span>Page {props.pagination.number}</span>
            <nav aria-label="Pagination des articles">
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
          <div className={`sales-basket-dock ${unitCount ? 'sales-basket-dock-active' : ''}`}>
            <div>
              <FiShoppingCart aria-hidden="true" />
              <span>
                <strong>
                  {unitCount
                    ? `${unitCount} article${unitCount > 1 ? 's' : ''} au panier`
                    : 'Votre panier est vide'}
                </strong>
                <small>
                  {unitCount
                    ? formatMoney(props.totalCents)
                    : 'Ajoutez avec +'}
                </small>
              </span>
            </div>
            <div>
              <Button
                type="button"
                variant="ghost"
                disabled={submitting || !unitCount}
                onClick={props.onClearBasket}
              >
                Vider
              </Button>
              <Button type="button" disabled={!unitCount} onClick={props.onReviewBasket}>
                Vérifier le panier
                <FiArrowRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="sales-review-toolbar">
            <Button
              type="button"
              variant="ghost"
              onClick={props.onContinueShopping}
              disabled={submitting}
            >
              <FiArrowLeft aria-hidden="true" />
              Ajouter d’autres articles
            </Button>
            <span>
              {unitCount} unité{unitCount > 1 ? 's' : ''} · {props.basketItems.length} ligne
              {props.basketItems.length > 1 ? 's' : ''}
            </span>
          </div>
          {(props.error || validationError) && (
            <div
              ref={errorRef}
              tabIndex={-1}
              className="sales-feedback sales-feedback-error"
              role="alert"
            >
              {props.error || validationError}
            </div>
          )}
          {!props.basketItems.length ? (
            <div className="sales-empty sales-empty-review">
              <FiShoppingCart aria-hidden="true" />
              <h3>Votre panier est vide</h3>
              <p>
                Choisissez les articles disponibles, puis vérifiez leurs prix et le paiement reçu.
              </p>
              <Button type="button" onClick={props.onContinueShopping}>
                Parcourir le stock
                <FiArrowRight aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <div className="sales-review-grid">
              <div className="sales-review-lines">
                <div className="sales-lines-heading">
                  <h2>Articles de la vente</h2>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={submitting}
                    onClick={props.onClearBasket}
                  >
                    Vider le panier
                  </Button>
                </div>
                <ul>
                  {props.basketItems.map((item) => {
                    const quantity = props.basketQuantities[item._id] ?? 1,
                      amount = lineCents(item),
                      invalidQuantity = quantity > available(item);
                    return (
                      <li
                        className={`sales-review-line ${invalidQuantity ? 'sales-line-conflict' : ''}`}
                        key={item._id}
                      >
                        <div className="sales-review-product">
                          <ItemThumbnail
                            name={item.name}
                            photos={item.photos}
                            catalogueImageUrl={item.catalogueImageUrl}
                            apiBase={props.apiBase}
                          />
                          <div>
                            <strong>{item.name}</strong>
                            <span>
                              {[item.identifier, item.series].filter(Boolean).join(' · ')}
                            </span>
                            <small>
                              {originLabel(item)}
                              {item.gradingCompany
                                ? ` · ${item.gradingCompany} ${item.gradingGrade ?? ''}`
                                : ''}
                            </small>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={submitting}
                            aria-label={`Retirer ${item.name} du panier`}
                            onClick={() => props.onRemoveItem(item)}
                          >
                            <FiTrash2 aria-hidden="true" />
                          </Button>
                        </div>
                        <div className="sales-line-editors">
                          <div>
                            <span className="sales-field-label">Quantité</span>
                            {quantityControl(item)}
                          </div>
                          <label>
                            Total de la ligne ({currencySymbol})
                            <Input
                              inputMode="decimal"
                              disabled={submitting}
                              value={lineText(item)}
                              aria-label={`Total pour ${quantity} unité(s) de ${item.name}`}
                              aria-invalid={lineText(item) !== '' && !Number.isSafeInteger(amount)}
                              onChange={(event) => {
                                setValidationError('');
                                props.onLineTotalChange(item, event.target.value);
                              }}
                            />
                          </label>
                        </div>
                        <div className="sales-line-meta">
                          <span>
                            {quantity} unité(s)
                            {Number.isSafeInteger(amount) && quantity > 0
                              ? ` · ${formatMoney(Math.round(amount / quantity))} / unité en moyenne`
                              : ''}
                          </span>
                          {invalidQuantity && (
                            <p className="sales-quantity-error" role="alert">
                              Stock insuffisant : {available(item)} disponible(s). Ajustez la
                              quantité.
                            </p>
                          )}
                          <p>{economics(item)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <aside className="sales-checkout" aria-label="Règlement et total">
                <div className="sales-checkout-total">
                  <span>Total de la vente</span>
                  <strong>{formatMoney(props.totalCents)}</strong>
                  <small>
                    {unitCount} unité(s) · {props.basketItems.length} ligne(s)
                  </small>
                </div>
                <SalePaymentEditor
                  value={props.paymentDraft}
                  onChange={(draft) => {
                    setValidationError('');
                    props.onPaymentChange(draft);
                  }}
                  totalCents={props.totalCents}
                  disabled={submitting}
                />
                <div className="sales-checkout-submit">
                  <Button
                    ref={reviewButton}
                    type="button"
                    disabled={submitting}
                    onClick={reviewSale}
                  >
                    {submitting ? 'Enregistrement…' : 'Vérifier et confirmer'}
                    <FiArrowRight aria-hidden="true" />
                  </Button>
                  <p>
                    La disponibilité de chaque article sera vérifiée au moment de l’enregistrement.
                    La vente utilise la date et l’heure de sa confirmation.
                  </p>
                </div>
              </aside>
            </div>
          )}
        </>
      )}
      <Dialog
        open={props.confirmOpen}
        onOpenChange={(open) => {
          if (!submitting) props.onConfirmOpenChange(open);
        }}
      >
        <DialogContent
          className="sales-confirmation"
          data-sales-confirmation
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            reviewButton.current?.focus();
          }}
        >
          <DialogTitle>Confirmer cette vente</DialogTitle>
          <DialogDescription>
            Vérifiez les quantités et le paiement. Cette action enregistre la vente et retire les
            articles du stock.
          </DialogDescription>
          {props.error && (
            <p className="sales-feedback sales-feedback-error" role="alert">
              {props.error}
            </p>
          )}
          <ul className="sales-confirmation-lines">
            {props.basketItems.map((item) => (
              <li key={item._id}>
                <span>
                  {props.basketQuantities[item._id] ?? 1} × {item.name}
                </span>
                <strong>
                  {Number.isSafeInteger(lineCents(item))
                    ? formatMoney(lineCents(item))
                    : 'À corriger'}
                </strong>
              </li>
            ))}
          </ul>
          <div className="sales-confirmation-total">
            <span>Total</span>
            <strong>{formatMoney(props.totalCents)}</strong>
          </div>
          <p className="sales-confirmation-payment">
            {props.paymentDraft.mode === 'pending'
              ? 'À encaisser — aucun paiement reçu enregistré.'
              : props.paymentDraft.mode === 'cash'
                ? `Espèces reçues : ${formatMoney(props.totalCents)}`
                : props.paymentDraft.mode === 'transfer'
                  ? `Virement reçu : ${formatMoney(props.totalCents)}`
                  : props.paymentDraft.mode === 'mixed'
                    ? `Espèces ${Number.isSafeInteger(parseCents(props.paymentDraft.cash)) ? formatMoney(parseCents(props.paymentDraft.cash)) : '—'} · Virement ${Number.isSafeInteger(parseCents(props.paymentDraft.cash)) ? formatMoney(props.totalCents - parseCents(props.paymentDraft.cash)) : '—'}`
                    : 'Paiement à préciser'}
          </p>
          <div className="sales-confirmation-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={() => props.onConfirmOpenChange(false)}
            >
              Modifier le panier
            </Button>
            <Button type="button" disabled={submitting} onClick={confirmSale}>
              {submitting ? 'Enregistrement…' : 'Confirmer la vente'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
