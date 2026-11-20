import { registerConsignmentDocumentRoutes } from './consignmentDocuments.js';
import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import type { Variables } from '../auth/middleware.js';
import { env } from '../env.js';
import { receiptIdentity } from '../receiptIdentity.js';

const cents = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const timestamp = z.number().int().min(-8_640_000_000_000_000).max(8_640_000_000_000_000);
const commissionRate = z.number().int().min(0).max(10_000);
export const consignmentSchema = z
  .object({
    operationId: z.string().uuid(),
    sellerId: z.string().min(1),
    occurredAt: timestamp,
    reference: z.string().trim().min(1).max(200),
    notes: z.string().trim().max(5000).optional(),
    flowVersion: z.literal(2).optional(),
    contractTerms: z.object({ version: z.string().trim().min(1).max(100), text: z.string().trim().min(1).max(10000) }).optional(),
    dueAt: timestamp.optional(),
    items: z
      .array(
        z.object({
          operationId: z.string().uuid(),
          name: z.string().trim().min(1).max(300),
          productType: z.enum(['card', 'sealed', 'other']),
          description: z.string().trim().max(5000).optional(),
          tcg: z.enum(['pokemon', 'riftbound', 'other']).optional(),
          series: z.string().trim().max(300).optional(),
          identifier: z.string().trim().max(200).optional(),
          language: z.enum(['fr', 'en', 'ja', 'zh']).optional(),
          condition: z.enum(['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO']).optional(),
          gradingCompany: z.enum(['PSA', 'CollectAura', 'PCA', 'CCC']).optional(),
          gradingGrade: z.string().trim().max(32).optional(),
          gradingCertificate: z.string().trim().max(64).optional(),
          gradingNotes: z.string().trim().max(500).optional(),
          askingPriceCents: cents,
          commissionRateBps: commissionRate.default(3000),
        }),
      )
      .min(1)
      .max(200),
  })
  .refine((value) => value.flowVersion !== 2 || !!value.contractTerms, { message: 'Les conditions du contrat sont requises.', path: ['contractTerms'] })
  .refine((value) => value.dueAt === undefined || value.dueAt >= value.occurredAt, {
    message: 'L’échéance ne peut pas précéder le dépôt.',
    path: ['dueAt'],
  })
  .refine(
    (value) => new Set(value.items.map((item) => item.operationId)).size === value.items.length,
    {
      message: 'Chaque article doit avoir un identifiant d’opération distinct.',
      path: ['items'],
    },
  );

export const consignmentPaymentSchema = z.object({
  operationId: z.string().uuid(),
  sellerId: z.string().min(1),
  amountCents: cents.refine((value) => value > 0, 'Le versement doit être positif.'),
  occurredAt: timestamp,
  method: z.string().trim().min(1).max(100),
  reference: z.string().trim().max(300).optional(),
});
export const consignmentReturnSchema = z.object({
  operationId: z.string().uuid(),
  itemId: z.string().min(1),
  occurredAt: timestamp,
});
export const consignmentTermsSchema = z.object({
  operationId: z.string().uuid(),
  itemId: z.string().min(1),
  askingPriceCents: cents,
  commissionRateBps: commissionRate,
  authorizationNote: z.string().trim().min(1).max(2000),
});

/** Registered after operationRoutes' authentication middleware. */
export function registerConsignmentRoutes(app: OpenAPIHono<{ Variables: Variables }>) {
  registerConsignmentDocumentRoutes(app);
  app.openapi(
    createRoute({
      method: 'get',
      path: '/receipt-identity',
      responses: { 200: { description: 'Identité de la société et logo pour les PDF mobiles' } },
    }),
    (c) => {
      c.header('Cache-Control', 'private, no-store');
      return c.json(receiptIdentity);
    },
  );
  for (const [path, operation, description] of [
    ['/consignments', 'consignmentHistory', 'Dépôts et articles'],
    ['/consignments/balances', 'consignmentBalances', 'Soldes déposants et versements'],
  ] as const) {
    app.openapi(
      createRoute({ method: 'get', path, responses: { 200: { description } } }),
      async (c) => {
        const client = new ConvexHttpClient(env.CONVEX_URL);
        client.setAuth(c.get('accessToken'));
        const result = await client.query(
          makeFunctionReference<'query'>(`operations:${operation}`),
          {},
        );
        return c.json(result as never);
      },
    );
  }
  app.openapi(
    createRoute({
      method: 'post',
      path: '/consignments',
      request: { body: { content: { 'application/json': { schema: consignmentSchema } } } },
      responses: { 201: { description: 'Dépôt enregistré et articles ajoutés au stock' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const result = await client.mutation(
        makeFunctionReference<'mutation'>('operations:createConsignment'),
        c.req.valid('json') as never,
      );
      return c.json(result as never, 201);
    },
  );
  // Separate routes preserve each request's OpenAPI contract and validation.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/consignments/payments',
      request: { body: { content: { 'application/json': { schema: consignmentPaymentSchema } } } },
      responses: { 201: { description: 'Versement enregistré' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const id = await client.mutation(
        makeFunctionReference<'mutation'>('operations:recordConsignmentPayment'),
        c.req.valid('json') as never,
      );
      return c.json({ id }, 201);
    },
  );
  app.openapi(
    createRoute({
      method: 'post',
      path: '/consignments/return',
      request: { body: { content: { 'application/json': { schema: consignmentReturnSchema } } } },
      responses: { 200: { description: 'Article restitué au déposant' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const id = await client.mutation(
        makeFunctionReference<'mutation'>('operations:returnConsignmentItem'),
        c.req.valid('json') as never,
      );
      return c.json({ id });
    },
  );
  app.openapi(
    createRoute({
      method: 'post',
      path: '/consignments/terms',
      request: { body: { content: { 'application/json': { schema: consignmentTermsSchema } } } },
      responses: { 200: { description: 'Nouvel accord du déposant enregistré' } },
    }),
    async (c) => {
      const client = new ConvexHttpClient(env.CONVEX_URL);
      client.setAuth(c.get('accessToken'));
      const id = await client.mutation(
        makeFunctionReference<'mutation'>('operations:updateConsignmentTerms'),
        c.req.valid('json') as never,
      );
      return c.json({ id });
    },
  );
}
