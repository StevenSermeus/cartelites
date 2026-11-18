import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';

async function requireOwner(ctx: {
  auth: { getUserIdentity(): Promise<{ subject: string } | null> };
}): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('UNAUTHENTICATED');
  // A Convex deployment represents one company. ownerId records who created a row,
  // while authenticated users in this deployment share the company's business data.
  return identity.subject;
}

const digest = (value: unknown) => JSON.stringify(value);
function replay<T extends { operationDigest: string }>(
  prior: T | null,
  nextDigest: string,
): T | null {
  if (!prior) return null;
  if (prior.operationDigest !== nextDigest) throw new Error('IDEMPOTENCY_KEY_REUSED');
  return prior;
}

export const createSeller = mutation({
  args: {
    operationId: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const operationDigest = digest(args);
    const existing = replay(
      await ctx.db
        .query('sellers')
        .withIndex('by_owner_operation', (q) =>
          q.eq('ownerId', ownerId).eq('operationId', args.operationId),
        )
        .unique(),
      operationDigest,
    );
    if (existing) return existing._id;
    const name = args.name.trim();
    if (!name) throw new Error('INVALID_SELLER_NAME');
    return ctx.db.insert('sellers', {
      ...args,
      operationDigest,
      name,
      ownerId,
      createdAt: Date.now(),
    });
  },
});

export const updateSeller = mutation({
  args: {
    sellerId: v.id('sellers'),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const seller = await ctx.db.get(args.sellerId);
    if (!seller) throw new Error('SELLER_NOT_FOUND');
    const name = args.name.trim();
    if (!name) throw new Error('INVALID_SELLER_NAME');
    const { sellerId, ...fields } = args;
    await ctx.db.patch(sellerId, {
      ...fields,
      name,
      email: args.email?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
      address: args.address?.trim() || undefined,
    });
    return sellerId;
  },
});

