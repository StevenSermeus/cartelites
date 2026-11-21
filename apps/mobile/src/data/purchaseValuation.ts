import type { PurchaseDraft } from './apiRepository';
import { parsePriceInput } from './productProfit';
export function purchaseValuation(rows: PurchaseDraft[]) {
  let marketCents = 0,
    purchaseCents = 0;
  for (const row of rows.filter((r) => r.included)) {
    const market = parsePriceInput(row.marketValue),
      percentBps = parsePriceInput(row.discountPercent);
    if (market === null || percentBps === null || percentBps > 10000) return null;
    marketCents += market;
    purchaseCents += Math.round((market * percentBps) / 10000);
    if (!Number.isSafeInteger(marketCents) || !Number.isSafeInteger(purchaseCents)) return null;
  }
  return { marketCents, purchaseCents, theoreticalGainCents: marketCents - purchaseCents };
}
export function applyPurchasePercent(rows: PurchaseDraft[], keys: string[], value: string) {
  const bps = parsePriceInput(value);
  if (bps === null || bps > 10000)
    throw new Error('Indiquez un pourcentage entre 0 et 100, avec deux décimales maximum.');
  const selected = new Set(keys);
  return rows.map((row) =>
    row.included && selected.has(row.key)
      ? { ...row, discountPercent: (bps / 100).toString() }
      : row,
  );
}
