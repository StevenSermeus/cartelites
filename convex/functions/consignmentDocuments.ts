import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";

async function owner(ctx: Pick<QueryCtx, "auth">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("UNAUTHENTICATED");
  if (identity.scope === "realtime:read") throw new Error("READ_ONLY_TOKEN");
  return identity.subject;
}
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const money = (value: number) => `${(value / 100).toFixed(2)} EUR`;
export async function financialSnapshot(
  ctx: Pick<QueryCtx, "db">,
  sellerId: Id<"sellers">,
  at: number,
) {
  const client = await ctx.db.get(sellerId);
  if (!client) throw new Error("SELLER_NOT_FOUND");
  const [allSales, allPayments] = await Promise.all([
    ctx.db.query("sales").collect(),
    ctx.db
      .query("consignmentPayments")
      .withIndex("by_seller", (q) => q.eq("sellerId", sellerId))
      .collect(),
  ]);
  const sales = allSales.filter(
    (s) =>
      s.origin === "consignment" &&
      s.sellerId === sellerId &&
      s.status === "active" &&
      s.occurredAt <= at,
  );
  const paid = allPayments.filter((p) => p.occurredAt <= at);
  const earnedCents = sales
    .filter(
      (s) =>
        s.paymentStatus !== "pending" &&
        (s.payment?.receivedAt ?? s.occurredAt) <= at,
    )
    .reduce((n, s) => n + (s.depositorAmountCents ?? 0), 0);
  const paidCents = paid.reduce((n, p) => n + p.amountCents, 0);
  if (
    ![earnedCents, paidCents, earnedCents - paidCents].every(
      Number.isSafeInteger,
    )
  )
    throw new Error("AMOUNT_OVERFLOW");
  const lines = await Promise.all(
    sales.map(async (s) => {
      const [item, dossier] = await Promise.all([
        ctx.db.get(s.itemId),
        s.consignmentId ? ctx.db.get(s.consignmentId) : null,
      ]);
      const received =
        s.paymentStatus !== "pending" &&
        (s.payment?.receivedAt ?? s.occurredAt) <= at;
      return {
        label: `${dossier?.reference ?? ""} - ${item?.name ?? "Article supprimé"}`,
        detail: `Vente ${s._id} | ${new Date(s.occurredAt).toISOString().slice(0, 10)} | Prix ${money(s.salePriceCents)} | Commission ${money(s.commissionCents ?? 0)} | Part déposant ${money(s.depositorAmountCents ?? 0)} | ${received ? "Encaissée" : "Non encaissée - hors solde disponible"}`,
      };
    }),
  );
  return clean({
    reference: `DC-${at}`,
    occurredAt: at,
    client: {
      name: client.name,
      email: client.email,
      phone: client.phone,
      address: client.address,
    },
    title: "Décompte du déposant",
    lines: [
      ...lines,
      ...paid.map((p) => ({
        label: `Reversement ${p._id}`,
        detail: `${new Date(p.occurredAt).toISOString().slice(0, 10)} | ${p.method} | ${p.reference ?? ""} | ${money(p.amountCents)}`,
      })),
    ],
    totals: [
      `Part acquise : ${money(earnedCents)}`,
      `Versements enregistrés : ${money(paidCents)}`,
      `Reste payable : ${money(earnedCents - paidCents)}`,
    ],
    notes: [
      "Tous les dépôts de ce déposant sont inclus.",
      "Les ventes non encaissées sont exclues du solde disponible.",
      "Ce décompte ne constitue pas à lui seul une preuve de paiement.",
    ],
    earnedCents,
    paidCents,
    balanceCents: earnedCents - paidCents,
  });
}
export async function snapshotPayment(
  ctx: MutationCtx,
  paymentId: Id<"consignmentPayments">,
) {
  const p = (await ctx.db.get(paymentId))!;
  const snapshot = await financialSnapshot(ctx, p.sellerId, Date.now());
  const accountId = ctx.db.normalizeId("accounts", p.ownerId);
  const account = accountId ? await ctx.db.get(accountId) : null;
  return ctx.db.insert("consignmentDocuments", {
    ownerId: p.ownerId,
    operationId: `payment:${paymentId}`,
    operationDigest: paymentId,
    sellerId: p.sellerId,
    kind: "payment",
    createdAt: Date.now(),
    snapshot: clean({
      ...snapshot,
      reference: `REV-${paymentId}`,
      occurredAt: p.occurredAt,
      title: "Justificatif de reversement",
      lines: [
        {
          label: `Montant enregistré : ${money(p.amountCents)}`,
          detail: `Mode : ${p.method} | Référence : ${p.reference ?? "-"} | Opération : ${paymentId}`,
        },
        {
          label: "Enregistré par",
          detail: account?.signatory
            ? `${account.signatory.firstName} ${account.signatory.lastName}`
            : p.ownerId,
        },
      ],
      notes: [
        "Versement enregistré comme déjà effectué. Aucun virement bancaire n’est déclenché par cette opération.",
        "Ce document est un justificatif interne et ne constitue pas une preuve bancaire.",
        "Solde et versement : tous les dépôts du déposant, sans affectation à un dossier particulier.",
      ],
    }),
  });
}
export const createStatement = mutation({
  args: { operationId: v.string(), sellerId: v.id("sellers") },
  handler: async (ctx, args) => {
    const ownerId = await owner(ctx);
    const prior = await ctx.db
      .query("consignmentDocuments")
      .withIndex("by_owner_operation", (q) =>
        q.eq("ownerId", ownerId).eq("operationId", args.operationId),
      )
      .unique();
    if (prior) {
      if (prior.operationDigest !== JSON.stringify(args))
        throw new Error("IDEMPOTENCY_KEY_REUSED");
      return prior._id;
    }
    const snapshot = await financialSnapshot(ctx, args.sellerId, Date.now());
    return ctx.db.insert("consignmentDocuments", {
      ...args,
      ownerId,
      operationDigest: JSON.stringify(args),
      kind: "statement",
      snapshot,
      createdAt: Date.now(),
    });
  },
});
export const list = query({
  args: { sellerId: v.id("sellers") },
  handler: async (ctx, { sellerId }) => {
    await owner(ctx);
    const documents = await ctx.db
      .query("consignmentDocuments")
      .withIndex("by_seller", (q) => q.eq("sellerId", sellerId))
      .collect();
    return documents
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((d) => ({
        id: d._id,
        kind: d.kind,
        reference: d.snapshot.reference,
        createdAt: d.createdAt,
        archived: !!d.objectKey,
      }));
  },
});
export const get = query({
  args: { id: v.id("consignmentDocuments") },
  handler: async (ctx, { id }) => {
    await owner(ctx);
    const row = await ctx.db.get(id);
    if (!row) throw new Error("DOCUMENT_NOT_FOUND");
    return row;
  },
});
export const freezeIdentity = internalMutation({
  args: { id: v.id("consignmentDocuments"), identity: v.any() },
  handler: async (ctx, { id, identity }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("DOCUMENT_NOT_FOUND");
    if (!row.identity) await ctx.db.patch(id, { identity });
    return (await ctx.db.get(id))!;
  },
});
export const archive = internalMutation({
  args: {
    id: v.id("consignmentDocuments"),
    objectKey: v.string(),
    sha256: v.string(),
    filename: v.string(),
  },
  handler: async (ctx, { id, ...data }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("DOCUMENT_NOT_FOUND");
    if (row.sha256 && row.sha256 !== data.sha256)
      throw new Error("ARCHIVE_IMMUTABLE");
    await ctx.db.patch(id, data);
  },
});

