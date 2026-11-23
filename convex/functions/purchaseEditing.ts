import {mutation} from './itemActivity';
import { v } from 'convex/values';
import { query} from './_generated/server';
import { stockOwner, checkReplay, integer } from './stockLedger';
import { productFields } from './inventoryValidators';
import type { Id } from './_generated/dataModel';

export const detail = query({
  args: { purchaseId: v.id('purchases') },
  handler: async (ctx, { purchaseId }) => {
    await stockOwner(ctx);
    const purchase = await ctx.db.get(purchaseId);
    if (!purchase) throw new Error('PURCHASE_NOT_FOUND');
    const items = await ctx.db
      .query('items')
      .withIndex('by_purchase', (q) => q.eq('purchaseId', purchaseId))
      .take(501);
    if (items.length > 500) throw new Error('PURCHASE_TOO_LARGE');
    const lockedIds = (
      await Promise.all(
        items.map(async (item) =>
          item.status !== 'available' ||
          (await ctx.db
            .query('sales')
            .withIndex('by_item_status', (q) => q.eq('itemId', item._id))
            .first()) ||
          (await ctx.db
            .query('stockGifts')
            .withIndex('by_item', (q) => q.eq('itemId', item._id))
            .first())
            ? item._id
            : null,
        ),
      )
    ).filter((id) => id !== null);
    return { purchase, items, lockedIds, expectedDigest: JSON.stringify([purchase, items]) };
  },
});
const line = v.object({
  itemId: v.optional(v.id('items')),
  operationId: v.string(),
  name: v.string(),
  tcg: productFields.tcg,
  language: productFields.language,
  condition: productFields.condition,
  series: v.optional(v.string()),
  identifier: v.optional(v.string()),
  catalogueImageUrl: v.optional(v.string()),
  gradingCompany: productFields.gradingCompany,
  gradingGrade: v.optional(v.string()),
  gradingCertificate: v.optional(v.string()),
  gradingNotes: v.optional(v.string()),
  marketValueCents: v.number(),
  discountPercent: v.number(),
  askingPriceCents: v.optional(v.number()),
});
export const save = mutation({
  args: {
    operationId: v.string(),
    purchaseId: v.id('purchases'),
    expectedDigest: v.string(),
    items: v.array(line),
    removedIds: v.array(v.id('items')),
  },
  handler: async (ctx, args) => {
    const ownerId = await stockOwner(ctx);
    const prior = checkReplay(
      await ctx.db
        .query('purchaseEdits')
        .withIndex('by_owner_operation', (q) =>
          q.eq('ownerId', ownerId).eq('operationId', args.operationId),
        )
        .unique(),
      args,
    );
    if (prior) return { itemIds: prior.itemIds };
    const purchase = await ctx.db.get(args.purchaseId);
    if (!purchase || purchase.status === 'cancelled') throw new Error('PURCHASE_NOT_EDITABLE');
    const before = await ctx.db
      .query('items')
      .withIndex('by_purchase', (q) => q.eq('purchaseId', args.purchaseId))
      .take(501);
    if (before.length > 500 || args.items.length > 500 || args.removedIds.length > 500)
      throw new Error('PURCHASE_TOO_LARGE');
    if (JSON.stringify([purchase, before]) !== args.expectedDigest)
      throw new Error('PURCHASE_CHANGED');
    const ids = args.items.flatMap((i) => (i.itemId ? [i.itemId] : [])).concat(args.removedIds);
    if (
      new Set(ids).size !== ids.length ||
      new Set(args.items.map((i) => i.operationId)).size !== args.items.length
    )
      throw new Error('INVALID_PURCHASE');
    for (const id of ids) {
      const item = before.find((i) => i._id === id);
      if (!item || item.status !== 'available') throw new Error('PURCHASE_ITEM_LOCKED');
      // Cancelled sales still reference these identities and costs. Preserve their audit history.
      if (
        await ctx.db
          .query('sales')
          .withIndex('by_item_status', (q) => q.eq('itemId', id))
          .first()
      )
        throw new Error('PURCHASE_ITEM_LOCKED');
      if (
        await ctx.db
          .query('stockGifts')
          .withIndex('by_item', (q) => q.eq('itemId', id))
          .first()
      )
        throw new Error('PURCHASE_ITEM_LOCKED');
    }
    if (before.length - args.removedIds.length + args.items.filter((i) => !i.itemId).length < 1)
      throw new Error('INVALID_PURCHASE');
    for (const item of args.items) {
      if (
        !item.operationId ||
        !item.name.trim() ||
        item.name.length > 300 ||
        (item.series?.length ?? 0) > 300 ||
        (item.identifier?.length ?? 0) > 100 ||
        (item.gradingNotes?.length ?? 0) > 500
      )
        throw new Error('INVALID_PURCHASE');
      integer(item.marketValueCents);
      if (
        !Number.isFinite(item.discountPercent) ||
        item.discountPercent < 0 ||
        item.discountPercent > 100
      )
        throw new Error('INVALID_PURCHASE');
      integer(Math.round((item.marketValueCents * item.discountPercent) / 100));
      if (item.askingPriceCents !== undefined) integer(item.askingPriceCents);
    }
    const itemIds: Id<'items'>[] = [];
    for (const { itemId, operationId, ...item } of args.items) {
      const original = itemId ? before.find(row=>row._id===itemId) : undefined;
      const sameValuation = original && (original.marketValueCents ?? original.purchasePriceCents) === item.marketValueCents && (original.discountPercent ?? 100) === item.discountPercent;
      const values = {
        ...item,
        gradingCompany: item.gradingCompany,
        gradingGrade: item.gradingCompany ? item.gradingGrade : undefined,
        gradingCertificate: item.gradingCompany ? item.gradingCertificate : undefined,
        gradingNotes: item.gradingCompany ? item.gradingNotes : undefined,
        name: item.name.trim(),
        purchasePriceCents: sameValuation ? original.purchasePriceCents : Math.round((item.marketValueCents * item.discountPercent) / 100),
      };
      if (itemId) {
        await ctx.db.patch(itemId, {...values,revision:(original?.revision??0)+1});
        itemIds.push(itemId);
      } else
        itemIds.push(
          await ctx.db.insert('items', {
            ...values,
            ownerId,
            operationId,
            purchaseId: purchase._id,
            purchaseOccurredAt: purchase.occurredAt,
            status: 'available',
            vatRegime: 'margin',
            createdAt: Date.now(),
          }),
        );
    }
    for (const id of args.removedIds)
      await ctx.db.patch(id, {
        purchaseId: undefined,
        removedPurchaseId: purchase._id,
        status: 'cancelled',
      });
    await ctx.db.insert('purchaseEdits', {
      ownerId,
      operationId: args.operationId,
      operationDigest: JSON.stringify(args),
      purchaseId: purchase._id,
      before,
      itemIds,
      createdAt: Date.now(),
    });
    return { itemIds };
  },
});
