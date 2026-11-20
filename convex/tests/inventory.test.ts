import assert from 'node:assert/strict';
import test from 'node:test';
import { convexTest } from 'convex-test';
import schema from '../functions/schema';
import { api, internal } from '../functions/_generated/api';
const modules = {
  './functions/inventory.ts': () => import('../functions/inventory'),
  './functions/operations.ts': () => import('../functions/operations'),
  './functions/readModels.ts': () => import('../functions/readModels'),
  './functions/saleTickets.ts': () => import('../functions/saleTickets'),
  './functions/_generated/server.js': () => import('../functions/_generated/server.js'),
};
const product = {
  name: 'Display',
  productType: 'sealed' as const,
  format: 'display' as const,
  packSize: 36,
  askingPriceCents: 14000,
  taxRateBps: 2100,
};
async function fixture() {
  const t = convexTest(schema, modules),
    user = t.withIdentity({ subject: 'employee' });
  const args = {
    operationId: 'receive',
    supplier: 'Distribution',
    reference: 'FAC-1',
    occurredAt: 1000,
    lines: [{ product, quantity: 10, unitCostCents: 10001 }],
  };
  const receipt = await user.mutation(api.inventory.receive, args);
  return { t, user, receipt, args, itemId: receipt.itemIds[0] };
}
test('receipt replay, quantity stock, same product restock, hidden public catalogue', async () => {
  const { t, user, args, receipt, itemId } = await fixture();
  assert.deepEqual(await user.mutation(api.inventory.receive, args), receipt);
  await assert.rejects(
    () => user.mutation(api.inventory.receive, { ...args, reference: 'changed' }),
    /IDEMPOTENCY_KEY_REUSED/,
  );
  const stock = await user.query(api.operations.stock, {});
  assert.equal(stock.length, 1);
  assert.equal(stock[0].quantity, 10);
  const page = await user.query(api.readModels.browse, { resource: 'stock' });
  assert.equal(page.items.length, 1);
  await user.mutation(api.inventory.receive, {
    ...args,
    operationId: 'restock',
    lines: [{ ...args.lines[0], itemId, quantity: 2, unitCostCents: 12000 }],
  });
  const d = await user.query(api.inventory.detail, { itemId });
  assert.equal(d.item.quantity, 12);
  assert.equal(d.lots.length, 2);
  assert.equal(d.item.hiddenFromCatalogue, true);
  const cat = {
    paginationOpts: { numItems: 20, cursor: null },
    search: '',
    gradingStatus: 'all',
    gradingCompany: '',
    gradingGrade: '',
  };
  assert.equal((await t.query(api.operations.publicCatalogue, cat)).totalCount, 0);
  await user.mutation(api.operations.setStockVisibility, {
    operationId: 'visible',
    itemIds: [itemId],
    hidden: false,
  });
  assert.equal((await t.query(api.operations.publicCatalogue, cat)).totalCount, 1);
});
test('sale quantities allocate FIFO exact costs, cancellation restores original lots, bulk atomicity', async () => {
  const { user, itemId } = await fixture();
  const sale = await user.mutation(api.operations.createSales, {
    operationId: 'sale',
    occurredAt: 2000,
    items: [{ itemId, quantity: 3, salePriceCents: 42000 }],
    paymentStatus: 'received',
    payment: { cashCents: 42000, transferCents: 0, receivedAt: 2000 },
  });
  let d = await user.query(api.inventory.detail, { itemId });
  assert.equal(d.item.quantity, 7);
  assert.equal(d.lots[0].remainingCostCents, 70007);
  const sales = await user.query(api.operations.salesHistory, {});
  assert.equal(sales[0].purchasePriceCents, 30003);
  await user.mutation(api.operations.cancelSale, { operationId: 'undo', saleId: sale.ids[0] });
  await user.mutation(api.operations.cancelSale, { operationId: 'undo', saleId: sale.ids[0] });
  d = await user.query(api.inventory.detail, { itemId });
  assert.equal(d.item.quantity, 10);
  assert.equal(d.lots[0].remainingCostCents, 100010);
  await assert.rejects(
    () =>
      user.mutation(api.operations.createSales, {
        operationId: 'too-many',
        occurredAt: 2000,
        items: [{ itemId, quantity: 11, salePriceCents: 1 }],
      }),
    /ITEM_UNAVAILABLE/,
  );
  assert.equal((await user.query(api.inventory.detail, { itemId })).item.quantity, 10);
});
test('opening transfers exact cents, sale blocks reversal, sale cancellation unlocks it', async () => {
  const { user, itemId } = await fixture();
  const args = {
    operationId: 'open',
    itemId,
    product: { ...product, name: 'Booster', format: 'booster' as const, askingPriceCents: 600 },
    quantity: 1,
    packSize: 36,
    occurredAt: 2000,
  };
  const id = await user.mutation(api.inventory.openDisplay, args);
  assert.equal(await user.mutation(api.inventory.openDisplay, args), id);
  const source = await user.query(api.inventory.detail, { itemId });
  assert.equal(source.item.quantity, 9);
  const targetId = source.openings[0].targetId;
  let target = await user.query(api.inventory.detail, { itemId: targetId });
  assert.equal(target.item.quantity, 36);
  assert.equal(target.lots[0].remainingCostCents, 10001);
  assert.equal(target.lots[0].receiptId, source.lots[0].receiptId);
  const sold = await user.mutation(api.operations.createSales, {
    operationId: 'booster-sale',
    occurredAt: 3000,
    items: [{ itemId: targetId, quantity: 1, salePriceCents: 600 }],
  });
  await assert.rejects(
    () => user.mutation(api.inventory.reverse, { operationId: 'undo-open', openingId: id }),
    /OPENING_ALREADY_USED/,
  );
  target = await user.query(api.inventory.detail, { itemId: targetId });
  assert.equal(target.lots[0].remainingCostCents, 9724);
  await user.mutation(api.operations.cancelSale, { operationId: 'undo-sale', saleId: sold.ids[0] });
  await user.mutation(api.inventory.reverse, { operationId: 'undo-open', openingId: id });
  assert.equal((await user.query(api.inventory.detail, { itemId })).item.quantity, 10);
  assert.equal((await user.query(api.inventory.detail, { itemId: targetId })).item.quantity, 0);
});
test('donations have provenance and exact costs, reversal idempotent, no sales', async () => {
  const { user, itemId } = await fixture();
  const giftId = await user.mutation(api.inventory.donate, {
    operationId: 'gift',
    itemId,
    quantity: 2,
    occurredAt: 2000,
    reason: 'Concours',
  });
  const page = await user.query(api.inventory.gifts, {
    from: 0,
    to: 3000,
    paginationOpts: { numItems: 20, cursor: null },
  });
  assert.equal(page.page[0].costCents, 20002);
  assert.equal(page.page[0].lotSources[0].reference, 'FAC-1');
  assert.equal((await user.query(api.operations.salesHistory, {})).length, 0);
  await user.mutation(api.inventory.reverse, { operationId: 'undo-gift', giftId });
  await user.mutation(api.inventory.reverse, { operationId: 'undo-gift', giftId });
  assert.equal((await user.query(api.inventory.detail, { itemId })).item.quantity, 10);
});
test('read-only tokens cannot mutate or access service-only ticket archive functions', async () => {
  const { t, itemId } = await fixture();
  const ro = t.withIdentity({ subject: 'employee', scope: 'realtime:read' });
  await assert.rejects(
    () =>
      ro.mutation(api.inventory.donate, {
        operationId: 'attack',
        itemId,
        quantity: 1,
        occurredAt: 2000,
        reason: 'x',
      }),
    /READ_ONLY_TOKEN/,
  );
  await assert.rejects(
    () =>
      t.mutation(api.inventory.donate, {
        operationId: 'attack',
        itemId,
        quantity: 1,
        occurredAt: 2000,
        reason: 'x',
      }),
    /UNAUTHENTICATED/,
  );
});
test('ticket freezes sale names, generations preserve status, email claim prevents duplicates and stale tickets', async () => {
  const { t, user, itemId } = await fixture();
  const { ids } = await user.mutation(api.operations.createSales, {
    operationId: 'sale',
    occurredAt: 2000,
    items: [{ itemId, quantity: 2, salePriceCents: 28000 }],
  });
  const ticket = await user.mutation(api.saleTickets.prepare, {
    operationId: 'ticket',
    saleIds: ids,
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(itemId, { name: 'Renamed' });
  });
  let row = await user.query(api.saleTickets.get, { id: ticket });
  assert.equal(row.snapshot.lines[0].name, 'Display');
  assert.equal(row.snapshot.lines[0].quantity, 2);
  await t.mutation(internal.saleTickets.archive, {
    id: ticket,
    objectKey: 'key',
    sha256: 'hash',
    filename: 'ticket.pdf',
  });
  const first = await t.mutation(internal.saleTickets.claimEmail, {
    ticketId: ticket,
    operationId: 'email',
    recipient: 'a@example.test',
  });
  assert.equal(first.send, true);
  assert.equal(
    (
      await t.mutation(internal.saleTickets.claimEmail, {
        ticketId: ticket,
        operationId: 'email',
        recipient: 'a@example.test',
      })
    ).send,
    false,
  );
  await user.mutation(api.operations.cancelSale, { operationId: 'cancel', saleId: ids[0] });
  await assert.rejects(
    () =>
      t.mutation(internal.saleTickets.claimEmail, {
        ticketId: ticket,
        operationId: 'email2',
        recipient: 'a@example.test',
      }),
    /TICKET_STALE/,
  );
  const newer = await user.mutation(api.saleTickets.prepare, {
    operationId: 'ticket-new',
    saleIds: ids,
  });
  row = await user.query(api.saleTickets.get, { id: newer });
  assert.equal(row.snapshot.lines[0].status, 'cancelled');
  assert.equal(
    (await user.query(api.saleTickets.get, { id: ticket })).snapshot.lines[0].status,
    'active',
  );
});