export const prepareReturn = mutation({
  args: {
    operationId: v.string(),
    consignmentId: v.id("consignments"),
    itemIds: v.array(v.id("items")),
    occurredAt: v.number(),
    conditionNotes: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await owner(ctx);
    const prior = await ctx.db
      .query("consignmentReturns")
      .withIndex("by_owner_operation", (q) =>
        q.eq("ownerId", ownerId).eq("operationId", args.operationId),
      )
      .unique();
    if (prior) {
      if (prior.operationDigest !== JSON.stringify(args))
        throw new Error("IDEMPOTENCY_KEY_REUSED");
      return prior._id;
    }
    const dossier = await ctx.db.get(args.consignmentId);
    if (
      !dossier ||
      !args.itemIds.length ||
      args.itemIds.length > 200 ||
      new Set(args.itemIds).size !== args.itemIds.length ||
      !args.conditionNotes.trim() ||
      args.conditionNotes.length > 5000
    )
      throw new Error("INVALID_RETURN");
    if (
      !Number.isSafeInteger(args.occurredAt) ||
      !Number.isFinite(new Date(args.occurredAt).getTime()) ||
      new Date(args.occurredAt).toISOString().slice(0, 10) <
        new Date(dossier.occurredAt).toISOString().slice(0, 10)
    )
      throw new Error("INVALID_RETURN_DATE");
    for (const id of args.itemIds) {
      const item = await ctx.db.get(id);
      if (
        item?.consignmentId !== args.consignmentId ||
        item.status !== "available"
      )
        throw new Error("ITEM_UNAVAILABLE");
    }
    return ctx.db.insert("consignmentReturns", {
      ...args,
      ownerId,
      operationDigest: JSON.stringify(args),
      createdAt: Date.now(),
    });
  },
});
export const returns = query({
  args: { consignmentId: v.id("consignments") },
  handler: async (ctx, { consignmentId }) => {
    await owner(ctx);
    return ctx.db
      .query("consignmentReturns")
      .withIndex("by_consignment", (q) => q.eq("consignmentId", consignmentId))
      .collect();
  },
});
