import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { clearSession, getApiBaseUrl, readSession } from '../auth/session';

export type GradingCompany = 'PSA' | 'CollectAura' | 'PCA' | 'CCC';

export type Seller = {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
};
export type Item = {
  _id: string;
  name: string;
  series?: string;
  identifier?: string;
  serialNumber?: string;
  sellerId: string;
  sellerName: string;
  purchaseReference: string;
  purchasePriceCents: number;
  purchaseOccurredAt: number;
  marketValueCents?: number;
  discountPercent?: number;
  askingPriceCents?: number;
  vatRegime: 'margin' | 'other';
  status: string;
  language?: 'fr' | 'en' | 'ja';
  condition?: 'M' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';
  gradingCompany?: GradingCompany;
  gradingGrade?: string;
  gradingCertificate?: string;
  gradingNotes?: string;
  catalogueImageUrl?: string;
  photos?: Attachment[];
};
export type Sale = {
  _id: string;
  itemId: string;
  itemName: string;
  salePriceCents: number;
  occurredAt: number;
  status: 'active' | 'cancelled';
};
export type AttachmentFile = { uri: string; name: string; mimeType: string };
export type PurchaseItem = {
  _id: string;
  name: string;
  series?: string;
  identifier?: string;
  serialNumber?: string;
  marketValueCents?: number;
  discountPercent?: number;
  purchasePriceCents: number;
  askingPriceCents?: number;
  language?: 'fr' | 'en' | 'ja';
  condition?: 'M' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';
  gradingCompany?: GradingCompany;
  gradingGrade?: string;
  gradingCertificate?: string;
  gradingNotes?: string;
  vatRegime: 'margin' | 'other';
  photos?: Attachment[];
};
export type Purchase = {
  _id: string;
  sellerId: string;
  reference: string;
  occurredAt: number;
  sellerName: string;
  status: 'pending' | 'active' | 'cancelled';
  items: PurchaseItem[];
};
export type Attachment = { _id: string; filename: string; contentType: string; size: number };
export type PurchaseDraft = {
  key: string;
  name: string;
  series: string;
  identifier: string;
  marketValue: string;
  discountPercent: string;
  askingPrice: string;
  askingPriceTouched: boolean;
  photo: AttachmentFile | null;
  language: 'fr' | 'en' | 'ja';
  condition: 'M' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';
  gradingCompany?: GradingCompany;
  gradingGrade?: string;
  gradingCertificate?: string;
  gradingNotes?: string;
  catalogueImageUrl: string;
  cardSearch: string;
  cardResults: {
    id: string;
    localId: string;
    name: string;
    image?: string;
    setName?: string;
    language: 'fr' | 'en' | 'ja';
    availableLanguages?: ('fr' | 'en' | 'ja')[];
  }[];
  catalogueCardId?: string;
  availableLanguages?: ('fr' | 'en' | 'ja')[];
  searching?: boolean;
};

let sessionExpiredHandler: (() => void) | undefined;
export function onSessionExpired(handler: () => void) {
  sessionExpiredHandler = handler;
  return () => {
    if (sessionExpiredHandler === handler) sessionExpiredHandler = undefined;
  };
}

