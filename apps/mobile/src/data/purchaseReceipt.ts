import type { Purchase, PurchaseItem, Seller } from './apiRepository';

export type ReceiptInput = {
  buyerNote?: string;
  sellerNote?: string;
  reference: string; occurredAt: number; status: Purchase['status']; client: Seller;
  items: { name: string; tcg?: 'pokemon' | 'riftbound' | 'other'; series: string; identifier: string; language: string; condition: string; gradingCompany?: string; gradingGrade?: string; gradingCertificate?: string; gradingNotes?: string; marketValueCents: number; discountPercent: number; purchasePriceCents: number }[];
};
const languageName = (id?: string) => id === 'zh' ? 'Chinois' : id === 'en' ? 'Anglais' : id === 'ja' ? 'Japonais' : 'Français';
const conditionName = (id?: string) => ({ M:'Mint (M)', NM:'Near Mint (NM)', EX:'Excellent (EX)', GD:'Good (GD)', LP:'Light Played (LP)', PL:'Played (PL)', PO:'Poor (PO)' }[id ?? ''] ?? 'Near Mint (NM)');
export function mapPurchaseReceipt(purchase: Purchase, client: Seller, items: PurchaseItem[] = purchase.items): ReceiptInput {
  return { buyerNote: purchase.buyerNote, sellerNote: purchase.sellerNote, reference: purchase.reference, occurredAt: purchase.occurredAt, status: purchase.status, client,
    items: items.map(item => ({ name:item.name, tcg:item.tcg, series:item.series ?? '', identifier:item.identifier ?? '', language:languageName(item.language), condition:conditionName(item.condition), gradingCompany:item.gradingCompany, gradingGrade:item.gradingGrade, gradingCertificate:item.gradingCertificate, gradingNotes:item.gradingNotes, marketValueCents:item.marketValueCents ?? (item.discountPercent ? Math.round(item.purchasePriceCents/(item.discountPercent/100)) : item.purchasePriceCents), discountPercent:item.discountPercent ?? 70, purchasePriceCents:item.purchasePriceCents })) };
}

/** Replaces the bounded embedded list with every page of the purchase's articles. */
export async function completePurchaseItems(
  purchase: Purchase & { hasMoreItems?: boolean },
  fetchPage: (cursor?: string) => Promise<{ items: PurchaseItem[]; nextCursor: string | null; isDone: boolean }>,
): Promise<PurchaseItem[]> {
  if (!purchase.hasMoreItems) return purchase.items;
  const items = new Map<string, PurchaseItem>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  while (true) {
    const page = await fetchPage(cursor);
    for (const item of page.items) items.set(item._id, item);
    if (page.isDone) return [...items.values()];
    if (!page.nextCursor || cursors.has(page.nextCursor)) throw new Error('Le bordereau est incomplet. Réessayez le chargement.');
    cursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}
