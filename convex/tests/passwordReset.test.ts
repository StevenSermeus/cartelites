import test from 'node:test';
import assert from 'node:assert/strict';
import { convexTest } from 'convex-test';
import { internal } from '../functions/_generated/api';
import schema from '../functions/schema';
const modules = {
  './functions/auth.ts': () => import('../functions/auth'),
  './functions/_generated/server.js': () => import('../functions/_generated/server.js'),
};
test('legacy reset replacement, expiry boundary and replay preserve session invalidation', async () => {
  const t = convexTest(schema, modules),
    id = await t.run((ctx) =>
      ctx.db.insert('accounts', {
        email: 'reset@example.invalid',
        passwordHash: 'before',
        sessionVersion: 0,
        createdAt: 1,
      }),
    );
  assert.equal(
    await t.mutation(internal.auth.createPasswordReset, {
      email: 'absent@example.invalid',
      tokenHash: 'missing',
      expiresAt: 1000,
    }),
    null,
  );
  await t.mutation(internal.auth.createPasswordReset, {
    email: 'reset@example.invalid',
    tokenHash: 'old',
    expiresAt: 1000,
  });
  await t.mutation(internal.auth.createPasswordReset, {
    email: 'reset@example.invalid',
    tokenHash: 'current',
    expiresAt: 1000,
  });
  await assert.rejects(
    t.mutation(internal.auth.consumePasswordReset, {
      tokenHash: 'old',
      passwordHash: 'wrong',
      now: 500,
    }),
    /RESET_TOKEN_INVALID/,
  );
  await assert.rejects(
    t.mutation(internal.auth.consumePasswordReset, {
      tokenHash: 'current',
      passwordHash: 'wrong',
      now: 1000,
    }),
    /RESET_TOKEN_INVALID/,
  );
  assert.equal((await t.run((ctx) => ctx.db.get(id)))?.passwordHash, 'before');
  const results = await Promise.allSettled(
    ['after', 'competing'].map((passwordHash) =>
      t.mutation(internal.auth.consumePasswordReset, {
        tokenHash: 'current',
        passwordHash,
        now: 999,
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await t.run((ctx) => ctx.db.get(id)))?.sessionVersion, 1);
  await assert.rejects(
    t.mutation(internal.auth.consumePasswordReset, {
      tokenHash: 'current',
      passwordHash: 'replay',
      now: 999,
    }),
    /RESET_TOKEN_INVALID/,
  );
});
