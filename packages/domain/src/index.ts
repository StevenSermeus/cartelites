import { z } from 'zod';
import {calendarDay} from './calendarDay';
export {calendarDay} from './calendarDay';

export const ItemSchema = z.object({
  id: z.string().min(1),
  purchaseId: z.string().min(1).optional(),
  origin: z.enum(['purchase', 'consignment', 'supplier']).optional(),
  consignmentId: z.string().min(1).optional(),
  productType: z.enum(['card', 'sealed', 'other']).optional(),
  description: z.string().optional(),
  hiddenFromCatalogue: z.boolean().optional(),
  commissionRateBps: z.number().int().min(0).max(10000).optional(),
  agreedPriceCents: z.number().int().nonnegative().optional(),
  purchaseOccurredAt: z.number().int(),
  name: z.string().trim().min(1),
  tcg: z.enum(['pokemon', 'riftbound', 'other']).optional(),
  series: z.string().optional(),
  identifier: z.string().optional(),
  serialNumber: z.string().optional(),
  catalogueImageUrl: z.string().url().optional(),
  language: z.enum(['fr', 'en', 'ja', 'zh']).optional(),
  condition: z.enum(['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO']).optional(),
  gradingCompany: z.string().trim().min(1).max(100).optional(),
  gradingGrade: z.string().optional(),
  gradingCertificate: z.string().optional(),
  gradingNotes: z.string().optional(),
  marketValueCents: z.number().int().nonnegative().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  purchasePriceCents: z.number().int().nonnegative().optional(),
  askingPriceCents: z.number().int().nonnegative().optional(),
  vatRegime: z.enum(['margin', 'other']),
  status: z.enum(['available', 'sold', 'cancelled', 'returned', 'donated']),
});
export const PurchaseSchema = z.object({
  id: z.string().min(1),
  sellerId: z.string().min(1),
  occurredAt: z.number().int(),
  itemIds: z.array(z.string().min(1)).min(1),
  status: z.enum(['pending', 'active', 'cancelled']),
});
export const ClientSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});
export const SalePaymentSchema = z.object({
  cashCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  transferCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  receivedAt: z.number().int(),
  reference: z.string().max(300).optional(),
});
export type SalePayment = z.infer<typeof SalePaymentSchema>;
export const SaleSchema = z.object({
  paymentStatus: z.enum(['pending', 'received']).optional(),
  payment: SalePaymentSchema.optional(),
  id: z.string().min(1),
  itemId: z.string().min(1),
  occurredAt: z.number().int(),
  salePriceCents: z.number().int().nonnegative(),
  customerName: z.string().optional(),
  origin: z.enum(['purchase', 'consignment', 'supplier']).optional(),
  commissionRateBps: z.number().int().min(0).max(10000).optional(),
  commissionCents: z.number().int().nonnegative().optional(),
  depositorAmountCents: z.number().int().nonnegative().optional(),
  status: z.enum(['active', 'cancelled']),
});
export type Item = z.infer<typeof ItemSchema>;
export type Purchase = z.infer<typeof PurchaseSchema>;
export type Client = z.infer<typeof ClientSchema>;
export type Sale = z.infer<typeof SaleSchema>;
export type Inventory = ReadonlyMap<string, Item>;
export function availableStock(items: Iterable<Item>): Item[] {
  return [...items].filter((item) => item.status === 'available');
}
/** Pass the selected shop timezone; business dates are compared at calendar-day granularity. */
export function validateSaleAgainstStock(
  sale: Sale,
  items: Inventory,
  timeZone: string,
):
  | { ok: true; item: Item }
  | {
      ok: false;
      reason:
        | 'ITEM_NOT_FOUND'
        | 'ITEM_UNAVAILABLE'
        | 'SALE_BEFORE_PURCHASE'
        | 'PRICE_BELOW_AGREEMENT';
    } {
  const item = items.get(sale.itemId);
  if (!item) return { ok: false, reason: 'ITEM_NOT_FOUND' };
  if (item.status !== 'available') return { ok: false, reason: 'ITEM_UNAVAILABLE' };
  if (
    sale.occurredAt < item.purchaseOccurredAt &&
    calendarDay(sale.occurredAt,timeZone) <
      calendarDay(item.purchaseOccurredAt,timeZone)
  )
    return { ok: false, reason: 'SALE_BEFORE_PURCHASE' };
  if (item.origin === 'consignment' && sale.salePriceCents < (item.agreedPriceCents ?? 0))
    return { ok: false, reason: 'PRICE_BELOW_AGREEMENT' };
  return { ok: true, item };
}

export * from './shopTheme';
export * from './tcgdexSearch';

export type * from './marketPrices';