export const createPurchase = mutation({
  args: {
    operationId: v.string(),
    sellerId: v.id('sellers'),
    occurredAt: v.number(),
    reference: v.string(),
    items: v.array(
      v.object({
        operationId: v.string(),
        name: v.string(),
        series: v.optional(v.string()),
        identifier: v.optional(v.string()),
        serialNumber: v.optional(v.string()),
        catalogueImageUrl: v.optional(v.string()),
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
        marketValueCents: v.optional(v.number()),
        discountPercent: v.optional(v.number()),
        purchasePriceCents: v.number(),
        askingPriceCents: v.optional(v.number()),
        vatRegime: v.union(v.literal('margin'), v.literal('other')),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const operationDigest = digest(args);
    const prior = replay(
      await ctx.db
        .query('purchases')
        .withIndex('by_owner_operation', (q) =>
          q.eq('ownerId', ownerId).eq('operationId', args.operationId),
        )
        .unique(),
      operationDigest,
    );
    if (prior)
      return {
        purchaseId: prior._id,
        itemIds: (
          await ctx.db
            .query('items')
            .withIndex('by_purchase', (q) => q.eq('purchaseId', prior._id))
            .collect()
        )
          .map((i) => i._id),
      };
    const seller = await ctx.db.get(args.sellerId);
    if (!seller) throw new Error('SELLER_NOT_FOUND');
    if (!Number.isFinite(args.occurredAt) || args.items.length === 0)
      throw new Error('INVALID_PURCHASE');
    if (
      args.items.some(
        (i) =>
          !i.name.trim() ||
          !Number.isSafeInteger(i.purchasePriceCents) ||
          i.purchasePriceCents < 0 ||
          (i.marketValueCents !== undefined &&
            (!Number.isSafeInteger(i.marketValueCents) || i.marketValueCents < 0)) ||
          (i.discountPercent !== undefined &&
            (!Number.isFinite(i.discountPercent) ||
              i.discountPercent < 0 ||
              i.discountPercent > 100)) ||
          (i.marketValueCents !== undefined &&
            i.discountPercent !== undefined &&
            Math.round((i.marketValueCents * i.discountPercent) / 100) !== i.purchasePriceCents) ||
          (i.askingPriceCents !== undefined &&
            (!Number.isSafeInteger(i.askingPriceCents) || i.askingPriceCents < 0)) ||
          !i.operationId,
      ) ||
      new Set(args.items.map((i) => i.operationId)).size !== args.items.length
    )
      throw new Error('INVALID_ITEM');
    const purchaseId = await ctx.db.insert('purchases', {
      ownerId,
      operationId: args.operationId,
      operationDigest,
      sellerId: args.sellerId,
      occurredAt: args.occurredAt,
      reference: args.reference,
      status: 'pending',
      createdAt: Date.now(),
    });
    const itemIds: Id<'items'>[] = [];
    for (const item of args.items)
      itemIds.push(
        await ctx.db.insert('items', {
          ...item,
          name: item.name.trim(),
          ownerId,
          purchaseId,
          purchaseOccurredAt: args.occurredAt,
          status: 'available',
          createdAt: Date.now(),
        }),
      );
    return { purchaseId, itemIds };
  },
});

export const validatePurchase = mutation({
  args: { purchaseId: v.id('purchases') },
  handler: async (ctx, { purchaseId }) => {
    await requireOwner(ctx);
    const purchase = await ctx.db.get(purchaseId);
    if (!purchase) throw new Error('PURCHASE_NOT_FOUND');
    if (purchase.status === 'cancelled') throw new Error('PURCHASE_CANCELLED');
    if (purchase.status === 'active') return purchaseId;
    await ctx.db.patch(purchaseId, { status: 'active' });
    return purchaseId;
  },
});

export const cancelPendingPurchase = mutation({
  args: { purchaseId: v.id('purchases') },
  handler: async (ctx, { purchaseId }) => {
    await requireOwner(ctx);
    const purchase = await ctx.db.get(purchaseId);
    if (!purchase) throw new Error('PURCHASE_NOT_FOUND');
    if (purchase.status === 'active') throw new Error('PURCHASE_ALREADY_VALIDATED');
    if (purchase.status === 'cancelled') return purchaseId;
    await ctx.db.patch(purchaseId, { status: 'cancelled' });
    const items = await ctx.db
      .query('items')
      .withIndex('by_purchase', (q) => q.eq('purchaseId', purchaseId))
      .collect();
    for (const item of items)
      if (item.status === 'available')
        await ctx.db.patch(item._id, { status: 'cancelled' });
    return purchaseId;
  },
});

export const updatePurchaseDate = mutation({
  args: { purchaseId: v.id('purchases'), occurredAt: v.number() },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const purchase = await ctx.db.get(args.purchaseId);
    if (!purchase) throw new Error('PURCHASE_NOT_FOUND');
    if (!Number.isSafeInteger(args.occurredAt)) throw new Error('INVALID_PURCHASE_DATE');
    const nextDay = new Date(args.occurredAt).toISOString().slice(0, 10);
    const items = await ctx.db
      .query('items')
      .withIndex('by_purchase', (q) => q.eq('purchaseId', args.purchaseId))
      .collect();
    for (const item of items) {
      const activeSales = await ctx.db
        .query('sales')
        .withIndex('by_item_status', (q) =>
          q.eq('itemId', item._id).eq('status', 'active'),
        )
        .collect();
      if (
        activeSales.some(
          (sale) => new Date(sale.occurredAt).toISOString().slice(0, 10) < nextDay,
        )
      )
        throw new Error('PURCHASE_DATE_AFTER_SALE');
    }
    await ctx.db.patch(args.purchaseId, { occurredAt: args.occurredAt });
    for (const item of items) {
      await ctx.db.patch(item._id, { purchaseOccurredAt: args.occurredAt });
    }
    return args.purchaseId;
  },
});

export const createSale = mutation({
  args: {
    operationId: v.string(),
    itemId: v.id('items'),
    occurredAt: v.number(),
    salePriceCents: v.number(),
    customerName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const operationDigest = digest(args);
    const prior = replay(
      await ctx.db
        .query('sales')
        .withIndex('by_owner_operation', (q) =>
          q.eq('ownerId', ownerId).eq('operationId', args.operationId),
        )
        .unique(),
      operationDigest,
    );
    if (prior) return prior._id;
    const previousConflict = replay(
      await ctx.db
        .query('saleConflicts')
        .withIndex('by_owner_operation', (q) =>
          q.eq('ownerId', ownerId).eq('operationId', args.operationId),
        )
        .unique(),
      operationDigest,
    );
    if (previousConflict) return { conflict: true as const, id: previousConflict._id };
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error('ITEM_NOT_FOUND');
    if (!Number.isSafeInteger(args.salePriceCents) || args.salePriceCents < 0)
      throw new Error('INVALID_PRICE');
    const saleDay = new Date(args.occurredAt).toISOString().slice(0, 10);
    const purchaseDay = new Date(item.purchaseOccurredAt).toISOString().slice(0, 10);
    if (!Number.isFinite(args.occurredAt) || (args.occurredAt < item.purchaseOccurredAt && saleDay < purchaseDay))
      throw new Error('SALE_BEFORE_PURCHASE');
    if (item.status !== 'available') {
      const conflictId = await ctx.db.insert('saleConflicts', {
        ownerId,
        operationId: args.operationId,
        operationDigest,
        itemId: args.itemId,
        occurredAt: args.occurredAt,
        salePriceCents: args.salePriceCents,
        customerName: args.customerName,
        status: 'open',
        createdAt: Date.now(),
      });
      return { conflict: true as const, id: conflictId };
    }
    const saleId = await ctx.db.insert('sales', {
      ...args,
      operationDigest,
      ownerId,
      status: 'active',
      createdAt: Date.now(),
    });
    await ctx.db.patch(item._id, { status: 'sold' });
    return saleId;
  },
});

export const updateAskingPrice = mutation({
  args: {
    itemId: v.id('items'),
    askingPriceCents: v.number(),
  },
  handler: async (ctx, { itemId, askingPriceCents }) => {
    await requireOwner(ctx);
    if (!Number.isSafeInteger(askingPriceCents) || askingPriceCents < 0)
      throw new Error('INVALID_PRICE');
    const item = await ctx.db.get(itemId);
    if (!item || item.status !== 'available')
      throw new Error('ITEM_NOT_FOUND');
    await ctx.db.patch(itemId, { askingPriceCents });
    return itemId;
  },
});

export const cancelSale = mutation({
  args: { operationId: v.string(), saleId: v.id('sales') },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const operationDigest = digest(args);
    const prior = await ctx.db
      .query('sales')
      .withIndex('by_owner_cancel_operation', (q) =>
        q.eq('ownerId', ownerId).eq('cancelOperationId', args.operationId),
      )
      .unique();
    if (prior) {
      if (prior.cancelDigest !== operationDigest) throw new Error('IDEMPOTENCY_KEY_REUSED');
      return prior._id;
    }
    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new Error('SALE_NOT_FOUND');
    if (sale.status === 'cancelled') {
      await ctx.db.patch(sale._id, {
        cancelOperationId: args.operationId,
        cancelDigest: operationDigest,
      });
      return sale._id;
    }
    const item = await ctx.db.get(sale.itemId);
    if (!item || item.status !== 'sold')
      throw new Error('ITEM_STATE_INVALID');
    await ctx.db.patch(sale._id, {
      status: 'cancelled',
      cancelOperationId: args.operationId,
      cancelDigest: operationDigest,
    });
    await ctx.db.patch(item._id, { status: 'available' });
    return sale._id;
  },
});

export const stock = query({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    const items = await ctx.db
      .query('items')
      .withIndex('by_status', (q) => q.eq('status', 'available'))
      .collect();
    const rows = await Promise.all(
      items.map(async (item) => {
        const [purchase, photos] = await Promise.all([
          ctx.db.get(item.purchaseId),
          ctx.db
            .query('attachments')
            .withIndex('by_item', (q) => q.eq('itemId', item._id))
            .collect(),
        ]);
        const seller = purchase ? await ctx.db.get(purchase.sellerId) : null;
        if (purchase?.status !== 'active') return null;
        return {
          ...item,
          photos,
          purchaseReference: purchase?.reference ?? '',
          sellerName: seller?.name ?? '',
        };
      }),
    );
    return rows.filter((row) => row !== null);
  },
});

