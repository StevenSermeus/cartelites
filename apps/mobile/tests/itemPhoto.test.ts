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
