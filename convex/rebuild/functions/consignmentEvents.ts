import type { QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';

function change(row: Doc<'auditEvents'>): Record<string, unknown> {
  try { const value = JSON.parse(row.changeJson); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  catch { return {}; }
}
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const text = (value: unknown) => typeof value === 'string' ? value : undefined;

/** Explicit client projection: never expose the opaque legacy vault or raw audit payload. */
export async function consignmentEventRecord(ctx: QueryCtx, row: Doc<'auditEvents'>) {
  const legacy = row.action === 'legacy-import:consignmentEvents', data = change(row);
  const kind = legacy ? data.kind : row.action === 'consignment.terms' ? 'terms' : row.action === 'consignment.return' ? 'return' : undefined;
  if (kind !== 'terms' && kind !== 'return') return null;
  let itemId: Id<'stockItems'> | null = null;
  if (row.record?.table === 'stockItems') itemId = ctx.db.normalizeId('stockItems', row.record.id);
  else if (legacy && typeof data.itemId === 'string') {
    const mapping = await ctx.db.query('legacyMappings').withIndex('by_legacy_record', q => q.eq('oldTable', 'items').eq('oldId', data.itemId as string).eq('newTable', 'stockItems')).unique();
    itemId = mapping ? ctx.db.normalizeId('stockItems', mapping.newId) : null;
  }
  if (!itemId) return null;
  const item = await ctx.db.get(itemId);
  if (!item) return null;
  const lot = await ctx.db.query('stockLots').withIndex('by_item_fifo', q => q.eq('stockItemId', itemId!)).first();
  if (lot?.source.kind !== 'consignment') return null;
  const dossier = await ctx.db.get(lot.source.consignmentId), product = await ctx.db.get(item.productId);
  const seller = dossier ? await ctx.db.get(dossier.depositorId) : null;
  let occurredAt = number(data.occurredAt) ?? row.occurredAt;
  let quantity = kind === 'return' ? number(data.quantity) ?? 1 : undefined;
  let returnId: Id<'consignmentReturns'> | undefined;
  if (!legacy && kind === 'return' && typeof data.returnId === 'string') {
    const id = ctx.db.normalizeId('consignmentReturns', data.returnId), operation = id ? await ctx.db.get(id) : null;
    if (operation) {
      returnId = operation._id; occurredAt = operation.occurredAt;
      const lines = await ctx.db.query('consignmentReturnLines').withIndex('by_return', q => q.eq('returnId', operation._id)).collect();
      quantity = 0;
      for (const line of lines) if ((await ctx.db.get(line.lotId))?.stockItemId === itemId) quantity += line.quantity;
    }
  }
  let previousPriceCents = number(data.previousPriceCents), previousCommissionRateBps = number(data.previousCommissionRateBps);
  if (!legacy && kind === 'terms' && typeof data.previousRevisionId === 'string') {
    const revisionId = ctx.db.normalizeId('consignmentRevisions', data.previousRevisionId);
    const terms = revisionId ? await ctx.db.query('consignmentTerms').withIndex('by_revision_item', q => q.eq('revisionId', revisionId).eq('stockItemId', itemId!)).unique() : null;
    previousPriceCents = terms?.agreedPriceCents ?? undefined; previousCommissionRateBps = terms?.commissionRateBps ?? undefined;
  }
  return { _id: row._id, _creationTime: row._creationTime, createdAt: row.createdAt, occurredAt, kind,
    itemId, itemName: product?.name ?? '', consignmentId: dossier?._id, sellerId: dossier?.depositorId,
    sellerName: seller?.name ?? '', reference: dossier?.reference ?? '', quantity, returnId,
    askingPriceCents: number(data.askingPriceCents), commissionRateBps: number(data.commissionRateBps),
    previousPriceCents, previousCommissionRateBps, authorizationNote: text(data.authorizationNote) };
}

export async function consignmentEventsForItem(ctx: QueryCtx, itemId: Id<'stockItems'>) {
  const direct = await ctx.db.query('auditEvents').withIndex('by_record', q => q.eq('record.table', 'stockItems').eq('record.id', itemId)).collect();
  const events = await Promise.all(direct.map(row => consignmentEventRecord(ctx, row)));
  return events.filter(event => event !== null && event.itemId === itemId).sort((a, b) => b!.occurredAt - a!.occurredAt);
}
