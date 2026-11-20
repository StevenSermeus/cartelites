type Photo = { _id: string; filename: string; contentType?: string };

/** RN Response.blob() cannot wrap ArrayBuffers returned by our session layer. */
export async function photoDataUrl(response: Pick<Response, 'ok' | 'headers' | 'arrayBuffer'>): Promise<string> {
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!response.ok || !contentType || !/^image\/[a-z0-9.+-]+$/.test(contentType))
    throw new Error('Photo indisponible');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error('Photo vide');
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return `data:${contentType};base64,${btoa(chunks.join(''))}`;
}

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
      return await load(`/attachments/${encodeURIComponent(photo._id)}/download?size=thumbnail`);
    } catch {
      // Another attachment, then the catalogue image, can still be displayed.
    }
  }
  return null;
}
