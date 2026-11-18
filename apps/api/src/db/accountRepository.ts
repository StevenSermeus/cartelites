import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { env } from '../env.js';

export type Account = {
  id: string;
  email: string;
  passwordHash: string;
  sessionVersion: number;
  createdAt: number;
};
type AuthOperation =
  | 'accountByEmail'
  | 'accountById'
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

  async isSignupEnabled(): Promise<boolean> {
    return this.call<boolean>('signupEnabled', {});
  }

  async setSignupEnabled(enabled: boolean): Promise<void> {
    await this.call('setSignupEnabled', { enabled, now: Date.now() });
  }

  async create(email: string, passwordHash: string): Promise<Account> {
    const row = await this.call<Account>('createAccount', { email, passwordHash });
    return row;
  }

  async canAttemptLogin(emailHash: string): Promise<boolean> {
    return this.call<boolean>('startLoginAttempt', { emailHash, now: Date.now() });
  }

  async clearLoginFailures(emailHash: string): Promise<void> {
    await this.call('clearLoginAttempts', { emailHash });
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
