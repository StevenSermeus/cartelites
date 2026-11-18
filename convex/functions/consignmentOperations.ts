import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, type QueryCtx, query } from './_generated/server';

// Like purchases, consignments belong to the deployment's company, not an employee.
async function requireOwner(ctx: Pick<QueryCtx, 'auth'>) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('UNAUTHENTICATED');
  if (identity.scope === 'realtime:read') throw new Error('READ_ONLY_TOKEN');
  return identity.subject;
}
function replay<T extends { operationDigest: string }>(prior: T | null, args: unknown) {
  if (prior && prior.operationDigest !== JSON.stringify(args))
    throw new Error('IDEMPOTENCY_KEY_REUSED');
  return prior;
}
function validDate(value: number) {
  return Number.isSafeInteger(value) && Number.isFinite(new Date(value).getTime());
}
function validateTerms(price: number, rate: number) {
  if (!Number.isSafeInteger(price) || price < 0) throw new Error('INVALID_PRICE');
  if (!Number.isSafeInteger(rate) || rate < 0 || rate > 10000)
    throw new Error('INVALID_COMMISSION');
}
export function splitConsignmentPrice(price: number, rate: number) {
  validateTerms(price, rate);
  // Integer arithmetic preserves cents even for amounts near Number.MAX_SAFE_INTEGER.
  const commissionCents = Number((BigInt(price) * BigInt(rate) + 5000n) / 10000n);
  return { commissionCents, depositorAmountCents: price - commissionCents };
}

