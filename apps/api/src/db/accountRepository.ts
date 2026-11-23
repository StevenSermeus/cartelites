import { serverShopConfig } from '../generated/serverShopConfig.js';
import type { Signature } from '../receipts/signature.js';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { env } from '../env.js';

export type SignatoryProfile = { firstName: string; lastName: string; capacity: string; signature?: Signature | null };

export type Account = {
  id: string;
  email: string;
  passwordHash: string;
  sessionVersion: number;
  createdAt: number;
};
type AuthOperation =
  | 'startSession'
  | 'accountByEmail'
  | 'accountById'
  | 'signatoryProfile'
  | 'setSignatoryProfile'
  | 'signupEnabled'
  | 'setSignupEnabled'
  | 'createAccount'
  | 'startLoginAttempt'
  | 'clearLoginAttempts'
  | 'revokeSession'
  | 'sessionIsValid'
  | 'createPasswordReset'
  | 'consumePasswordReset';
const execute = makeFunctionReference<'action'>('authService:execute');

export class ConvexAccountRepository {
  private readonly client = new ConvexHttpClient(env.CONVEX_URL);

  private call<T>(operation: AuthOperation, payload: Record<string, unknown>): Promise<T> {
    return this.client.action(execute, {
      secret: env.CONVEX_AUTH_SECRET,
      operation,
      payload,
    } as never) as Promise<T>;
  }

  async byEmail(email: string): Promise<Account | null> {
    const row = await this.call<(Omit<Account, 'id'> & { _id: string }) | null>('accountByEmail', {
      email,
    });
    return row
      ? {
          id: row._id,
          email: row.email,
          passwordHash: row.passwordHash,
          sessionVersion: row.sessionVersion ?? 0,
          createdAt: row.createdAt,
        }
      : null;
  }

  async byId(id: string): Promise<Account | null> {
    const row = await this.call<(Omit<Account, 'id'> & { _id: string }) | null>('accountById', {
      id,
    });
    return row
      ? {
          id: row._id,
          email: row.email,
          passwordHash: row.passwordHash,
          sessionVersion: row.sessionVersion ?? 0,
          createdAt: row.createdAt,
        }
      : null;
  }

  async signatoryProfile(id: string): Promise<SignatoryProfile> {
    return this.call('signatoryProfile', { id });
  }

  async setSignatoryProfile(id: string, profile: SignatoryProfile): Promise<SignatoryProfile> {
    return this.call('setSignatoryProfile', { id, ...profile });
  }

  async isSignupEnabled(): Promise<boolean> {
    return serverShopConfig.registrationPolicy === 'open';
  }

  async setSignupEnabled(enabled: boolean): Promise<void> {
    if (enabled !== (serverShopConfig.registrationPolicy === 'open')) throw new Error('REGISTRATION_CONFIG_MANAGED');
  }

  async create(email: string, passwordHash: string): Promise<Account> {
    const row = await this.call<Account>('createAccount', { email, passwordHash, registrationPolicy: serverShopConfig.registrationPolicy });
    return row;
  }

  async canAttemptLogin(emailHash: string): Promise<boolean> {
    return this.call<boolean>('startLoginAttempt', { emailHash, now: Date.now() });
  }

  async clearLoginFailures(emailHash: string): Promise<void> {
    await this.call('clearLoginAttempts', { emailHash });
  }

  async registerSession(session: { subject: string; jti: string; sessionVersion: number; expiresAt: number }): Promise<void> {
    if (env.DATA_MODEL !== 'canonical') return;
    await this.call('startSession', { id: session.subject, jti: session.jti, sessionVersion: session.sessionVersion, expiresAt: session.expiresAt, now: Date.now() });
  }

  async revokeJti(jti: string, expiresAt: number): Promise<void> {
    await this.call('revokeSession', { jti, expiresAt });
  }

  async isSessionValid(id: string, jti: string, sessionVersion: number): Promise<boolean> {
    return this.call<boolean>('sessionIsValid', { id, jti, sessionVersion, now: Date.now() });
  }

  async createPasswordReset(email: string, tokenHash: string, expiresAt: number) {
    return this.call<{ email: string } | null>('createPasswordReset', {
      email,
      tokenHash,
      expiresAt,
    });
  }

  async consumePasswordReset(tokenHash: string, passwordHash: string) {
    return this.call<boolean>('consumePasswordReset', {
      tokenHash,
      passwordHash,
      now: Date.now(),
    });
  }
}
