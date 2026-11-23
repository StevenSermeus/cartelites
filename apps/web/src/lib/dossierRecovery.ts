import { AccountRecoveryVault } from './accountScope';

/** A pending operation belongs to both its authenticated account and its dossier. */
export class DossierRecoveryVault<T> {
  private readonly vault: AccountRecoveryVault<Map<string, T>>;
  constructor(
    private readonly create: (accountId?: string) => T,
    pending: (value: T) => boolean,
  ) {
    this.vault = new AccountRecoveryVault((values) => [...values.values()].some(pending));
  }
  forRequest(request: { accountId?: string | null }, dossierId: string): T {
    if (!request.accountId) return this.create();
    const values = this.vault.forAccount(request.accountId, () => new Map<string, T>());
    if (!values.has(dossierId)) values.set(dossierId, this.create(request.accountId));
    return values.get(dossierId)!;
  }
}
