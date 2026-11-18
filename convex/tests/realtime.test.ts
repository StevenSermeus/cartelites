import assert from 'node:assert/strict';
import test from 'node:test';
import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import schema from '../functions/schema';
const modules = {
  './functions/readModels.ts': () => import('../functions/readModels'),
  './functions/operations.ts': () => import('../functions/operations'),
  './functions/_generated/server.js': () => import('../functions/_generated/server.js'),
};
const browse = makeFunctionReference<'query'>('readModels:browse');
const createSeller = makeFunctionReference<'mutation'>('operations:createSeller');
test('live read credentials are revoked with the original session and cannot mutate', async () => {
  const t = convexTest(schema, modules);
  const account = await t.run(ctx => ctx.db.insert('accounts', { email: 'staff@example.test', passwordHash: 'hash', sessionVersion: 0, createdAt: 1 }));
  const user = t.withIdentity({ subject: account, scope: 'realtime:read', sv: 0, sessionJti: 'session-a' });
  assert.deepEqual((await user.query(browse, { resource: 'stock' })).items, []);
  await assert.rejects(user.mutation(createSeller, { operationId: 'no-write', name: 'Forbidden', email: '', phone: '' }), /READ_ONLY_TOKEN/);
  await t.run(ctx => ctx.db.insert('revokedSessions', { jti: 'session-a', expiresAt: Date.now() + 60000 }));
  await assert.rejects(user.query(browse, { resource: 'stock' }), /INVALID_SESSION/);
});
test('password reset invalidates live credentials and anonymous users cannot read stock', async () => {
  const t = convexTest(schema, modules);
  const account = await t.run(ctx => ctx.db.insert('accounts', { email: 'staff@example.test', passwordHash: 'hash', sessionVersion: 1, createdAt: 1 }));
  await assert.rejects(t.withIdentity({ subject: account, scope: 'realtime:read', sv: 0, sessionJti: 'old' }).query(browse, { resource: 'stock' }), /INVALID_SESSION/);
  await assert.rejects(t.query(browse, { resource: 'stock' }), /UNAUTHENTICATED/);
});
