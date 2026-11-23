import {z,type OpenAPIHono} from '@hono/zod-openapi';
import {ConvexHttpClient} from 'convex/browser';
import {makeFunctionReference} from 'convex/server';
import type {Variables} from '../auth/middleware.js';
import {env} from '../env.js';
export function registerExportRoutes(app:OpenAPIHono<{Variables:Variables}>){
 app.get('/exports/:resource',async c=>{
  const resource=z.enum(['purchases','sales','stock','stockLots','consignments','payments','contacts']).safeParse(c.req.param('resource'));
  const params=z.object({size:z.coerce.number().int().min(1).max(25).default(25),cursor:z.string().max(10000).optional()}).strict().safeParse(c.req.query());
  if(!resource.success||!params.success)return c.json({error:'INVALID_EXPORT_QUERY'},400);
  const client=new ConvexHttpClient(env.CONVEX_URL);client.setAuth(c.get('accessToken'));
  c.header('Cache-Control','private, no-store');
  return c.json(await client.query(makeFunctionReference<'query'>('exportReads:page'),{resource:resource.data,...params.data}));
 });
}