test('two competing requests cannot sell more units than received', async () => {
  const { user, itemId } = await fixture();
  const results = await Promise.allSettled(
    ['a', 'b'].map((operationId) =>
      user.mutation(api.operations.createSales, {
        operationId,
        occurredAt: 2000,
        items: [{ itemId, quantity: 7, salePriceCents: 98000 }],
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await user.query(api.inventory.detail, { itemId })).item.quantity, 3);
});

test('mixed basket failure rolls back earlier quantity debits; deposit gifts are rejected', async () => {
  const { user, itemId } = await fixture();
  const sellerId = await user.mutation(api.operations.createSeller, {
    operationId: 'seller',
    name: 'Depositor',
  });
  const deposit = await user.mutation(api.operations.createConsignment, {
    operationId: 'deposit',
    sellerId,
    occurredAt: 1000,
    reference: 'DEP',
    items: [
      {
        operationId: 'deposited',
        name: 'Single',
        productType: 'card',
        askingPriceCents: 1000,
        commissionRateBps: 3000,
      },
    ],
  });
  await assert.rejects(
    () =>
      user.mutation(api.operations.createSales, {
        operationId: 'mixed',
        occurredAt: 2000,
        items: [
          { itemId, quantity: 2, salePriceCents: 28000 },
          { itemId: deposit.itemIds[0], salePriceCents: 500 },
        ],
      }),
    /PRICE_BELOW_AGREEMENT/,
  );
  assert.equal((await user.query(api.inventory.detail, { itemId })).item.quantity, 10);
  await assert.rejects(
    () =>
      user.mutation(api.inventory.donate, {
        operationId: 'gift-deposit',
        itemId: deposit.itemIds[0],
        quantity: 1,
        occurredAt: 2000,
        reason: 'Gift',
      }),
    /ITEM_UNAVAILABLE/,
  );
});

test('product editor changes catalogue fields without changing stock or acquisition history', async () => {
  const { t, user, itemId } = await fixture();
  const before = await user.query(api.inventory.detail, { itemId });
  const fields = {
    itemId,
    name: 'Display corrigé',
    description: 'Édition française',
    series: 'Série',
    identifier: 'ABC',
    askingPriceCents: 15000,
    hiddenFromCatalogue: false,
    gradingGrade: '',
    gradingCertificate: '',
  };
  await user.mutation(api.inventory.updateProduct, fields);
  const after = await user.query(api.inventory.detail, { itemId });
  assert.equal(after.item.name, fields.name);
  assert.equal(after.item.askingPriceCents, 15000);
  assert.equal(after.item.hiddenFromCatalogue, false);
  assert.equal(after.item.quantity, before.item.quantity);
  assert.equal(after.item.taxRateBps, before.item.taxRateBps);
  assert.deepEqual(after.lots, before.lots);
  await assert.rejects(t.mutation(api.inventory.updateProduct, fields), /UNAUTHENTICATED/);
  await assert.rejects(
    t
      .withIdentity({ subject: 'employee', scope: 'realtime:read' })
      .mutation(api.inventory.updateProduct, fields),
    /READ_ONLY_TOKEN/,
  );
  await assert.rejects(
    user.mutation(api.inventory.updateProduct, { ...fields, name: ' ' }),
    /INVALID_INVENTORY/,
  );
  await assert.rejects(
    user.mutation(api.inventory.updateProduct, { ...fields, askingPriceCents: -1 }),
    /INVALID_INVENTORY/,
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(itemId, { origin: 'consignment', agreedPriceCents: 16000 });
  });
  await assert.rejects(user.mutation(api.inventory.updateProduct, fields), /PRICE_BELOW_AGREEMENT/);
});
