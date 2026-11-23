import {v} from 'convex/values';
import {internalMutation,internalQuery} from './_generated/server';
import {validSignature} from '../../../packages/domain/src/signature';
const signature=v.array(v.array(v.array(v.number())));
export const accountByEmail=internalQuery({args:{email:v.string()},handler:async(ctx,args)=>{const account=await ctx.db.query('accounts').withIndex('by_email',q=>q.eq('email',args.email)).unique();return account?.disabledAt===undefined?account:null;}});
export const accountById=internalQuery({args:{id:v.id('accounts')},handler:async(ctx,args)=>{const account=await ctx.db.get(args.id);return account?.disabledAt===undefined?account:null;}});
export const createAccount=internalMutation({args:{email:v.string(),passwordHash:v.string(),registrationPolicy:v.union(v.literal('open'),v.literal('closed'))},handler:async(ctx,args)=>{
 if(args.registrationPolicy!=='open')throw new Error('SIGNUP_DISABLED');const email=args.email.trim().toLowerCase();if(!email||!args.passwordHash)throw new Error('INVALID_ACCOUNT');
 if(await ctx.db.query('accounts').withIndex('by_email',q=>q.eq('email',email)).unique())throw new Error('ACCOUNT_EXISTS');
 const createdAt=Date.now(),id=await ctx.db.insert('accounts',{email,passwordHash:args.passwordHash,sessionVersion:0,createdAt,revision:1});return {id,email,passwordHash:args.passwordHash,sessionVersion:0,createdAt};
}});
export const startLoginAttempt=internalMutation({args:{emailHash:v.string(),now:v.number()},handler:async(ctx,args)=>{
 const prior=await ctx.db.query('loginAttempts').withIndex('by_identifier',q=>q.eq('identifierHash',args.emailHash)).unique();
 if(!prior){await ctx.db.insert('loginAttempts',{identifierHash:args.emailHash,windowStartedAt:args.now,count:1,createdAt:args.now});return true;}
 if(args.now-prior.windowStartedAt>=15*60*1000){await ctx.db.patch(prior._id,{windowStartedAt:args.now,count:1});return true;}
 if(prior.count>=5)return false;await ctx.db.patch(prior._id,{count:prior.count+1});return true;
}});
export const clearLoginAttempts=internalMutation({args:{emailHash:v.string()},handler:async(ctx,args)=>{const row=await ctx.db.query('loginAttempts').withIndex('by_identifier',q=>q.eq('identifierHash',args.emailHash)).unique();if(row)await ctx.db.delete(row._id);}});
export const startSession=internalMutation({args:{id:v.id('accounts'),jti:v.string(),sessionVersion:v.number(),expiresAt:v.number(),now:v.number()},handler:async(ctx,args)=>{
 const account=await ctx.db.get(args.id);if(!account||account.disabledAt!==undefined||account.sessionVersion!==args.sessionVersion||!args.jti||args.expiresAt<=args.now)throw new Error('INVALID_SESSION');
 const prior=await ctx.db.query('sessions').withIndex('by_token',q=>q.eq('tokenId',args.jti)).unique();
 if(prior){if(prior.accountId!==args.id||prior.revokedAt!==undefined||prior.expiresAt<=args.now)throw new Error('INVALID_SESSION');await ctx.db.patch(prior._id,{expiresAt:Math.max(args.expiresAt,prior.expiresAt),lastActivityAt:args.now,updatedAt:args.now});return prior._id;}
 return ctx.db.insert('sessions',{accountId:args.id,tokenId:args.jti,expiresAt:args.expiresAt,lastActivityAt:args.now,createdAt:args.now,createdBy:args.id});
}});
export const sessionIsValid=internalQuery({args:{id:v.id('accounts'),jti:v.string(),sessionVersion:v.number(),now:v.number()},handler:async(ctx,args)=>{
 const account=await ctx.db.get(args.id);if(!account||account.disabledAt!==undefined||account.sessionVersion!==args.sessionVersion)return false;
 const session=await ctx.db.query('sessions').withIndex('by_token',q=>q.eq('tokenId',args.jti)).unique();return !!session&&session.accountId===account._id&&session.revokedAt===undefined&&session.expiresAt>args.now;
}});
export const revokeSession=internalMutation({args:{jti:v.string(),expiresAt:v.number()},handler:async(ctx,args)=>{const session=await ctx.db.query('sessions').withIndex('by_token',q=>q.eq('tokenId',args.jti)).unique();if(session&&session.revokedAt===undefined)await ctx.db.patch(session._id,{revokedAt:Date.now(),expiresAt:Math.max(args.expiresAt,session.expiresAt)});}});
export const createPasswordReset=internalMutation({args:{email:v.string(),tokenHash:v.string(),expiresAt:v.number()},handler:async(ctx,args)=>{
 const account=await ctx.db.query('accounts').withIndex('by_email',q=>q.eq('email',args.email)).unique();if(!account||account.disabledAt!==undefined)return null;
 const now=Date.now();for(const prior of await ctx.db.query('passwordResetTokens').withIndex('by_account',q=>q.eq('accountId',account._id)).collect())if(prior.consumedAt===undefined)await ctx.db.patch(prior._id,{consumedAt:now});
 await ctx.db.insert('passwordResetTokens',{accountId:account._id,tokenHash:args.tokenHash,expiresAt:args.expiresAt,createdAt:now});return {email:account.email};
}});
export const consumePasswordReset=internalMutation({args:{tokenHash:v.string(),passwordHash:v.string(),now:v.number()},handler:async(ctx,args)=>{
 const token=await ctx.db.query('passwordResetTokens').withIndex('by_token_hash',q=>q.eq('tokenHash',args.tokenHash)).unique();if(!token||token.consumedAt!==undefined||token.expiresAt<=args.now)throw new Error('RESET_TOKEN_INVALID');
 const account=await ctx.db.get(token.accountId);if(!account||account.disabledAt!==undefined)throw new Error('RESET_TOKEN_INVALID');
 await ctx.db.patch(account._id,{passwordHash:args.passwordHash,sessionVersion:account.sessionVersion+1,updatedAt:args.now,revision:(account.revision??1)+1});await ctx.db.patch(token._id,{consumedAt:args.now});
 for(const session of await ctx.db.query('sessions').withIndex('by_account',q=>q.eq('accountId',account._id)).collect())if(session.revokedAt===undefined)await ctx.db.patch(session._id,{revokedAt:args.now});return true;
}});
export const signatoryProfile=internalQuery({args:{id:v.id('accounts')},handler:async(ctx,args)=>{const account=await ctx.db.get(args.id);if(!account||account.disabledAt!==undefined)throw new Error('ACCOUNT_NOT_FOUND');return account.signatory??{firstName:'',lastName:'',capacity:''};}});
export const setSignatoryProfile=internalMutation({args:{id:v.id('accounts'),firstName:v.string(),lastName:v.string(),capacity:v.string(),signature:v.optional(v.union(signature,v.null()))},handler:async(ctx,{id,...args})=>{
 const account=await ctx.db.get(id);if(!account||account.disabledAt!==undefined)throw new Error('ACCOUNT_NOT_FOUND');
 const profile={firstName:args.firstName.trim(),lastName:args.lastName.trim(),capacity:args.capacity.trim()};if(Object.values(profile).some(v=>!v||v.length>100||/[\r\n\x00-\x1f]/.test(v)))throw new Error('INVALID_SIGNATORY');if(args.signature!=null&&!validSignature(args.signature))throw new Error('INVALID_SIGNATURE');
 const signature=args.signature===undefined?account.signatory?.signature:args.signature,saved={...profile,...(signature!==undefined?{signature}:{})};await ctx.db.patch(id,{signatory:saved,updatedAt:Date.now(),updatedBy:id,revision:(account.revision??1)+1});return saved;
}});
