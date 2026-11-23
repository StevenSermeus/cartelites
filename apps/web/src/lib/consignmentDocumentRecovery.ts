import { SubmittedAttempt } from './submittedAttempt';
export type ReturnSubmission = {
  consignmentId: string;
  itemIds: string[];
  occurredAt: number;
  conditionNotes: string;
};
export type ReturnContext = {
  reference: string;
  sellerName: string;
  itemNames: string[];
  occurredAt: number;
  conditionNotes: string;
};
export class ConsignmentDocumentRecovery {
  readonly returns: SubmittedAttempt<{ id: string }, ReturnContext>;
  readonly statement: SubmittedAttempt<{ id: string }, { reference: string; sellerName: string }>;
  constructor(accountId?: string) {
    this.returns = new SubmittedAttempt(accountId);
    this.statement = new SubmittedAttempt(accountId);
  }
  prepareReturn(payload: ReturnSubmission, context: ReturnContext) {
    return this.returns.prepare('/consignments/returns/prepare', payload, structuredClone(context));
  }
  prepareStatement(sellerId: string, context: { reference: string; sellerName: string }) {
    return this.statement.prepare(
      '/consignments/documents/statement',
      { sellerId },
      structuredClone(context),
    );
  }
}
