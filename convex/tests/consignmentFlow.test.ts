import assert from "node:assert/strict";
import test from "node:test";
import { convexTest } from "convex-test";
import { api, internal } from "../functions/_generated/api";
import schema from "../functions/schema";
const modules = {
  "./functions/operations.ts": () => import("../functions/operations"),
  "./functions/consignmentOperations.ts": () =>
    import("../functions/consignmentOperations"),
  "./functions/consignmentDocuments.ts": () =>
    import("../functions/consignmentDocuments"),
  "./functions/signedReceipts.ts": () => import("../functions/signedReceipts"),
  "./functions/_generated/server.js": () =>
    import("../functions/_generated/server.js"),
};
const strokes = [
  [
    [0.1, 0.8],
    [0.2, 0.3],
    [0.3, 0.6],
    [0.5, 0.2],
    [0.8, 0.7],
  ],
];
async function fixture() {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) =>
    ctx.db.insert("accounts", {
      email: "staff@test.be",
      passwordHash: "test",
      createdAt: 1,
      signatory: {
        firstName: "Alice",
        lastName: "Martin",
        capacity: "Mandataire",
      },
    }),
  );
  const user = t.withIdentity({ subject: ownerId });
  const sellerId = await user.mutation(api.operations.createSeller, {
    operationId: "seller",
    name: "Déposant",
  });
  const deposit = await user.mutation(api.operations.createConsignment, {
    operationId: "deposit",
    sellerId,
    occurredAt: 86400000,
    reference: "D1",
    flowVersion: 2,
    contractTerms: {
      version: "1",
      text: "Conditions effectivement convenues.",
    },
    items: [
      {
        operationId: "item",
        name: "Display",
        productType: "sealed",
        askingPriceCents: 10000,
        commissionRateBps: 2000,
      },
    ],
  });
  async function sign(
    kind: "consignment" | "consignment_return",
    targetId: string,
  ) {
    const draft = await t.mutation(internal.signedReceipts.prepare, {
      ownerId,
      kind,
      targetId,
      identity: {},
    });
    await t.mutation(internal.signedReceipts.sign, {
      ownerId,
      id: draft.id,
      company: strokes,
      client: strokes,
      accepted: true,
    });
    return draft;
  }
  return { t, user, ownerId, sellerId, ...deposit, sign };
}
test("new inventory stays unavailable until signed archive; old archive cannot activate amended terms", async () => {
  const { t, user, consignmentId, itemIds, sign } = await fixture();
  const sale = {
    operationId: "sale",
    itemId: itemIds[0],
    occurredAt: 172800000,
    salePriceCents: 10000,
  };
  assert.equal((await user.query(api.operations.stock, {})).length, 0);
  await assert.rejects(
    user.mutation(api.operations.createSale, sale),
    /CONTRACT_SIGNATURE_REQUIRED/,
  );
  const draft = await sign("consignment", consignmentId);
  await assert.rejects(
    user.mutation(api.operations.createSale, sale),
    /CONTRACT_SIGNATURE_REQUIRED/,
  );
  await t.mutation(internal.signedReceipts.archive, {
    id: draft.id,
    objectKey: "pdf",
    sha256: "hash",
    filename: "contract.pdf",
  });
  assert.equal((await user.query(api.operations.stock, {})).length, 1);
  await user.mutation(api.operations.updateConsignmentTerms, {
    operationId: "amend",
    itemId: itemIds[0],
    askingPriceCents: 9000,
    commissionRateBps: 2000,
    authorizationNote: "Accord du déposant",
  });
  assert.equal(
    (await t.run((ctx) => ctx.db.get(consignmentId)))?.contractRevision,
    2,
  );
  await t.mutation(internal.signedReceipts.archive, {
    id: draft.id,
    objectKey: "pdf",
    sha256: "hash",
    filename: "contract.pdf",
  });
  await assert.rejects(
    user.mutation(api.operations.createSale, sale),
    /CONTRACT_SIGNATURE_REQUIRED/,
  );
});
test("return preparation preserves stock; signing returns selected articles without sale or payment", async () => {
  const { t, user, consignmentId, itemIds, sign } = await fixture();
  const input = {
    operationId: "return",
    consignmentId,
    itemIds,
    occurredAt: 172800000,
    conditionNotes: "Boîte intacte remise au déposant",
  };
  const id = await user.mutation(api.consignmentDocuments.prepareReturn, input);
  assert.equal(
    await user.mutation(api.consignmentDocuments.prepareReturn, input),
    id,
  );
  assert.equal(
    (await t.run((ctx) => ctx.db.get(itemIds[0])))?.status,
    "available",
  );
  await sign("consignment_return", id);
  assert.equal(
    (await t.run((ctx) => ctx.db.get(itemIds[0])))?.status,
    "returned",
  );
  assert.equal(
    (await t.run((ctx) => ctx.db.query("sales").collect())).length,
    0,
  );
  assert.equal(
    (await t.run((ctx) => ctx.db.query("consignmentPayments").collect()))
      .length,
    0,
  );
});
test("payout and statement snapshots stay frozen; retries do not duplicate documents", async () => {
  const { t, user, consignmentId, itemIds, sellerId, sign } = await fixture();
  const draft = await sign("consignment", consignmentId);
  await t.mutation(internal.signedReceipts.archive, {
    id: draft.id,
    objectKey: "pdf",
    sha256: "hash",
    filename: "contract.pdf",
  });
  await user.mutation(api.operations.createSale, {
    operationId: "sale",
    itemId: itemIds[0],
    occurredAt: 172800000,
    salePriceCents: 10000,
  });
  const payout = {
    operationId: "pay",
    sellerId,
    amountCents: 3000,
    occurredAt: 172800000,
    method: "Virement",
  };
  await user.mutation(api.operations.recordConsignmentPayment, payout);
  await user.mutation(api.operations.recordConsignmentPayment, payout);
  const statement = { operationId: "statement", sellerId };
  const id = await user.mutation(
    api.consignmentDocuments.createStatement,
    statement,
  );
  assert.equal(
    await user.mutation(api.consignmentDocuments.createStatement, statement),
    id,
  );
  const frozen = await user.query(api.consignmentDocuments.get, { id });
  assert.equal(frozen.snapshot.balanceCents, 5000);
  await user.mutation(api.operations.recordConsignmentPayment, {
    ...payout,
    operationId: "pay2",
    amountCents: 1000,
  });
  assert.deepEqual(
    (await user.query(api.consignmentDocuments.get, { id })).snapshot,
    frozen.snapshot,
  );
  assert.equal(
    (await user.query(api.consignmentDocuments.list, { sellerId })).length,
    3,
  );
});