export const publicCatalogue = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.string(), minPrice: v.optional(v.number()), maxPrice: v.optional(v.number()),
    gradingStatus: v.string(), gradingCompany: v.string(), gradingGrade: v.string(),
  },
  handler: async (ctx, args) => {
    // Apply every catalogue filter before slicing the result set. Paginating the
    // raw inventory first leaves sparse pages and incorrect next/previous state.
    const items = await ctx.db
      .query('items')
      .withIndex('by_status', (q) => q.eq('status', 'available'))
      .collect();
    const rows = await Promise.all(items.map(async (item) => {
      const purchase = await ctx.db.get(item.purchaseId);
      if (purchase?.status !== 'active' || item.askingPriceCents === undefined) return null;
      const search = args.search.trim().toLocaleLowerCase();
      const text = [item.name, item.series, item.identifier, item.gradingNotes, item.gradingCompany, item.gradingGrade].join(' ').toLocaleLowerCase();
      const graded = Boolean(item.gradingCompany);
      if (search && !text.includes(search)) return null;
      if (args.minPrice !== undefined && item.askingPriceCents < args.minPrice) return null;
      if (args.maxPrice !== undefined && item.askingPriceCents > args.maxPrice) return null;
      if (args.gradingStatus === 'graded' && !graded || args.gradingStatus === 'ungraded' && graded) return null;
      if (args.gradingCompany && item.gradingCompany !== args.gradingCompany) return null;
      if (args.gradingGrade && !(item.gradingGrade ?? '').toLocaleLowerCase().includes(args.gradingGrade.toLocaleLowerCase())) return null;
      return {
        id: item._id,
        name: item.name,
        series: item.series ?? '',
        identifier: item.identifier ?? '',
        language: item.language ?? 'fr',
        condition: item.condition ?? 'NM',
        gradingCompany: item.gradingCompany,
        gradingGrade: item.gradingGrade,
        gradingNotes: item.gradingNotes,
        catalogueImageUrl: item.catalogueImageUrl,
        salePriceCents: item.askingPriceCents!,
      };
    }));
    const filtered = rows.filter((row) => row !== null);
    const offset = args.paginationOpts.cursor ? Number(args.paginationOpts.cursor) : 0;
    const start = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    const page = filtered.slice(start, start + args.paginationOpts.numItems);
    const nextOffset = start + page.length;
    return {
      page,
      totalCount: filtered.length,
      continueCursor: String(nextOffset),
      isDone: nextOffset >= filtered.length,
    };
  },
});

