/** Exhaust every provider page; never return a silent partial export on a bad cursor. */
export async function collectCursorPages<T>(
  load: (cursor: string | null) => Promise<{ page: T[]; continueCursor: string; isDone: boolean }>,
) {
  const records: T[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (;;) {
    const result = await load(cursor);
    records.push(...result.page);
    if (result.isDone) return records;
    if (!result.continueCursor || seen.has(result.continueCursor))
      throw new Error('Pagination interrompue : export annulé pour éviter un fichier incomplet.');
    seen.add(result.continueCursor);
    cursor = result.continueCursor;
  }
}