export const createConsignment = mutation({
  args: {
    operationId: v.string(),
    sellerId: v.id('sellers'),
    occurredAt: v.number(),
    reference: v.string(),
    notes: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    items: v.array(
      v.object({
        operationId: v.string(),
        name: v.string(),
        productType: v.union(v.literal('card'), v.literal('sealed'), v.literal('other')),
        description: v.optional(v.string()),
        series: v.optional(v.string()),
        identifier: v.optional(v.string()),
        tcg: v.optional(v.union(v.literal('pokemon'), v.literal('riftbound'))),
        language: v.optional(v.union(v.literal('fr'), v.literal('en'), v.literal('ja'))),
        condition: v.optional(
          v.union(
            v.literal('M'),
            v.literal('NM'),
            v.literal('EX'),
            v.literal('GD'),
            v.literal('LP'),
            v.literal('PL'),
            v.literal('PO'),
          ),
        ),
        gradingCompany: v.optional(
          v.union(v.literal('PSA'), v.literal('CollectAura'), v.literal('PCA'), v.literal('CCC')),
        ),
        gradingGrade: v.optional(v.string()),
        gradingCertificate: v.optional(v.string()),
        gradingNotes: v.optional(v.string()),
        askingPriceCents: v.number(),
        commissionRateBps: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const prior = replay(
      await ctx.db
        .query('consignments')
        .withIndex('by_owner_operation', (q) =>
          q.eq('ownerId', ownerId).eq('operationId', args.operationId),
        )
        .unique(),
      args,
    );
    if (prior)
      return {
        consignmentId: prior._id,
        itemIds: (
          await ctx.db
            .query('items')
            .withIndex('by_consignment', (q) => q.eq('consignmentId', prior._id))
            .collect()
        ).map((item) => item._id),
      };
    if (!(await ctx.db.get(args.sellerId))) throw new Error('SELLER_NOT_FOUND');
    if (
      !args.operationId ||
      !validDate(args.occurredAt) ||
      !args.items.length ||
      args.items.length > 200 ||
      !args.reference.trim() ||
      (args.dueAt !== undefined && (!validDate(args.dueAt) || args.dueAt < args.occurredAt))
    )
      throw new Error('INVALID_CONSIGNMENT');
    if (new Set(args.items.map((i) => i.operationId)).size !== args.items.length)
      throw new Error('INVALID_ITEM');
    for (const item of args.items) {
      if (!item.operationId || !item.name.trim()) throw new Error('INVALID_ITEM');
      validateTerms(item.askingPriceCents, item.commissionRateBps);
    }
    const { items, ...header } = args;
    const consignmentId = await ctx.db.insert('consignments', {
      ...header,
      ownerId,
      operationDigest: JSON.stringify(args),
      createdAt: Date.now(),
    });
    const itemIds: Id<'items'>[] = [];
    for (const item of items)
      itemIds.push(
        await ctx.db.insert('items', {
          ...item,
          name: item.name.trim(),
          ownerId,
          consignmentId,
          origin: 'consignment',
          agreedPriceCents: item.askingPriceCents,
          purchaseOccurredAt: args.occurredAt,
          vatRegime: 'other',
          status: 'available',
          createdAt: Date.now(),
        }),
      );
    return { consignmentId, itemIds };
  },
});

export const consignmentHistory = query({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    const dossiers = await ctx.db.query('consignments').collect();
    dossiers.sort((a, b) => b.occurredAt - a.occurredAt);
    return Promise.all(
      dossiers.map(async (dossier) => ({
        ...dossier,
        sellerName: (await ctx.db.get(dossier.sellerId))?.name ?? '',
        items: await Promise.all(
          (
            await ctx.db
              .query('items')
              .withIndex('by_consignment', (q) => q.eq('consignmentId', dossier._id))
              .collect()
          ).map(async (item) => ({
            ...item,
            purchasePriceCents: 0,
            purchaseReference: dossier.reference,
            photos: await ctx.db
              .query('attachments')
              .withIndex('by_item', (q) => q.eq('itemId', item._id))
              .collect(),
            events: await ctx.db
              .query('consignmentEvents')
              .withIndex('by_item', (q) => q.eq('itemId', item._id))
              .collect(),
          })),
        ),
      })),
    );
  },
});

async function readBalances(ctx: Pick<QueryCtx, 'db'>) {
  const [sales, payments, dossiers, sellers] = await Promise.all([
    ctx.db.query('sales').collect(),
    ctx.db.query('consignmentPayments').collect(),
    ctx.db.query('consignments').collect(),
    ctx.db.query('sellers').collect(),
  ]);
  const names = new Map(sellers.map((s) => [s._id, s.name]));
  const totals = new Map<
    Id<'sellers'>,
    {
      sellerId: Id<'sellers'>;
      sellerName: string;
      earnedCents: number;
      paidCents: number;
      balanceCents: number;
    }
  >();
  for (const dossier of dossiers)
    totals.set(dossier.sellerId, {
      sellerId: dossier.sellerId,
      sellerName: names.get(dossier.sellerId) ?? '',
      earnedCents: 0,
      paidCents: 0,
      balanceCents: 0,
    });
  for (const sale of sales)
    if (
      sale.origin === 'consignment' &&
      sale.status === 'active' &&
      sale.paymentStatus !== 'pending' &&
      sale.sellerId
    ) {
      const row = totals.get(sale.sellerId);
      if (row) row.earnedCents += sale.depositorAmountCents ?? 0;
    }
  for (const payment of payments) {
    const row = totals.get(payment.sellerId);
    if (row) row.paidCents += payment.amountCents;
  }
  for (const row of totals.values()) row.balanceCents = row.earnedCents - row.paidCents;
  return {
    balances: [...totals.values()],
    payments: payments
      .sort((a, b) => b.occurredAt - a.occurredAt)
      .map((payment) => ({ ...payment, sellerName: names.get(payment.sellerId) ?? '' })),
  };
}
export const consignmentBalances = query({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    return readBalances(ctx);
  },
});
export const recordConsignmentPayment = mutation({
  args: {
    operationId: v.string(),
    sellerId: v.id('sellers'),
    amountCents: v.number(),
    occurredAt: v.number(),
    method: v.string(),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const prior = replay(
      await ctx.db
        .query('consignmentPayments')
        .withIndex('by_owner_operation', (q) =>
          q.eq('ownerId', ownerId).eq('operationId', args.operationId),
        )
        .unique(),
      args,
    );
    if (prior) return prior._id;
    if (
      !args.operationId ||
      !Number.isSafeInteger(args.amountCents) ||
      args.amountCents <= 0 ||
      !validDate(args.occurredAt) ||
      !args.method.trim()
    )
      throw new Error('INVALID_PAYMENT');
    if (!(await ctx.db.get(args.sellerId))) throw new Error('SELLER_NOT_FOUND');
    const { balances } = await readBalances(ctx);
    const balance = balances.find((row) => row.sellerId === args.sellerId)?.balanceCents ?? 0;
    if (args.amountCents > balance) throw new Error('PAYMENT_EXCEEDS_BALANCE');
    const paymentDay = new Date(args.occurredAt).toISOString().slice(0, 10);
    const [sales, payments] = await Promise.all([
      ctx.db.query('sales').collect(),
      ctx.db
        .query('consignmentPayments')
        .withIndex('by_seller', (q) => q.eq('sellerId', args.sellerId))
        .collect(),
    ]);
    const earnedAtDate = sales
      .filter(
        (sale) =>
          sale.origin === 'consignment' &&
          sale.status === 'active' &&
          sale.paymentStatus !== 'pending' &&
          sale.sellerId === args.sellerId &&
          new Date(sale.payment?.receivedAt ?? sale.occurredAt).toISOString().slice(0, 10) <=
            paymentDay,
      )
      .reduce((sum, sale) => sum + BigInt(sale.depositorAmountCents ?? 0), 0n);
    const paidAtDate = payments
      .filter((payment) => new Date(payment.occurredAt).toISOString().slice(0, 10) <= paymentDay)
      .reduce((sum, payment) => sum + BigInt(payment.amountCents), 0n);
    if (BigInt(args.amountCents) > earnedAtDate - paidAtDate)
      throw new Error('INVALID_PAYMENT_DATE');
    return ctx.db.insert('consignmentPayments', {
      ...args,
      method: args.method.trim(),
      ownerId,
      operationDigest: JSON.stringify(args),
      createdAt: Date.now(),
    });
  },
});
export const returnConsignmentItem = mutation({
  args: { operationId: v.string(), itemId: v.id('items'), occurredAt: v.number() },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const prior = replay(
      await ctx.db
        .query('consignmentEvents')
        .withIndex('by_owner_operation', (q) =>
          q.eq('ownerId', ownerId).eq('operationId', args.operationId),
        )
        .unique(),
      args,
    );
    if (prior) return prior.itemId;
    const item = await ctx.db.get(args.itemId);
    if (item?.origin !== 'consignment' || !item.consignmentId)
      throw new Error('CONSIGNMENT_ITEM_NOT_FOUND');
    if (item.status !== 'available') throw new Error('ITEM_UNAVAILABLE');
    if (
      !args.operationId ||
      !validDate(args.occurredAt) ||
      new Date(args.occurredAt).toISOString().slice(0, 10) <
        new Date(item.purchaseOccurredAt).toISOString().slice(0, 10)
    )
      throw new Error('INVALID_RETURN_DATE');
    await ctx.db.patch(item._id, { status: 'returned', returnedAt: args.occurredAt });
    await ctx.db.insert('consignmentEvents', {
      ...args,
      ownerId,
      operationDigest: JSON.stringify(args),
      kind: 'return',
      createdAt: Date.now(),
    });
    return item._id;
  },
});
export const updateConsignmentTerms = mutation({
  args: {
    operationId: v.string(),
    itemId: v.id('items'),
    askingPriceCents: v.number(),
    commissionRateBps: v.number(),
    authorizationNote: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const prior = replay(
      await ctx.db
        .query('consignmentEvents')
        .withIndex('by_owner_operation', (q) =>
          q.eq('ownerId', ownerId).eq('operationId', args.operationId),
        )
        .unique(),
      args,
    );
    if (prior) return prior.itemId;
    const item = await ctx.db.get(args.itemId);
    if (item?.origin !== 'consignment' || !item.consignmentId)
      throw new Error('CONSIGNMENT_ITEM_NOT_FOUND');
    if (item.status !== 'available') throw new Error('ITEM_UNAVAILABLE');
    validateTerms(args.askingPriceCents, args.commissionRateBps);
    if (!args.operationId || !args.authorizationNote.trim())
      throw new Error('AUTHORIZATION_REQUIRED');
    await ctx.db.insert('consignmentEvents', {
      ...args,
      ownerId,
      operationDigest: JSON.stringify(args),
      kind: 'terms',
      previousPriceCents: item.agreedPriceCents,
      previousCommissionRateBps: item.commissionRateBps,
      occurredAt: Date.now(),
      createdAt: Date.now(),
    });
    await ctx.db.patch(item._id, {
      askingPriceCents: args.askingPriceCents,
      agreedPriceCents: args.askingPriceCents,
      commissionRateBps: args.commissionRateBps,
    });
    return item._id;
  },
});
