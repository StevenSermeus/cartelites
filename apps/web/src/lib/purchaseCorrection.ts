export type CorrectionLine = {
  itemId?: string;
  operationId: string;
  name: string;
  tcg?: 'pokemon' | 'riftbound' | 'other';
  language?: 'fr' | 'en' | 'ja' | 'zh';
  condition?: 'M' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';
  series?: string;
  identifier?: string;
  catalogueImageUrl?: string;
  gradingCompany?: string;
  gradingGrade?: string;
  gradingCertificate?: string;
  gradingNotes?: string;
  marketValueCents: number;
  discountPercent: number;
  askingPriceCents?: number;
};
export type CorrectionItem = Omit<
  CorrectionLine,
  'itemId' | 'operationId' | 'marketValueCents' | 'discountPercent'
> & {
  _id: string;
  operationId?: string;
  marketValueCents?: number;
  discountPercent?: number;
  purchasePriceCents: number | null;
  status: string;
};
export type CorrectionDraft = CorrectionLine & {
  key: string;
  marketInput: string;
  percentInput: string;
  askingInput: string;
};
export type CorrectionSnapshot = {
  purchase: { _id: string; reference: string; status: string; sellerName?: string };
  items: CorrectionItem[];
  lockedIds: string[];
  expectedDigest: string;
};
/** Decimal input becomes integer cents without accepting exponents or rounding extra decimals. */
export function correctionCents(value: string): number {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error('Saisissez un montant positif ou nul avec deux décimales maximum.');
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new Error('Le montant dépasse la précision autorisée.');
  return cents;
}
export const correctionAmount = (cents: number) => (cents / 100).toFixed(2);
function historicalCost(item: CorrectionItem): number {
  if (
    item.purchasePriceCents == null ||
    !Number.isSafeInteger(item.purchasePriceCents) ||
    item.purchasePriceCents < 0
  )
    throw new Error(
      `Le coût historique de « ${item.name} » est inconnu. La correction exige de réconcilier ce coût avant de calculer les totaux.`,
    );
  return item.purchasePriceCents;
}
export function correctionDraft(item: CorrectionItem): CorrectionDraft {
  const market = item.marketValueCents ?? historicalCost(item);
  historicalCost(item);
  const percent = item.discountPercent ?? 100;
  return {
    key: item._id,
    itemId: item._id,
    operationId: crypto.randomUUID(),
    name: item.name,
    tcg: item.tcg,
    language: item.language,
    condition: item.condition,
    series: item.series,
    identifier: item.identifier,
    catalogueImageUrl: item.catalogueImageUrl,
    gradingCompany: item.gradingCompany,
    gradingGrade: item.gradingGrade,
    gradingCertificate: item.gradingCertificate,
    gradingNotes: item.gradingNotes,
    marketValueCents: market,
    discountPercent: percent,
    askingPriceCents: item.askingPriceCents,
    marketInput: correctionAmount(market),
    percentInput: String(percent),
    askingInput: item.askingPriceCents === undefined ? '' : correctionAmount(item.askingPriceCents),
  };
}
export function newCorrectionDraft(): CorrectionDraft {
  const key = crypto.randomUUID();
  return {
    key,
    operationId: key,
    name: '',
    tcg: 'pokemon',
    language: 'fr',
    marketValueCents: 0,
    discountPercent: 70,
    marketInput: '',
    percentInput: '70',
    askingInput: '',
  };
}
export function correctionLine(row: CorrectionDraft): CorrectionLine {
  if (!row.name.trim() || row.name.trim().length > 300)
    throw new Error('Chaque carte doit avoir un nom de 1 à 300 caractères.');
  const percentText = row.percentInput.trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(percentText))
    throw new Error('Le pourcentage doit être compris entre 0 et 100.');
  const percent = Number(percentText);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100)
    throw new Error('Le pourcentage doit être compris entre 0 et 100.');
  const market = correctionCents(row.marketInput);
  if (!Number.isSafeInteger(Math.round((market * percent) / 100)))
    throw new Error('Montant de rachat invalide.');
  if (row.catalogueImageUrl) {
    let url: URL;
    try {
      url = new URL(row.catalogueImageUrl);
    } catch {
      throw new Error('L’adresse de l’image catalogue est invalide.');
    }
    if (!['https:', 'http:'].includes(url.protocol))
      throw new Error('L’adresse de l’image catalogue doit utiliser HTTP ou HTTPS.');
  }
  for (const [value, limit, label] of [
    [row.series, 300, 'série'],
    [row.identifier, 100, 'numéro'],
    [row.gradingCompany, 100, 'société'],
    [row.gradingGrade, 32, 'note'],
    [row.gradingCertificate, 64, 'certificat'],
    [row.gradingNotes, 500, 'notes de gradation'],
  ] as const)
    if ((value?.length ?? 0) > limit)
      throw new Error(`Le champ ${label} dépasse ${limit} caractères.`);
  const optional = (value?: string) => value?.trim() || undefined;
  return {
    itemId: row.itemId,
    operationId: row.operationId,
    name: row.name.trim(),
    tcg: row.tcg,
    language: row.language,
    condition: row.condition,
    series: row.series === undefined ? undefined : row.series.trim(),
    identifier: row.identifier === undefined ? undefined : row.identifier.trim(),
    catalogueImageUrl: optional(row.catalogueImageUrl),
    gradingCompany: optional(row.gradingCompany),
    gradingGrade: row.gradingCompany ? optional(row.gradingGrade) : undefined,
    gradingCertificate: row.gradingCompany ? optional(row.gradingCertificate) : undefined,
    gradingNotes: row.gradingCompany ? optional(row.gradingNotes) : undefined,
    marketValueCents: market,
    discountPercent: percent,
    askingPriceCents: row.askingInput.trim()
      ? correctionCents(row.askingInput)
      : row.itemId
        ? row.askingPriceCents
        : undefined,
  };
}
/** Metadata edits preserve recorded acquisition costs, including legacy rounding differences. */
export function correctionPurchaseCents(line: CorrectionLine, original?: CorrectionItem): number {
  if (original) historicalCost(original);
  if (
    original &&
    line.marketValueCents === (original.marketValueCents ?? original.purchasePriceCents) &&
    line.discountPercent === (original.discountPercent ?? 100)
  )
    return historicalCost(original);
  return Math.round((line.marketValueCents * line.discountPercent) / 100);
}
const comparable = ({ itemId: _id, operationId: _operation, ...value }: CorrectionLine) =>
  JSON.stringify(value);