export const sellerHistory = query({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    return ctx.db
      .query('sellers')
      .order('asc')
      .collect();
  },
});

export const purchaseHistory = query({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    const purchases = await ctx.db
      .query('purchases')
      .collect();
    purchases.sort((left, right) => right.occurredAt - left.occurredAt);
    return Promise.all(
      purchases.map(async (purchase) => {
        const [seller, items] = await Promise.all([
          ctx.db.get(purchase.sellerId),
          ctx.db
            .query('items')
            .withIndex('by_purchase', (q) => q.eq('purchaseId', purchase._id))
            .collect(),
        ]);
        return {
          ...purchase,
          sellerName: seller?.name ?? '',
          items: await Promise.all(
            items.map(async (item) => ({
              ...item,
              photos: await ctx.db
                .query('attachments')
                .withIndex('by_item', (q) => q.eq('itemId', item._id))
                .collect(),
            })),
          ),
        };
      }),
    );
  },
});

export const salesHistory = query({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    const sales = await ctx.db
      .query('sales')
      .order('desc')
      .collect();
    return Promise.all(
      sales.map(async (sale) => {
        const item = await ctx.db.get(sale.itemId);
        if (!item) return null;
        const purchase = await ctx.db.get(item.purchaseId);
        const seller = purchase ? await ctx.db.get(purchase.sellerId) : null;
        return {
          ...sale,
          itemName: item.name,
          series: item.series ?? '',
          identifier: item.identifier ?? '',
          language: item.language ?? 'fr',
          condition: item.condition ?? 'NM',
          gradingCompany: item.gradingCompany,
          gradingGrade: item.gradingGrade,
          gradingCertificate: item.gradingCertificate,
          gradingNotes: item.gradingNotes,
          marketValueCents: item.marketValueCents,
          discountPercent: item.discountPercent,
          askingPriceCents: item.askingPriceCents,
          purchasePriceCents: item.purchasePriceCents,
          purchaseReference: purchase?.reference ?? '',
          vatRegime: item.vatRegime,
          purchaseOccurredAt: purchase?.occurredAt ?? item.purchaseOccurredAt,
          sellerName: seller?.name ?? '',
        };
      }),
    ).then((rows) => rows.filter((row) => row !== null));
  },
});

