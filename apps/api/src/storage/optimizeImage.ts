import sharp from 'sharp';

export const IMAGE_MAX_EDGE = 2000;
const options = { limitInputPixels: 60_000_000, failOn: 'warning' as const };
export async function optimizeImage(input: Uint8Array, filename: string) {
  const bytes = Buffer.from(input);
  const metadata = await sharp(bytes, options).metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) throw new Error('IMAGE_FORMAT_INVALID');
  const clean = !metadata.exif && !metadata.xmp && !metadata.iptc && !metadata.icc && !(metadata as { comments?: unknown[] }).comments?.length;
  const fits = (metadata.width ?? Infinity) <= IMAGE_MAX_EDGE && (metadata.height ?? Infinity) <= IMAGE_MAX_EDGE;
  const pipeline = () => sharp(bytes, options).rotate().resize({ width: IMAGE_MAX_EDGE, height: IMAGE_MAX_EDGE, fit: 'inside', withoutEnlargement: true });
  // Decode even when retaining a small input: headers alone cannot validate a file.
  const webp = await pipeline().webp({ quality: 85, effort: 4 }).toBuffer();
  const retain = fits && clean && (metadata.orientation ?? 1) === 1 && (metadata.format === 'webp' || bytes.length <= webp.length);
  const body = retain ? bytes : webp;
  const format = retain ? metadata.format! : 'webp';
  const extension = format === 'jpeg' ? 'jpg' : format;
  const thumbnail = await sharp(body, options).resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  return { body, thumbnail, contentType: `image/${format}`, filename: `${filename.replace(/[\r\n\\/]/g, '_').replace(/\.[^.]*$/, '').slice(0, 165) || 'photo'}.${extension}` };
}
