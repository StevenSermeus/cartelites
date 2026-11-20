import type { Id } from './_generated/dataModel';
import { v } from 'convex/values';
import { mutation, query, internalMutation } from './_generated/server';
import { stockOwner, checkReplay } from './stockLedger';
export const prepare = mutation({
  args: { operationId: v.string(), saleIds: v.array(v.id('sales')) },
  handler: async (ctx, args) => {
    const ownerId = await stockOwner(ctx);
    if (
      !args.operationId ||
      !args.saleIds.length ||
      args.saleIds.length > 100 ||
      new Set(args.saleIds).size !== args.saleIds.length
    )
      throw new Error('INVALID_TICKET');
    const prior = checkReplay(
      await ctx.db
        .query('saleTickets')
        .withIndex('by_owner_operation', (q) =>
          q.eq('ownerId', ownerId).eq('operationId', args.operationId),
        )
        .unique(),
      args,
    );
    if (prior) return prior._id;
    const lines = [];
    for (const id of args.saleIds) {
      const sale = await ctx.db.get(id);
      if (!sale) throw new Error('SALE_NOT_FOUND');
      const item = await ctx.db.get(sale.itemId);
      if (!item) throw new Error('ITEM_NOT_FOUND');
      lines.push({
        saleId: id,
        name: sale.itemName ?? item.name,
        quantity: sale.quantity ?? 1,
        totalCents: sale.salePriceCents,
        status: sale.status,
        occurredAt: sale.occurredAt,
        paymentStatus: sale.paymentStatus ?? 'unknown',
        payment: sale.payment ?? null,
        vatRegime: sale.vatRegime ?? item.vatRegime,
        origin: sale.origin ?? item.origin ?? 'purchase',
        taxRateBps: sale.taxRateBps ?? null,
      });
    }
    const ticketId = await ctx.db.insert('saleTickets', {
      ownerId,
      operationId: args.operationId,
      operationDigest: JSON.stringify(args),
      saleIds: args.saleIds,
      anchorId: args.saleIds[0],
      snapshot: { reference: `VEN-${args.saleIds[0]}`, occurredAt: lines[0].occurredAt, lines },
      createdAt: Date.now(),
    });
    for (const saleId of args.saleIds) await ctx.db.insert('saleTicketLinks', { saleId, ticketId });
    return ticketId;
  },
});
export const list = query({
  args: { saleId: v.id('sales') },
  handler: async (ctx, args) => {
    await stockOwner(ctx);
    const links = await ctx.db
      .query('saleTicketLinks')
      .withIndex('by_sale', (q) => q.eq('saleId', args.saleId))
      .order('desc')
      .take(100);
    return (await Promise.all(links.map((l) => ctx.db.get(l.ticketId)))).filter(
      (row) => row !== null,
    );
  },
});
export const get = query({
  args: { id: v.id('saleTickets') },
  handler: async (ctx, args) => {
    await stockOwner(ctx);
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error('TICKET_NOT_FOUND');
    return {
      ...row,
      emails: await ctx.db
        .query('ticketEmails')
        .withIndex('by_ticket', (q) => q.eq('ticketId', row._id))
        .order('desc')
        .take(20),
    };
  },
});
export const identity = internalMutation({
  args: { id: v.id('saleTickets'), identity: v.any() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error('TICKET_NOT_FOUND');
    if (row.identity) return row;
    await ctx.db.patch(row._id, { identity: args.identity });
    return { ...row, identity: args.identity };
  },
});
export const archive = internalMutation({
  args: {
    id: v.id('saleTickets'),
    objectKey: v.string(),
    sha256: v.string(),
    filename: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error('TICKET_NOT_FOUND');
    if (row.objectKey) {
      if (row.sha256 !== args.sha256) throw new Error('ARCHIVE_CONFLICT');
      return;
    }
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});
export const claimEmail = internalMutation({
  args: { ticketId: v.id('saleTickets'), operationId: v.string(), recipient: v.string() },
  handler: async (ctx, args) => {
    const prior = await ctx.db
      .query('ticketEmails')
      .withIndex('by_operation', (q) => q.eq('operationId', args.operationId))
      .unique();
    if (prior) {
      if (prior.ticketId !== args.ticketId || prior.recipient !== args.recipient)
        throw new Error('IDEMPOTENCY_KEY_REUSED');
      return { id: prior._id, send: false, status: prior.status };
    }
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket?.objectKey) throw new Error('TICKET_NOT_FOUND');
    // Historical versions remain downloadable, but cannot be emailed as current after cancellation or collection.
    for (const line of ticket.snapshot.lines) {
      const sale = await ctx.db.get(line.saleId as Id<'sales'>);
      if (
        !sale ||
        sale.status !== line.status ||
        (sale.paymentStatus ?? 'unknown') !== line.paymentStatus ||
        JSON.stringify(sale.payment ?? null) !== JSON.stringify(line.payment)
      )
        throw new Error('TICKET_STALE');
    }
    const id = await ctx.db.insert('ticketEmails', {
      ...args,
      status: 'sending',
      createdAt: Date.now(),
    });
    return { id, send: true, status: 'sending' };
  },
});
export const emailResult = internalMutation({
  args: {
    id: v.id('ticketEmails'),
    status: v.union(v.literal('accepted'), v.literal('failed'), v.literal('unknown')),
    messageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error('TICKET_NOT_FOUND');
    if (row.status === 'accepted') return;
    await ctx.db.patch(args.id, { status: args.status, messageId: args.messageId });
  },
});
