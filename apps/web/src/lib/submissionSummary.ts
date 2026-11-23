export type FrozenSummary = {
  label: string;
  reference?: string;
  party?: string;
  quantity?: number;
  totalCents?: number;
  occurredAt?: number;
};
type Pending = { path: string; body: string; context?: unknown } | null;
const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;
const integer = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const sum = (values: (number | undefined)[]) =>
  values.some((value) => value === undefined)
    ? undefined
    : integer(values.reduce<number>((total, value) => total + (value ?? 0), 0));

/** Only the immutable sent body/context is accepted, never the current editable draft. */
export function submissionSummary(pending: Pending): FrozenSummary | null {
  if (!pending) return null;
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(pending.body);
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object') return null;
  const items = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
  const context = pending.context as { client?: { name?: string } } | undefined;
  const base = { reference: text(body.reference), occurredAt: integer(body.occurredAt) };
  if (pending.path === '/purchases')
    return {
      ...base,
      label: 'Rachat soumis',
      party: text(context?.client?.name),
      quantity: items.length,
      totalCents: sum(items.map((item) => integer(item.purchasePriceCents))),
    };
  if (pending.path === '/sales/bulk')
    return {
      ...base,
      label: 'Vente soumise',
      quantity: sum(
        items.map((item) => (item.quantity === undefined ? 1 : integer(item.quantity))),
      ),
      totalCents: sum(items.map((item) => integer(item.salePriceCents))),
    };
  if (pending.path === '/sales/payment')
    return {label:'Encaissement soumis',reference:text(body.saleId),party:text((pending.context as {name?:string})?.name),totalCents:sum([integer(body.cashCents),integer(body.transferCents)]),occurredAt:integer(body.receivedAt)};
  if (pending.path === '/sales/cancel')
    return {label:'Annulation de vente soumise',reference:text(body.saleId),party:text((pending.context as {name?:string})?.name)};
  if (pending.path === '/consignments/payments')
    return { ...base, label: 'Versement soumis', totalCents: integer(body.amountCents) };
  if (pending.path === '/consignments')
    return {
      ...base,
      label: 'Dépôt soumis · prix convenus',
      quantity: items.length,
      totalCents: sum(items.map((item) => integer(item.askingPriceCents))),
    };
  if (pending.path === '/consignments/terms')
    return {
      ...base,
      label: 'Accord soumis',
      totalCents: integer(body.askingPriceCents),
      reference: text(body.itemId),
    };
  if (pending.path === '/supplier-receipts') {
    const lines = Array.isArray(body.lines) ? (body.lines as Record<string, unknown>[]) : [];
    return {
      ...base,
      label: 'Réception fournisseur soumise',
      party: text(body.supplier),
      quantity: sum(lines.map((line) => integer(line.quantity))),
      totalCents: sum(
        lines.map((line) => {
          const quantity = integer(line.quantity),
            cost = integer(line.unitCostCents);
          return quantity === undefined || cost === undefined
            ? undefined
            : integer(quantity * cost);
        }),
      ),
    };
  }
  if (pending.path === '/stock/donate')
    return {
      ...base,
      label: 'Don soumis',
      quantity: integer(body.quantity),
      party: text(body.recipient),
      reference: text(body.reason),
    };
  if (pending.path === '/stock/open')
    return { ...base, label: 'Ouverture de display soumise', quantity: integer(body.quantity) };
  if (pending.path === '/stock/reverse')
    return {
      ...base,
      label: body.giftId ? 'Annulation de don soumise' : 'Annulation d’ouverture soumise',
      reference: text(body.giftId ?? body.openingId),
    };
  return { ...base, label: 'Opération soumise' };
}

export function formatSubmissionSummary(
  summary: FrozenSummary | null,
  currency: string,
  timeZone: string,
) {
  if (!summary) return '';
  return [
    summary.label,
    summary.reference,
    summary.party,
    summary.quantity === undefined ? undefined : `${summary.quantity} article(s)`,
    summary.totalCents === undefined
      ? undefined
      : new Intl.NumberFormat('fr-BE', { style: 'currency', currency }).format(
          summary.totalCents / 100,
        ),
    summary.occurredAt === undefined
      ? undefined
      : new Intl.DateTimeFormat('fr-BE', {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone,
        }).format(summary.occurredAt),
  ]
    .filter(Boolean)
    .join(' · ');
}
