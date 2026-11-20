import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { mutation, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { productFields } from './inventoryValidators';
import { stockOwner, checkReplay, integer, validDate, consume, restore } from './stockLedger';

export const updateProduct = mutation({
  args: {
    tcg: productFields.tcg,
    itemId: v.id('items'),
    name: v.string(),
    description: v.string(),
    series: v.string(),
    identifier: v.string(),
    askingPriceCents: v.number(),
    hiddenFromCatalogue: v.boolean(),
    language: productFields.language,
    condition: productFields.condition,
    gradingCompany: productFields.gradingCompany,
    gradingGrade: v.string(),
    gradingCertificate: v.string(),
  },
  handler: async (ctx, { itemId, ...fields }) => {
    await stockOwner(ctx);
    const item = await ctx.db.get(itemId);
    if (!item) throw new Error('ITEM_NOT_FOUND');
    if (
      !fields.name.trim() ||
      fields.name.length > 300 ||
      fields.description.length > 3000 ||
      fields.series.length > 300 ||
      fields.identifier.length > 100 ||
      fields.gradingGrade.length > 32 ||
      fields.gradingCertificate.length > 100
    )
      throw new Error('INVALID_INVENTORY');
    integer(fields.askingPriceCents);
    if (
      item.origin === 'consignment' &&
      fields.askingPriceCents < (item.agreedPriceCents ?? item.askingPriceCents ?? 0)
    )
      throw new Error('PRICE_BELOW_AGREEMENT');
    await ctx.db.patch(itemId, {
      ...fields,
      tcg: fields.tcg ?? item.tcg,
      name: fields.name.trim(),
      language: fields.language,
      condition: fields.condition,
      gradingCompany: fields.gradingCompany,
      gradingGrade: fields.gradingCompany ? fields.gradingGrade : undefined,
      gradingCertificate: fields.gradingCompany ? fields.gradingCertificate : undefined,
    });
    return { id: itemId };
  },
});

export const receive = mutation({
  args: {
    operationId: v.string(),
    supplier: v.string(),
    reference: v.string(),
    occurredAt: v.number(),
    lines: v.array(
      v.object({
        itemId: v.optional(v.id('items')),
        product: v.object(productFields),
        quantity: v.number(),
        unitCostCents: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const ownerId = await stockOwner(ctx);
    const prior = checkReplay(
      await ctx.db
        .query('supplierReceipts')
        .withIndex('by_owner_operation', (q) =>
          q.eq('ownerId', ownerId).eq('operationId', args.operationId),
        )
        .unique(),
      args,
    );
    if (prior) return { id: prior._id, itemIds: prior.itemIds };
    if (
      !args.operationId.trim() ||
      !args.supplier.trim() ||
      !args.reference.trim() ||
      args.supplier.length > 200 ||
      args.reference.length > 200 ||
      !args.lines.length ||
      args.lines.length > 50
    )
      throw new Error('INVALID_INVENTORY');
    validDate(args.occurredAt);
    let totalCostCents = 0;
    for (const line of args.lines) {
      integer(line.quantity, 1, 100000);
      integer(line.unitCostCents);
      integer(line.product.askingPriceCents);
      integer(line.product.taxRateBps, 0, 10000);
      integer(line.quantity * line.unitCostCents);
      if (!line.product.name.trim() || line.product.name.length > 300)
        throw new Error('INVALID_INVENTORY');
      if (line.product.packSize !== undefined) integer(line.product.packSize, 1, 1000);
      if (line.product.productType !== 'sealed' && line.product.format)
        throw new Error('INVALID_INVENTORY');
      totalCostCents += line.quantity * line.unitCostCents;
      integer(totalCostCents);
    }
    const id = await ctx.db.insert('supplierReceipts', {
      ownerId,
      operationId: args.operationId,
      operationDigest: JSON.stringify(args),
      supplier: args.supplier.trim(),
      reference: args.reference.trim(),
      occurredAt: args.occurredAt,
      createdAt: Date.now(),
      itemIds: [],
      totalCostCents,
    });
    const itemIds: Id<'items'>[] = [];
    for (const line of args.lines) {
      let itemId = line.itemId;
      if (itemId) {
        const item = await ctx.db.get(itemId);
        if (
          !item ||
          item.origin !== 'supplier' ||
          (line.product.tcg !== undefined && line.product.tcg !== (item.tcg ?? 'pokemon')) ||
          item.taxRateBps !== line.product.taxRateBps ||
          item.productType !== line.product.productType ||
          item.format !== line.product.format
        )
          throw new Error('PRODUCT_MISMATCH');
        integer((item.quantity ?? 0) + line.quantity);
        await ctx.db.patch(itemId, {
          quantity: (item.quantity ?? 0) + line.quantity,
          status: 'available',
          purchaseOccurredAt: Math.min(item.purchaseOccurredAt, args.occurredAt),
        });
      } else
        itemId = await ctx.db.insert('items', {
          ...line.product,
          name: line.product.name.trim(),
          ownerId,
          operationId: `${args.operationId}:${itemIds.length}`,
          origin: 'supplier',
          quantity: line.quantity,
          vatRegime: 'other',
          purchaseOccurredAt: args.occurredAt,
          status: 'available',
          hiddenFromCatalogue: true,
          createdAt: Date.now(),
        });
      await ctx.db.insert('stockLots', {
        itemId,
        receiptId: id,
        received: line.quantity,
        remaining: line.quantity,
        totalCostCents: line.quantity * line.unitCostCents,
        remainingCostCents: line.quantity * line.unitCostCents,
        occurredAt: args.occurredAt,
        taxRateBps: line.product.taxRateBps,
        createdAt: Date.now(),
      });
      itemIds.push(itemId);
    }
    await ctx.db.patch(id, { itemIds });
    return { id, itemIds };
  },
});
export const detail = query({
  args: { itemId: v.id('items') },
  handler: async (ctx, { itemId }) => {
    await stockOwner(ctx);
    const item = await ctx.db.get(itemId);
    if (!item) throw new Error('ITEM_NOT_FOUND');
    const lots = await ctx.db
      .query('stockLots')
      .withIndex('by_item', (q) => q.eq('itemId', itemId))
      .collect();
    return {
      item,
      lots: await Promise.all(
        lots.map(async (l) => ({
          ...l,
          receipt: l.receiptId ? await ctx.db.get(l.receiptId) : null,
        })),
      ),
      openings: await ctx.db
        .query('stockOpenings')
        .withIndex('by_source', (q) => q.eq('sourceId', itemId))
        .collect(),
      photos: (
        await ctx.db
          .query('attachments')
          .withIndex('by_item', (q) => q.eq('itemId', itemId))
          .collect()
      ).sort((a, b) => Number(b._id === item.coverPhotoId) - Number(a._id === item.coverPhotoId)),
    };
  },
});
export const receipts = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await stockOwner(ctx);
    return ctx.db.query('supplierReceipts').order('desc').paginate(args.paginationOpts);
  },
});
export const openDisplay = mutation({
  args: {
    operationId: v.string(),
    itemId: v.id('items'),
    targetId: v.optional(v.id('items')),
    product: v.optional(v.object(productFields)),
    quantity: v.number(),
    packSize: v.number(),
    occurredAt: v.number(),
  },
  handler: async (ctx, args) => {
    const ownerId = await stockOwner(ctx);
    const prior = checkReplay(
      await ctx.db
        .query('stockOpenings')
        .withIndex('by_owner_operation', (q) =>
          q.eq('ownerId', ownerId).eq('operationId', args.operationId),
        )
        .unique(),
      args,
    );
    if (prior) return prior._id;
    integer(args.quantity, 1, 10000);
    integer(args.packSize, 1, 1000);
    validDate(args.occurredAt);
    const source = await ctx.db.get(args.itemId);
    if (!source || source.origin !== 'supplier' || source.format !== 'display')
      throw new Error('INVALID_INVENTORY');
    let targetId = args.targetId;
    if (targetId) {
      const t = await ctx.db.get(targetId);
      if (
        !t ||
        t.origin !== 'supplier' ||
        (t.tcg ?? 'pokemon') !== (source.tcg ?? 'pokemon') ||
        t.format !== 'booster' ||
        t.taxRateBps !== source.taxRateBps ||
        t._id === source._id
      )
        throw new Error('PRODUCT_MISMATCH');
    } else {
      const p = args.product;
      if (
        !p ||
        !p.name.trim() ||
        p.name.length > 300 ||
        p.productType !== 'sealed' ||
        (p.tcg !== undefined && p.tcg !== (source.tcg ?? 'pokemon')) ||
        p.format !== 'booster' ||
        p.taxRateBps !== source.taxRateBps
      )
        throw new Error('INVALID_INVENTORY');
      integer(p.askingPriceCents);
      targetId = await ctx.db.insert('items', {
        ...p,
        tcg: source.tcg ?? 'pokemon',
        ownerId,
        operationId: args.operationId,
        origin: 'supplier',
        quantity: 0,
        vatRegime: 'other',
        purchaseOccurredAt: args.occurredAt,
        status: 'sold',
        hiddenFromCatalogue: true,
        createdAt: Date.now(),
      });
    }
    const allocations = await consume(ctx, source, args.quantity, args.occurredAt);
    const id = await ctx.db.insert('stockOpenings', {
      ownerId,
      operationId: args.operationId,
      operationDigest: JSON.stringify(args),
      sourceId: source._id,
      targetId,
      quantity: args.quantity,
      packSize: args.packSize,
      allocations,
      occurredAt: args.occurredAt,
    });
    for (const a of allocations) {
      const parent = (await ctx.db.get(a.lotId))!;
      await ctx.db.insert('stockLots', {
        itemId: targetId,
        receiptId: parent.receiptId,
        openingId: id,
        received: a.quantity * args.packSize,
        remaining: a.quantity * args.packSize,
        totalCostCents: a.costCents,
        remainingCostCents: a.costCents,
        occurredAt: args.occurredAt,
        taxRateBps: parent.taxRateBps,
        createdAt: Date.now(),
      });
    }
    const target = (await ctx.db.get(targetId))!;
    const quantity = (target.quantity ?? 0) + args.quantity * args.packSize;
    integer(quantity);
    await ctx.db.patch(targetId, { quantity, status: 'available' });
    return id;
  },
});
export const donate = mutation({
  args: {
    operationId: v.string(),
    itemId: v.id('items'),
    quantity: v.number(),
    occurredAt: v.number(),
    recipient: v.optional(v.string()),
    reason: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await stockOwner(ctx);
    const prior = checkReplay(
      await ctx.db
        .query('stockGifts')
        .withIndex('by_owner_operation', (q) =>
          q.eq('ownerId', ownerId).eq('operationId', args.operationId),
        )
        .unique(),
      args,
    );
    if (prior) return prior._id;
    integer(args.quantity, 1, 100000);
    validDate(args.occurredAt);
    if (
      !args.reason.trim() ||
      args.reason.length > 1000 ||
      (args.recipient?.length ?? 0) > 300 ||
      (args.note?.length ?? 0) > 3000
    )
      throw new Error('INVALID_INVENTORY');
    const item = await ctx.db.get(args.itemId);
    if (!item || item.status !== 'available' || item.origin === 'consignment' || item.consignmentId)
      throw new Error('ITEM_UNAVAILABLE');
    if (
      new Date(args.occurredAt).toISOString().slice(0, 10) <
      new Date(item.purchaseOccurredAt).toISOString().slice(0, 10)
    )
      throw new Error('INVALID_DATE');
    let allocations: Awaited<ReturnType<typeof consume>> = [];
    let costCents = item.purchasePriceCents;
    if (item.origin === 'supplier') {
      allocations = await consume(ctx, item, args.quantity, args.occurredAt);
      costCents = allocations.reduce((s, a) => s + a.costCents, 0);
    } else {
      if (
        args.quantity !== 1 ||
        !item.purchaseId ||
        (await ctx.db.get(item.purchaseId))?.status !== 'active'
      )
        throw new Error('ITEM_UNAVAILABLE');
      await ctx.db.patch(item._id, { status: 'donated' });
    }
    return ctx.db.insert('stockGifts', {
      ...args,
      ownerId,
      operationDigest: JSON.stringify(args),
      itemName: item.name,
      costCents,
      allocations,
      purchaseId: item.purchaseId,
    });
  },
});
export const reverse = mutation({
  args: {
    operationId: v.string(),
    giftId: v.optional(v.id('stockGifts')),
    openingId: v.optional(v.id('stockOpenings')),
  },
  handler: async (ctx, args) => {
    const ownerId = await stockOwner(ctx);
    if (!!args.giftId === !!args.openingId) throw new Error('INVALID_INVENTORY');
    const prior = checkReplay(
      await ctx.db
        .query('inventoryReversals')
        .withIndex('by_owner_operation', (q) =>
          q.eq('ownerId', ownerId).eq('operationId', args.operationId),
        )
        .unique(),
      args,
    );
    if (prior) return;
    if (args.giftId) {
      const gift = await ctx.db.get(args.giftId);
      if (!gift) throw new Error('GIFT_NOT_FOUND');
      if (!gift.cancelledAt) {
        if (gift.allocations.length) await restore(ctx, gift.itemId, gift.allocations);
        else {
          const item = await ctx.db.get(gift.itemId);
          if (item?.status !== 'donated') throw new Error('ITEM_UNAVAILABLE');
          await ctx.db.patch(gift.itemId, { status: 'available' });
        }
        await ctx.db.patch(gift._id, { cancelledAt: Date.now() });
      }
    } else {
      const opening = await ctx.db.get(args.openingId!);
      if (!opening) throw new Error('OPENING_NOT_FOUND');
      if (!opening.cancelledAt) {
        const lots = await ctx.db
          .query('stockLots')
          .withIndex('by_opening', (q) => q.eq('openingId', opening._id))
          .collect();
        if (lots.some((l) => l.remaining !== l.received)) throw new Error('OPENING_ALREADY_USED');
        const target = (await ctx.db.get(opening.targetId))!;
        const quantity = (target.quantity ?? 0) - opening.quantity * opening.packSize;
        if (quantity < 0) throw new Error('INVALID_INVENTORY');
        for (const lot of lots)
          await ctx.db.patch(lot._id, { remaining: 0, remainingCostCents: 0 });
        await ctx.db.patch(target._id, { quantity, status: quantity ? 'available' : 'sold' });
        await restore(ctx, opening.sourceId, opening.allocations);
        await ctx.db.patch(opening._id, { cancelledAt: Date.now() });
      }
    }
    await ctx.db.insert('inventoryReversals', {
      ownerId,
      operationId: args.operationId,
      operationDigest: JSON.stringify(args),
    });
  },
});
export const gifts = query({
  args: { from: v.number(), to: v.number(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await stockOwner(ctx);
    validDate(args.from);
    validDate(args.to);
    if (args.from > args.to) throw new Error('INVALID_DATE');
    const result = await ctx.db
      .query('stockGifts')
      .withIndex('by_date', (q) => q.gte('occurredAt', args.from).lte('occurredAt', args.to))
      .order('desc')
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (g) => ({
          ...g,
          purchaseReference: g.purchaseId ? (await ctx.db.get(g.purchaseId))?.reference : undefined,
          lotSources: await Promise.all(
            g.allocations.map(async (a) => {
              const l = await ctx.db.get(a.lotId);
              const r = l?.receiptId ? await ctx.db.get(l.receiptId) : null;
              return { ...a, reference: r?.reference, supplier: r?.supplier };
            }),
          ),
        })),
      ),
    };
  },
});
export const photo = mutation({
  args: {
    itemId: v.id('items'),
    attachmentId: v.id('attachments'),
    action: v.union(v.literal('cover'), v.literal('remove')),
  },
  handler: async (ctx, args) => {
    await stockOwner(ctx);
    const item = await ctx.db.get(args.itemId),
      photo = await ctx.db.get(args.attachmentId);
    if (!item || !photo || photo.itemId !== item._id || !photo.contentType.startsWith('image/'))
      throw new Error('INVALID_ATTACHMENT');
    if (args.action === 'cover') await ctx.db.patch(item._id, { coverPhotoId: photo._id });
    else {
      await ctx.db.delete(photo._id);
      if (item.coverPhotoId === photo._id)
        await ctx.db.patch(item._id, { coverPhotoId: undefined });
    }
    return { objectKey: photo.objectKey };
  },
});

export const evidence = query({
  args: { receiptId: v.optional(v.id('supplierReceipts')), giftId: v.optional(v.id('stockGifts')) },
  handler: async (ctx, args) => {
    await stockOwner(ctx);
    if (!!args.receiptId === !!args.giftId) throw new Error('INVALID_INVENTORY');
    return args.receiptId
      ? ctx.db
          .query('attachments')
          .withIndex('by_supplier', (q) => q.eq('supplierReceiptId', args.receiptId))
          .collect()
      : ctx.db
          .query('attachments')
          .withIndex('by_gift', (q) => q.eq('giftId', args.giftId))
          .collect();
  },
});
