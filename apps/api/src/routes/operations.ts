import {registerHistoryRoutes} from './history.js';
import { registerInventoryRoutes } from './inventory.js';
import { registerSaleTicketRoutes } from './saleTickets.js';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import type { Variables } from '../auth/middleware.js';
import { authMiddleware } from '../auth/middleware.js';
import type { ConvexAccountRepository } from '../db/accountRepository.js';
import { env } from '../env.js';
import { registerConsignmentRoutes } from './consignments.js';
import { registerPaginatedReads } from './paginatedReads.js';

const seller = z.object({
  operationId: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});
const purchase = z.object({
  buyerNote: z.string().max(2000).optional(),
  sellerNote: z.string().max(2000).optional(),
  operationId: z.string().uuid(),
  sellerId: z.string().min(1),
  occurredAt: z.number().int(),
  reference: z.string(),
  items: z
    .array(
      z.object({
        operationId: z.string().uuid(),
        name: z.string().min(1),
        tcg: z.enum(['pokemon', 'riftbound', 'other']).optional(),
        series: z.string().optional(),
        identifier: z.string().optional(),
        serialNumber: z.string().optional(),
        catalogueImageUrl: z.string().url().optional(),
        catalogueCardId:z.string().max(100).optional(),catalogueSetId:z.string().max(100).optional(),
        language: z.enum(['fr', 'en', 'ja', 'zh']).optional(),
        condition: z.enum(['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO']).optional(),
        gradingCompany: z.string().trim().min(1).max(100).optional(),
        gradingGrade: z.string().trim().min(1).max(32).optional(),
        gradingCertificate: z.string().trim().max(64).optional(),
        gradingNotes: z.string().trim().max(500).optional(),
        marketValueCents: z.number().int().nonnegative().optional(),
        discountPercent: z.number().min(0).max(100).optional(),
        purchasePriceCents: z.number().int().nonnegative(),
        askingPriceCents: z.number().int().nonnegative().optional(),
        vatRegime: z.enum(['margin', 'other']),
      }),
    )
    .min(1),
});
const salePayment = z.object({
  cashCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  transferCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  receivedAt: z.number().int(),
  reference: z.string().max(300).optional(),
});
const sale = z.object({
  quantity: z.number().int().min(1).max(100000).optional(),
  paymentStatus: z.enum(['pending', 'received']).optional(),
  payment: salePayment.optional(),
  operationId: z.string().uuid(),
  itemId: z.string().min(1),
  occurredAt: z.number().int(),
  salePriceCents: z.number().int().nonnegative(),
  customerName: z.string().optional(),
});
const bulkSale = z.object({
  paymentStatus: z.enum(['pending', 'received']).optional(),
  payment: salePayment.optional(),
  operationId: z.string().uuid(),
  items: z
    .array(z.object({ itemId: z.string().min(1), salePriceCents: z.number().int().nonnegative(), quantity: z.number().int().min(1).max(100000).optional() }))
    .min(1),
  occurredAt: z.number().int(),
});
const stockQuery = makeFunctionReference<'query'>('operations:stock');
const sellerHistoryQuery = makeFunctionReference<'query'>('operations:sellerHistory');
const purchaseHistoryQuery = makeFunctionReference<'query'>('operations:purchaseHistory');
const salesHistoryQuery = makeFunctionReference<'query'>('operations:salesHistory');
const createSellerMutation = makeFunctionReference<'mutation'>('operations:createSeller');
const updateSellerMutation = makeFunctionReference<'mutation'>('operations:updateSeller');
const createPurchaseMutation = makeFunctionReference<'mutation'>('operations:createPurchase');
const validatePurchaseMutation = makeFunctionReference<'mutation'>('operations:validatePurchase');
const cancelPendingPurchaseMutation = makeFunctionReference<'mutation'>(
  'operations:cancelPendingPurchase',
);
const updatePurchaseDateMutation = makeFunctionReference<'mutation'>(
  'operations:updatePurchaseDate',
);
const createSaleMutation = makeFunctionReference<'mutation'>('operations:createSale');
const updateAskingPriceMutation = makeFunctionReference<'mutation'>('operations:updateAskingPrice');
const cancelSaleMutation = makeFunctionReference<'mutation'>('operations:cancelSale');
const openSaleConflictsQuery = makeFunctionReference<'query'>('operations:openSaleConflicts');
const saleConflictQuery = makeFunctionReference<'query'>('operations:getSaleConflict');
const resolveSaleConflictMutation = makeFunctionReference<'mutation'>(
  'operations:resolveSaleConflict',
);
import {registerExportRoutes} from './exports.js';
export function operationRoutes(repo: ConvexAccountRepository) {
  const app = new OpenAPIHono<{ Variables: Variables }>();
  app.use('*', authMiddleware(repo));
  registerExportRoutes(app);
  registerHistoryRoutes(app);
  registerPaginatedReads(app);
  app.get('/grading-companies', async c => {
    const client = new ConvexHttpClient(env.CONVEX_URL); client.setAuth(c.get('accessToken'));
    return c.json(await client.query(makeFunctionReference<'query'>('gradingCompanies:list'), {}));
  });
  const gradingCompanyInput = z.object({name:z.string().trim().min(1).max(100), abbreviation:z.string().max(30).optional(), website:z.string().url().optional(), archived:z.boolean().optional(), expectedRevision:z.number().int().positive().optional()}).strict();
  app.post('/grading-companies', async c => {
    const input = gradingCompanyInput.safeParse(await c.req.json());
    if (!input.success) return c.json({error:'INVALID_GRADING_COMPANY'},400);
    const client = new ConvexHttpClient(env.CONVEX_URL); client.setAuth(c.get('accessToken'));
    return c.json({id:await client.mutation(makeFunctionReference<'mutation'>('gradingCompanies:save'), input.data)});
  });
  app.patch('/grading-companies/:id', async c => {
    const input = gradingCompanyInput.safeParse(await c.req.json());
    if (!input.success) return c.json({error:'INVALID_GRADING_COMPANY'},400);
    const client = new ConvexHttpClient(env.CONVEX_URL); client.setAuth(c.get('accessToken'));
    return c.json({id:await client.mutation(makeFunctionReference<'mutation'>('gradingCompanies:save'), {...input.data,id:c.req.param('id')})});
  });
  app.get('/purchases/:purchaseId/edit', async c => {
    const client = new ConvexHttpClient(env.CONVEX_URL); client.setAuth(c.get('accessToken'));
    return c.json(await client.query(makeFunctionReference<'query'>('purchaseEditing:detail'), { purchaseId: c.req.param('purchaseId') }));
  });
  app.post('/purchases/:purchaseId/edit', async c => {
    const schema = z.object({ operationId: z.string().uuid(), expectedDigest: z.string().max(2000000), removedIds: z.array(z.string()).max(500), items: z.array(purchase.shape.items.element.omit({ purchasePriceCents: true, vatRegime: true, serialNumber: true }).extend({ itemId: z.string().optional(), marketValueCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), discountPercent: z.number().min(0).max(100) })).max(500) });
    const input = schema.safeParse(await c.req.json());
    if (!input.success) return c.json({ error: 'INVALID_PURCHASE' }, 400);
    const client = new ConvexHttpClient(env.CONVEX_URL); client.setAuth(c.get('accessToken'));
    return c.json(await client.mutation(makeFunctionReference<'mutation'>('purchaseEditing:save'), { ...input.data, purchaseId: c.req.param('purchaseId') }));
  });

  registerInventoryRoutes(app);
  registerSaleTicketRoutes(app);
  registerConsignmentRoutes(app);
  app.onError((error, c) => {
    if (/\b(INVALID_CURSOR|INVALID_PAGINATION|INVALID_FILTER|INVALID_RESOURCE)\b/.test(error.message)) return c.json({ error: 'INVALID_QUERY' }, 400);
    const codes = [
      'UNAUTHENTICATED', 'INVALID_SESSION', 'ACCOUNT_DISABLED', 'READ_ONLY_TOKEN',
      'CONSIGNMENT_SIGNATURE_REQUIRED', 'CONTRACT_SIGNATURE_REQUIRED', 'CONTRACT_TERMS_REQUIRED', 'RETURN_SIGNATURE_REQUIRED', 'CONSIGNMENT_TERMS_UNKNOWN', 'PURCHASE_NOT_ACTIVE', 'PAYMENT_TOTAL_MISMATCH', 'PAYMENT_BEFORE_SALE', 'PENDING_STOCK_CHANGED', 'ITEM_UNAVAILABLE_AT_DATE', 'STOCK_LEDGER_MISMATCH', 'LOT_OVERFLOW', 'ALLOCATION_LEDGER_MISMATCH', 'OWNERSHIP_MISMATCH', 'MIXED_TAX_LOTS_REQUIRE_SEPARATE_ITEM',
      'REVISION_CONFLICT', 'GRADING_COMPANY_EXISTS', 'GRADING_COMPANY_NOT_FOUND', 'INVALID_GRADING_COMPANY', 'INVALID_GRADING_WEBSITE',
      'SELLER_NOT_FOUND',
      'ITEM_NOT_FOUND',
      'CONSIGNMENT_NOT_FOUND',
      'ITEM_NOT_AVAILABLE',
      'ITEM_STATE_INVALID',
      'NOT_CONSIGNMENT_ITEM',
      'SALE_BEFORE_PURCHASE',
      'SALE_BEFORE_DEPOSIT',
      'SALE_BELOW_AGREED_PRICE',
      'CONSIGNMENT_PRICE_REQUIRES_AUTHORIZATION',
      'CONSIGNMENT_TERMS_REQUIRED',
      'PAYMENT_EXCEEDS_BALANCE',
      'INVALID_PAYMENT',
      'INVALID_PRICE',
      'INVALID_COMMISSION_RATE',
      'INVALID_DATE',
      'RETURN_BEFORE_DEPOSIT',
      'INVALID_PAYMENT_DATE',
      'INVALID_CONSIGNMENT',
      'INVALID_AUTHORIZATION_NOTE',
      'IDEMPOTENCY_KEY_REUSED',
      'DUPLICATE_ITEM',
      'SALE_CONFLICT',
      'PRICE_BELOW_AGREEMENT',
      'INVALID_COMMISSION',
      'CONSIGNMENT_ITEM_NOT_FOUND',
      'ITEM_UNAVAILABLE',
      'INVALID_RETURN_DATE',
      'AUTHORIZATION_REQUIRED',
      'INVALID_SALE_BATCH',
      'INVALID_SALE_DATE',
      'INVALID_ITEM',
      'INVALID_SALE_PAYMENT',
      'INVALID_SALE_PAYMENT_DATE',
      'SALE_NOT_FOUND',
      'SALE_CANCELLED',
      'PURCHASE_CHANGED', 'PURCHASE_NOT_EDITABLE', 'PURCHASE_ITEM_LOCKED', 'PURCHASE_TOO_LARGE', 'INVALID_PURCHASE', 'INVALID_STOCK_SELECTION', 'INVALID_INVENTORY', 'PRODUCT_MISMATCH', 'OPENING_ALREADY_USED', 'GIFT_NOT_FOUND', 'OPENING_NOT_FOUND', 'TICKET_NOT_FOUND', 'INVALID_TICKET', 'TICKET_STALE', 'INVALID_ATTACHMENT',
    ];
    const code = codes.find((value) => new RegExp(`\\b${value}\\b`).test(error.message));
    if (code === 'READ_ONLY_TOKEN') return c.json({ error: code }, 403);
    if (code === 'UNAUTHENTICATED' || code === 'INVALID_SESSION' || code === 'ACCOUNT_DISABLED') return c.json({ error: code }, 401);
    if (code?.endsWith('_NOT_FOUND')) return c.json({ error: code }, 404);
    if (code) return c.json({ error: code }, 409);
    console.error('Operation failed', error);
    return c.json({ error: 'OPERATION_FAILED' }, 500);
  });
  app.openapi(
    createRoute({
      method: 'post',
      path: '/stock/visibility',
      request: {
        body: {
          content: {
            'application/json': {
              schema: z.object({
                operationId: z.string().uuid(),
                itemIds: z
                  .array(z.string().min(1))
                  .min(1)
                  .max(500)
                  .refine((ids) => new Set(ids).size === ids.length, 'Sélection dupliquée'),
                hidden: z.boolean(),
              }),
            },
          },
        },
      },
      responses: { 200: { description: 'Visibilité du catalogue mise à jour' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const result = await client.mutation(
        makeFunctionReference<'mutation'>('operations:setStockVisibility'),
        c.req.valid('json') as never,
      );
      return c.json(result as never);
    },
  );
  app.openapi(
    createRoute({
      method: 'post',
      path: '/sales/payment',
      request: {
        body: {
          content: {
            'application/json': {
              schema: salePayment.extend({
                operationId: z.string().uuid(),
                saleId: z.string().min(1),
              }),
            },
          },
        },
      },
      responses: { 200: { description: 'Encaissement enregistré et historisé' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const id = await client.mutation(
        makeFunctionReference<'mutation'>('operations:recordSalePayment'),
        c.req.valid('json') as never,
      );
      return c.json({ id });
    },
  );
  app.openapi(
    createRoute({
      method: 'post',
      path: '/stock/asking-price',
      request: {
        body: {
          content: {
            'application/json': {
              schema: z.object({
                itemId: z.string().min(1),
                askingPriceCents: z.number().int().nonnegative(),
              }),
            },
          },
        },
      },
      responses: { 200: { description: 'Prix demandé mis à jour' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const result = await client.mutation(updateAskingPriceMutation, c.req.valid('json') as never);
      return c.json({ id: result });
    },
  );
  app.openapi(
    createRoute({
      method: 'get',
      path: '/sellers',
      responses: { 200: { description: 'Vendeurs du compte' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const result = await client.query(sellerHistoryQuery, {});
      return c.json(result as never);
    },
  );
  app.openapi(
    createRoute({
      method: 'get',
      path: '/stock',
      responses: { 200: { description: 'Stock disponible' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const result = await client.query(stockQuery, {});
      return c.json(result as never);
    },
  );
  app.get('/purchases/page', async (c) => {
    const parsed = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        size: z.coerce.number().int().min(1).max(50).default(12),
        search: z.string().max(200).default(''),
        status: z.enum(['all', 'pending', 'active', 'cancelled']).default('all'),
        from: z.coerce.number().finite().optional(),
        to: z.coerce.number().finite().optional(),
      })
      .refine(
        (value) => value.from === undefined || value.to === undefined || value.from <= value.to,
      )
      .safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'Filtres ou pagination invalides' }, 400);
    const client = new ConvexHttpClient(env.CONVEX_URL);
    client.setAuth(c.get('accessToken'));
    const result = await client.query(
      makeFunctionReference<'query'>('operations:purchaseHistoryPage'),
      parsed.data,
    );
    return c.json(result as never);
  });
  app.openapi(
    createRoute({
      method: 'get',
      path: '/purchases',
      responses: { 200: { description: 'Historique des rachats' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const result = await client.query(purchaseHistoryQuery, {});
      return c.json(result as never);
    },
  );
  app.openapi(
    createRoute({
      method: 'get',
      path: '/sales',
      responses: { 200: { description: 'Historique des ventes' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const result = await client.query(salesHistoryQuery, {});
      return c.json(result as never);
    },
  );
  app.openapi(
    createRoute({
      method: 'post',
      path: '/sellers',
      request: { body: { content: { 'application/json': { schema: seller } } } },
      responses: { 201: { description: 'Vendeur créé' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const id = await client.mutation(createSellerMutation, c.req.valid('json'));
      return c.json({ id }, 201);
    },
  );
  app.openapi(
    createRoute({
      method: 'patch',
      path: '/sellers/{sellerId}',
      request: {
        params: z.object({ sellerId: z.string().min(1) }),
        body: {
          content: {
            'application/json': {
              schema: z.object({
                name: z.string().min(1),
                email: z.string().email().optional(),
                phone: z.string().optional(),
                address: z.string().optional(),
              }),
            },
          },
        },
      },
      responses: { 200: { description: 'Fiche client modifiée' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const id = await client.mutation(updateSellerMutation, {
        sellerId: c.req.valid('param').sellerId as never,
        ...c.req.valid('json'),
      });
      return c.json({ id });
    },
  );
  app.openapi(
    createRoute({
      method: 'post',
      path: '/purchases',
      request: { body: { content: { 'application/json': { schema: purchase } } } },
      responses: { 201: { description: 'Rachat créé' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const result = await client.mutation(createPurchaseMutation, c.req.valid('json') as never);
      return c.json(result as never, 201);
    },
  );
  app.openapi(
    createRoute({
      method: 'post',
      path: '/purchases/{purchaseId}/validate',
      request: { params: z.object({ purchaseId: z.string().min(1) }) },
      responses: { 200: { description: 'Rachat validé et ajouté au stock' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const id = await client.mutation(validatePurchaseMutation, {
        purchaseId: c.req.valid('param').purchaseId as never,
      });
      return c.json({ id });
    },
  );
  app.openapi(
    createRoute({
      method: 'post',
      path: '/purchases/{purchaseId}/cancel',
      request: { params: z.object({ purchaseId: z.string().min(1) }) },
      responses: { 200: { description: 'Rachat en attente annulé' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const id = await client.mutation(cancelPendingPurchaseMutation, {
        purchaseId: c.req.valid('param').purchaseId as never,
      });
      return c.json({ id });
    },
  );
  app.openapi(
    createRoute({
      method: 'patch',
      path: '/purchases/{purchaseId}',
      request: {
        params: z.object({ purchaseId: z.string().min(1) }),
        body: {
          content: {
            'application/json': {
              schema: z.object({ occurredAt: z.number().int() }),
            },
          },
        },
      },
      responses: { 200: { description: 'Date du rachat modifiée' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      try {
        const id = await client.mutation(updatePurchaseDateMutation, {
          purchaseId: c.req.valid('param').purchaseId as never,
          ...c.req.valid('json'),
        });
        return c.json({ id });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.includes('PURCHASE_NOT_FOUND'))
          return c.json({ error: 'PURCHASE_NOT_FOUND' }, 404);
        if (message.includes('PURCHASE_DATE_AFTER_SALE'))
          return c.json({ error: 'PURCHASE_DATE_AFTER_SALE' }, 409);
        throw error;
      }
    },
  );
  app.openapi(
    createRoute({
      method: 'post',
      path: '/sales/bulk',
      request: { body: { content: { 'application/json': { schema: bulkSale } } } },
      responses: { 201: { description: 'Ventes enregistrées' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const result = await client.mutation(
        makeFunctionReference<'mutation'>('operations:createSales'),
        c.req.valid('json') as never,
      );
      return c.json(result as never, 201);
    },
  );
  app.openapi(
    createRoute({
      method: 'post',
      path: '/sales',
      request: { body: { content: { 'application/json': { schema: sale } } } },
      responses: { 201: { description: 'Vente créée' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      let result: string | { id: string; conflict?: true };
      try {
        result = await client.mutation(createSaleMutation, c.req.valid('json') as never);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.includes('SALE_BEFORE_PURCHASE'))
          return c.json({ error: 'SALE_BEFORE_PURCHASE' }, 400);
        if (message.includes('ITEM_NOT_FOUND')) return c.json({ error: 'ITEM_NOT_FOUND' }, 404);
        throw error;
      }
      if (typeof result !== 'string')
        return c.json({ error: 'SALE_CONFLICT', conflictId: result.id }, 409);
      return c.json({ id: result }, 201);
    },
  );
  app.openapi(
    createRoute({
      method: 'get',
      path: '/conflicts',
      responses: { 200: { description: 'Conflits de vente ouverts' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const result = await client.query(openSaleConflictsQuery, {});
      return c.json(result as never);
    },
  );
  app.openapi(
    createRoute({
      method: 'get',
      path: '/conflicts/{conflictId}',
      request: { params: z.object({ conflictId: z.string().min(1) }) },
      responses: { 200: { description: 'État du conflit' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const result = await client.query(saleConflictQuery, {
        conflictId: c.req.valid('param').conflictId,
      } as never);
      return c.json(result as never);
    },
  );
  app.openapi(
    createRoute({
      method: 'post',
      path: '/conflicts/resolve',
      request: {
        body: {
          content: {
            'application/json': {
              schema: z.object({
                conflictId: z.string().min(1),
                resolutionNote: z.string().min(1),
              }),
            },
          },
        },
      },
      responses: { 200: { description: 'Conflit résolu et historisé' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const result = await client.mutation(
        resolveSaleConflictMutation,
        c.req.valid('json') as never,
      );
      return c.json({ id: result });
    },
  );
  app.openapi(
    createRoute({
      method: 'post',
      path: '/sales/cancel',
      request: {
        body: {
          content: {
            'application/json': {
              schema: z.object({ operationId: z.string().uuid(), saleId: z.string().min(1) }),
            },
          },
        },
      },
      responses: { 200: { description: 'Vente annulée' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const result = await client.mutation(cancelSaleMutation, c.req.valid('json') as never);
      return c.json({ id: result });
    },
  );
  return app;
}
