import type { PurchaseDraft } from './apiRepository';

export type LocalPurchaseDraft = {
  buyerNote?: string;
  sellerNote?: string;
  id: string;
  clientId: string;
  clientName?: string;
  date: string;
  step: number;
  rows: PurchaseDraft[];
  updatedAt: number;
};
export type LocalPurchaseState = { activeId: string; drafts: LocalPurchaseDraft[] };
export function hasPurchaseContent(draft: LocalPurchaseDraft) {
  return !!draft.buyerNote?.trim() || !!draft.sellerNote?.trim() || !!draft.clientId || draft.rows.some(row => !!(row.name.trim() || row.cardSearch.trim() || row.photo || row.marketValue.trim()));
}
export function purchaseSnapshot(state: LocalPurchaseState) {
  return {
    activeId: state.activeId,
    drafts: state.drafts.filter(hasPurchaseContent).map(draft => ({
      ...draft,
      rows: draft.rows.map(row => ({ ...row, searching: false, cardResults: [] })),
    })),
  };
}
export function updateLocalPurchase<K extends 'clientId' | 'clientName' | 'date' | 'step' | 'rows' | 'buyerNote' | 'sellerNote'>(
  state: LocalPurchaseState, key: K,
  value: LocalPurchaseDraft[K] | ((previous: LocalPurchaseDraft[K]) => LocalPurchaseDraft[K]),
): LocalPurchaseState {
  return { ...state, drafts: state.drafts.map(draft => draft.id !== state.activeId ? draft : {
    ...draft, ...(key === 'clientId' ? { clientName: undefined } : {}), [key]: typeof value === 'function' ? value(draft[key]) : value, updatedAt: Date.now(),
  }) };
}
export function readPurchaseSnapshot(raw: string): { revision: number; state: LocalPurchaseState } {
  const parsed = JSON.parse(raw);
  if (parsed.version !== 1 || !Number.isSafeInteger(parsed.revision) || !Array.isArray(parsed.state?.drafts)) throw new Error('Sauvegarde de rachats invalide.');
  for (const draft of parsed.state.drafts) {
    if (typeof draft.id !== 'string' || typeof draft.clientId !== 'string' || typeof draft.date !== 'string' || !Array.isArray(draft.rows) || !Number.isInteger(draft.step) || draft.step < 0 || draft.step > 2) throw new Error('Brouillon de rachat invalide.');
    for (const row of draft.rows) {
      if (!['key', 'name', 'series', 'identifier', 'marketValue', 'discountPercent', 'askingPrice', 'cardSearch'].every(key => typeof row[key] === 'string')) throw new Error('Carte du brouillon invalide.');
    }
  }
  return { revision: parsed.revision, state: parsed.state };
}
