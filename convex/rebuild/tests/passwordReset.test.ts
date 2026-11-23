import test from 'node:test';
import assert from 'node:assert/strict';
import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import schema from '../functions/schema';
const modules = {
  './functions/auth.ts': () => import('../functions/auth'),
  './functions/_generated/server.js': () => import('../functions/_generated/server.js'),
};
const mutation = (name: string) => makeFunctionReference<'mutation'>(`auth:${name}`);
const query = (name: string) => makeFunctionReference<'query'>(`auth:${name}`);
async function fixture() {
  const t = convexTest(schema, modules);
  const id = await t.run((ctx) =>
    ctx.db.insert('accounts', {
      email: 'reset@example.invalid',
      passwordHash: 'before',
      sessionVersion: 0,
      createdAt: 1,
      revision: 1,
    }),
  );
  return { t, id };
}

test('reset replacement, exact expiry and single consumption preserve password/session state', async () => {
  const { t, id } = await fixture();
  await t.mutation(mutation('startSession'), {
    id,
    jti: 'before-reset',
    sessionVersion: 0,
    now: 100,
    expiresAt: 10000,
  });
  await t.mutation(mutation('createPasswordReset'), {
    email: 'reset@example.invalid',
    tokenHash: 'old',
    expiresAt: 1000,
  });
  await t.mutation(mutation('createPasswordReset'), {
    email: 'reset@example.invalid',
    tokenHash: 'current',
    expiresAt: 1000,
  });
  await assert.rejects(
    t.mutation(mutation('consumePasswordReset'), {
      tokenHash: 'old',
      passwordHash: 'wrong',
      now: 500,
    }),
    /RESET_TOKEN_INVALID/,
  );
  await assert.rejects(
    t.mutation(mutation('consumePasswordReset'), {
      tokenHash: 'current',
      passwordHash: 'wrong',
      now: 1000,
    }),
    /RESET_TOKEN_INVALID/,
  );
  assert.equal((await t.run((ctx) => ctx.db.get(id)))?.passwordHash, 'before');
  assert.equal(
    await t.query(query('sessionIsValid'), {
      id,
      jti: 'before-reset',
      sessionVersion: 0,
      now: 1000,
    }),
    true,
  );
  await t.mutation(mutation('consumePasswordReset'), {
    tokenHash: 'current',
    passwordHash: 'after',
    now: 999,
  });
  await assert.rejects(
    t.mutation(mutation('consumePasswordReset'), {
      tokenHash: 'current',
      passwordHash: 'replay',
      now: 999,
    }),
    /RESET_TOKEN_INVALID/,
  );
  const account = await t.run((ctx) => ctx.db.get(id));
  assert.equal(account?.passwordHash, 'after');
  assert.equal(account?.sessionVersion, 1);
  assert.equal(
    await t.query(query('sessionIsValid'), {
      id,
      jti: 'before-reset',
      sessionVersion: 0,
      now: 1000,
    }),
    false,
  );
  await t.mutation(mutation('startSession'), {
    id,
    jti: 'after-reset',
    sessionVersion: 1,
    now: 1000,
    expiresAt: 10000,
  });
  assert.equal(
    await t.query(query('sessionIsValid'), {
      id,
      jti: 'after-reset',
      sessionVersion: 1,
      now: 1000,
    }),
    true,
  );
});

test('concurrent reset consumption changes password and session version only once', async () => {
  const { t, id } = await fixture();
  await t.mutation(mutation('createPasswordReset'), {
    email: 'reset@example.invalid',
    tokenHash: 'one-use',
    expiresAt: 1000,
  });
  const outcomes = await Promise.allSettled(
    ['first', 'second'].map((passwordHash) =>
      t.mutation(mutation('consumePasswordReset'), {
        tokenHash: 'one-use',
        passwordHash,
        now: 500,
      }),
    ),
  );
  assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 1);
  const rejected = outcomes.find((o) => o.status === 'rejected');
  assert.match(
    String(rejected?.status === 'rejected' ? rejected.reason : ''),
    /RESET_TOKEN_INVALID/,
  );
  assert.equal((await t.run((ctx) => ctx.db.get(id)))?.sessionVersion, 1);
});

test('missing and disabled accounts issue no reset; disabled accounts cannot consume an earlier token', async () => {
  const { t, id } = await fixture();
  assert.equal(
    await t.mutation(mutation('createPasswordReset'), {
      email: 'absent@example.invalid',
      tokenHash: 'missing',
      expiresAt: 1000,
    }),
    null,
  );
  await t.mutation(mutation('createPasswordReset'), {
    email: 'reset@example.invalid',
    tokenHash: 'issued',
    expiresAt: 1000,
  });
  await t.run((ctx) => ctx.db.patch(id, { disabledAt: 100 }));
  assert.equal(
    await t.mutation(mutation('createPasswordReset'), {
      email: 'reset@example.invalid',
      tokenHash: 'disabled',
      expiresAt: 1000,
    }),
    null,
  );
  await assert.rejects(
    t.mutation(mutation('consumePasswordReset'), {
      tokenHash: 'issued',
      passwordHash: 'wrong',
      now: 500,
    }),
    /RESET_TOKEN_INVALID/,
  );
  assert.equal((await t.run((ctx) => ctx.db.query('passwordResetTokens').collect())).length, 1);
  assert.equal((await t.run((ctx) => ctx.db.get(id)))?.passwordHash, 'before');
});
