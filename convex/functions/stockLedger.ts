import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
export type Allocation = { lotId: Id<'stockLots'>; quantity: number; costCents: number };
export function integer(value: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error('INVALID_INVENTORY');
}
export function validDate(value: number) {
  integer(value);
  if (!Number.isFinite(new Date(value).getTime())) throw new Error('INVALID_DATE');
}
export async function stockOwner(ctx: {
  auth: { getUserIdentity(): Promise<{ subject: string; scope?: unknown } | null> };
}) {
  const user = await ctx.auth.getUserIdentity();
  if (!user) throw new Error('UNAUTHENTICATED');
  if (user.scope === 'realtime:read') throw new Error('READ_ONLY_TOKEN');
  return user.subject;
}
export function checkReplay<T extends { operationDigest: string }>(prior: T | null, args: unknown) {
  if (prior && prior.operationDigest !== JSON.stringify(args))
    throw new Error('IDEMPOTENCY_KEY_REUSED');
  return prior;
}
export async function consume(
  ctx: MutationCtx,
  item: Doc<'items'>,
  quantity: number,
  occurredAt: number,
): Promise<Allocation[]> {
  integer(quantity, 1, 100000);
  validDate(occurredAt);
  if (item.origin !== 'supplier' || item.status !== 'available' || (item.quantity ?? 0) < quantity)
    throw new Error('ITEM_UNAVAILABLE');
  const lots = (
    await ctx.db
      .query('stockLots')
      .withIndex('by_item', (q) => q.eq('itemId', item._id))
      .collect()
  )
    .filter(
      (l) =>
        l.remaining > 0 &&
        new Date(l.occurredAt).toISOString().slice(0, 10) <=
          new Date(occurredAt).toISOString().slice(0, 10),
    )
    .sort((a, b) => a.occurredAt - b.occurredAt || a._creationTime - b._creationTime);
  let needed = quantity;
  const allocations: Allocation[] = [];
  for (const lot of lots) {
    const take = Math.min(needed, lot.remaining);
    // BigInt preserves the exact total cost, including indivisible cents after opening a display.
    const cost = Number((BigInt(lot.remainingCostCents) * BigInt(take)) / BigInt(lot.remaining));
    allocations.push({ lotId: lot._id, quantity: take, costCents: cost });
    await ctx.db.patch(lot._id, {
      remaining: lot.remaining - take,
      remainingCostCents: lot.remainingCostCents - cost,
    });
    needed -= take;
    if (!needed) break;
  }
  if (needed) throw new Error('ITEM_UNAVAILABLE');
  const remaining = (item.quantity ?? 0) - quantity;
  await ctx.db.patch(item._id, { quantity: remaining, status: remaining ? 'available' : 'sold' });
  return allocations;
}
export async function restore(ctx: MutationCtx, itemId: Id<'items'>, allocations: Allocation[]) {
  const item = await ctx.db.get(itemId);
  if (!item || item.origin !== 'supplier') throw new Error('ITEM_NOT_FOUND');
  let quantity = 0;
  for (const a of allocations) {
    const lot = await ctx.db.get(a.lotId);
    if (!lot || lot.itemId !== itemId || lot.remaining + a.quantity > lot.received)
      throw new Error('INVALID_INVENTORY');
    await ctx.db.patch(lot._id, {
      remaining: lot.remaining + a.quantity,
      remainingCostCents: lot.remainingCostCents + a.costCents,
    });
    quantity += a.quantity;
  }
  await ctx.db.patch(itemId, { quantity: (item.quantity ?? 0) + quantity, status: 'available' });
}
