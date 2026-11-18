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
  date: new Date().toLocaleDateString('en-CA'),
  reference: '',
});
export const paymentStatusLabel = (sale: { paymentStatus?: string }) =>
  sale.paymentStatus === 'received'
    ? 'Reçu'
    : sale.paymentStatus === 'pending'
      ? 'À encaisser'
      : 'Non renseigné';
const money = (cents: number) =>
  new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
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
      'Le montant reçu en espèces doit être compris entre 0 € et le total, avec deux décimales maximum.',
    );
  const receivedAt = new Date(`${draft.date}T12:00:00`).getTime();
  const parsedDate = new Date(receivedAt);
  const calendarDate = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`;
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
  return (
    <fieldset disabled={disabled} className="sale-payment-editor">
      <legend>Encaissement · {money(totalCents)}</legend>
      <label>
        Mode d’encaissement
        <select
          value={value.mode}
          onChange={(event) =>
            onChange({ ...value, mode: event.target.value as PaymentDraft['mode'] })
          }
        >
          <option value="">Choisir un mode</option>
          <option value="cash">Espèces</option>
          <option value="transfer">Virement</option>
          <option value="mixed">Espèces + virement</option>
          {allowPending && <option value="pending">À encaisser</option>}
        </select>
      </label>
      {value.mode === 'mixed' && (
        <div className="form-grid">
          <label>
            Espèces reçues (€)
            <input
              inputMode="decimal"
              value={value.cash}
              onChange={(event) => onChange({ ...value, cash: event.target.value })}
            />
          </label>
          <p>
            Virement reçu :{' '}
            <strong>
              {Number.isSafeInteger(cash) && cash <= totalCents ? money(totalCents - cash) : '—'}
            </strong>
            <small>Le complément est calculé automatiquement.</small>
          </p>
        </div>
      )}
      {value.mode && value.mode !== 'pending' && (
        <div className="form-grid">
          <label>
            Date de réception
            <input
              type="date"
              value={value.date}
              onChange={(event) => onChange({ ...value, date: event.target.value })}
            />
          </label>
          <label>
            Référence ou note (facultatif)
            <input
              maxLength={300}
              value={value.reference}
              onChange={(event) => onChange({ ...value, reference: event.target.value })}
              placeholder="Référence bancaire…"
            />
          </label>
        </div>
      )}
      <p className="purchase-muted">
        {value.mode === 'pending'
          ? 'La vente sera enregistrée sans encaissement. Vous pourrez la marquer reçue depuis l’historique.'
          : 'Enregistrez uniquement les sommes effectivement reçues.'}
      </p>
    </fieldset>
  );
}
export function paymentDetail(payment: SalePayment) {
  return `Espèces ${money(payment.cashCents)} · Virement ${money(payment.transferCents)} · Reçu le ${new Date(payment.receivedAt).toLocaleDateString('fr-BE')}${payment.reference ? ` · ${payment.reference}` : ''}`;
}
