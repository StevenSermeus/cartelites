import { v } from 'convex/values';
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import type { Id } from './_generated/dataModel';
import { signatureValidator, validSignature } from './signatures';

const kind = v.union(v.literal('purchase'), v.literal('consignment'));
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));
// Convex may reorder object keys when storing values; compare content canonically.
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, nested) =>
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b)))
      : nested,
  );
const consent =
  'Je confirme avoir lu le document et accepte son contenu ainsi que la signature électronique et la remise d’une copie numérique.';
async function snapshot(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  type: 'purchase' | 'consignment',
  targetId: string,
) {
  const account = await ctx.db.get(ownerId as Id<'accounts'>);
  if (!account) throw new Error('ACCOUNT_NOT_FOUND');
  const signatory = account.signatory;
  if (!signatory?.firstName || !signatory.lastName || !signatory.capacity)
    throw new Error('SIGNATORY_REQUIRED');
  const row =
    type === 'purchase'
      ? await ctx.db.get(targetId as Id<'purchases'>)
      : await ctx.db.get(targetId as Id<'consignments'>);
  if (!row || ('status' in row && row.status === 'cancelled'))
    throw new Error('RECEIPT_TARGET_INVALID');
  const client = await ctx.db.get(row.sellerId);
  if (!client) throw new Error('CLIENT_NOT_FOUND');
  const items =
    type === 'purchase'
      ? await ctx.db
          .query('items')
          .withIndex('by_purchase', (q) => q.eq('purchaseId', targetId as Id<'purchases'>))
          .collect()
      : await ctx.db
          .query('items')
          .withIndex('by_consignment', (q) => q.eq('consignmentId', targetId as Id<'consignments'>))
          .collect();
  if (!items.length || items.length > 1000) throw new Error('RECEIPT_ITEMS_LIMIT');
  return clean({
    reference: row.reference,
    occurredAt: row.occurredAt,
    ...('status' in row ? { status: row.status } : { notes: row.notes, dueAt: row.dueAt }),
    client: {
      name: client.name,
      email: client.email,
      phone: client.phone,
      address: client.address,
    },
    signatory: {
      firstName: signatory.firstName,
      lastName: signatory.lastName,
      capacity: signatory.capacity,
    },
    items: items
      .sort((a, b) => a._id.localeCompare(b._id))
      .map((i) => ({
        name: i.name,
        productType: i.productType,
        description: i.description,
        series: i.series ?? '',
        identifier: i.identifier ?? '',
        language: i.language,
        condition: i.condition,
        gradingCompany: i.gradingCompany,
        gradingGrade: i.gradingGrade,
        gradingCertificate: i.gradingCertificate,
        gradingNotes: i.gradingNotes,
        ...(type === 'purchase'
          ? {
              purchasePriceCents: i.purchasePriceCents ?? 0,
              marketValueCents: i.marketValueCents ?? i.purchasePriceCents ?? 0,
              discountPercent: i.discountPercent ?? 100,
            }
          : {
              askingPriceCents: i.agreedPriceCents ?? i.askingPriceCents,
              commissionRateBps: i.commissionRateBps,
            }),
      })),
  });
}
export const prepare = internalMutation({
  args: { ownerId: v.string(), kind, targetId: v.string(), identity: v.any() },
  handler: async (ctx, args) => {
    const content = await snapshot(ctx, args.ownerId, args.kind, args.targetId);
    const id = await ctx.db.insert('signedReceipts', {
      ...args,
      snapshot: content,
      createdAt: Date.now(),
    });
    return { id, snapshot: content, consent };
  },
});
export const get = internalQuery({
  args: { ownerId: v.string(), id: v.id('signedReceipts') },
  handler: async (ctx, { ownerId, id }) => {
    if (!(await ctx.db.get(ownerId as Id<'accounts'>))) throw new Error('ACCOUNT_NOT_FOUND');
    const row = await ctx.db.get(id);
    if (!row || (!row.signedAt && row.ownerId !== ownerId)) throw new Error('RECEIPT_NOT_FOUND');
    return row;
  },
});
export const list = internalQuery({
  args: { ownerId: v.string(), kind, targetId: v.string() },
  handler: async (ctx, args) => {
    if (!(await ctx.db.get(args.ownerId as Id<'accounts'>))) throw new Error('ACCOUNT_NOT_FOUND');
    const rows = await ctx.db
      .query('signedReceipts')
      .withIndex('by_target', (q) => q.eq('kind', args.kind).eq('targetId', args.targetId))
      .collect();
    return rows
      .filter((r) => r.signedAt)
      .map((r) => ({
        id: r._id,
        signedAt: r.signedAt,
        archived: !!r.objectKey,
        emailStatus: r.snapshot.client.email ? (r.emailStatus ?? 'pending') : 'no_email',
        recipient: r.snapshot.client.email ?? '',
        emailError: r.emailError,
        emailHttpStatus: r.emailHttpStatus,
        messageId: r.messageId,
        sha256: r.sha256,
      }));
  },
});
export const sign = internalMutation({
  args: {
    ownerId: v.string(),
    id: v.id('signedReceipts'),
    company: signatureValidator,
    client: signatureValidator,
    accepted: v.literal(true),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row || row.ownerId !== args.ownerId) throw new Error('RECEIPT_NOT_FOUND');
    if (!validSignature(args.company) || !validSignature(args.client))
      throw new Error('INVALID_SIGNATURE');
    if (row.signedAt) {
      if (
        JSON.stringify([row.companySignature, row.clientSignature]) !==
        JSON.stringify([args.company, args.client])
      )
        throw new Error('ALREADY_SIGNED');
      return row;
    }
    if (Date.now() - row.createdAt > 30 * 60_000) throw new Error('RECEIPT_EXPIRED');
    if (
      canonical(await snapshot(ctx, args.ownerId, row.kind, row.targetId)) !==
      canonical(row.snapshot)
    )
      throw new Error('RECEIPT_CHANGED');
    await ctx.db.patch(args.id, {
      signedAt: Date.now(),
      companySignature: args.company,
      clientSignature: args.client,
      consent,
      emailStatus: 'pending',
    });
    return (await ctx.db.get(args.id))!;
  },
});
export const archive = internalMutation({
  args: {
    id: v.id('signedReceipts'),
    objectKey: v.string(),
    sha256: v.string(),
    filename: v.string(),
  },
  handler: async (ctx, { id, ...data }) => {
    const row = await ctx.db.get(id);
    if (!row?.signedAt) throw new Error('NOT_SIGNED');
    if (row.sha256 && row.sha256 !== data.sha256) throw new Error('ARCHIVE_IMMUTABLE');
    await ctx.db.patch(id, data);
  },
});
export const claimEmail = internalMutation({
  args: { id: v.id('signedReceipts'), attempt: v.string(), retry: v.boolean() },
  handler: async (ctx, { id, attempt, retry }) => {
    const row = await ctx.db.get(id);
    if (!row?.objectKey) throw new Error('NOT_ARCHIVED');
    if (row.emailStatus === 'sending' && Date.now() - (row.emailAttemptAt ?? 0) < 60_000)
      return false;
    if (!retry && row.emailStatus !== 'pending') return false;
    // A manual resend is explicit and rate limited, including accepted messages.
    if (Date.now() - (row.emailAttemptAt ?? 0) < 60_000) return false;
    await ctx.db.patch(id, {
      emailStatus: 'sending',
      emailError: undefined,
      emailHttpStatus: undefined,
      emailAttempt: attempt,
      emailAttemptAt: Date.now(),
    });
    return true;
  },
});
export const emailResult = internalMutation({
  args: {
    id: v.id('signedReceipts'),
    attempt: v.string(),
    status: v.string(),
    messageId: v.optional(v.string()),
    error: v.optional(v.string()),
    httpStatus: v.optional(v.number()),
  },
  handler: async (ctx, { id, attempt, status, messageId, error, httpStatus }) => {
    const row = await ctx.db.get(id);
    if (row?.emailAttempt !== attempt) return;
    await ctx.db.patch(id, {
      emailStatus: status,
      emailError: error,
      emailHttpStatus: httpStatus,
      ...(messageId ? { messageId } : {}),
    });
  },
});
