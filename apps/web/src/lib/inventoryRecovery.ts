import { SubmittedAttempt } from './submittedAttempt';
import type { AccountBoundRequest, AccountRequest } from './accountScope';

export type InventoryKind = 'receive' | 'gift' | 'open' | 'reverse';
export type EvidenceTarget = { supplierReceiptId?: string; giftId?: string };
type InventoryContext<FileType> = {
  kind: InventoryKind;
  file: FileType | null;
  attachmentId: string;
  target: EvidenceTarget | null;
};

/** One stock movement and its follow-ups; refresh/upload failure never recreates it. */
export class InventoryRecovery<FileType> {
  readonly attempt: SubmittedAttempt<{ result: unknown }, InventoryContext<FileType>>;
  constructor(accountId?: string) {
    this.attempt = new SubmittedAttempt(accountId);
  }
  get state() {
    return this.attempt.state;
  }
  get context() {
    return this.attempt.current?.context;
  }
  prepare(kind: InventoryKind, path: string, payload: object, file: FileType | null) {
    if (this.attempt.current) throw new Error('INVENTORY_RECOVERY_REQUIRED');
    this.attempt.prepare(path, payload, {
      kind,
      file,
      attachmentId: crypto.randomUUID(),
      target: null,
    });
  }
  async execute(request: AccountRequest) {
    const response = await this.attempt.execute(request);
    (request as Partial<AccountBoundRequest>).assertActive?.();
    const context = this.context!;
    if (context.kind === 'receive')
      context.target = { supplierReceiptId: (response.result as { id: string }).id };
    if (context.kind === 'gift') context.target = { giftId: response.result as string };
    return response.result;
  }
  async saveEvidence(
    upload: (target: EvidenceTarget, file: FileType, operationId: string) => Promise<void>,
    assertActive: () => void,
  ) {
    assertActive();
    const context = this.context;
    if (!context?.file) return;
    if (this.state !== 'confirmed' || !context.target)
      throw new Error('INVENTORY_CONFIRMATION_REQUIRED');
    await upload(context.target, context.file, context.attachmentId);
    assertActive();
    context.file = null;
  }
  release() {
    if (this.state === 'confirmed' && this.context?.file)
      throw new Error('INVENTORY_EVIDENCE_PENDING');
    this.attempt.release();
  }
}
