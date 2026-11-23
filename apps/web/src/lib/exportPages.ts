export type ExportResource = 'purchases' | 'sales' | 'stock' | 'stockLots' | 'consignments' | 'payments' | 'contacts';
/** Excel dates have no timezone. Export civil dates as ISO text rather than shifting the shop day. */
export function exportDate(value: number | null | undefined, timezone: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
  const get = (key: string) => parts.find(p => p.type === key)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
type Page<T> = {items: T[]; nextCursor: string | null; isDone: boolean};

/** Do not save a plausible but incomplete financial workbook after a failed page. */
export async function readExportPages<T>(
  request: <R>(path: string) => Promise<R>,
  resource: ExportResource,
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (;;) {
    const query = new URLSearchParams({size: '25'});
    if (cursor) query.set('cursor', cursor);
    const page = await request<Page<T>>(`/exports/${resource}?${query}`);
    if (!page || !Array.isArray(page.items) || typeof page.isDone !== 'boolean')
      throw new Error('EXPORT_INVALID_PAGE');
    rows.push(...page.items);
    if (page.isDone) return rows;
    if (typeof page.nextCursor !== 'string' || !page.nextCursor || seen.has(page.nextCursor))
      throw new Error('EXPORT_INCOMPLETE_PAGINATION');
    cursor = page.nextCursor;
    seen.add(cursor);
  }
}

export function exportBalances(
  contacts: readonly {_id: string; name: string; hasDeposits: boolean}[],
  sales: readonly {sellerId?: string; balanceEligible: boolean; depositorAmountCents?: number | null}[],
  payments: readonly {sellerId: string; amountCents: number}[],
) {
  const earned = new Map<string, number | null>();
  const paid = new Map<string, number>();
  for (const sale of sales) {
    if (!sale.balanceEligible) continue;
    if (!sale.sellerId) throw new Error('EXPORT_DEPOSITOR_MISSING');
    const previous = earned.get(sale.sellerId);
    const value = sale.depositorAmountCents;
    const next = typeof value === 'number' && Number.isSafeInteger(value) && previous !== null
      ? (previous ?? 0) + value : null;
    earned.set(sale.sellerId, next !== null && Number.isSafeInteger(next) ? next : null);
  }
  for (const payment of payments) {
    const next = (paid.get(payment.sellerId) ?? 0) + payment.amountCents;
    if (!Number.isSafeInteger(payment.amountCents) || !Number.isSafeInteger(next)) throw new Error('EXPORT_INVALID_PAYOUT');
    paid.set(payment.sellerId, next);
  }
  const contactIds = new Set(contacts.map(c => c._id));
  if ([...earned.keys(), ...paid.keys()].some(id => !contactIds.has(id))) throw new Error('EXPORT_DEPOSITOR_MISSING');
  return contacts.filter(c => c.hasDeposits || earned.has(c._id) || paid.has(c._id)).map(c => {
    const earnedCents = earned.has(c._id) ? earned.get(c._id)! : 0;
    const paidCents = paid.get(c._id) ?? 0;
    const difference = earnedCents === null ? null : earnedCents - paidCents;
    return {sellerId: c._id, sellerName: c.name, earnedCents, paidCents,
      balanceCents: difference !== null && Number.isSafeInteger(difference) ? difference : null};
  });
}
