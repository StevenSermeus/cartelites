export type AttachmentOwner = 'purchaseId' | 'itemId' | 'supplierReceiptId' | 'giftId';

export function attachmentForm(
  field: AttachmentOwner,
  id: string,
  file: { name: string; mimeType: string; bytes: () => Promise<Uint8Array> },
  operationId?: string,
) {
  const form = new FormData();
  form.append(field, id);
  if (operationId) form.append('operationId', operationId);
  // Expo fetch accepts the File/Blob bytes interface, not React Native URI parts.
  // Keep the selected filename and MIME type instead of the cache file's name.
  form.append('file', { name: file.name, type: file.mimeType, bytes: file.bytes } as unknown as Blob);
  return form;
}
