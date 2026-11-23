export type TicketEmailStatus = 'idle' | 'unknown' | 'failed' | 'accepted' | 'stale';
export type TicketEmailIntent = {
  ticketId: string; operationId: string; recipient: string;
  status: Exclude<TicketEmailStatus, 'idle'>; uncertain: boolean;
};

/** Freeze the destination and idempotency key until the outcome is known. */
export class SaleTicketEmailAttempt {
  private intent: TicketEmailIntent | null = null;
  get status(): TicketEmailStatus { return this.intent?.status ?? 'idle'; }
  snapshot(): TicketEmailIntent | null { return this.intent ? {...this.intent} : null; }
  restore(intent: TicketEmailIntent) { this.intent = {...intent}; }
  prepare(ticketId: string, recipient: string) {
    if (!this.intent || this.status === 'accepted') this.intent = {
      ticketId, recipient: recipient.trim(), operationId: crypto.randomUUID(), status: 'unknown', uncertain: false,
    };
    this.intent.status = 'unknown';
    return {path: `/sale-tickets/${encodeURIComponent(this.intent.ticketId)}/email`,
      body: JSON.stringify({operationId: this.intent.operationId, recipient: this.intent.recipient})};
  }
  resolve(status: string) {
    if (!this.intent) return;
    this.intent.status = status === 'accepted' || status === 'failed' ? status : 'unknown';
    this.intent.uncertain = this.status === 'unknown';
  }
  reject(error: unknown) {
    if (!this.intent) return;
    const code = error instanceof Error ? error.message : '';
    if (code === 'EMAIL_DELIVERY_FAILED') this.intent.status = 'failed';
    else if (!this.intent.uncertain && code === 'TICKET_STALE') this.intent.status = 'stale';
    else if (!this.intent.uncertain && ['EMAIL_DELIVERY_UNAVAILABLE', 'INVALID_EMAIL'].includes(code)) this.intent.status = 'failed';
    else this.intent.status = 'unknown';
    this.intent.uncertain = this.status === 'unknown';
  }
  releaseStale() {
    if (this.status !== 'stale' || this.intent?.uncertain) throw new Error('EMAIL_RELEASE_REQUIRES_STALE_TICKET');
    this.intent = null;
  }
  retryFailed() {
    if (this.status !== 'failed') throw new Error('EMAIL_RETRY_REQUIRES_CONFIRMED_FAILURE');
    this.intent = null;
  }
}
