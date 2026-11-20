import { env } from '../env.js';
import { ImageCache } from './imageCache.js';
import { requestR2 } from './r2.js';

const cache = new ImageCache({
  maxBytes: env.IMAGE_CACHE_MAX_BYTES,
  maxEntryBytes: 4 * 1024 * 1024,
  maxEntries: 512,
  ttlMs: env.IMAGE_CACHE_TTL_SECONDS * 1000,
});

/** Call only after resolving the attachment and authorizing this specific request. */
export function readImage(objectKey: string) {
  const key = JSON.stringify([env.R2_ENDPOINT, env.R2_BUCKET, objectKey]);
  return cache.read(key, () => requestR2('GET', objectKey));
}

export async function readImageVariant(objectKey: string, contentType: string, thumbnail: boolean) {
  if (thumbnail) {
    const preview = await readImage(`${objectKey}.thumb.webp`);
    if (preview.ok && preview.body) return { stored: preview, contentType: 'image/webp' };
  }
  return { stored: await readImage(objectKey), contentType };
}
