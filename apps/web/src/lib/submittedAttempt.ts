export class RequestFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}
export type SubmissionState = 'idle' | 'unknown' | 'rejected' | 'confirmed';

/** A sent operation is immutable until acknowledged or explicitly rejected. */
export class SubmittedAttempt<Result, Context = undefined> {
  constructor(readonly accountId?: string) {}
  private executionVersion = 0;
  current: {
    path: string;
    body: string;
    context: Context;
    state: Exclude<SubmissionState, 'idle'>;
    unresolvedExecution: boolean;
    result?: Result;
  } | null = null;
  get state(): SubmissionState {
    return this.current?.state ?? 'idle';
  }
  prepare(path: string, payload: object, context: Context) {
    this.current ??= {
      path,
      body: JSON.stringify({ operationId: crypto.randomUUID(), ...payload }),
      context,
      state: 'unknown',
      unresolvedExecution: false,
    };
    return this.current;
  }
  async execute(request: <T>(path: string, init: RequestInit) => Promise<T>): Promise<Result> {
    (request as { assertActive?: () => void }).assertActive?.();
    if (this.accountId && (request as { accountId?: string | null }).accountId !== this.accountId)
      throw new Error('RECOVERY_ACCOUNT_MISMATCH');
    const current = this.current;
    if (!current) throw new Error('NO_SUBMITTED_ATTEMPT');
    if (current.state === 'confirmed') return current.result as Result;
    const executionVersion = ++this.executionVersion;
    current.state = 'unknown';
    try {
      const result = await request<Result>(current.path, {
        method: 'POST',
        body: current.body,
        ...(this.accountId ? { headers: { 'X-Expected-Account-ID': this.accountId } } : {}),
      });
      if (executionVersion !== this.executionVersion || this.current !== current)
        throw new Error('STALE_SUBMISSION_RESPONSE');
      current.result = result;
      current.state = 'confirmed';
      current.unresolvedExecution = false;
      return result;
    } catch (error) {
      if (executionVersion !== this.executionVersion || this.current !== current) throw error;
      // Timeouts, server failures and idempotency conflicts cannot prove non-commit.
      const businessRejection =
        error instanceof RequestFailure &&
        error.status === 409 &&
        /^(INVALID_|PAYMENT_EXCEEDS_BALANCE$|ITEM_UNAVAILABLE$|ITEM_UNAVAILABLE_AT_DATE$|ITEM_NOT_AVAILABLE$|ITEM_STATE_INVALID$|SALE_CONFLICT$|SALE_CANCELLED$|RETURN_BEFORE_DEPOSIT$|PRICE_BELOW_AGREEMENT$|SALE_BELOW_AGREED_PRICE$|SALE_BEFORE_|PURCHASE_NOT_|PURCHASE_CHANGED$|PURCHASE_ITEM_LOCKED$|PURCHASE_TOO_LARGE$|CONSIGNMENT_.*REQUIRED$|REVISION_CONFLICT$)/.test(
          error.code ?? '',
        );
      const definitiveRejection =
        error instanceof RequestFailure &&
        ([400, 401, 403, 404, 422, 429].includes(error.status) || businessRejection) &&
        !/IDEMPOT|REPLAY|OPERATION.*CONFLICT/.test(error.code ?? '');
      // A rejected recovery request says nothing about an earlier request whose
      // response was lost. Only the same operation's acknowledgement resolves it.
      if (definitiveRejection && !current.unresolvedExecution) current.state = 'rejected';
      else current.unresolvedExecution = true;
      throw error;
    }
  }
  release() {
    if (this.current?.state === 'unknown') throw new Error('UNRESOLVED_SUBMISSION');
    this.current = null;
  }
}

export type PendingPhoto<FileType> = {
  purchaseId: string;
  itemId: string;
  name: string;
  file: FileType;
  operationId: string;
};
export class PendingPurchasePhotos<FileType> {
  rows: PendingPhoto<FileType>[] = [];
  add(rows: Omit<PendingPhoto<FileType>, 'operationId'>[]) {
    this.rows.push(...rows.map((row) => ({ ...row, operationId: crypto.randomUUID() })));
  }
  async retry(upload: (itemId: string, file: FileType, operationId: string) => Promise<unknown>) {
    const failures: string[] = [];
    for (const row of [...this.rows]) {
      try {
        await upload(row.itemId, row.file, row.operationId);
        this.rows = this.rows.filter((value) => value !== row);
      } catch (error) {
        failures.push(
          `${row.name} : ${error instanceof Error ? error.message : 'Envoi impossible'}`,
        );
      }
    }
    return failures;
  }
}
