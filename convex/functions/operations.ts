import { itemTcg, matchesSeries, seriesOptions, type SeriesItem } from '../../packages/domain/src/seriesFilter';
export {salePaymentHistory} from './paymentHistory';
import {mutation} from './itemActivity';
import {shopDay} from './shopCalendar';
import { consume, restore, integer } from './stockLedger';
import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { type MutationCtx, type QueryCtx, internalQuery, query } from './_generated/server';
import { splitConsignmentPrice } from './consignmentOperations';
import {
  allocateSalePayments,
  type SalePayment,
  salePaymentStatusValidator,
  salePaymentValidator,
  validateSalePayment,
} from './salePayments';

export {
  consignmentBalances,
  consignmentHistory,
  createConsignment,
  recordConsignmentPayment,
  returnConsignmentItem,
  updateConsignmentTerms,
} from './consignmentOperations';

import { requireLiveSession as requireOwner } from './sessionGuard';

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
    buyerNote: v.optional(v.string()),
    sellerNote: v.optional(v.string()),
    operationId: v.string(),
    sellerId: v.id('sellers'),
    occurredAt: v.number(),
    reference: v.string(),
    items: v.array(
      v.object({
        operationId: v.string(),
        name: v.string(),
        tcg: v.optional(v.union(v.literal('pokemon'), v.literal('riftbound'), v.literal('other'))),
        series: v.optional(v.string()),
        identifier: v.optional(v.string()),
        serialNumber: v.optional(v.string()),
        catalogueImageUrl: v.optional(v.string()),
        catalogueCardId:v.optional(v.string()),catalogueSetId:v.optional(v.string()),
        language: v.optional(v.union(v.literal('fr'), v.literal('en'), v.literal('ja'), v.literal('zh'))),
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
          v.string(),
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
        ).map((i) => i._id),
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
    if ([args.buyerNote, args.sellerNote].some(note => (note?.length ?? 0) > 2000)) throw new Error('INVALID_PURCHASE_NOTE');
    const purchaseId = await ctx.db.insert('purchases', {
      buyerNote: args.buyerNote?.trim() || undefined,
      sellerNote: args.sellerNote?.trim() || undefined,
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
      if (item.status === 'available') await ctx.db.patch(item._id, { status: 'cancelled' });
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
    const nextDay = shopDay(args.occurredAt);
    const items = await ctx.db
      .query('items')
      .withIndex('by_purchase', (q) => q.eq('purchaseId', args.purchaseId))
      .collect();
    for (const item of items) {
      const activeSales = await ctx.db
        .query('sales')
        .withIndex('by_item_status', (q) => q.eq('itemId', item._id).eq('status', 'active'))
        .collect();
      if (
        activeSales.some((sale) => shopDay(sale.occurredAt) < nextDay)
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

type SaleInput = {
  quantity?: number;
  paymentStatus?: 'pending' | 'received';
  payment?: SalePayment;
  operationId: string;
  itemId: Id<'items'>;
  occurredAt: number;
  salePriceCents: number;
  customerName?: string;
};
async function createSaleTransaction(ctx: MutationCtx, args: SaleInput) {
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
  integer(args.quantity ?? 1, 1, 100000);
  if (item.origin !== 'supplier' && (args.quantity ?? 1) !== 1) throw new Error('INVALID_INVENTORY');
  if (!Number.isSafeInteger(args.salePriceCents) || args.salePriceCents < 0)
    throw new Error('INVALID_PRICE');
  if (
    !Number.isSafeInteger(args.occurredAt) ||
    !Number.isFinite(new Date(args.occurredAt).getTime())
  )
    throw new Error('INVALID_SALE_DATE');
  validateSalePayment(args.salePriceCents, args.occurredAt, args.paymentStatus, args.payment);
  const saleDay = shopDay(args.occurredAt);
  const purchaseDay = shopDay(item.purchaseOccurredAt);
  if (
    !Number.isFinite(args.occurredAt) ||
    (args.occurredAt < item.purchaseOccurredAt && saleDay < purchaseDay)
  )
    throw new Error('SALE_BEFORE_PURCHASE');
  const consignment = item.consignmentId ? await ctx.db.get(item.consignmentId) : null;
  const purchase = item.purchaseId ? await ctx.db.get(item.purchaseId) : null;
  if (item.origin === 'consignment') {
    if (!consignment || item.commissionRateBps === undefined || item.agreedPriceCents === undefined)
      throw new Error('CONSIGNMENT_ITEM_NOT_FOUND');
    if (consignment.flowVersion === 2 && consignment.contractStatus !== 'signed') throw new Error('CONTRACT_SIGNATURE_REQUIRED');
    if (args.salePriceCents < item.agreedPriceCents) throw new Error('PRICE_BELOW_AGREEMENT');
  } else if (item.origin !== 'supplier' && purchase?.status !== 'active') throw new Error('ITEM_UNAVAILABLE');
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
  const allocations = item.origin === 'supplier' ? await consume(ctx, item, args.quantity ?? 1, args.occurredAt) : undefined;
  const costCents = allocations ? allocations.reduce((s,a)=>s+a.costCents,0) : item.purchasePriceCents;
  const saleId = await ctx.db.insert('sales', {
    allocations, costCents, itemName: item.name, taxRateBps: item.taxRateBps, vatRegime: item.vatRegime,
    ...args,
    operationDigest,
    ownerId,
    origin: item.origin ?? 'purchase',
    ...(consignment && item.commissionRateBps !== undefined
      ? {
          consignmentId: consignment._id,
          sellerId: consignment.sellerId,
          commissionRateBps: item.commissionRateBps,
          ...splitConsignmentPrice(args.salePriceCents, item.commissionRateBps),
        }
      : {}),
    status: 'active',
    createdAt: Date.now(),
  });
  if (item.origin !== 'supplier') await ctx.db.patch(item._id, { status: 'sold' });
  return saleId;
}
export const createSale = mutation({
  args: {
    quantity: v.optional(v.number()),
    paymentStatus: v.optional(salePaymentStatusValidator),
    payment: v.optional(salePaymentValidator),
    operationId: v.string(),
    itemId: v.id('items'),
    occurredAt: v.number(),
    salePriceCents: v.number(),
    customerName: v.optional(v.string()),
  },
  handler: createSaleTransaction,
});

export const createSales = mutation({
  args: {
    paymentStatus: v.optional(salePaymentStatusValidator),
    payment: v.optional(salePaymentValidator),
    operationId: v.string(),
    occurredAt: v.number(),
    items: v.array(v.object({ itemId: v.id('items'), salePriceCents: v.number(), quantity: v.optional(v.number()) })),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const prior = replay(
      await ctx.db
        .query('saleBatches')
        .withIndex('by_owner_operation', (q) =>
          q.eq('ownerId', ownerId).eq('operationId', args.operationId),
        )
        .unique(),
      digest(args),
    );
    if (prior) return { ids: prior.saleIds };
    if (
      !args.operationId ||
      !args.items.length || args.items.length > 100 ||
      new Set(args.items.map((item) => item.itemId)).size !== args.items.length
    )
      throw new Error('INVALID_SALE_BATCH');
    if (
      args.items.some(
        (item) => !Number.isSafeInteger(item.salePriceCents) || item.salePriceCents < 0,
      )
    )
      throw new Error('INVALID_PRICE');
    const totalBig = args.items.reduce((sum, item) => sum + BigInt(item.salePriceCents), 0n);
    if (totalBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('INVALID_PRICE');
    validateSalePayment(Number(totalBig), args.occurredAt, args.paymentStatus, args.payment);
    const payments = args.payment
      ? allocateSalePayments(
          args.items.map((item) => item.salePriceCents),
          args.payment,
        )
      : undefined;
    const ids: Id<'sales'>[] = [];
    for (const [index, item] of args.items.entries()) {
      const saleId = await createSaleTransaction(ctx, {
        ...item,
        operationId: `${args.operationId}:bulk:${index}`,
        occurredAt: args.occurredAt,
        ...(args.paymentStatus ? { paymentStatus: args.paymentStatus } : {}),
        ...(payments ? { payment: payments[index] } : {}),
      });
      if (typeof saleId !== 'string') throw new Error('ITEM_UNAVAILABLE');
      ids.push(saleId);
    }
    await ctx.db.insert('saleBatches', {
      ownerId,
      operationId: args.operationId,
      operationDigest: digest(args),
      saleIds: ids,
    });
    return { ids };
  },
});

export const recordSalePayment = mutation({
  args: {
    operationId: v.string(),
    saleId: v.id('sales'),
    cashCents: v.number(),
    transferCents: v.number(),
    receivedAt: v.number(),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const operationDigest = digest(args);
    const prior = replay(
      await ctx.db
        .query('salePaymentEvents')
        .withIndex('by_owner_operation', (q) =>
          q.eq('ownerId', ownerId).eq('operationId', args.operationId),
        )
        .unique(),
      operationDigest,
    );
    if (prior) return prior.saleId;
    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new Error('SALE_NOT_FOUND');
    if (sale.status !== 'active') throw new Error('SALE_CANCELLED');
    if (!args.operationId) throw new Error('INVALID_SALE_PAYMENT');
    const { operationId, saleId, ...payment } = args;
    validateSalePayment(sale.salePriceCents, sale.occurredAt, 'received', payment);
    await ctx.db.insert('salePaymentEvents', {
      ownerId,
      operationId,
      operationDigest,
      saleId,
      previousPaymentStatus: sale.paymentStatus,
      previousPayment: sale.payment,
      payment,
      createdAt: Date.now(),
    });
    await ctx.db.patch(saleId, { paymentStatus: 'received', payment });
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
    if (!item || item.status !== 'available') throw new Error('ITEM_NOT_FOUND');
    if (item.origin === 'consignment' && askingPriceCents < (item.agreedPriceCents ?? 0))
      throw new Error('PRICE_BELOW_AGREEMENT');
    await ctx.db.patch(itemId, { askingPriceCents,revision:(item.revision??0)+1 });
    return itemId;
  },
});

export const cancelSale = mutation({
  args: { operationId: v.string(), saleId: v.id('sales') },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    if (!args.operationId.trim() || args.operationId.length > 200) throw new Error('INVALID_OPERATION_KEY');
    const operationDigest = digest(args);
    const prior = replay(await ctx.db.query('saleCancellations')
      .withIndex('by_owner_operation', q => q.eq('ownerId', ownerId).eq('operationId', args.operationId)).unique(), operationDigest);
    if (prior) return prior.saleId;
    // Preserve keys recorded by the earlier schema. Promote them lazily without altering their acknowledgement.
    const historical = await ctx.db.query('sales')
      .withIndex('by_owner_cancel_operation', q => q.eq('ownerId', ownerId).eq('cancelOperationId', args.operationId)).unique();
    if (historical && historical.cancelDigest !== operationDigest) throw new Error('IDEMPOTENCY_KEY_REUSED');
    const sale = historical ?? await ctx.db.get(args.saleId);
    if (!sale) throw new Error('SALE_NOT_FOUND');
    if (!historical && sale.status !== 'cancelled') {
      const item = await ctx.db.get(sale.itemId);
      if (!item || (item.origin !== 'supplier' && item.status !== 'sold')) throw new Error('ITEM_STATE_INVALID');
      await ctx.db.patch(sale._id, {
        status: 'cancelled',
        cancelOperationId: sale.cancelOperationId ?? args.operationId,
        cancelDigest: sale.cancelDigest ?? operationDigest,
      });
      if (item.origin === 'supplier') await restore(ctx, item._id, sale.allocations ?? []);
      else await ctx.db.patch(item._id, { status: 'available' });
    }
    // Every accepted request retains its own binding, including no-op repeats by another colleague.
    // A second request must never replace the first key or become reusable for another sale.
    await ctx.db.insert('saleCancellations', { ownerId, ...args, operationDigest, createdAt: Date.now(), applied: !historical && sale.status !== 'cancelled' });
    return sale._id;
  },
});

export const setStockVisibility = mutation({
  args: {
    operationId: v.string(),
    itemIds: v.array(v.id('items')),
    hidden: v.boolean(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const operationDigest = digest(args);
    const prior = replay(
      await ctx.db
        .query('stockVisibilityOperations')
        .withIndex('by_owner_operation', (q) =>
          q.eq('ownerId', ownerId).eq('operationId', args.operationId),
        )
        .unique(),
      operationDigest,
    );
    if (prior) return { updatedCount: prior.updatedCount };
    if (
      !args.operationId.trim() ||
      args.itemIds.length < 1 ||
      args.itemIds.length > 500 ||
      new Set(args.itemIds).size !== args.itemIds.length
    )
      throw new Error('INVALID_STOCK_SELECTION');
    const items = await Promise.all(args.itemIds.map((id) => ctx.db.get(id)));
    // A stale selection fails as a whole, so no product is changed silently.
    if (items.some((item) => item?.status !== 'available'))
      throw new Error('ITEM_UNAVAILABLE');
    let updatedCount = 0;
    for (const item of items) {
      if (item && (item.hiddenFromCatalogue ?? false) !== args.hidden) {
        await ctx.db.patch(item._id, { hiddenFromCatalogue: args.hidden,revision:(item.revision??0)+1 });
        updatedCount++;
      }
    }
    await ctx.db.insert('stockVisibilityOperations', {
      ...args,
      ownerId,
      operationDigest,
      updatedCount,
      createdAt: Date.now(),
    });
    return { updatedCount };
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
          item.purchaseId ? ctx.db.get(item.purchaseId) : Promise.resolve(null),
          ctx.db
            .query('attachments')
            .withIndex('by_item', (q) => q.eq('itemId', item._id))
            .collect(),
        ]);
        const consignment = item.consignmentId ? await ctx.db.get(item.consignmentId) : null;
        const source = consignment ?? purchase;
        const seller = source ? await ctx.db.get(source.sellerId) : null;
        if (!consignment && item.origin !== 'supplier' && purchase?.status !== 'active') return null;
        if (consignment?.flowVersion === 2 && consignment.contractStatus !== 'signed') return null;
        return {
          ...item,
          photos: photos.sort((a,b)=>Number(b._id===item.coverPhotoId)-Number(a._id===item.coverPhotoId)),
          origin: item.origin ?? 'purchase',
          productType: item.productType ?? 'card',
          purchasePriceCents: item.purchasePriceCents ?? 0,
          sellerId: source?.sellerId,
          purchaseReference: source?.reference ?? '',
          sellerName: seller?.name ?? '',
        };
      }),
    );
    return rows.filter((row) => row !== null);
  },
});

async function catalogueEligible(ctx: QueryCtx, item: Doc<'items'>): Promise<boolean> {
  if (item.removedPurchaseId || (item.quantity ?? 1) <= 0 || item.status !== 'available' || item.hiddenFromCatalogue || item.askingPriceCents === undefined) return false;
  if (item.consignmentId) { const d = await ctx.db.get(item.consignmentId); return !!d && (d.flowVersion !== 2 || d.contractStatus === 'signed'); }
  if (item.origin === 'supplier') return (item.quantity ?? 0) > 0;
  const purchase = item.purchaseId ? await ctx.db.get(item.purchaseId) : null;
  return purchase?.status === 'active';
}

async function cataloguePhoto(ctx: QueryCtx, itemId: Id<'items'>) {
  const photos = await ctx.db.query('attachments').withIndex('by_item', q => q.eq('itemId', itemId)).collect();
  const product = await ctx.db.get(itemId);
  const publicPhotos = photos.filter(photo => !photo.purchaseId && !photo.supplierReceiptId && !photo.giftId && ['image/jpeg', 'image/png', 'image/webp'].includes(photo.contentType));
  return publicPhotos.find(photo => photo._id === product?.coverPhotoId) ?? publicPhotos[0] ?? null;
}

// Only the service-authenticated action can resolve private object keys.
export const cataloguePhotoObject = internalQuery({
  args: { itemId: v.string(), photoId: v.optional(v.string()) },
  handler: async (ctx, { itemId, photoId }) => {
    const id = ctx.db.normalizeId('items', itemId);
    const item = id ? await ctx.db.get(id) : null;
    if (!item || !await catalogueEligible(ctx, item)) return null;
    const attachmentId = photoId ? ctx.db.normalizeId('attachments', photoId) : null;
    const photo = photoId ? (attachmentId ? await ctx.db.get(attachmentId) : null) : await cataloguePhoto(ctx, item._id);
    if (photo && (photo.itemId !== item._id || photo.purchaseId || photo.supplierReceiptId || photo.giftId || !['image/jpeg','image/png','image/webp'].includes(photo.contentType))) return null;
    return photo ? { objectKey: photo.objectKey, contentType: photo.contentType } : null;
  },
});

export const publicProduct = query({
  args: { itemId: v.string() },
  handler: async (ctx, {itemId}) => {
    const id = ctx.db.normalizeId('items', itemId), item = id ? await ctx.db.get(id) : null;
    if (!item || !await catalogueEligible(ctx,item)) return null;
    const photos = (await ctx.db.query('attachments').withIndex('by_item',q=>q.eq('itemId',item._id)).collect())
      .filter(p=>!p.purchaseId && !p.supplierReceiptId && !p.giftId && ['image/jpeg','image/png','image/webp'].includes(p.contentType))
      .sort((a,b)=>Number(b._id===item.coverPhotoId)-Number(a._id===item.coverPhotoId));
    return {id:item._id, name:item.name, productType:item.productType ?? 'card', description:item.description ?? '',
      series:item.series, identifier:item.identifier, language:item.language, condition:item.condition,
      gradingCompany:item.gradingCompany, gradingGrade:item.gradingGrade, gradingCertificate:item.gradingCertificate,
      publicAttributes:item.publicAttributes,variant:item.variant,...(item.priceVisible===false?{}:{salePriceCents:item.askingPriceCents}), quantity:item.quantity ?? 1, catalogueImageUrl:item.catalogueImageUrl,
      coverPhotoId:photos[0]?._id, photos:photos.map(p=>({id:p._id}))};
  }
});

export const publicCatalogue = query({
  args: {
    language: v.optional(v.string()),
    tcg: v.optional(v.union(v.literal('pokemon'), v.literal('riftbound'), v.literal('other'), v.literal('all'))),
    paginationOpts: paginationOptsValidator,
    series: v.optional(v.string()),
    search: v.string(),
    minPrice: v.optional(v.number()),
    maxPrice: v.optional(v.number()),
    gradingStatus: v.string(),
    gradingCompany: v.string(),
    gradingGrade: v.string(),
    sort: v.optional(v.union(v.literal('recent'),v.literal('name'),v.literal('price-asc'),v.literal('price-desc'))),
  },
  handler: async (ctx, args) => {
    // Apply every catalogue filter before slicing the result set. Paginating the
    // raw inventory first leaves sparse pages and incorrect next/previous state.
    const size=args.paginationOpts.numItems;
    if(!Number.isInteger(size)||size<1||size>48||args.search.length>200||(args.series?.length??0)>300||(args.language?.length??0)>20||args.gradingCompany.length>100||args.gradingGrade.length>100||!['all','graded','ungraded'].includes(args.gradingStatus)||[args.minPrice,args.maxPrice].some(value=>value!==undefined&&(!Number.isSafeInteger(value)||value<0))||(args.minPrice!==undefined&&args.maxPrice!==undefined&&args.minPrice>args.maxPrice))throw new Error('INVALID_CATALOGUE_QUERY');
    if(args.paginationOpts.cursor!==null&&(!/^\d+$/.test(args.paginationOpts.cursor)||!Number.isSafeInteger(Number(args.paginationOpts.cursor))))throw new Error('INVALID_CURSOR');
    const items = await ctx.db
      .query('items')
      .withIndex('by_status', (q) => q.eq('status', 'available'))
      .collect();
    if (args.sort) items.sort((a,b)=>{
      const order=args.sort==='name'?a.name.localeCompare(b.name,'fr',{numeric:true,sensitivity:'base'}):args.sort==='price-asc'?((a.priceVisible===false?Number.MAX_SAFE_INTEGER:a.askingPriceCents??0)-(b.priceVisible===false?Number.MAX_SAFE_INTEGER:b.askingPriceCents??0)):args.sort==='price-desc'?((b.priceVisible===false?-1:b.askingPriceCents??0)-(a.priceVisible===false?-1:a.askingPriceCents??0)):b._creationTime-a._creationTime;
      return order||a._id.localeCompare(b._id);
    });
    const gradingCompanies = new Set<string>(), languages = new Set<string>();
    const seriesCandidates: SeriesItem[] = [];
    const rows = await Promise.all(
      items.map(async (item) => {
        if (!await catalogueEligible(ctx, item) || item.askingPriceCents === undefined) return null;
        seriesCandidates.push(item);
        const isCard = !item.productType || item.productType === 'card';
        const language = item.language ?? (isCard ? 'fr' : undefined);
        if (item.gradingCompany) gradingCompanies.add(item.gradingCompany);
        if (language) languages.add(language);
        if (!matchesSeries(item, args.series)) return null;
        if (args.language && args.language !== language) return null;
        const tcg = item.tcg ?? (isCard ? 'pokemon' : undefined);
        if (args.tcg && args.tcg !== 'all' && itemTcg(item) !== args.tcg) return null;
        const search = args.search.trim().toLocaleLowerCase();
        const text = [
          item.name,
          item.series,
          item.identifier,
          item.description,
          item.gradingCompany,
          item.gradingGrade,
        ]
          .join(' ')
          .toLocaleLowerCase();
        const graded = Boolean(item.gradingCompany);
        if (search && !text.includes(search)) return null;
        if (item.priceVisible !== false && args.minPrice !== undefined && item.askingPriceCents < args.minPrice) return null;
        if (item.priceVisible !== false && args.maxPrice !== undefined && item.askingPriceCents > args.maxPrice) return null;
        if (
          (args.gradingStatus === 'graded' && !graded) ||
          (args.gradingStatus === 'ungraded' && graded)
        )
          return null;
        if (args.gradingCompany && item.gradingCompany !== args.gradingCompany) return null;
        if (
          args.gradingGrade &&
          !(item.gradingGrade ?? '')
            .toLocaleLowerCase()
            .includes(args.gradingGrade.toLocaleLowerCase())
        )
          return null;
        return {
          id: item._id,
          productType: item.productType ?? 'card',
          description: item.description,
          publicAttributes:item.publicAttributes,variant:item.variant,
          tcg,
          name: item.name,
          series: item.series ?? '',
          identifier: item.identifier ?? '',
          language:
            item.language ?? (!item.productType || item.productType === 'card' ? 'fr' : undefined),
          condition:
            item.condition ?? (!item.productType || item.productType === 'card' ? 'NM' : undefined),
          gradingCompany: item.gradingCompany,
          gradingGrade: item.gradingGrade,
          catalogueImageUrl: item.catalogueImageUrl,
          hasPhoto: Boolean(await cataloguePhoto(ctx, item._id)),
          ...(item.priceVisible===false?{}:{salePriceCents:item.askingPriceCents}),
          quantity: item.quantity ?? 1,
        };
      }),
    );
    const filtered = rows.filter((row) => row !== null);
    const offset = args.paginationOpts.cursor ? Number(args.paginationOpts.cursor) : 0;
    const start = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    const page = filtered.slice(start, start + args.paginationOpts.numItems);
    const nextOffset = start + page.length;
    return {
      page,
      totalCount: filtered.length,
      series: seriesOptions(seriesCandidates, args.tcg),
      gradingCompanies: [...gradingCompanies].sort((a,b)=>a.localeCompare(b,'fr')),
      languages: [...languages].sort(),
      continueCursor: String(nextOffset),
      isDone: nextOffset >= filtered.length,
    };
  },
});

export const sellerHistory = query({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    return ctx.db.query('sellers').order('asc').collect();
  },
});

export const purchaseHistory = query({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    const purchases = await ctx.db.query('purchases').collect();
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
    const sales = await ctx.db.query('sales').order('desc').collect();
    return Promise.all(
      sales.map(async (sale) => {
        const item = await ctx.db.get(sale.itemId);
        if (!item) return null;
        const purchase = item.purchaseId ? await ctx.db.get(item.purchaseId) : null;
        const consignment = item.consignmentId ? await ctx.db.get(item.consignmentId) : null;
        const source = consignment ?? purchase;
        const seller = source ? await ctx.db.get(source.sellerId) : null;
        return {
          ...sale,
          origin: sale.origin ?? item.origin ?? 'purchase',
          productType: item.productType ?? 'card',
          itemName: sale.itemName ?? item.name,
          series: item.series ?? '',
          identifier: item.identifier ?? '',
          language:
            item.language ?? (!item.productType || item.productType === 'card' ? 'fr' : undefined),
          condition:
            item.condition ?? (!item.productType || item.productType === 'card' ? 'NM' : undefined),
          gradingCompany: item.gradingCompany,
          gradingGrade: item.gradingGrade,
          gradingCertificate: item.gradingCertificate,
          gradingNotes: item.gradingNotes,
          marketValueCents: item.marketValueCents,
          discountPercent: item.discountPercent,
          askingPriceCents: item.askingPriceCents,
          purchasePriceCents: sale.costCents ?? item.purchasePriceCents ?? 0,
          purchaseReference: source?.reference ?? '',
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
    operationId: v.optional(v.string()),
    supplierReceiptId: v.optional(v.id('supplierReceipts')),
    giftId: v.optional(v.id('stockGifts')),
    purchaseId: v.optional(v.id('purchases')),
    itemId: v.optional(v.id('items')),
    objectKey: v.string(),
    filename: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    if (args.operationId) { const prior = await ctx.db.query('attachments').withIndex('by_owner_operation', q=>q.eq('ownerId', ownerId).eq('operationId',args.operationId)).unique(); if (prior) { if(prior.operationDigest !== JSON.stringify(args)) throw new Error('IDEMPOTENCY_KEY_REUSED'); return prior._id; } }
    if (!args.purchaseId && !args.itemId && !args.supplierReceiptId && !args.giftId) throw new Error('ATTACHMENT_TARGET_REQUIRED');
    if (args.supplierReceiptId && !(await ctx.db.get(args.supplierReceiptId))) throw new Error('RECEIPT_NOT_FOUND');
    if (args.giftId && !(await ctx.db.get(args.giftId))) throw new Error('GIFT_NOT_FOUND');
    if (args.purchaseId) {
      const purchase = await ctx.db.get(args.purchaseId);
      if (!purchase) throw new Error('PURCHASE_NOT_FOUND');
    }
    if (args.itemId) {
      const item = await ctx.db.get(args.itemId);
      if (!item) throw new Error('ITEM_NOT_FOUND');
      if (args.contentType.startsWith('image/')) { const photos=await ctx.db.query('attachments').withIndex('by_item',q=>q.eq('itemId',item._id)).collect(); if(photos.filter(p=>p.contentType.startsWith('image/')).length>=6) throw new Error('INVALID_ATTACHMENT'); }
      if (args.purchaseId && item.purchaseId !== args.purchaseId)
        throw new Error('ATTACHMENT_TARGET_MISMATCH');
    }
    const prefix = args.itemId && ['image/jpeg', 'image/png', 'image/webp'].includes(args.contentType)
      ? `cards/${ownerId}/` : `attachments/${ownerId}/`;
    const validKey = [prefix, `${ownerId}/`].some(base => {
      if (!args.objectKey.startsWith(base)) return false;
      const suffix = args.objectKey.slice(base.length);
      return !!suffix && !suffix.includes('/') && suffix !== '.' && suffix !== '..';
    });
    if (!validKey || args.size <= 0)
      throw new Error('INVALID_ATTACHMENT');
    return ctx.db.insert('attachments', { ...args, operationDigest: args.operationId ? JSON.stringify(args) : undefined, ownerId, createdAt: Date.now() });
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

/** Filter purchase metadata on the server; hydrate items/photos only for the requested page. */
export const purchaseHistoryPage = query({
  args: {
    page: v.number(),
    size: v.number(),
    series: v.optional(v.string()),
    search: v.string(),
    status: v.union(
      v.literal('all'),
      v.literal('pending'),
      v.literal('active'),
      v.literal('cancelled'),
    ),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    if (
      !Number.isSafeInteger(args.page) ||
      args.page < 1 ||
      !Number.isSafeInteger(args.size) ||
      args.size < 1 ||
      args.size > 50
    )
      throw new Error('INVALID_PAGINATION');
    if (
      (args.from !== undefined && !Number.isFinite(args.from)) ||
      (args.to !== undefined && !Number.isFinite(args.to)) ||
      (args.from !== undefined && args.to !== undefined && args.from > args.to)
    )
      throw new Error('INVALID_DATE_RANGE');
    const [purchases, sellers] = await Promise.all([
      ctx.db.query('purchases').collect(),
      ctx.db.query('sellers').collect(),
    ]);
    const sellerNames = new Map(sellers.map((s) => [s._id, s.name]));
    const normalize = (text: string) =>
      text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase();
    const words = normalize(args.search.trim()).split(/\s+/).filter(Boolean);
    const matches = purchases
      .filter((p) => {
        if (args.status !== 'all' && p.status !== args.status) return false;
        if (args.from !== undefined && p.occurredAt < args.from) return false;
        if (args.to !== undefined && p.occurredAt > args.to) return false;
        const text = normalize(`${p.reference} ${sellerNames.get(p.sellerId) ?? ''}`);
        return words.every((word) => text.includes(word));
      })
      .sort(
        (a, b) =>
          b.occurredAt - a.occurredAt ||
          b._creationTime - a._creationTime ||
          a._id.localeCompare(b._id),
      );
    const totalPages = Math.max(1, Math.ceil(matches.length / args.size));
    const page = Math.min(args.page, totalPages);
    const rows = await Promise.all(
      matches.slice((page - 1) * args.size, page * args.size).map(async (purchase) => {
        const items = await ctx.db
          .query('items')
          .withIndex('by_purchase', (q) => q.eq('purchaseId', purchase._id))
          .collect();
        return {
          ...purchase,
          sellerName: sellerNames.get(purchase.sellerId) ?? '',
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
    return { rows, page, totalPages, totalCount: matches.length };
  },
});