async function request<T>(
  path: string,
  body?: unknown,
  method: 'POST' | 'PATCH' = 'POST',
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const token = await readSession();
  if (!baseUrl) throw new Error('EXPO_PUBLIC_API_URL n’est pas configurée.');
  if (!token) throw new Error('Votre session a expiré. Reconnectez-vous.');
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/v1${path}`, {
      method: body === undefined ? 'GET' : method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error('Connexion au serveur impossible. Vérifiez votre accès Internet.');
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      conflictId?: string;
    };
    if (response.status === 401 && ['INVALID_SESSION', 'UNAUTHENTICATED'].includes(payload.error ?? '')) {
      await clearSession();
      sessionExpiredHandler?.();
      throw new Error('Votre session a expiré. Reconnectez-vous.');
    }
    const messages: Record<string, string> = {
      SALE_CONFLICT: 'Cette carte a déjà été vendue depuis un autre appareil.',
      SALE_BEFORE_PURCHASE: 'La date de vente ne peut pas précéder le jour du rachat.',
      PURCHASE_DATE_AFTER_SALE:
        'Impossible de déplacer le rachat après une vente déjà enregistrée.',
      ITEM_NOT_AVAILABLE: 'Une des cartes n’est plus disponible dans le stock.',
      PURCHASE_NOT_FOUND: 'Rachat introuvable.',
    };
    const error = new Error(
      (payload.error && messages[payload.error]) ||
        payload.error ||
        `Le serveur a refusé l’opération (${response.status}).`,
    );
    Object.assign(error, { status: response.status, conflictId: payload.conflictId });
    throw error;
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const listSellers = () => request<Seller[]>('/sellers');
export const listStock = () => request<Item[]>('/stock');
export const listSales = () => request<Sale[]>('/sales');
export const listPurchases = () => request<Purchase[]>('/purchases');
export const listPurchaseAttachments = (purchaseId: string) =>
  request<Attachment[]>(`/purchases/${encodeURIComponent(purchaseId)}/attachments`);

export function createSeller(seller: Omit<Seller, '_id'>) {
  return request<{ id: string }>('/sellers', { operationId: Crypto.randomUUID(), ...seller });
}

export function updateSeller(id: string, seller: Omit<Seller, '_id'>) {
  return request<{ id: string }>(`/sellers/${encodeURIComponent(id)}`, seller, 'PATCH');
}

export function createPurchase(
  sellerId: string,
  entries: {
    name: string;
    series?: string;
    identifier?: string;
    marketValue: number;
    discountPercent: number;
    askingPrice: number;
    language?: 'fr' | 'en' | 'ja';
    condition?: 'M' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';
    gradingCompany?: GradingCompany;
    gradingGrade?: string;
    gradingCertificate?: string;
    gradingNotes?: string;
    catalogueImageUrl?: string;
  }[],
  date: number,
  reference: string,
) {
  return request<{ purchaseId: string; itemIds: string[] }>('/purchases', {
    operationId: Crypto.randomUUID(),
    sellerId,
    occurredAt: date,
    reference,
    items: entries.map((entry) => ({
      operationId: Crypto.randomUUID(),
      name: entry.name,
      series: entry.series || undefined,
      identifier: entry.identifier || undefined,
      marketValueCents: Math.round(entry.marketValue * 100),
      discountPercent: entry.discountPercent,
      purchasePriceCents: Math.round(entry.marketValue * entry.discountPercent),
      askingPriceCents: Math.round(entry.askingPrice * 100),
      language: entry.language ?? 'fr',
      condition: entry.condition ?? 'NM',
      gradingCompany: entry.gradingCompany,
      gradingGrade: entry.gradingGrade?.trim() || undefined,
      gradingCertificate: entry.gradingCertificate?.trim() || undefined,
      gradingNotes: entry.gradingNotes?.trim() || undefined,
      catalogueImageUrl: entry.catalogueImageUrl,
      vatRegime: 'margin',
    })),
  });
}

export function updatePurchaseDate(purchaseId: string, occurredAt: number) {
  return request<{ id: string }>(
    `/purchases/${encodeURIComponent(purchaseId)}`,
    { occurredAt },
    'PATCH',
  );
}

export function validatePurchase(purchaseId: string) {
  return request<{ id: string }>(`/purchases/${encodeURIComponent(purchaseId)}/validate`);
}
export function cancelPendingPurchase(purchaseId: string) {
  return request<{ id: string }>(`/purchases/${encodeURIComponent(purchaseId)}/cancel`);
}

export function createSale(item: Item, price: number, date: number) {
  return request('/sales', {
    operationId: Crypto.randomUUID(),
    itemId: item._id,
    occurredAt: date,
    salePriceCents: Math.round(price * 100),
  });
}

export function updateAskingPrice(itemId: string, askingPriceCents: number) {
  return request('/stock/asking-price', { itemId, askingPriceCents });
}

export function createSales(items: { itemId: string; salePriceCents: number }[], date: number) {
  return request('/sales/bulk', {
    operationId: Crypto.randomUUID(),
    items,
    occurredAt: date,
  });
}

export function cancelSale(saleId: string) {
  return request('/sales/cancel', { operationId: Crypto.randomUUID(), saleId });
}

async function uploadAttachment(field: 'purchaseId' | 'itemId', id: string, file: AttachmentFile) {
  const baseUrl = getApiBaseUrl();
  const token = await readSession();
  if (!baseUrl || !token) throw new Error('Reconnectez-vous avant de téléverser la photo.');
  const form = new FormData();
  form.append(field, id);
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as never);
  const response = await fetch(`${baseUrl}/api/v1/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!response.ok) throw new Error(`La photo n’a pas été téléversée (${response.status}).`);
  return response.json();
}