export function correctionPlan(snapshot: CorrectionSnapshot, rows: CorrectionDraft[]) {
  snapshot.items.forEach(historicalCost);
  if (snapshot.purchase.status === 'cancelled')
    throw new Error('Ce rachat annulé ne peut plus être corrigé.');
  const locked = new Set(snapshot.lockedIds);
  const editable = snapshot.items.filter((item) => !locked.has(item._id));
  const ids = rows.flatMap((row) => (row.itemId ? [row.itemId] : []));
  if (
    new Set(ids).size !== ids.length ||
    new Set(rows.map((row) => row.operationId)).size !== rows.length
  )
    throw new Error('Une carte apparaît plusieurs fois dans la correction.');
  if (
    rows.some(
      (row) =>
        row.itemId && (!editable.some((item) => item._id === row.itemId) || locked.has(row.itemId)),
    )
  )
    throw new Error('Une carte protégée ne peut pas être modifiée.');
  const removed = editable.filter((item) => !ids.includes(item._id));
  if (snapshot.items.length - removed.length + rows.filter((row) => !row.itemId).length < 1)
    throw new Error('Le rachat doit conserver au moins une carte.');
  if (snapshot.items.length - removed.length + rows.filter((row) => !row.itemId).length > 500)
    throw new Error('Un rachat peut contenir au maximum 500 cartes.');
  const changed = rows.map(correctionLine).filter((row) => {
    if (!row.itemId) return true;
    const old = editable.find((item) => item._id === row.itemId)!;
    return comparable(row) !== comparable(correctionLine(correctionDraft(old)));
  });
  const beforeCents = snapshot.items.reduce((sum, item) => sum + historicalCost(item), 0);
  const afterCents =
    snapshot.items
      .filter((item) => !removed.some((row) => row._id === item._id))
      .reduce((sum, item) => {
        const next = changed.find((row) => row.itemId === item._id);
        return sum + (next ? correctionPurchaseCents(next, item) : historicalCost(item));
      }, 0) +
    changed
      .filter((row) => !row.itemId)
      .reduce((sum, row) => sum + correctionPurchaseCents(row), 0);
  if (!Number.isSafeInteger(beforeCents) || !Number.isSafeInteger(afterCents))
    throw new Error('Le total dépasse la précision autorisée.');
  return {
    items: changed,
    removedIds: removed.map((item) => item._id),
    removed,
    beforeCents,
    afterCents,
    addedCount: changed.filter((row) => !row.itemId).length,
    updatedCount: changed.filter((row) => row.itemId).length,
    expectedDigest: snapshot.expectedDigest,
  };
}
export function correctionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const errors: Record<string, string> = {
    PURCHASE_CHANGED:
      'Ce rachat a changé sur un autre écran. Rechargez la version actuelle avant de vérifier et réappliquer vos corrections.',
    PURCHASE_ITEM_LOCKED:
      'Une carte a été vendue, donnée ou mouvementée depuis l’ouverture. Rechargez le dossier ; son historique doit être conservé.',
    PURCHASE_NOT_EDITABLE: 'Ce rachat est annulé ou ne peut plus être corrigé.',
    PURCHASE_NOT_FOUND: 'Ce rachat est introuvable.',
    PURCHASE_TOO_LARGE: 'Ce rachat dépasse les 500 cartes prises en charge.',
    INVALID_PURCHASE:
      'La correction contient une valeur refusée. Vérifiez les noms, montants et pourcentages.',
    OPERATION_CONFLICT:
      'Cette tentative ne correspond plus aux données envoyées. Rechargez le dossier avant de reprendre.',
  };
  const code = Object.keys(errors).find((code) => message.includes(code));
  if (code) return errors[code];
  if (/fetch|network|Failed to fetch/i.test(message))
    return 'Connexion interrompue. La saisie est conservée. Réessayez la même correction pour vérifier son enregistrement sans doublon.';
  return message || 'Correction impossible. Réessayez sans fermer cette fenêtre.';
}
