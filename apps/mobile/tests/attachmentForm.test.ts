import assert from 'node:assert/strict';
import test from 'node:test';
import { attachmentForm, type AttachmentOwner } from '../src/data/attachmentForm';
// Exercise the installed Expo encoder that rejected URI-based attachments on iOS.
import { installFormDataPatch } from '../node_modules/expo/src/winter/FormData';
import { convertFormDataAsync } from '../node_modules/expo/src/winter/fetch/convertFormData';

test('Expo encodes photos and PDFs with bytes, filename, MIME type and retry identity', async () => {
  const original = globalThis.FormData;
  class NativeFormData { _parts: unknown[] = []; }
  globalThis.FormData = installFormDataPatch(NativeFormData as unknown as typeof FormData) as unknown as typeof FormData;
  try {
    const legacy = new FormData();
    legacy.append('file', { uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg' } as never);
    await assert.rejects(convertFormDataAsync(legacy), /Unsupported FormDataPart implementation/);
    for (const field of ['itemId', 'purchaseId', 'supplierReceiptId', 'giftId'] as AttachmentOwner[]) {
      for (const [name, mimeType] of [['photo.jpg', 'image/jpeg'], ['photo.webp', 'image/webp'], ['invoice.pdf', 'application/pdf']]) {
        const form = attachmentForm(field, 'record-123', {
          name, mimeType, bytes: async () => new Uint8Array([0, 1, 127, 128, 255]),
        }, 'retry-123');
        const { body } = await convertFormDataAsync(form, 'test-boundary');
        const parsed = await new Response(body, { headers: { 'Content-Type': 'multipart/form-data; boundary=test-boundary' } }).formData();
        assert.equal(parsed.get(field), 'record-123');
        assert.equal(parsed.get('operationId'), 'retry-123');
        const file = parsed.get('file') as File;
        assert.equal(file.name, name);
        assert.equal(file.type, mimeType);
        assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array([0, 1, 127, 128, 255]));
      }
    }
  } finally { globalThis.FormData = original; }
});
