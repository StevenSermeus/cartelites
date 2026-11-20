'use node';

import { timingSafeEqual } from 'node:crypto';
import { v } from 'convex/values';
import { internal } from './_generated/api.js';
import { action } from './_generated/server.js';

function validServiceSecret(received: string) {
  const expected = process.env.CONVEX_AUTH_SECRET;
  if (!expected) throw new Error('CONVEX_AUTH_SECRET is not configured');
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return (
    receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes)
  );
}

export const execute = action({
  args: {
    secret: v.string(),
    operation: v.union(
      v.literal('receiptPrepare'), v.literal('receiptGet'), v.literal('receiptList'), v.literal('receiptSign'), v.literal('receiptArchive'), v.literal('receiptClaimEmail'), v.literal('receiptEmailResult'),
      v.literal('cataloguePhotoObject'),
      v.literal('accountByEmail'),
      v.literal('accountById'),
      v.literal('signatoryProfile'),
      v.literal('setSignatoryProfile'),
      v.literal('signupEnabled'),
      v.literal('setSignupEnabled'),
      v.literal('createAccount'),
      v.literal('startLoginAttempt'),
      v.literal('clearLoginAttempts'),
      v.literal('revokeSession'),
      v.literal('sessionIsValid'),
      v.literal('createPasswordReset'),
      v.literal('consumePasswordReset'),
    ),
    payload: v.any(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    if (!validServiceSecret(args.secret)) throw new Error('UNAUTHORIZED_SERVICE');
    switch (args.operation) {
      case 'receiptPrepare': return ctx.runMutation(internal.signedReceipts.prepare, args.payload);
      case 'receiptGet': return ctx.runQuery(internal.signedReceipts.get, args.payload);
      case 'receiptList': return ctx.runQuery(internal.signedReceipts.list, args.payload);
      case 'receiptSign': return ctx.runMutation(internal.signedReceipts.sign, args.payload);
      case 'receiptArchive': return ctx.runMutation(internal.signedReceipts.archive, args.payload);
      case 'receiptClaimEmail': return ctx.runMutation(internal.signedReceipts.claimEmail, args.payload);
      case 'receiptEmailResult': return ctx.runMutation(internal.signedReceipts.emailResult, args.payload);

      case 'cataloguePhotoObject':
        return ctx.runQuery(internal.operations.cataloguePhotoObject, args.payload);
      case 'accountByEmail':
        return ctx.runQuery(internal.auth.accountByEmail, args.payload);
      case 'accountById':
        return ctx.runQuery(internal.auth.accountById, args.payload);
      case 'signatoryProfile':
        return ctx.runQuery(internal.auth.signatoryProfile, args.payload);
      case 'setSignatoryProfile':
        return ctx.runMutation(internal.auth.setSignatoryProfile, args.payload);
      case 'signupEnabled':
        return ctx.runQuery(internal.auth.signupEnabled, args.payload);
      case 'setSignupEnabled':
        return ctx.runMutation(internal.auth.setSignupEnabled, args.payload);
      case 'createAccount':
        return ctx.runMutation(internal.auth.createAccount, args.payload);
      case 'startLoginAttempt':
        return ctx.runMutation(internal.auth.startLoginAttempt, args.payload);
      case 'clearLoginAttempts':
        return ctx.runMutation(internal.auth.clearLoginAttempts, args.payload);
      case 'revokeSession':
        return ctx.runMutation(internal.auth.revokeSession, args.payload);
      case 'sessionIsValid':
        return ctx.runQuery(internal.auth.sessionIsValid, args.payload);
      case 'createPasswordReset':
        return ctx.runMutation(internal.auth.createPasswordReset, args.payload);
      case 'consumePasswordReset':
        return ctx.runMutation(internal.auth.consumePasswordReset, args.payload);
    }
  },
});
