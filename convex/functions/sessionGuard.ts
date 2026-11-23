import type { QueryCtx } from './_generated/server';

/** A deployment is a shared shop. Accounts authenticate staff; ownerId is audit attribution. */
export async function requireLiveSession(ctx: Pick<QueryCtx, 'auth' | 'db'>): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('UNAUTHENTICATED');
  const readOnly = identity.scope === 'realtime:read';
  if (identity.scope !== undefined && !readOnly) throw new Error('INVALID_SESSION');
  // Convex supplies DatabaseWriter only to mutations, including nested domain helpers.
  if (readOnly && 'insert' in ctx.db) throw new Error('READ_ONLY_TOKEN');
  const accountId = ctx.db.normalizeId('accounts', identity.subject);
  const account = accountId ? await ctx.db.get(accountId) : null;
  const version = identity.sv === undefined ? 0 : identity.sv;
  // jti is a JWT housekeeping claim and is not exposed by Convex UserIdentity.
  // API tokens carry sessionJti; realtime tokens retain the ORIGINAL session ID.
  const sessionJti = identity.sessionJti;
  if (
    !account ||
    typeof version !== 'number' ||
    !Number.isSafeInteger(version) ||
    version < 0 ||
    (account.sessionVersion ?? 0) !== version ||
    typeof sessionJti !== 'string' ||
    !sessionJti.trim() ||
    sessionJti.length > 256
  )
    throw new Error('INVALID_SESSION');
  // These reads invalidate live subscriptions after logout, account deletion or password reset.
  const revoked = await ctx.db
    .query('revokedSessions')
    .withIndex('by_jti', (q) => q.eq('jti', sessionJti))
    .unique();
  // A renewed JWT retains this session ID. Never reopen a revoked session when
  // an older token's expiry passes; expiresAt is audit metadata, not a TTL.
  if (revoked) throw new Error('INVALID_SESSION');
  return accountId!;
}
