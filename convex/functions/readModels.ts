import { v } from 'convex/values';
import { query, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';

async function authenticate(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('UNAUTHENTICATED');
  if (identity.scope === 'realtime:read') {
    const id = ctx.db.normalizeId('accounts', identity.subject);
    const account = id ? await ctx.db.get(id) : null;
    if (!account || (account.sessionVersion ?? 0) !== identity.sv || typeof identity.sessionJti !== 'string') throw new Error('INVALID_SESSION');
    // These database reads also invalidate live subscriptions on logout/password reset.
    const revoked = await ctx.db.query('revokedSessions').withIndex('by_jti', q => q.eq('jti', identity.sessionJti as string)).unique();
    if (revoked) throw new Error('INVALID_SESSION');
  }
}
const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
const tables = { sellers: 'sellers', stock: 'items', sales: 'sales', purchases: 'purchases', consignments: 'consignments', balances: 'sellers', conflicts: 'saleConflicts', payments: 'consignmentPayments', attachments: 'attachments', events: 'consignmentEvents' } as const;
type Resource = keyof typeof tables;
function resourceOf(value: string): Resource {
  if (!Object.hasOwn(tables, value)) throw new Error('INVALID_RESOURCE');
  return value as Resource;
}
async function itemRecord(ctx: QueryCtx, item: Doc<'items'>) {
  const source = item.consignmentId ? await ctx.db.get(item.consignmentId) : item.purchaseId ? await ctx.db.get(item.purchaseId) : null;
  const seller = source ? await ctx.db.get(source.sellerId) : null;
  const photos = await ctx.db.query('attachments').withIndex('by_item', q => q.eq('itemId', item._id)).take(11);
  return { ...item, origin: item.origin ?? 'purchase', productType: item.productType ?? 'card', purchasePriceCents: item.purchasePriceCents ?? 0,
    purchaseReference: source?.reference ?? '', sellerId: source?.sellerId, sellerName: seller?.name ?? '',
    sourceStatus: source && 'status' in source ? source.status : undefined, photos: photos.slice(0, 10), hasMorePhotos: photos.length > 10 };
}
async function saleRecord(ctx: QueryCtx, sale: Doc<'sales'>) {
  const item = await ctx.db.get(sale.itemId);
  const source = item ? await itemRecord(ctx, item) : null;
  return { ...sale, catalogueImageUrl: item?.catalogueImageUrl, photos: source?.photos ?? [], itemName: item?.name ?? 'Article supprimé', origin: sale.origin ?? item?.origin ?? 'purchase',
    productType: item?.productType ?? 'card', series: item?.series, identifier: item?.identifier, language: item?.language,
    condition: item?.condition, gradingCompany: item?.gradingCompany, gradingGrade: item?.gradingGrade,
    gradingCertificate: item?.gradingCertificate, purchasePriceCents: item?.purchasePriceCents ?? 0,
    vatRegime: item?.vatRegime, purchaseOccurredAt: item?.purchaseOccurredAt,
    sellerId: sale.sellerId ?? source?.sellerId, sellerName: source?.sellerName ?? '', purchaseReference: source?.purchaseReference ?? '' };
}
async function sourceRecord(ctx: QueryCtx, record: Doc<'purchases'> | Doc<'consignments'>, deposit: boolean) {
  const seller = await ctx.db.get(record.sellerId);
  const items = deposit
    ? await ctx.db.query('items').withIndex('by_consignment', q => q.eq('consignmentId', record._id as Id<'consignments'>)).take(51)
    : await ctx.db.query('items').withIndex('by_purchase', q => q.eq('purchaseId', record._id as Id<'purchases'>)).take(51);
  return { ...record, sellerName: seller?.name ?? '', items: await Promise.all(items.slice(0, 50).map(i => itemRecord(ctx, i))), hasMoreItems: items.length > 50 };
}
async function balanceRecord(ctx: QueryCtx, seller: Doc<'sellers'>) {
  // Aggregation stays server-side; only the scalar balance is returned, never the full ledger.
  let earnedCents = 0, paidCents = 0;
  // Convex permits only one paginate call per query. Aggregates remain server-side;
  // these indexed ledger reads still require a separately paged action for very large ledgers.
  for await (const sale of ctx.db.query('sales').withIndex('by_seller', q => q.eq('sellerId', seller._id))) {
    if (sale.origin === 'consignment' && sale.status === 'active' && sale.paymentStatus !== 'pending') earnedCents += sale.depositorAmountCents ?? 0;
  }
  for await (const payment of ctx.db.query('consignmentPayments').withIndex('by_seller', q => q.eq('sellerId', seller._id))) paidCents += payment.amountCents;
  const hasDeposits = !!(await ctx.db.query('consignments').withIndex('by_seller', q => q.eq('sellerId', seller._id)).first());
  return { _id: seller._id, sellerId: seller._id, sellerName: seller.name, earnedCents, paidCents, balanceCents: earnedCents - paidCents, hasDeposits };
}
type Row = Record<string, unknown>;
async function enrich(ctx: QueryCtx, resource: Resource, record: unknown): Promise<Row> {
  if (resource === 'stock') return itemRecord(ctx, record as Doc<'items'>);
  if (resource === 'sales') return saleRecord(ctx, record as Doc<'sales'>);
  if (resource === 'purchases' || resource === 'consignments') return sourceRecord(ctx, record as Doc<'purchases'> | Doc<'consignments'>, resource === 'consignments');
  if (resource === 'balances') return balanceRecord(ctx, record as Doc<'sellers'>);
  if (resource === 'payments') {
    const payment = record as Doc<'consignmentPayments'>;
    return { ...payment, sellerName: (await ctx.db.get(payment.sellerId))?.name ?? '' };
  }
  if (resource === 'conflicts') { const r = record as Doc<'saleConflicts'>; return { ...r, itemName: (await ctx.db.get(r.itemId))?.name ?? '' }; }
  return record as Row;
}
const filterArgs = {
  resource: v.string(), size: v.optional(v.number()), cursor: v.optional(v.string()), search: v.optional(v.string()),
  status: v.optional(v.string()), origin: v.optional(v.string()), visibility: v.optional(v.string()), sellerId: v.optional(v.string()),
  purchaseId: v.optional(v.string()), consignmentId: v.optional(v.string()), itemId: v.optional(v.string()),
  from: v.optional(v.number()), to: v.optional(v.number()), paymentStatus: v.optional(v.string()),
  productType: v.optional(v.union(v.literal('all'), v.literal('card'), v.literal('sealed'), v.literal('other'))),
  gradingStatus: v.optional(v.string()), gradingCompany: v.optional(v.string()), gradingText: v.optional(v.string()),
};
export const browse = query({ args: filterArgs, handler: async (ctx, args) => {
  await authenticate(ctx);
  const resource = resourceOf(args.resource), size = args.size ?? 25;
  if (!Number.isInteger(size) || size < 1 || size > 50 || (args.search?.length ?? 0) > 200 || (args.from !== undefined && args.to !== undefined && args.from > args.to)) throw new Error('INVALID_PAGINATION');
  const { cursor, ...criteria } = args;
  const signature = JSON.stringify(criteria);
  let continuation: string | null = null;
  if (cursor) {
    try { const saved = JSON.parse(cursor); if (saved.signature !== signature || typeof saved.value !== 'string') throw new Error(); continuation = saved.value; }
    catch { throw new Error('INVALID_CURSOR'); }
  }
  // A bounded scan supports substring search on legacy rows without requiring a disruptive backfill.
  // Filters can produce short/empty pages; the continuation remains authoritative.
  let raw;
  if (resource === 'stock' && args.purchaseId) {
    const id = ctx.db.normalizeId('purchases', args.purchaseId); if (!id) throw new Error('INVALID_FILTER');
    raw = await ctx.db.query('items').withIndex('by_purchase', q => q.eq('purchaseId', id)).order('desc').paginate({ cursor: continuation, numItems: size });
  } else if (resource === 'stock' && args.consignmentId) {
    const id = ctx.db.normalizeId('consignments', args.consignmentId); if (!id) throw new Error('INVALID_FILTER');
    raw = await ctx.db.query('items').withIndex('by_consignment', q => q.eq('consignmentId', id)).order('desc').paginate({ cursor: continuation, numItems: size });
  } else if (resource === 'stock' && (!args.status || args.status === 'available')) {
    raw = await ctx.db.query('items').withIndex('by_status', q => q.eq('status', 'available')).order('desc').paginate({ cursor: continuation, numItems: size });
  } else {
    raw = await ctx.db.query(tables[resource]).order('desc').paginate({ cursor: continuation, numItems: size });
  }
  const rows = await Promise.all(raw.page.map(r => enrich(ctx, resource, r)));
  const words = normalize(args.search).trim().split(/\s+/).filter(Boolean);
  const items = rows.filter(row => {
    if (resource === 'stock' && !args.purchaseId && !args.consignmentId && row.origin !== 'consignment' && row.sourceStatus !== 'active') return false;
    if (resource === 'balances' && !row.hasDeposits) return false;
    if (args.sellerId && String(row.sellerId ?? (resource === 'sellers' ? row._id : '')) !== args.sellerId) return false;
    if (args.itemId && String(row.itemId) !== args.itemId) return false;
    if (args.purchaseId && String(row.purchaseId) !== args.purchaseId) return false;
    if (args.consignmentId && String(row.consignmentId) !== args.consignmentId) return false;
    if (args.origin && args.origin !== 'all' && (row.origin ?? 'purchase') !== args.origin) return false;
    if (args.visibility === 'hidden' && !row.hiddenFromCatalogue) return false;
    if (args.visibility === 'visible' && row.hiddenFromCatalogue) return false;
    if (args.productType && args.productType !== 'all' && (row.productType ?? 'card') !== args.productType) return false;
    if (args.gradingStatus === 'graded' && !row.gradingCompany || args.gradingStatus === 'ungraded' && !!row.gradingCompany) return false;
    if (args.gradingCompany && args.gradingCompany !== 'all' && row.gradingCompany !== args.gradingCompany) return false;
    if (args.gradingText && !normalize([row.gradingGrade, row.gradingCertificate, row.gradingNotes].join(' ')).includes(normalize(args.gradingText))) return false;
    if (args.paymentStatus && args.paymentStatus !== 'all' && (row.paymentStatus ?? 'unknown') !== args.paymentStatus) return false;
    const status = args.status ?? (resource === 'conflicts' ? 'open' : 'all');
    if (status !== 'all') {
      if (resource === 'balances') {
        const value = Number(row.balanceCents);
        if (status === 'due' && value <= 0 || status === 'settled' && value !== 0 || status === 'regularization' && value >= 0) return false;
      } else if (row.status !== status) return false;
    }
    const date = Number(row.occurredAt ?? row.purchaseOccurredAt ?? row.createdAt);
    if (args.from !== undefined && date < args.from || args.to !== undefined && date > args.to) return false;
    const haystack = normalize([row._id, row.name, row.email, row.phone, row.address, row.reference, row.sellerName, row.itemName, row.series, row.identifier, row.gradingCertificate, row.purchaseReference].join(' '));
    return words.every(word => haystack.includes(word));
  });
  return { items, nextCursor: raw.isDone ? null : JSON.stringify({ signature, value: raw.continueCursor }), isDone: raw.isDone };
} });

export const record = query({ args: { resource: v.string(), id: v.string() }, handler: async (ctx, args) => {
  await authenticate(ctx);
  const resource = resourceOf(args.resource), id = ctx.db.normalizeId(tables[resource], args.id);
  if (!id) return null;
  const found = await ctx.db.get(id);
  return found ? enrich(ctx, resource, found) : null;
} });

export const dashboardSummary = query({ args: {}, handler: async ctx => {
  await authenticate(ctx);
  const summary = { purchaseCents: 0, salesCents: 0, pendingCents: 0, unknownCents: 0, cashCents: 0, transferCents: 0,
    gains: 0, losses: 0, commissions: 0, consignmentSales: 0, net: 0, purchaseCount: 0, saleCount: 0, dueCents: 0, regularizationCents: 0 };
  const byTcg = [
    { key: 'pokemon', label: 'Pokémon', stockCount: 0, marginCents: 0 },
    { key: 'riftbound', label: 'Riftbound', stockCount: 0, marginCents: 0 },
    { key: 'other', label: 'Autres / non renseignés', stockCount: 0, marginCents: 0 },
  ];
  const byOrigin = [
    { key: 'purchase', label: 'Achat-revente', stockCount: 0, marginCents: 0 },
    { key: 'consignment', label: 'Dépôt-vente', stockCount: 0, marginCents: 0 },
  ];
  const tcgGroup = (item: Doc<'items'> | null) => byTcg.find(group => group.key === (item?.tcg ?? (item && (item.productType ?? 'card') === 'card' ? 'pokemon' : 'other')))!;
  for await (const item of ctx.db.query('items').withIndex('by_status', q => q.eq('status', 'available'))) {
    const deposit = (item.origin ?? (item.consignmentId ? 'consignment' : 'purchase')) === 'consignment';
    if (!deposit && (!item.purchaseId || (await ctx.db.get(item.purchaseId))?.status !== 'active')) continue;
    tcgGroup(item).stockCount++;
    byOrigin[deposit ? 1 : 0].stockCount++;
  }
  const days = new Map<string, { key: string; purchases: number; sales: number; gains: number; losses: number }>();
  const bucket = (date: number) => { const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); if (!days.has(key)) days.set(key, { key, purchases: 0, sales: 0, gains: 0, losses: 0 }); return days.get(key)!; };
  for await (const purchase of ctx.db.query('purchases')) {
    if (purchase.status !== 'active') continue;
    summary.purchaseCount++;
    for await (const item of ctx.db.query('items').withIndex('by_purchase', q => q.eq('purchaseId', purchase._id))) { summary.purchaseCents += item.purchasePriceCents ?? 0; bucket(purchase.occurredAt).purchases += item.purchasePriceCents ?? 0; }
  }
  for await (const sale of ctx.db.query('sales')) {
    if (sale.status !== 'active') continue;
    summary.saleCount++;
    if (sale.paymentStatus === 'received') { summary.salesCents += sale.salePriceCents; summary.cashCents += sale.payment?.cashCents ?? 0; summary.transferCents += sale.payment?.transferCents ?? 0; }
    else if (sale.paymentStatus === 'pending') summary.pendingCents += sale.salePriceCents;
    else summary.unknownCents += sale.salePriceCents;
    const item = await ctx.db.get(sale.itemId);
    const deposit = (sale.origin ?? item?.origin ?? (sale.consignmentId || item?.consignmentId ? 'consignment' : 'purchase')) === 'consignment';
    const margin = deposit ? sale.commissionCents ?? 0 : sale.salePriceCents - (item?.purchasePriceCents ?? 0);
    if (deposit) { summary.commissions += margin; summary.consignmentSales += sale.salePriceCents; }
    else { summary.gains += Math.max(0, margin); summary.losses += Math.max(0, -margin); }
    tcgGroup(item).marginCents += margin;
    byOrigin[deposit ? 1 : 0].marginCents += margin;
    const day = bucket(sale.occurredAt); if (sale.paymentStatus === 'received') day.sales += sale.salePriceCents; day.gains += Math.max(0, margin); day.losses += Math.max(0, -margin);
  }
  for await (const seller of ctx.db.query('sellers')) { const balance = await balanceRecord(ctx, seller); if (balance.hasDeposits) { summary.dueCents += Math.max(0, balance.balanceCents); summary.regularizationCents += Math.max(0, -balance.balanceCents); } }
  summary.net = summary.gains - summary.losses + summary.commissions;
  // Charts only need the latest year; totals above are all-time.
  const since = Date.now() - 366 * 86400000;
  return { summary, byTcg, byOrigin, days: [...days.values()].filter(day => Date.parse(day.key) >= since).sort((a, b) => a.key.localeCompare(b.key)) };
} });
