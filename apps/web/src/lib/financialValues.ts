export type OptionalCents = number | null | undefined;
export const knownCents = (value: OptionalCents): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);
/** Null is missing accounting evidence. It must never enter JS arithmetic as zero. */
export const moneyCell = (value: OptionalCents): number | '' =>
  knownCents(value) ? value / 100 : '';
export const moneyDifference = (revenue: OptionalCents, cost: OptionalCents): number | null =>
  knownCents(revenue) && knownCents(cost) && Number.isSafeInteger(revenue - cost)
    ? revenue - cost
    : null;
export function completeCostTotal(values: readonly OptionalCents[]): number | null {
  if (values.some((value) => !knownCents(value))) return null;
  const result = (values as number[]).reduce((total, value) => total + value, 0);
  return Number.isSafeInteger(result) ? result : null;
}
export function allocatedSaleCost(sale: {
  costCents?: number | null;
  purchasePriceCents?: number | null;
}): number | null {
  const value = sale.costCents !== undefined ? sale.costCents : sale.purchasePriceCents;
  return knownCents(value) ? value : null;
}
export type ValuationLot = { remainingQuantity?: number; remaining?: number; remainingCostCents: number | null };
export function stockValuation(
  item: { quantity?: number; askingPriceCents?: number | null },
  lots: readonly ValuationLot[],
) {
  const validQuantity = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  // The legacy API calls this `remaining`; canonical lots expose `remainingQuantity`.
  const quantities = lots.map(lot => lot.remainingQuantity ?? lot.remaining);
  const rawQuantity = quantities.every(validQuantity) ? (quantities as number[]).reduce((sum,value)=>sum+value,0) : null;
  const lotQuantity = validQuantity(rawQuantity) ? rawQuantity : null;
  const quantity = validQuantity(item.quantity) ? item.quantity : lots.length ? lotQuantity : null;
  const remainingCostCents =
    quantity !== null && lotQuantity === quantity
      ? completeCostTotal(
          lots.filter((lot,index) => (quantities[index] ?? 0) > 0).map((lot) => lot.remainingCostCents),
        )
      : null;
  const unitAskingPriceCents = knownCents(item.askingPriceCents) ? item.askingPriceCents : null;
  const totalAskingPriceCents =
    quantity === null ||
    unitAskingPriceCents === null ||
    !Number.isSafeInteger(quantity * unitAskingPriceCents)
      ? null
      : quantity * unitAskingPriceCents;
  return { quantity, remainingCostCents, unitAskingPriceCents, totalAskingPriceCents };
}
