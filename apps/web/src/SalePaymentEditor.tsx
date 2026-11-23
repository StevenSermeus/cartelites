import { useId } from 'react';
import { FiArchive, FiClock, FiColumns, FiRepeat } from 'react-icons/fi';
import { Input } from './components/ui/input';
import { shopDateInput, shopDateTimestamp } from './shopFormat';
import { currencySymbol, shopCurrency, shopTimezone } from './shopFormat';
export type SalePayment = {
  cashCents: number;
  transferCents: number;
  receivedAt: number;
  reference?: string;
};
export type PaymentDraft = {
  mode: '' | 'cash' | 'transfer' | 'mixed' | 'pending';
  cash: string;
  date: string;
  reference: string;
};
export const newPaymentDraft = (): PaymentDraft => ({
  mode: '',
  cash: '',
  date: shopDateInput(),
  reference: '',
});
export const paymentStatusLabel = (sale: { paymentStatus?: string }) =>
  sale.paymentStatus === 'received'
    ? 'Reçu'
    : sale.paymentStatus === 'pending'
      ? 'À encaisser'
      : 'Non renseigné';
const money = (cents: number) =>
  new Intl.NumberFormat('fr-BE', { style: 'currency', currency: shopCurrency }).format(cents / 100);
const cents = (text: string) =>
  /^\d+(?:[.,]\d{1,2})?$/.test(text.trim())
    ? Math.round(Number(text.replace(',', '.')) * 100)
    : NaN;
export function paymentPayload(
  draft: PaymentDraft,
  totalCents: number,
): { paymentStatus: 'pending' | 'received'; payment?: SalePayment } {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0)
    throw new Error('Le total de la vente est invalide.');
  if (!draft.mode)
    throw new Error('Indiquez comment la vente a été encaissée, ou choisissez « À encaisser ».');
  if (draft.mode === 'pending') return { paymentStatus: 'pending' };
  const cashCents =
    draft.mode === 'cash' ? totalCents : draft.mode === 'transfer' ? 0 : cents(draft.cash);
  if (!Number.isSafeInteger(cashCents) || cashCents < 0 || cashCents > totalCents)
    throw new Error(
      'Le montant reçu en espèces doit être compris entre 0 € et le total, avec deux décimales maximum.'.replaceAll(
        '€',
        currencySymbol,
      ),
    );
  const receivedAt = shopDateTimestamp(draft.date);
  const calendarDate = shopDateInput(new Date(receivedAt));
  if (!Number.isFinite(receivedAt) || calendarDate !== draft.date)
    throw new Error('Indiquez une date de réception valide.');
  return {
    paymentStatus: 'received',
    payment: {
      cashCents,
      transferCents: totalCents - cashCents,
      receivedAt,
      reference: draft.reference.trim() || undefined,
    },
  };
}
export function SalePaymentEditor({
  value,
  onChange,
  totalCents,
  allowPending = true,
  disabled = false,
}: {
  value: PaymentDraft;
  onChange: (draft: PaymentDraft) => void;
  totalCents: number;
  allowPending?: boolean;
  disabled?: boolean;
}) {
  const cash = cents(value.cash);
  const groupId = useId();
  const mixedInvalid =
    value.mode === 'mixed' &&
    value.cash.trim() !== '' &&
    (!Number.isSafeInteger(cash) || cash < 0 || cash > totalCents);
  const choices = [
    { value: 'cash', label: 'Espèces', Icon: FiArchive },
    { value: 'transfer', label: 'Virement', Icon: FiRepeat },
    { value: 'mixed', label: 'Mixte', Icon: FiColumns },
    ...(allowPending ? [{ value: 'pending', label: 'À encaisser', Icon: FiClock }] : []),
  ];
  return (
    <fieldset disabled={disabled} className="sale-payment-editor sale-payment-editor-redesign">
      <legend>Enregistrement du paiement</legend>
      <p className="payment-intro">Comment cette vente a-t-elle été encaissée ?</p>
      <div className="payment-methods">
        {choices.map(({ value: mode, label, Icon }) => (
          <label
            className={`payment-method ${value.mode === mode ? 'is-selected' : ''}`}
            key={mode}
          >
            <input
              type="radio"
              name={groupId}
              value={mode}
              checked={value.mode === mode}
              onChange={() => onChange({ ...value, mode: mode as PaymentDraft['mode'] })}
            />
            <span>
              <Icon aria-hidden="true" />
              {label}
            </span>
          </label>
        ))}
      </div>
      <div className="payment-entry-fields">
        {value.mode === 'mixed' && (
          <div className="payment-split">
            <label>
              Espèces reçues ({currencySymbol})
              <Input
                inputMode="decimal"
                value={value.cash}
                aria-invalid={mixedInvalid}
                aria-describedby={mixedInvalid ? `${groupId}-error` : undefined}
                onChange={(event) => onChange({ ...value, cash: event.target.value })}
              />
            </label>
            <div>
              <span>Virement reçu</span>
              <strong aria-live="polite">
                {Number.isSafeInteger(cash) && cash >= 0 && cash <= totalCents
                  ? money(totalCents - cash)
                  : '—'}
              </strong>
              <small>Complément calculé</small>
            </div>
            {mixedInvalid && (
              <p className="payment-field-error" id={`${groupId}-error`} role="alert">
                Indiquez un montant entre zéro et {money(totalCents)}, avec deux décimales maximum.
              </p>
            )}
          </div>
        )}
        {value.mode && value.mode !== 'pending' && (
          <div className="payment-date-reference">
            <label>
              Date de réception
              <Input
                type="date"
                required
                value={value.date}
                onChange={(event) => onChange({ ...value, date: event.target.value })}
              />
            </label>
            <label>
              Référence ou note <span>(facultatif)</span>
              <Input
                maxLength={300}
                value={value.reference}
                onChange={(event) => onChange({ ...value, reference: event.target.value })}
                placeholder="Référence du règlement…"
              />
            </label>
          </div>
        )}
        <p
          className={`payment-disclosure ${value.mode === 'pending' ? 'payment-disclosure-pending' : ''}`}
        >
          {value.mode === 'pending' ? (
            <>
              <FiClock aria-hidden="true" />
              <span>
                La vente sera enregistrée <strong>à encaisser</strong>. Le stock sera retiré ; vous
                enregistrerez le paiement reçu dans l’historique.
              </span>
            </>
          ) : (
            <span>
              Ces informations enregistrent les sommes effectivement reçues. L’application ne
              réalise aucun transfert d’argent.
            </span>
          )}
        </p>
      </div>
    </fieldset>
  );
}

export function paymentDetail(payment: SalePayment) {
  return `Espèces ${money(payment.cashCents)} · Virement ${money(payment.transferCents)} · Reçu le ${new Date(payment.receivedAt).toLocaleDateString('fr-BE', { timeZone: shopTimezone })}${payment.reference ? ` · ${payment.reference}` : ''}`;
}
