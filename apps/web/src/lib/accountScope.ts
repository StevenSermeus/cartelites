export type AccountRequest = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
export type AccountBoundRequest = AccountRequest & {
  readonly accountId: string | null;
  readonly assertActive: () => void;
};
export type ScopedRequestInit = RequestInit & { assertAccountScope?: () => void };

export class AccountScopeChanged extends Error {
  constructor() {
    super('ACCOUNT_SCOPE_CHANGED');
  }
}

/** Epochs prevent old async completions from reviving after logout and re-login. */
export class AccountSession {
  private accountId: string | null = null;
  private epoch = 0;
  select(accountId: string | null) {
    if (this.accountId !== accountId) {
      this.accountId = accountId;
      this.epoch++;
    }
    return this.epoch;
  }
  scope(accountId: string | null) {
    const epoch = this.epoch;
    const assertActive = () => {
      if (this.accountId !== accountId || this.epoch !== epoch) throw new AccountScopeChanged();
    };
    return {
      accountId,
      assertActive,
      headers(input?: HeadersInit) {
        assertActive();
        const headers = new Headers(input);
        if (accountId) headers.set('X-Expected-Account-ID', accountId);
        return headers;
      },
      bind(request: AccountRequest, onMismatch: () => void): AccountBoundRequest {
        const scoped: AccountRequest = async <T>(path: string, init: RequestInit = {}) => {
          assertActive();
          if (!accountId && !path.startsWith('/auth/')) throw new AccountScopeChanged();
          const headers = new Headers(init.headers);
          if (accountId) headers.set('X-Expected-Account-ID', accountId);
          try {
            const guardedInit: ScopedRequestInit = {
              ...init,
              headers,
              assertAccountScope: assertActive,
            };
            const result = await request<T>(path, guardedInit);
            assertActive();
            return result;
          } catch (error) {
            assertActive();
            if (
              error instanceof Error &&
              [
                'ACCOUNT_MISMATCH',
                'UNAUTHENTICATED',
                'INVALID_SESSION',
                'ACCOUNT_DISABLED',
              ].includes(error.message)
            )
              onMismatch();
            throw error;
          }
        };
        Object.defineProperty(scoped, 'accountId', { value: accountId, writable: false });
        Object.defineProperty(scoped, 'assertActive', { value: assertActive, writable: false });
        return scoped as AccountBoundRequest;
      },
    };
  }
}

/** Browser-memory only: pending work survives a scoped remount, never changes owner. */
const retainedWorkChecks = new Set<() => boolean>();
export const hasRetainedAccountWork = () => [...retainedWorkChecks].some((check) => check());
export class AccountRecoveryVault<T> {
  private accounts = new Map<string, T>();
  constructor(pending: (value: T) => boolean = () => false) {
    retainedWorkChecks.add(() => [...this.accounts.values()].some(pending));
  }
  forAccount(accountId: string, create: () => T): T {
    if (!accountId) throw new Error('RECOVERY_ACCOUNT_REQUIRED');
    if (!this.accounts.has(accountId)) this.accounts.set(accountId, create());
    return this.accounts.get(accountId)!;
  }
}
