export type AttributeRow = { id: string; key: string; value: string };
export function attributeRows(value: Record<string, string> | undefined): AttributeRow[] {
  return Object.entries(value ?? {}).map(([key, value], index) => ({
    id: `saved-${index}`,
    key,
    value,
  }));
}
export function attributesRecord(rows: AttributeRow[]): Record<string, string> {
  if (rows.length > 20) throw new Error('20 caractéristiques maximum par liste.');
  const result: Record<string, string> = Object.create(null);
  for (const row of rows) {
    const key = row.key.trim();
    if (!key || key.length > 60 || row.value.length > 500)
      throw new Error(
        'Chaque caractéristique nécessite un nom de 1 à 60 caractères et une valeur de 500 caractères maximum.',
      );
    if (Object.hasOwn(result, key))
      throw new Error(`La caractéristique « ${key} » est présente plusieurs fois.`);
    result[key] = row.value;
  }
  return result;
}
const metadataFields = [
  'tcg',
  'name',
  'description',
  'series',
  'identifier',
  'language',
  'condition',
  'gradingCompany',
  'gradingGrade',
  'gradingCertificate',
  'askingPriceCents',
  'hiddenFromCatalogue',
  'variant',
  'serialNumber',
  'privateNotes',
  'publicAttributes',
  'privateAttributes',
] as const;
/** Photo-only changes can advance the concurrency revision without overwriting the local draft. */
export function unchangedMetadata(previous: object, next: object): boolean {
  const normalized = (value: object) =>
    Object.fromEntries(
      metadataFields.map((key) => {
        const raw = (value as Record<string, unknown>)[key];
        return [
          key,
          raw && typeof raw === 'object'
            ? Object.fromEntries(Object.entries(raw).sort(([a], [b]) => a.localeCompare(b)))
            : (raw ?? ''),
        ];
      }),
    );
  return JSON.stringify(normalized(previous)) === JSON.stringify(normalized(next));
}
