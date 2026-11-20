/** An archived original always takes precedence over a freshly generated preview.
 * Failure to retrieve it must remain visible: an unsigned fallback is misleading. */
export async function loadReceiptDocument(
  list: () => Promise<{ id: string; signedAt?: number }[]>,
  archive: (id: string) => Promise<{ pdfBase64: string }>,
  preview: () => Promise<string>,
): Promise<{ pdf: string; archived: boolean }> {
  const versions = await list();
  const latest = versions
    .filter((row) => typeof row.signedAt === "number")
    .sort((a, b) => b.signedAt! - a.signedAt!)[0];
  if (latest)
    return { pdf: (await archive(latest.id)).pdfBase64, archived: true };
  return { pdf: await preview(), archived: false };
}

/** A successful signature makes the unsigned preview obsolete, even if fetching
 * the immutable archive fails. Keep this ordering independent of the UI. */
export async function publishSignedArchive(
  invalidatePreview: () => void,
  loadArchive: () => Promise<string>,
  publishArchive: (pdf: string) => void,
): Promise<void> {
  invalidatePreview();
  const pdf = await loadArchive();
  publishArchive(pdf);
}
