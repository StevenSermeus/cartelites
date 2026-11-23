import {SaleTicketEmailAttempt, type TicketEmailIntent} from './saleTicketEmailAttempt';
import type {AccountRequest} from './accountScope';
export type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem'>;
const unavailable = () => new Error('La reprise de l’envoi ne peut pas être conservée dans cet onglet. Aucun nouvel envoi effectué.');
function valid(value: unknown): value is TicketEmailIntent {
  if (!value || typeof value !== 'object') return false;
  const v = value as TicketEmailIntent;
  return typeof v.ticketId === 'string' && !!v.ticketId && typeof v.operationId === 'string' && !!v.operationId &&
    typeof v.recipient === 'string' && !!v.recipient && ['unknown','failed','accepted','stale'].includes(v.status) && typeof v.uncertain === 'boolean';
}
function history(ticketId: string, value: unknown): TicketEmailIntent[] {
  if (!value || typeof value !== 'object' || !('emails' in value) || !Array.isArray(value.emails))
    throw new Error('Historique des envois indisponible. Aucun nouvel envoi effectué.');
  return value.emails.map((row: unknown) => {
    if (!row || typeof row !== 'object') throw new Error('Historique des envois incomplet.');
    const e = row as Record<string, unknown>;
    const state = e.status ?? e.state;
    const status = state === 'accepted' || state === 'failed' ? state : 'unknown';
    const intent = {ticketId, operationId: e.operationId ?? e.attemptKey, recipient: e.recipient, status, uncertain: status === 'unknown'};
    if (!valid(intent)) throw new Error('Historique des envois incomplet. Aucun nouvel envoi effectué.');
    return intent;
  });
}

/** One outstanding intent per account. Only recovery metadata is retained, never PDF bytes. */
export class TicketEmailRecovery {
  readonly attempt = new SaleTicketEmailAttempt();
  private listeners = new Set<() => void>();
  private revision = 0;
  private executing = false;
  private restoreError = false;
  constructor(private storage: RecoveryStorage, private key: string) {
    try {
      const raw = storage.getItem(key);
      if (raw) {
        const value = JSON.parse(raw);
        if (value !== null) {
          if (!valid(value)) throw new Error();
          this.attempt.restore({...value, uncertain: value.status === 'unknown' || value.uncertain});
        }
      }
    } catch { this.restoreError = true; }
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getRevision = () => this.revision;
  get pending() { const row = this.attempt.snapshot(); return row && row.status !== 'accepted' ? row : null; }
  private save() {
    if (this.restoreError) throw unavailable();
    try { this.storage.setItem(this.key, JSON.stringify(this.attempt.snapshot())); }
    catch { throw unavailable(); }
    this.revision++;
    for (const listener of this.listeners) listener();
  }
  releaseStale() { this.attempt.releaseStale(); this.save(); }
  async send(request: AccountRequest, ticketId: string, recipient: string, retryFailed = false) {
    if (this.executing) throw new Error('Une vérification de cet envoi est déjà en cours.');
    if (this.restoreError) throw unavailable();
    this.executing = true;
    try {
      const before = this.pending;
      const selected = before?.ticketId ?? ticketId;
      const entries = history(selected, await request(`/sale-tickets/${encodeURIComponent(selected)}`));
      const matched = before && entries.find(e => e.operationId === before.operationId);
      if (matched && matched.recipient !== before.recipient) throw new Error('Destination de reprise incohérente. Aucun nouvel envoi effectué.');
      if (matched && before.status === 'unknown' && matched.status !== 'unknown') {
        this.attempt.restore(matched); this.save(); return this.attempt.status;
      }
      const otherUnknown = entries.find(e => e.status === 'unknown' && e.operationId !== before?.operationId);
      if (!before && otherUnknown) {
        this.attempt.restore(otherUnknown); this.save(); return this.attempt.status;
      }
      if (before && otherUnknown) throw new Error('Plusieurs tentatives restent incertaines. Vérifiez les envois avant tout nouvel envoi.');
      if (before?.ticketId !== undefined && before.ticketId !== ticketId) return this.attempt.status;
      if (this.attempt.status === 'stale') return 'stale';
      if (this.attempt.status === 'failed') {
        if (!retryFailed) return 'failed';
        this.attempt.retryFailed();
      }
      const attempt = this.attempt.prepare(ticketId, recipient);
      // A reload between this durable write and the response is conservatively uncertain.
      this.save();
      try {
        const result = await request<{status: string}>(attempt.path, {method:'POST', body:attempt.body});
        this.attempt.resolve(result.status);
      } catch (error) { this.attempt.reject(error); this.save(); throw error; }
      this.save();
      return this.attempt.status;
    } finally { this.executing = false; }
  }
}
const stores = new Map<string, TicketEmailRecovery>();
export function ticketEmailRecovery(request: {accountId?: string | null}) {
  const accountId = request.accountId;
  if (!accountId) throw new Error('Compte requis pour la reprise des envois.');
  let store = stores.get(accountId);
  if (!store) {
    const storage: RecoveryStorage = {
      getItem: key => window.sessionStorage.getItem(key),
      setItem: (key, value) => window.sessionStorage.setItem(key, value),
    };
    store = new TicketEmailRecovery(storage, `cartelites:ticket-email:v1:${encodeURIComponent(accountId)}`);
    stores.set(accountId, store);
  }
  return store;
}
