/** Memory-only recovery state. Never share anonymous state or another account's drafts. */
export class AccountMemory<T> {
  private accounts = new Map<string, Map<string, T>>();
  constructor(private create: () => T) {}
  forRequest(request: { accountId?: string }, key = ''): T {
    if (!request.accountId) return this.create();
    let account = this.accounts.get(request.accountId);
    if (!account) this.accounts.set(request.accountId, (account = new Map()));
    let value = account.get(key);
    if (value === undefined) account.set(key, (value = this.create()));
    return value;
  }
}
