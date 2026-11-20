import assert from 'node:assert/strict';
import test from 'node:test';
import { loadItemPhoto } from '../src/data/itemPhoto';

test('personal image wins and PDF attachments are skipped', async () => {
  const paths: string[] = [];
  const result = await loadItemPhoto([
    { _id: 'pdf', filename: 'receipt.pdf', contentType: 'application/pdf' },
    { _id: 'photo/id', filename: 'card.png', contentType: 'image/png' },
    { _id: 'second', filename: 'card.jpg', contentType: 'image/jpeg' },
  ], async (path) => { paths.push(path); return 'data:image/png;base64,AQ=='; });
  assert.equal(result, 'data:image/png;base64,AQ==');
  assert.deepEqual(paths, ['/attachments/photo%2Fid/download?size=thumbnail']);
});

test('unavailable attachments fall through to another photo or catalogue fallback', async () => {
  const photos = [{ _id: 'a', filename: 'a.png' }, { _id: 'b', filename: 'b.jpg' }];
  assert.equal(await loadItemPhoto(photos, async (path) => {
    if (path.includes('/a/')) throw new Error('404');
    return 'second image';
  }), 'second image');
  assert.equal(await loadItemPhoto(photos, async () => { throw new Error('401'); }), null);
  assert.equal(await loadItemPhoto([], async () => { throw new Error('must not load'); }), null);
});

test('private thumbnail uses binary response bytes without unsupported native Blob conversion', async () => {
  const { photoDataUrl } = await import('../src/data/itemPhoto');
  const bytes = Uint8Array.from({ length: 50000 }, (_, i) => i % 256);
  const response = {
    ok: true,
    headers: new Headers({ 'content-type': 'image/webp' }),
    arrayBuffer: async () => bytes.buffer,
    blob: () => { throw new Error("Creating blobs from 'ArrayBuffer' is not supported"); },
  };
  const uri = await photoDataUrl(response);
  assert.ok(uri.startsWith('data:image/webp;base64,'));
  assert.deepEqual(Buffer.from(uri.split(',')[1], 'base64'), Buffer.from(bytes));
  await assert.rejects(photoDataUrl({ ...response, ok: false }), /Photo indisponible/);
  await assert.rejects(photoDataUrl({ ...response, headers: new Headers({ 'content-type': 'application/json' }) }), /Photo indisponible/);
  await assert.rejects(photoDataUrl({ ...response, arrayBuffer: async () => new ArrayBuffer(0) }), /Photo vide/);
});
