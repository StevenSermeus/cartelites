import assert from 'node:assert/strict';
import test from 'node:test';
import { convexTest } from 'convex-test';
import { api } from '../functions/_generated/api';
import schema from '../functions/schema';

const day = 86400000;
const modules = {
  './functions/operations.ts': () => import('../functions/operations'),
  './functions/consignmentOperations.ts': () => import('../functions/consignmentOperations'),
  './functions/_generated/server.js': () => import('../functions/_generated/server.js'),
};
async function setup(prices = [10000]) {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: 'employee' });
  const sellerId = await user.mutation(api.operations.createSeller, {
    operationId: 'seller',
    name: 'Depositor',
  });
  const deposit = await user.mutation(api.operations.createConsignment, {
    operationId: 'deposit',
    sellerId,
    reference: 'D',
    occurredAt: day,
    items: prices.map((price, index) => ({
      operationId: `item-${index}`,
      name: `Box ${index}`,
      productType: 'sealed' as const,
      askingPriceCents: price,
      commissionRateBps: 3000,
    })),
  });
  return { t, user, sellerId, itemId: deposit.itemIds[0], itemIds: deposit.itemIds };
}
test('received cash, transfer and mixed payments persist without inventing legacy payment data', async () => {
  const { user, itemIds } = await setup([10000, 10000, 10000, 10000]);
  for (const [index, cashCents] of [10000, 0, 4000].entries()) {
    await user.mutation(api.operations.createSale, {
      operationId: `sale-${index}`,
      itemId: itemIds[index],
      occurredAt: day * 2,
      salePriceCents: 10000,
      paymentStatus: 'received',
      payment: {
        cashCents,
        transferCents: 10000 - cashCents,
        receivedAt: day * 2,
        reference: 'BANK',
      },
    });
  }
  await user.mutation(api.operations.createSale, {
    operationId: 'legacy',
    itemId: itemIds[3],
    occurredAt: day * 2,
    salePriceCents: 10000,
  });
  const sales = await user.query(api.operations.salesHistory, {});
  const legacy = sales.find((sale) => sale.operationId === 'legacy');
  assert.equal(legacy?.paymentStatus, undefined);
  assert.equal(legacy?.payment, undefined);
  assert.deepEqual(
    sales
      .filter((sale) => sale.payment)
      .map((sale) => sale.payment?.cashCents)
      .sort((a, b) => (a ?? 0) - (b ?? 0)),
    [0, 4000, 10000],
  );
});
test('pending sale becomes payable only when collection is recorded; date and overpayment guards remain', async () => {
  const { user, itemId, sellerId, t } = await setup();
  const saleId = await user.mutation(api.operations.createSale, {
    operationId: 'pending',
    itemId,
    occurredAt: day * 2,
    salePriceCents: 10000,
    paymentStatus: 'pending',
  });
  assert.equal(
    (await user.query(api.operations.consignmentBalances, {})).balances[0].balanceCents,
    0,
  );
  await assert.rejects(
    user.mutation(api.operations.recordConsignmentPayment, {
      operationId: 'early',
      sellerId,
      amountCents: 100,
      occurredAt: day * 2,
      method: 'cash',
    }),
    /PAYMENT_EXCEEDS_BALANCE/,
  );
  assert.equal(typeof saleId, 'string');
  const args = {
    operationId: 'collect',
    saleId: saleId as never,
    cashCents: 3000,
    transferCents: 7000,
    receivedAt: day * 3,
  };
  assert.equal(await user.mutation(api.operations.recordSalePayment, args), saleId);
  assert.equal(await user.mutation(api.operations.recordSalePayment, args), saleId);
  assert.equal(
    (await user.query(api.operations.consignmentBalances, {})).balances[0].balanceCents,
    7000,
  );
  await assert.rejects(
    user.mutation(api.operations.recordConsignmentPayment, {
      operationId: 'before-received',
      sellerId,
      amountCents: 7000,
      occurredAt: day * 2,
      method: 'Virement',
    }),
    /INVALID_PAYMENT_DATE/,
  );
  await user.mutation(api.operations.recordConsignmentPayment, {
    operationId: 'paid',
    sellerId,
    amountCents: 7000,
    occurredAt: day * 3,
    method: 'Virement',
  });
  assert.equal(
    (await user.query(api.operations.consignmentBalances, {})).balances[0].balanceCents,
    0,
  );
  assert.equal((await t.run((ctx) => ctx.db.query('salePaymentEvents').collect())).length, 1);
});
test('invalid payment splits, dates and inconsistent statuses do not create sales', async () => {
  const { user, itemId, t } = await setup();
  const base = { operationId: 'sale', itemId, occurredAt: day * 2, salePriceCents: 10000 };
  for (const payment of [
    { cashCents: 9999, transferCents: 0, receivedAt: day * 2 },
    { cashCents: -1, transferCents: 10001, receivedAt: day * 2 },
    { cashCents: 0.5, transferCents: 9999.5, receivedAt: day * 2 },
  ])
    await assert.rejects(
      user.mutation(api.operations.createSale, { ...base, paymentStatus: 'received', payment }),
      /INVALID_SALE_PAYMENT/,
    );
  const payment = { cashCents: 10000, transferCents: 0, receivedAt: day * 2 };
  await assert.rejects(
    user.mutation(api.operations.createSale, { ...base, paymentStatus: 'pending', payment }),
    /INVALID_SALE_PAYMENT/,
  );
  await assert.rejects(
    user.mutation(api.operations.createSale, { ...base, paymentStatus: 'received' }),
    /INVALID_SALE_PAYMENT/,
  );
  await assert.rejects(
    user.mutation(api.operations.createSale, {
      ...base,
      paymentStatus: 'received',
      payment: { ...payment, receivedAt: day },
    }),
    /INVALID_SALE_PAYMENT_DATE/,
  );
  assert.equal((await t.run((ctx) => ctx.db.query('sales').collect())).length, 0);
});
test('mixed bulk allocation preserves every cent and bulk retries cannot duplicate sales', async () => {
  const { user, itemIds } = await setup([1, 1, 1]);
  const input = {
    operationId: 'batch',
    occurredAt: day * 2,
    items: itemIds.map((itemId) => ({ itemId, salePriceCents: 1 })),
    paymentStatus: 'received' as const,
    payment: { cashCents: 1, transferCents: 2, receivedAt: day * 2 },
  };
  const result = await user.mutation(api.operations.createSales, input);
  assert.deepEqual(await user.mutation(api.operations.createSales, input), result);
  const sales = await user.query(api.operations.salesHistory, {});
  assert.equal(sales.length, 3);
  assert.equal(
    sales.reduce((sum, sale) => sum + (sale.payment?.cashCents ?? 0), 0),
    1,
  );
  assert.equal(
    sales.reduce((sum, sale) => sum + (sale.payment?.transferCents ?? 0), 0),
    2,
  );
  for (const sale of sales)
    assert.equal(
      (sale.payment?.cashCents ?? 0) + (sale.payment?.transferCents ?? 0),
      sale.salePriceCents,
    );
  await assert.rejects(
    user.mutation(api.operations.createSales, {
      ...input,
      payment: { ...input.payment, cashCents: 2, transferCents: 1 },
    }),
    /IDEMPOTENCY_KEY_REUSED/,
  );
});
test('payment corrections preserve audit and creation retry digest; cancelled sales cannot be collected', async () => {
  const { user, itemId, t } = await setup();
  const input = {
    operationId: 'sale',
    itemId,
    occurredAt: day * 2,
    salePriceCents: 10000,
    paymentStatus: 'received' as const,
    payment: { cashCents: 10000, transferCents: 0, receivedAt: day * 2 },
  };
  const saleId = await user.mutation(api.operations.createSale, input);
  const correction = {
    operationId: 'correct',
    saleId: saleId as never,
    cashCents: 0,
    transferCents: 10000,
    receivedAt: day * 2,
  };
  await user.mutation(api.operations.recordSalePayment, correction);
  assert.equal(await user.mutation(api.operations.createSale, input), saleId);
  const events = await t.run((ctx) => ctx.db.query('salePaymentEvents').collect());
  assert.equal(events[0].previousPayment?.cashCents, 10000);
  assert.equal(events[0].payment.transferCents, 10000);
  await assert.rejects(t.mutation(api.operations.recordSalePayment, correction), /UNAUTHENTICATED/);
  await user.mutation(api.operations.cancelSale, {
    operationId: 'cancel',
    saleId: saleId as never,
  });
  await assert.rejects(
    user.mutation(api.operations.recordSalePayment, { ...correction, operationId: 'new' }),
    /SALE_CANCELLED/,
  );
  assert.equal(
    (await user.query(api.operations.consignmentBalances, {})).balances[0].earnedCents,
    0,
  );
});
