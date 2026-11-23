import {shopDay} from './shopCalendar';
import { v } from 'convex/values';

export const salePaymentValidator = v.object({
  cashCents: v.number(),
  transferCents: v.number(),
  receivedAt: v.number(),
  reference: v.optional(v.string()),
});
export const salePaymentStatusValidator = v.union(v.literal('pending'), v.literal('received'));
export type SalePayment = {
  cashCents: number;
  transferCents: number;
  receivedAt: number;
  reference?: string;
};
export function validateSalePayment(
  total: number,
  occurredAt: number,
  paymentStatus?: 'pending' | 'received',
  payment?: SalePayment,
) {
  if (paymentStatus !== 'received') {
    if (payment) throw new Error('INVALID_SALE_PAYMENT');
    return;
  }
  if (
    !payment ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    !Number.isSafeInteger(payment.cashCents) ||
    payment.cashCents < 0 ||
    !Number.isSafeInteger(payment.transferCents) ||
    payment.transferCents < 0 ||
    BigInt(payment.cashCents) + BigInt(payment.transferCents) !== BigInt(total) ||
    (payment.reference !== undefined && payment.reference.length > 300)
  )
    throw new Error('INVALID_SALE_PAYMENT');
  if (
    !Number.isSafeInteger(payment.receivedAt) ||
    !Number.isFinite(new Date(payment.receivedAt).getTime()) ||
    !Number.isSafeInteger(occurredAt) ||
    !Number.isFinite(new Date(occurredAt).getTime()) ||
    shopDay(payment.receivedAt) <
      shopDay(occurredAt)
  )
    throw new Error('INVALID_SALE_PAYMENT_DATE');
}

/** Cumulative proportional rounding preserves both basket totals exactly. */
export function allocateSalePayments(prices: number[], payment: SalePayment): SalePayment[] {
  const total = prices.reduce((sum, price) => sum + BigInt(price), 0n);
  let cumulative = 0n;
  let allocatedCash = 0n;
  return prices.map((price) => {
    cumulative += BigInt(price);
    const nextCash = total === 0n ? 0n : (cumulative * BigInt(payment.cashCents)) / total;
    const cashCents = Number(nextCash - allocatedCash);
    allocatedCash = nextCash;
    return { ...payment, cashCents, transferCents: price - cashCents };
  });
}
