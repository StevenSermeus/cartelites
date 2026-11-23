import type { TestConvex } from 'convex-test';
import type schema from '../../functions/schema';
/** Seed real shop staff and a signed-token-shaped identity for domain tests. */
export async function authenticated(
  t: TestConvex<typeof schema>,
  name = 'staff',
  scope?: 'realtime:read',
) {
  const email = `${name}@session-fixture.test`;
  const accountId = await t.run(async (ctx) => {
    const existing = await ctx.db
      .query('accounts')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();
    return existing
      ? existing._id
      : ctx.db.insert('accounts', {
          email,
          passwordHash: 'test-only-hash',
          sessionVersion: 0,
          createdAt: 1,
        });
  });
  const account = await t.run((ctx) => ctx.db.get(accountId));
  const sessionJti = `fixture-session-${accountId}`;
  return Object.assign(
    t.withIdentity({
      subject: accountId,
      sv: account?.sessionVersion ?? 0,
      sessionJti,
      ...(scope ? { scope } : {}),
    }),
    { accountId, sessionJti },
  );
}
