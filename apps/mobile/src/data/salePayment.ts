import type { SaleSettlement } from './apiRepository';
import {shopDay,shopDayTimestamp} from './shopCalendar';

export type PaymentDraft = {
  mode: '' | 'cash' | 'transfer' | 'mixed' | 'pending';
  cash: string;
  transfer: string;
  date: string;
  reference: string;
};
export const paymentDay = shopDay;
export const emptyPaymentDraft = (): PaymentDraft => ({
  mode: '',
  cash: '',
  transfer: '',
  date: paymentDay(),
  reference: '',
});
function cents(value: string) {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim()))
    throw new Error('Saisissez un montant valide avec deux décimales maximum.');
  const result = Math.round(Number(value.replace(',', '.')) * 100);
  if (!Number.isSafeInteger(result)) throw new Error('Montant invalide.');
  return result;
}
export function buildSaleSettlement(draft: PaymentDraft, total: number): SaleSettlement {
  if (!draft.mode) throw new Error('Choisissez le mode d’encaissement ou « À encaisser ».');
  if (draft.mode === 'pending') return { paymentStatus: 'pending' };
  const receivedAt = shopDayTimestamp(draft.date);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ||
    receivedAt === undefined ||
    paymentDay(receivedAt) !== draft.date
  )
    throw new Error('Date d’encaissement invalide.');
  const cashCents = draft.mode === 'cash' ? total : draft.mode === 'mixed' ? cents(draft.cash) : 0;
  const transferCents =
    draft.mode === 'transfer' ? total : draft.mode === 'mixed' ? cents(draft.transfer) : 0;
  if (!Number.isSafeInteger(total) || total < 0 || cashCents + transferCents !== total)
    throw new Error('Le total reçu en espèces et par virement doit égaler le montant vendu.');
  return {
    paymentStatus: 'received',
    payment: {
      cashCents,
      transferCents,
      receivedAt,
      reference: draft.reference.trim() || undefined,
    },
  };
}
