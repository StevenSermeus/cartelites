import { serve } from '@hono/node-server';
import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { jwks } from './auth/tokens.js';
import { ConvexAccountRepository } from './db/accountRepository.js';
import { env } from './env.js';
import { attachmentRoutes } from './routes/attachments.js';
import { authRoutes } from './routes/auth.js';
import { catalogueRoutes } from './routes/catalogue.js';
import { operationRoutes } from './routes/operations.js';

const repo = new ConvexAccountRepository();
const app = new OpenAPIHono();
app.use(
  '/api/*',
  cors({
    origin: env.WEB_ORIGIN,
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Client-Platform'],
    exposeHeaders: ['X-CSRF-Token'],
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  }),
);
app.get('/.well-known/jwks.json', async (c) => c.json(await jwks()));
app.get('/api/v1/instance', (c) => c.json({ service: 'tcg-marge-api', apiVersion: 1, convexUrl: env.CONVEX_URL }));
app.route('/api/v1/auth', authRoutes(repo));
app.route('/', catalogueRoutes());
app.route('/api/v1', attachmentRoutes(repo));
app.route('/api/v1', operationRoutes(repo));
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: { title: 'TVA sur marge API', version: '1.0.0' },
});
app.get('/health', (c) => c.json({ status: 'ok' }));
serve({ fetch: app.fetch, port: env.PORT });