export const uploadPurchaseAttachment = (purchaseId: string, file: AttachmentFile) =>
  uploadAttachment('purchaseId', purchaseId, file);
export const uploadItemAttachment = (itemId: string, file: AttachmentFile) =>
  uploadAttachment('itemId', itemId, file);

export async function openAttachment(attachmentId: string, filename: string, contentType: string) {
  const baseUrl = getApiBaseUrl();
  const token = await readSession();
  if (!baseUrl || !token) throw new Error('Reconnectez-vous avant d’ouvrir la photo.');
  const extension = filename.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'file';
  const localUri = `${FileSystem.cacheDirectory}attachment-${attachmentId}.${extension}`;
  const result = await FileSystem.downloadAsync(
    `${baseUrl}/api/v1/attachments/${encodeURIComponent(attachmentId)}/download`,
    localUri,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (result.status !== 200) throw new Error(`Téléchargement refusé (${result.status}).`);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Aucune app ne peut ouvrir ce fichier.');
  await Sharing.shareAsync(result.uri, { mimeType: contentType, dialogTitle: filename });
}

function ascii(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/€/g, 'EUR')
    .replace(/[^\x20-\x7e]/g, '?');
}

export async function sharePurchaseReceipt(input: {
  reference: string;
  occurredAt: number;
  status?: 'pending' | 'active' | 'cancelled';
  client: Seller;
  items: {
    name: string;
    series: string;
    identifier: string;
    language: string;
    condition: string;
    gradingCompany?: string;
    gradingGrade?: string;
    gradingCertificate?: string;
    gradingNotes?: string;
    marketValueCents: number;
    discountPercent: number;
    purchasePriceCents: number;
  }[];
}) {
  const lines = [
    'BORDEREAU DE RACHAT',
    `Reference : ${input.reference}`,
    `Date : ${new Date(input.occurredAt).toLocaleString('fr-BE')}`,
    `Statut : ${input.status === 'active' ? 'valide' : input.status === 'cancelled' ? 'annule' : 'en attente de validation du client'}`,
    `Client : ${input.client.name}`,
    ...(input.client.email ? [`Email : ${input.client.email}`] : []),
    ...(input.client.phone ? [`Telephone : ${input.client.phone}`] : []),
    '',
    ...input.items.flatMap((item, index) => [
      `${index + 1}. ${item.name}`,
      `   Serie : ${item.series || '-'} | Identification : ${item.identifier || '-'}`,
      `   Langue : ${item.language} | Etat : ${item.condition}`,
      ...(item.gradingCompany ? [`   Gradation : ${item.gradingCompany} ${item.gradingGrade ?? ''} | Cert. ${item.gradingCertificate ?? '-'} | ${item.gradingNotes ?? ''}`] : []),
      `   Valeur actuelle : ${(item.marketValueCents / 100).toFixed(2)} EUR`,
      `   Decote : ${item.discountPercent}% | Prix de rachat : ${(item.purchasePriceCents / 100).toFixed(2)} EUR`,
    ]),
    '',
    `Total verse : ${(input.items.reduce((sum, item) => sum + item.purchasePriceCents, 0) / 100).toFixed(2)} EUR`,
    '',
    'Le prix de vente propose est exclu de ce recu.',
  ].map(ascii);
  const linesPerPage = 42;
  const pageCount = Math.max(1, Math.ceil(lines.length / linesPerPage));
  const pageIds = Array.from({ length: pageCount }, (_, index) => 4 + index * 2);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const pageId = 4 + pageIndex * 2;
    const contentId = pageId + 1;
    const pageLines = lines.slice(pageIndex * linesPerPage, (pageIndex + 1) * linesPerPage);
    const content = pageLines.map((line, index) => {
      const safe = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      return `BT /F1 11 Tf 48 ${790 - index * 17} Td (${safe}) Tj ET`;
    }).join('\n');
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  const filename = `rachat-${input.reference.replace(/[^a-z0-9-]/gi, '-')}.pdf`;
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, pdf, { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Le partage de PDF est indisponible.');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Reçu de rachat' });
}
