import { z } from 'zod';

export const ItemSchema = z.object({
  id: z.string().min(1),
  purchaseId: z.string().min(1),
  purchaseOccurredAt: z.number().int(),
  name: z.string().trim().min(1),
  series: z.string().optional(),
  identifier: z.string().optional(),
  serialNumber: z.string().optional(),
  catalogueImageUrl: z.string().url().optional(),
  language: z.enum(['fr', 'en', 'ja']).optional(),
  condition: z.enum(['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO']).optional(),
  gradingCompany: z.enum(['PSA', 'CollectAura', 'PCA', 'CCC']).optional(),
  gradingGrade: z.string().optional(),
  gradingCertificate: z.string().optional(),
  gradingNotes: z.string().optional(),
  marketValueCents: z.number().int().nonnegative().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  purchasePriceCents: z.number().int().nonnegative(),
  askingPriceCents: z.number().int().nonnegative().optional(),
  vatRegime: z.enum(['margin', 'other']),
  status: z.enum(['available', 'sold', 'cancelled']),
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
export const SaleSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  occurredAt: z.number().int(),
  salePriceCents: z.number().int().nonnegative(),
  customerName: z.string().optional(),
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
export function validateSaleAgainstStock(
  sale: Sale,
  items: Inventory,
):
  | { ok: true; item: Item }
  | { ok: false; reason: 'ITEM_NOT_FOUND' | 'ITEM_UNAVAILABLE' | 'SALE_BEFORE_PURCHASE' } {
  const item = items.get(sale.itemId);
  if (!item) return { ok: false, reason: 'ITEM_NOT_FOUND' };
  if (item.status !== 'available') return { ok: false, reason: 'ITEM_UNAVAILABLE' };
  if (
    sale.occurredAt < item.purchaseOccurredAt &&
    new Date(sale.occurredAt).toISOString().slice(0, 10) <
      new Date(item.purchaseOccurredAt).toISOString().slice(0, 10)
  )
    return { ok: false, reason: 'SALE_BEFORE_PURCHASE' };
  return { ok: true, item };
}
