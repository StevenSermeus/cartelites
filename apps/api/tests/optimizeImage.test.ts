import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { optimizeImage } from '../src/storage/optimizeImage.js';

test('large rotated photo becomes a bounded oriented WebP without metadata and a thumbnail', async () => {
  const input = await sharp({ create: { width: 3000, height: 1500, channels: 3, background: '#c8a067' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const result = await optimizeImage(input, 'card.jpeg');
  const main = await sharp(result.body).metadata();
  const thumbnail = await sharp(result.thumbnail).metadata();
  assert.equal(main.width, 1000);
  assert.equal(main.height, 2000);
  assert.equal(main.format, 'webp');
  assert.equal(main.exif, undefined);
  assert.equal(main.icc, undefined);
  assert.equal(main.orientation, undefined);
  assert.equal(thumbnail.height, 480);
  assert.equal(thumbnail.width, 240);
  assert.equal(result.contentType, 'image/webp');
  assert.equal(result.filename, 'card.webp');
});
test('already optimized WebP is not recompressed and small images are not enlarged', async () => {
  const input = await sharp({ create: { width: 200, height: 100, channels: 4, background: '#00000000' } }).webp().toBuffer();
  const result = await optimizeImage(input, 'small.webp');
  assert.deepEqual(result.body, input);
  const preview = await sharp(result.thumbnail).metadata();
  assert.equal(preview.width, 200);
  assert.equal(preview.height, 100);
  assert.equal(preview.hasAlpha, true);
});
test('forged, truncated, and unsupported images are rejected', async () => {
  await assert.rejects(() => optimizeImage(Buffer.from('%PDF-test'), 'fake.jpg'));
  await assert.rejects(() => optimizeImage(Buffer.from('<svg width="10" height="10"></svg>'), 'fake.png'));
  const input = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#fff' } }).jpeg().toBuffer();
  await assert.rejects(() => optimizeImage(input.subarray(0, 100), 'bad.jpg'));
});