export const openSaleConflicts = query({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    const conflicts = await ctx.db
      .query('saleConflicts')
      .withIndex('by_status', (q) => q.eq('status', 'open'))
      .order('desc')
      .collect();
    return Promise.all(
      conflicts.map(async (conflict) => {
        const item = await ctx.db.get(conflict.itemId);
        return { ...conflict, itemName: item?.name ?? '' };
      }),
    );
  },
});

export const getSaleConflict = query({
  args: { conflictId: v.id('saleConflicts') },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const conflict = await ctx.db.get(args.conflictId);
    if (!conflict) throw new Error('CONFLICT_NOT_FOUND');
    return conflict;
  },
});

export const resolveSaleConflict = mutation({
  args: { conflictId: v.id('saleConflicts'), resolutionNote: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const conflict = await ctx.db.get(args.conflictId);
    if (!conflict) throw new Error('CONFLICT_NOT_FOUND');
    if (!args.resolutionNote.trim()) throw new Error('RESOLUTION_NOTE_REQUIRED');
    if (conflict.status === 'open') {
      await ctx.db.patch(conflict._id, {
        status: 'resolved',
        resolutionNote: args.resolutionNote.trim(),
        resolvedAt: Date.now(),
      });
    }
    return conflict._id;
  },
});

export const createAttachment = mutation({
  args: {
    purchaseId: v.optional(v.id('purchases')),
    itemId: v.optional(v.id('items')),
    objectKey: v.string(),
    filename: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    if (!args.purchaseId && !args.itemId) throw new Error('ATTACHMENT_TARGET_REQUIRED');
    if (args.purchaseId) {
      const purchase = await ctx.db.get(args.purchaseId);
      if (!purchase) throw new Error('PURCHASE_NOT_FOUND');
    }
    if (args.itemId) {
      const item = await ctx.db.get(args.itemId);
      if (!item) throw new Error('ITEM_NOT_FOUND');
      if (args.purchaseId && item.purchaseId !== args.purchaseId)
        throw new Error('ATTACHMENT_TARGET_MISMATCH');
    }
    if (!args.objectKey.startsWith(`${ownerId}/`) || args.size <= 0)
      throw new Error('INVALID_ATTACHMENT');
    return ctx.db.insert('attachments', { ...args, ownerId, createdAt: Date.now() });
  },
});

export const attachmentById = query({
  args: { attachmentId: v.id('attachments') },
  handler: async (ctx, { attachmentId }) => {
    await requireOwner(ctx);
    const attachment = await ctx.db.get(attachmentId);
    if (!attachment) throw new Error('ATTACHMENT_NOT_FOUND');
    return attachment;
  },
});

export const attachmentsForPurchase = query({
  args: { purchaseId: v.id('purchases') },
  handler: async (ctx, { purchaseId }) => {
    await requireOwner(ctx);
    const purchase = await ctx.db.get(purchaseId);
    if (!purchase) throw new Error('PURCHASE_NOT_FOUND');
    return ctx.db
      .query('attachments')
      .withIndex('by_purchase', (q) => q.eq('purchaseId', purchaseId))
      .collect();
  },
});
