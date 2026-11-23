export function parsePriceInput(value: string): number | null {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const amount = Math.round(Number(value.trim().replace(',', '.')) * 100);
  return Number.isSafeInteger(amount) ? amount : null;
}

/** Supplier goods: acquisition cost is HT; the displayed selling price is TTC. */
export function productProfit(cost: number | null | undefined, price: number, rate: number, quantity: number) {
  if(cost==null)return null;
  if (
    ![cost, price, rate, quantity].every(Number.isSafeInteger) ||
    cost < 0 ||
    price < 0 ||
    rate < 0 ||
    rate > 10000 ||
    quantity < 1 ||
    !Number.isSafeInteger(price * quantity) ||
    !Number.isSafeInteger(cost * quantity)
  )
    return null;
  // Match sale accounting: subtract rounded VAT (including half-cent boundaries).
  const netSale = (gross: number) =>
    gross -
    Number(
      (BigInt(gross) * BigInt(rate) * 2n + BigInt(10000 + rate)) / (2n * BigInt(10000 + rate)),
    );
  const netCents = netSale(price);
  const profitCents = netCents - cost;
  return {
    netCents,
    profitCents,
    marginPercent: netCents > 0 ? (profitCents / netCents) * 100 : null,
    totalProfitCents: netSale(price * quantity) - cost * quantity,
  };
}

/** Round upwards so the suggested TTC price meets the requested margin on HT revenue. */
export function priceForMargin(cost: number | null | undefined, rate: number, marginPercent: number): number | null {
  if(cost==null)return null;
  if (
    ![cost, rate, marginPercent].every(Number.isSafeInteger) ||
    cost < 0 ||
    rate < 0 ||
    rate > 10000 ||
    marginPercent < 0 ||
    marginPercent >= 100
  )
    return null;
  const denominator = BigInt(100 - marginPercent);
  const net = (BigInt(cost) * 100n + denominator - 1n) / denominator;
  const gross = (net * BigInt(10000 + rate) + 9999n) / 10000n;
  const value = Number(gross);
  return Number.isSafeInteger(value) ? value : null;
}
