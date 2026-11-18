import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server.js';

export const accountByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) =>
    ctx.db
      .query('accounts')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique(),
});

export const accountById = internalQuery({
  args: { id: v.id('accounts') },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const signupEnabled = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Never lock out first-time setup, even if a previous settings row disabled signups.
    const firstAccount = await ctx.db.query('accounts').first();
    if (!firstAccount) return true;
    const setting = await ctx.db
      .query('applicationSettings')
      .withIndex('by_key', (q) => q.eq('key', 'signupEnabled'))
      .unique();
    return setting?.enabled ?? true;
  },
});

export const setSignupEnabled = internalMutation({
  args: { enabled: v.boolean(), now: v.number() },
  handler: async (ctx, { enabled, now }) => {
    const setting = await ctx.db
      .query('applicationSettings')
      .withIndex('by_key', (q) => q.eq('key', 'signupEnabled'))
      .unique();
    if (setting) await ctx.db.patch(setting._id, { enabled, updatedAt: now });
    else await ctx.db.insert('applicationSettings', { key: 'signupEnabled', enabled, updatedAt: now });
    return enabled;
  },
});

export const createAccount = internalMutation({
  args: { email: v.string(), passwordHash: v.string() },
  handler: async (ctx, { email, passwordHash }) => {
    const firstAccount = await ctx.db.query('accounts').first();
    const signupSetting = await ctx.db
      .query('applicationSettings')
      .withIndex('by_key', (q) => q.eq('key', 'signupEnabled'))
      .unique();
    if (firstAccount && signupSetting?.enabled === false) throw new Error('SIGNUP_DISABLED');
    const existing = await ctx.db
      .query('accounts')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();
    if (existing) throw new Error('ACCOUNT_EXISTS');
    const createdAt = Date.now();
    const id = await ctx.db.insert('accounts', {
      email,
      passwordHash,
      sessionVersion: 0,
      createdAt,
    });
    return { id, email, passwordHash, sessionVersion: 0, createdAt };
  },
});

export const startLoginAttempt = internalMutation({
  args: { emailHash: v.string(), now: v.number() },
  handler: async (ctx, { emailHash, now }) => {
    const row = await ctx.db
      .query('loginAttempts')
      .withIndex('by_email_hash', (q) => q.eq('emailHash', emailHash))
      .unique();
    if (!row || now - row.windowStartedAt >= 15 * 60 * 1000) {
      if (row) await ctx.db.delete(row._id);
      await ctx.db.insert('loginAttempts', { emailHash, windowStartedAt: now, attempts: 1 });
      return true;
    }
    if (row.attempts >= 5) return false;
    await ctx.db.patch(row._id, { attempts: row.attempts + 1 });
    return true;
  },
});

export const clearLoginAttempts = internalMutation({
  args: { emailHash: v.string() },
  handler: async (ctx, { emailHash }) => {
    const row = await ctx.db
      .query('loginAttempts')
      .withIndex('by_email_hash', (q) => q.eq('emailHash', emailHash))
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});

export const revokeSession = internalMutation({
  args: { jti: v.string(), expiresAt: v.number() },
  handler: async (ctx, { jti, expiresAt }) => {
    const existing = await ctx.db
      .query('revokedSessions')
      .withIndex('by_jti', (q) => q.eq('jti', jti))
      .unique();
    if (!existing) await ctx.db.insert('revokedSessions', { jti, expiresAt });
  },
});

export const sessionIsValid = internalQuery({
  args: { id: v.id('accounts'), jti: v.string(), sessionVersion: v.number(), now: v.number() },
  handler: async (ctx, { id, jti, sessionVersion, now }) => {
    const account = await ctx.db.get(id);
    if (!account || (account.sessionVersion ?? 0) !== sessionVersion) return false;
    const revoked = await ctx.db
      .query('revokedSessions')
      .withIndex('by_jti', (q) => q.eq('jti', jti))
      .unique();
    return !revoked || revoked.expiresAt <= now;
  },
});

export const createPasswordReset = internalMutation({
  args: { email: v.string(), tokenHash: v.string(), expiresAt: v.number() },
  handler: async (ctx, { email, tokenHash, expiresAt }) => {
    const account = await ctx.db
      .query('accounts')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();
    if (!account) return null;
    const oldTokens = await ctx.db
      .query('passwordResetTokens')
      .withIndex('by_account', (q) => q.eq('accountId', account._id))
      .collect();
    for (const old of oldTokens) await ctx.db.delete(old._id);
    await ctx.db.insert('passwordResetTokens', {
      accountId: account._id,
      tokenHash,
      expiresAt,
    });
    return { email: account.email };
  },
});

export const consumePasswordReset = internalMutation({
  args: { tokenHash: v.string(), passwordHash: v.string(), now: v.number() },
  handler: async (ctx, { tokenHash, passwordHash, now }) => {
    const token = await ctx.db
      .query('passwordResetTokens')
      .withIndex('by_token_hash', (q) => q.eq('tokenHash', tokenHash))
      .unique();
    if (!token || token.consumedAt || token.expiresAt <= now)
      throw new Error('RESET_TOKEN_INVALID');
    const account = await ctx.db.get(token.accountId);
    if (!account) throw new Error('RESET_TOKEN_INVALID');
    await ctx.db.patch(account._id, {
      passwordHash,
      sessionVersion: (account.sessionVersion ?? 0) + 1,
    });
    await ctx.db.patch(token._id, { consumedAt: now });
    return true;
  },
});


export const signatoryProfile = internalQuery({
  args: { id: v.id('accounts') },
  handler: async (ctx, { id }) => {
    const account = await ctx.db.get(id);
    if (!account) throw new Error('ACCOUNT_NOT_FOUND');
    return account.signatory ?? { firstName: '', lastName: '', capacity: '' };
  },
});

export const setSignatoryProfile = internalMutation({
  args: { id: v.id('accounts'), firstName: v.string(), lastName: v.string(), capacity: v.string() },
  handler: async (ctx, { id, ...input }) => {
    const profile = { firstName: input.firstName.trim(), lastName: input.lastName.trim(), capacity: input.capacity.trim() };
    if (Object.values(profile).some((value) => !value || value.length > 100 || /[\r\n\x00-\x1f]/.test(value))) throw new Error('INVALID_SIGNATORY');
    if (!await ctx.db.get(id)) throw new Error('ACCOUNT_NOT_FOUND');
    await ctx.db.patch(id, { signatory: profile });
    return profile;
  },
});
