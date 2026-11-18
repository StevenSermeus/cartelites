import logoUrl from '../../../branding/logo.png';
import type { ReceiptLogo } from './receiptPdf';

let cachedLogo: Promise<ReceiptLogo> | undefined;

// Embed the same local logo as the website; no external image service or per-client derivative.
export function loadReceiptLogo(): Promise<ReceiptLogo> {
  if (cachedLogo) return cachedLogo;
  cachedLogo = new Promise<ReceiptLogo>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, 720 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Impossible de préparer le logo du bordereau.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const bytes = atob(canvas.toDataURL('image/jpeg', 0.94).split(',')[1]);
        resolve({ width: canvas.width, height: canvas.height, jpegHex: Array.from(bytes, (byte) => byte.charCodeAt(0).toString(16).padStart(2, '0')).join('') });
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error('Impossible de charger le logo du bordereau.'));
    image.src = logoUrl;
  }).catch((error) => {
    cachedLogo = undefined;
    throw error;
  });
  return cachedLogo;
}
