import { authenticated } from './helpers/session';
import assert from 'node:assert/strict';
import test from 'node:test';
import { convexTest } from 'convex-test';
import { api } from '../functions/_generated/api';
import { splitConsignmentPrice } from '../functions/consignmentOperations';
import schema from '../functions/schema';

const modules = {
  './functions/operations.ts': () => import('../functions/operations'),
  './functions/consignmentOperations.ts': () => import('../functions/consignmentOperations'),
  './functions/_generated/server.js': () => import('../functions/_generated/server.js'),
};
async function fixture() {
  const t = convexTest(schema, modules);
  const user = (await authenticated(t, 'employee'));
  const sellerId = await user.mutation(api.operations.createSeller, {
    operationId: 'seller',
    name: 'Depositor',
    email: 'private@example.test',
  });
  const input = {
    operationId: 'deposit',
    sellerId,
    occurredAt: 86400000,
    reference: 'D-1',
    notes: 'private agreement',
    items: [
      {
        operationId: 'sealed',
        name: 'Display',
        productType: 'sealed' as const,
        description: 'Boîte sous blister',
        askingPriceCents: 10000,
        commissionRateBps: 3000,
      },
    ],
  };
  const deposit = await user.mutation(api.operations.createConsignment, input);
  return { t, user, sellerId, input, ...deposit, itemId: deposit.itemIds[0] };
}
test('deposit persists without fake purchase; replay, auth and company collaboration', async () => {
  const { t, user, input, consignmentId, itemIds, itemId } = await fixture();
  assert.deepEqual(await user.mutation(api.operations.createConsignment, input), {
    consignmentId,
    itemIds,
  });
  await assert.rejects(
    user.mutation(api.operations.createConsignment, { ...input, reference: 'changed' }),
    /IDEMPOTENCY_KEY_REUSED/,
  );
  const item = await t.run((ctx) => ctx.db.get(itemId));
  assert.equal(item?.purchaseId, undefined);
  assert.equal(item?.purchasePriceCents, undefined);
  assert.equal(item?.vatRegime, 'other');
  assert.equal((await t.run((ctx) => ctx.db.query('purchases').collect())).length, 0);
  assert.equal((await user.query(api.operations.stock, {}))[0].origin, 'consignment');
  assert.equal(
    (await (await authenticated(t, 'colleague')).query(api.operations.consignmentHistory, {}))
      .length,
    1,
  );
  await assert.rejects(t.query(api.operations.consignmentHistory, {}), /UNAUTHENTICATED/);
  await assert.rejects(t.mutation(api.operations.createConsignment, input), /UNAUTHENTICATED/);
});
test('commission rounds to cents and sale stores immutable agreement snapshot', async () => {
  assert.deepEqual(splitConsignmentPrice(10001, 3000), {
    commissionCents: 3000,
    depositorAmountCents: 7001,
  });
  assert.deepEqual(splitConsignmentPrice(5, 3000), { commissionCents: 2, depositorAmountCents: 3 });
  assert.deepEqual(splitConsignmentPrice(100, 0), {
    commissionCents: 0,
    depositorAmountCents: 100,
  });
  assert.deepEqual(splitConsignmentPrice(100, 10000), {
    commissionCents: 100,
    depositorAmountCents: 0,
  });
  const { t, user, itemId } = await fixture();
  const saleId = await user.mutation(api.operations.createSale, {
    operationId: 'sale',
    itemId,
    occurredAt: 172800000,
    salePriceCents: 10001,
  });
  assert.equal(typeof saleId, 'string');
  const sale = await t.run((ctx) => ctx.db.get(saleId as never));
  assert.equal((sale as { commissionCents: number }).commissionCents, 3000);
  await assert.rejects(
    user.mutation(api.operations.updateConsignmentTerms, {
      operationId: 'terms',
      itemId,
      askingPriceCents: 5000,
      commissionRateBps: 4000,
      authorizationNote: 'agreed',
    }),
    /ITEM_UNAVAILABLE/,
  );
  const history = await user.query(api.operations.salesHistory, {});
  assert.equal(history[0].depositorAmountCents, 7001);
  assert.equal(history[0].origin, 'consignment');
});
test('minimum price and authorized changes enforced; changes are audited', async () => {
  const { user, itemId } = await fixture();
  await assert.rejects(
    user.mutation(api.operations.createSale, {
      operationId: 'cheap',
      itemId,
      occurredAt: 172800000,
      salePriceCents: 9999,
    }),
    /PRICE_BELOW_AGREEMENT/,
  );
  await assert.rejects(
    user.mutation(api.operations.updateAskingPrice, { itemId, askingPriceCents: 9999 }),
    /PRICE_BELOW_AGREEMENT/,
  );
  await assert.rejects(
    user.mutation(api.operations.updateConsignmentTerms, {
      operationId: 'terms',
      itemId,
      askingPriceCents: 9000,
      commissionRateBps: 3000,
      authorizationNote: ' ',
    }),
    /AUTHORIZATION_REQUIRED/,
  );
  await user.mutation(api.operations.updateConsignmentTerms, {
    operationId: 'terms',
    itemId,
    askingPriceCents: 9000,
    commissionRateBps: 2500,
    authorizationNote: 'Accord par téléphone',
  });
  const history = await user.query(api.operations.consignmentHistory, {});
  assert.equal(history[0].items[0].events[0].previousPriceCents, 10000);
  await user.mutation(api.operations.createSale, {
    operationId: 'sale',
    itemId,
    occurredAt: 172800000,
    salePriceCents: 9000,
  });
  assert.equal(
    (await user.query(api.operations.consignmentBalances, {})).balances[0].earnedCents,
    6750,
  );
});
test('payments partial, replay and overpayment protection; cancellation preserves paid money as regularization', async () => {
  const { t, user, itemId, sellerId } = await fixture();
  const saleId = await user.mutation(api.operations.createSale, {
    operationId: 'sale',
    itemId,
    occurredAt: 172800000,
    salePriceCents: 10000,
  });
  const payment = {
    operationId: 'pay',
    sellerId,
    amountCents: 4000,
    occurredAt: 172800000,
    method: 'Virement',
    reference: 'BANK',
  };
  await assert.rejects(
    user.mutation(api.operations.recordConsignmentPayment, {
      ...payment,
      operationId: 'too-early',
      occurredAt: 86400000,
    }),
    /INVALID_PAYMENT_DATE/,
  );
  const paymentId = await user.mutation(api.operations.recordConsignmentPayment, payment);
  assert.equal(await user.mutation(api.operations.recordConsignmentPayment, payment), paymentId);
  await assert.rejects(
    user.mutation(api.operations.recordConsignmentPayment, { ...payment, amountCents: 4001 }),
    /IDEMPOTENCY_KEY_REUSED/,
  );
  await assert.rejects(
    user.mutation(api.operations.recordConsignmentPayment, {
      ...payment,
      operationId: 'over',
      amountCents: 3001,
    }),
    /PAYMENT_EXCEEDS_BALANCE/,
  );
  assert.equal(
    (await user.query(api.operations.consignmentBalances, {})).balances[0].balanceCents,
    3000,
  );
  await user.mutation(api.operations.cancelSale, {
    operationId: 'cancel',
    saleId: saleId as never,
  });
  const balances = await user.query(api.operations.consignmentBalances, {});
  assert.equal(balances.balances[0].balanceCents, -4000);
  assert.equal(balances.payments.length, 1);
  assert.equal((await t.run((ctx) => ctx.db.get(itemId)))?.status, 'available');
  await assert.rejects(
    user.mutation(api.operations.recordConsignmentPayment, {
      ...payment,
      operationId: 'again',
      amountCents: 1,
    }),
    /PAYMENT_EXCEEDS_BALANCE/,
  );
});
test('returns remove availability and catalogue, validate date and preserve audit/idempotency', async () => {
  const { t, user, itemId } = await fixture();
  await assert.rejects(
    user.mutation(api.operations.returnConsignmentItem, {
      operationId: 'return',
      itemId,
      occurredAt: 1,
    }),
    /INVALID_RETURN_DATE/,
  );
  const input = { operationId: 'return', itemId, occurredAt: 172800000 };
  assert.equal(await user.mutation(api.operations.returnConsignmentItem, input), itemId);
  assert.equal(await user.mutation(api.operations.returnConsignmentItem, input), itemId);
  assert.equal((await user.query(api.operations.stock, {})).length, 0);
  const history = await user.query(api.operations.consignmentHistory, {});
  assert.equal(history[0].items[0].status, 'returned');
  assert.equal(history[0].items[0].events.length, 1);
  const activity=await t.run(ctx=>ctx.db.query('itemActivity').withIndex('by_item_date',q=>q.eq('itemId',itemId)).collect());assert.deepEqual(activity.map(e=>[e.kind,e.quantityDelta]).sort(),[['acquisition',1],['consignment-return',-1]].sort());
  const sale = await user.mutation(api.operations.createSale, {
    operationId: 'sold-return',
    itemId,
    occurredAt: 172800000,
    salePriceCents: 10000,
  });
  assert.notEqual(typeof sale, 'string');
});
test('same-day restitution accepts a morning timestamp for a date entered at noon', async () => {
  const { t, user, itemId } = await fixture();
  await t.run((ctx) => ctx.db.patch(itemId, { purchaseOccurredAt: 86400000 + 12 * 3600000 }));
  await user.mutation(api.operations.returnConsignmentItem, {
    operationId: 'morning-return',
    itemId,
    occurredAt: 86400000 + 10 * 3600000,
  });
  assert.equal(
    (await user.query(api.operations.consignmentHistory, {}))[0].items[0].status,
    'returned',
  );
});
test('public catalogue exposes product details but no depositor or commission', async () => {
  const { t } = await fixture();
  const result = await t.query(api.operations.publicCatalogue, {
    paginationOpts: { numItems: 20, cursor: null },
    search: 'blister',
    gradingStatus: 'all',
    gradingCompany: '',
    gradingGrade: '',
  });
  assert.equal(result.totalCount, 1);
  assert.equal(result.page[0].productType, 'sealed');
  assert.equal(result.page[0].tcg, undefined);
  assert.equal(result.page[0].language, undefined);
  assert.equal(result.page[0].condition, undefined);
  const pokemon = await t.query(api.operations.publicCatalogue, {
    paginationOpts: { numItems: 20, cursor: null },
    search: '',
    tcg: 'pokemon',
    gradingStatus: 'all',
    gradingCompany: '',
    gradingGrade: '',
  });
  assert.equal(pokemon.totalCount, 0);
  for (const key of [
    'sellerId',
    'sellerName',
    'ownerId',
    'consignmentId',
    'commissionRateBps',
    'agreedPriceCents',
    'notes',
  ])
    assert.equal(key in result.page[0], false);
  assert.equal(JSON.stringify(result).includes('private'), false);
});
test('bulk sales are atomic, idempotent, reject duplicate items and validate entry dates', async () => {
  const { t, user, itemId, sellerId } = await fixture();
  const second = await user.mutation(api.operations.createConsignment, {
    operationId: 'second',
    sellerId,
    occurredAt: 86400000,
    reference: 'D2',
    items: [
      {
        operationId: 'second',
        name: 'Box',
        productType: 'other',
        askingPriceCents: 20000,
        commissionRateBps: 3000,
      },
    ],
  });
  const batch = {
    operationId: 'batch',
    occurredAt: 172800000,
    items: [
      { itemId, salePriceCents: 10000 },
      { itemId: second.itemIds[0], salePriceCents: 19999 },
    ],
  };
  await assert.rejects(user.mutation(api.operations.createSales, batch), /PRICE_BELOW_AGREEMENT/);
  assert.equal((await t.run((ctx) => ctx.db.query('sales').collect())).length, 0);
  assert.equal((await user.query(api.operations.stock, {})).length, 2);
  await assert.rejects(
    user.mutation(api.operations.createSales, {
      ...batch,
      items: [batch.items[0], batch.items[0]],
    }),
    /INVALID_SALE_BATCH/,
  );
  await assert.rejects(
    user.mutation(api.operations.createSale, {
      operationId: 'early',
      itemId,
      occurredAt: 1,
      salePriceCents: 10000,
    }),
    /SALE_BEFORE_PURCHASE/,
  );
  batch.items[1].salePriceCents = 20000;
  const result = await user.mutation(api.operations.createSales, batch);
  assert.equal(result.ids.length, 2);
  assert.deepEqual(await user.mutation(api.operations.createSales, batch), result);
  await assert.rejects(
    user.mutation(api.operations.createSales, { ...batch, items: [batch.items[0]] }),
    /IDEMPOTENCY_KEY_REUSED/,
  );
});
test('invalid deposit and rates rejected without writes', async () => {
  const { t, user, input } = await fixture();
  for (const rate of [-1, 10001, 30.5])
    await assert.rejects(
      user.mutation(api.operations.createConsignment, {
        ...input,
        operationId: 'invalid',
        items: [{ ...input.items[0], commissionRateBps: rate }],
      }),
      /INVALID_COMMISSION/,
    );
  await assert.rejects(
    user.mutation(api.operations.createConsignment, { ...input, operationId: 'invalid', dueAt: 1 }),
    /INVALID_CONSIGNMENT/,
  );
  assert.equal((await t.run((ctx) => ctx.db.query('consignments').collect())).length, 1);
});
