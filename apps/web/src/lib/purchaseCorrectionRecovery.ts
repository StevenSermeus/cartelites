import { SubmittedAttempt } from './submittedAttempt';
import {
  correctionPlan,
  type CorrectionSnapshot,
  type CorrectionDraft,
} from './purchaseCorrection';

export type CorrectionContext = {
  snapshot: CorrectionSnapshot;
  rows: CorrectionDraft[];
  plan: ReturnType<typeof correctionPlan>;
};
export class PurchaseCorrectionRecovery extends SubmittedAttempt<
  { itemIds: string[] },
  CorrectionContext
> {
  prepareCorrection(purchaseId: string, snapshot: CorrectionSnapshot, rows: CorrectionDraft[]) {
    if (this.current) return this.current;
    const frozen = structuredClone({ snapshot, rows });
    const plan = correctionPlan(frozen.snapshot, frozen.rows);
    if (!plan.items.length && !plan.removedIds.length)
      throw new Error('Aucune modification à enregistrer.');
    return this.prepare(
      `/purchases/${encodeURIComponent(purchaseId)}/edit`,
      {
        expectedDigest: plan.expectedDigest,
        items: plan.items,
        removedIds: plan.removedIds,
      },
      { ...frozen, plan },
    );
  }
}
