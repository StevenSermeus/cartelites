import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import type { Variables } from '../auth/middleware.js';
import { authMiddleware } from '../auth/middleware.js';
import type { ConvexAccountRepository } from '../db/accountRepository.js';
import { env } from '../env.js';

const seller = z.object({
  operationId: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});
const purchase = z.object({
  operationId: z.string().uuid(),
  sellerId: z.string().min(1),
  occurredAt: z.number().int(),
  reference: z.string(),
  items: z
    .array(
      z.object({
        operationId: z.string().uuid(),
        name: z.string().min(1),
        series: z.string().optional(),
        identifier: z.string().optional(),
        serialNumber: z.string().optional(),
        catalogueImageUrl: z.string().url().optional(),
        language: z.enum(['fr', 'en', 'ja']).optional(),
        condition: z.enum(['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO']).optional(),
        gradingCompany: z.enum(['PSA', 'CollectAura', 'PCA', 'CCC']).optional(),
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
const sale = z.object({
  operationId: z.string().uuid(),
  itemId: z.string().min(1),
  occurredAt: z.number().int(),
  salePriceCents: z.number().int().nonnegative(),
  customerName: z.string().optional(),
});
const bulkSale = z.object({
  operationId: z.string().uuid(),
  items: z
    .array(z.object({ itemId: z.string().min(1), salePriceCents: z.number().int().nonnegative() }))
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
const cancelPendingPurchaseMutation = makeFunctionReference<'mutation'>('operations:cancelPendingPurchase');
const updatePurchaseDateMutation = makeFunctionReference<'mutation'>('operations:updatePurchaseDate');
const createSaleMutation = makeFunctionReference<'mutation'>('operations:createSale');
const updateAskingPriceMutation = makeFunctionReference<'mutation'>('operations:updateAskingPrice');
const cancelSaleMutation = makeFunctionReference<'mutation'>('operations:cancelSale');
const openSaleConflictsQuery = makeFunctionReference<'query'>('operations:openSaleConflicts');
const saleConflictQuery = makeFunctionReference<'query'>('operations:getSaleConflict');
const resolveSaleConflictMutation = makeFunctionReference<'mutation'>(
  'operations:resolveSaleConflict',
);
export function operationRoutes(repo: ConvexAccountRepository) {
  const app = new OpenAPIHono<{ Variables: Variables }>();
  app.use('*', authMiddleware(repo));
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
      const { operationId, items, occurredAt } = c.req.valid('json');
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const available = (await client.query(stockQuery, {})) as {
        _id: string;
        askingPriceCents?: number;
        purchaseOccurredAt: number;
      }[];
      const availableById = new Map(available.map((item) => [item._id, item]));
      if (items.some(({ itemId }) => !availableById.has(itemId)))
        return c.json({ error: 'ITEM_NOT_AVAILABLE' }, 400);
      const saleDay = new Date(occurredAt).toISOString().slice(0, 10);
      if (items.some(({ itemId }) => saleDay < new Date(availableById.get(itemId)!.purchaseOccurredAt).toISOString().slice(0, 10)))
        return c.json({ error: 'SALE_BEFORE_PURCHASE' }, 400);
      const ids = [];
      for (const [index, { itemId, salePriceCents }] of items.entries()) {
        try {
          const result = await client.mutation(createSaleMutation, {
            operationId: `${operationId.slice(0, 32)}-${index.toString().padStart(4, '0')}`,
            itemId,
            occurredAt,
            salePriceCents,
          } as never);
          if (typeof result !== 'string')
            return c.json({ error: 'SALE_CONFLICT', conflictId: result.id }, 409);
          ids.push(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (message.includes('SALE_BEFORE_PURCHASE'))
            return c.json({ error: 'SALE_BEFORE_PURCHASE' }, 400);
          if (message.includes('ITEM_NOT_FOUND'))
            return c.json({ error: 'ITEM_NOT_AVAILABLE' }, 409);
          throw error;
        }
      }
      return c.json({ ids }, 201);
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
