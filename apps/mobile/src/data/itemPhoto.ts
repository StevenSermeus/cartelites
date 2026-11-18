type Photo = { _id: string; filename: string; contentType?: string };

/** Try private images in order; PDFs must never replace a card thumbnail. */
export async function loadItemPhoto(
  photos: Photo[],
  load: (path: string) => Promise<string>,
): Promise<string | null> {
  for (const photo of photos) {
    const isImage = photo.contentType
      ? photo.contentType.startsWith('image/')
      : /\.(jpe?g|png|webp|heic|avif)$/i.test(photo.filename);
    if (!isImage) continue;
    try {
      return await load(`/attachments/${encodeURIComponent(photo._id)}/download`);
    } catch {
      // Another attachment, then the catalogue image, can still be displayed.
    }
  }
  return null;
}
