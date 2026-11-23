import {z,type OpenAPIHono} from '@hono/zod-openapi';
import {ConvexHttpClient} from 'convex/browser';
import {makeFunctionReference} from 'convex/server';
import type {Variables} from '../auth/middleware.js';
import {env} from '../env.js';
// Mirrors the shared domain union; backend capability validation is authoritative.
const activityHistorySources=['purchases','sales','consignments','payments','events','receipts','gifts','openings'] as const;
const paging={size:z.coerce.number().int().min(1).max(50).default(25),cursor:z.string().max(10000).optional()};
const filters=z.object({...paging,search:z.string().max(200).optional(),from:z.coerce.number().int().nonnegative().optional(),to:z.coerce.number().int().nonnegative().optional(),status:z.enum(['all','active','pending','cancelled','open','closed','recorded']).optional(),origin:z.enum(['all','purchase','supplier','consignment']).optional(),paymentStatus:z.enum(['all','received','pending','unknown']).optional(),eventKind:z.enum(['all','return','terms']).optional()}).strict();
export function registerHistoryRoutes(app:OpenAPIHono<{Variables:Variables}>){
 app.get('/activity/:source',async c=>{
  const source=z.enum(activityHistorySources).safeParse(c.req.param('source')),parsed=filters.safeParse(c.req.query());if(!source.success||!parsed.success)return c.json({error:'INVALID_HISTORY_FILTER'},400);
  const client=new ConvexHttpClient(env.CONVEX_URL);client.setAuth(c.get('accessToken'));
  try{return c.json(await client.query(makeFunctionReference<'query'>('activity:browse'),{source:source.data,...parsed.data}));}catch(error){if(/INVALID_HISTORY_FILTER|INVALID_CURSOR/.test(String(error)))return c.json({error:'INVALID_HISTORY_FILTER'},400);throw error;}
 });
 app.get('/sales/:id/payment-history',async c=>{
  const parsed=z.object(paging).strict().safeParse(c.req.query());if(!parsed.success)return c.json({error:'INVALID_PAGINATION'},400);
  const client=new ConvexHttpClient(env.CONVEX_URL);client.setAuth(c.get('accessToken'));
  try{return c.json(await client.query(makeFunctionReference<'query'>('operations:salePaymentHistory'),{saleId:c.req.param('id'),...parsed.data}));}catch(error){if(/SALE_NOT_FOUND/.test(String(error)))return c.json({error:'SALE_NOT_FOUND'},404);if(/INVALID_CURSOR|INVALID_PAGINATION/.test(String(error)))return c.json({error:'INVALID_PAGINATION'},400);throw error;}
 });
}
