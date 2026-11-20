import { brand } from '../../../branding/brand';
import { legal } from '../../../branding/legal';
import { createPurchaseReceiptPdf as render, type ReceiptPdfInput } from '../../../packages/domain/src/purchaseReceipt';
import type { ReceiptLogo } from '../../../packages/domain/src/consignmentReceipt';
export type { SignatoryProfile, ReceiptLogo } from '../../../packages/domain/src/consignmentReceipt';
export type { ReceiptPdfInput } from '../../../packages/domain/src/purchaseReceipt';
export function createPurchaseReceiptPdf(receipt: ReceiptPdfInput, logo: ReceiptLogo): Blob {
  return new Blob([render(receipt, logo, { brand, legal })], { type: 'application/pdf' });
}
