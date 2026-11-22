import { optimizeAttachment } from './optimizeAttachment';
import { attachmentForm } from './attachmentForm';
import { createPurchaseReceiptPdf } from '../../../../packages/domain/src/purchaseReceipt';
import { createConsignmentReceiptPdf, type SignatoryProfile, type ConsignmentReceiptIdentity, type ReceiptLogo } from '../../../../packages/domain/src/consignmentReceipt';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { clearSession, getApiBaseUrl, readSession, instanceFetch } from '../auth/session';

export type GradingCompany = 'PSA' | 'CollectAura' | 'PCA' | 'CCC';

export type Seller = {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
};
export type Item = {
  quantity?: number; format?: 'display' | 'booster' | 'box' | 'other'; packSize?: number; taxRateBps?: number; coverPhotoId?: string;
  hiddenFromCatalogue?: boolean;
  origin?: 'purchase' | 'consignment' | 'supplier';
  consignmentId?: string;
  agreedPriceCents?: number;
  productType?: 'card' | 'sealed' | 'other';
  description?: string;
  commissionRateBps?: number;
  returnedAt?: number;
  events?: {
    _id: string;
    kind: 'terms' | 'return';
    occurredAt: number;
    authorizationNote?: string;
    askingPriceCents?: number;
    commissionRateBps?: number;
  }[];
  _id: string;
  name: string;
  tcg?: 'pokemon' | 'riftbound' | 'other';
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
  language?: 'fr' | 'en' | 'ja' | 'zh';
  condition?: 'M' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';
  gradingCompany?: GradingCompany;
  gradingGrade?: string;
  gradingCertificate?: string;
  gradingNotes?: string;
  catalogueImageUrl?: string;
  photos?: Attachment[];
};
export type SalePayment = { cashCents: number; transferCents: number; receivedAt: number; reference?: string };
export type SaleSettlement = { paymentStatus: 'pending' | 'received'; payment?: SalePayment };
export type Sale = {
  paymentStatus?: 'pending' | 'received';
  payment?: SalePayment;
  origin?: 'purchase' | 'consignment' | 'supplier';
  commissionRateBps?: number;
  commissionCents?: number;
  depositorAmountCents?: number;
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
  tcg?: 'pokemon' | 'riftbound' | 'other';
  series?: string;
  identifier?: string;
  serialNumber?: string;
  marketValueCents?: number;
  discountPercent?: number;
  purchasePriceCents: number;
  askingPriceCents?: number;
  language?: 'fr' | 'en' | 'ja' | 'zh';
  condition?: 'M' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';
  gradingCompany?: GradingCompany;
  gradingGrade?: string;
  gradingCertificate?: string;
  gradingNotes?: string;
  vatRegime: 'margin' | 'other';
  photos?: Attachment[];
};
export type Purchase = {
  buyerNote?: string;
  sellerNote?: string;
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
  included?: boolean;
  key: string;
  name: string;
  tcg?: 'pokemon' | 'riftbound' | 'other';
  series: string;
  identifier: string;
  marketValue: string;
  discountPercent: string;
  askingPrice: string;
  askingPriceTouched: boolean;
  photo: AttachmentFile | null;
  language: 'fr' | 'en' | 'ja' | 'zh';
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
    language: 'fr' | 'en' | 'ja' | 'zh';
    availableLanguages?: ('fr' | 'en' | 'ja' | 'zh')[];
  }[];
  catalogueCardId?: string;
  availableLanguages?: ('fr' | 'en' | 'ja' | 'zh')[];
  searching?: boolean;
};

let sessionExpiredHandler: (() => void) | undefined;
export function onSessionExpired(handler: () => void) {
  sessionExpiredHandler = handler;
  return () => {
    if (sessionExpiredHandler === handler) sessionExpiredHandler = undefined;
  };
}

export async function request<T = unknown>(
  path: string,
  body?: unknown,
  method: 'POST' | 'PATCH' = 'POST',
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const token = await readSession();
  if (!baseUrl) throw new Error('Configurez l’adresse de votre instance.');
  if (!token) throw new Error('Votre session a expiré. Reconnectez-vous.');
  let response: Response;
  try {
    response = await instanceFetch(path, {
      redirect: 'error',
      method: body === undefined ? 'GET' : method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }, true);
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
      PRICE_BELOW_AGREEMENT: 'Le prix est inférieur à l’accord du déposant. Modifiez l’accord dans Dépôts avec son autorisation.',
      INVALID_COMMISSION: 'La commission doit être comprise entre 0 et 100 %.',
      INVALID_CONSIGNMENT: 'Vérifiez les informations du dépôt.',
      INVALID_PAYMENT: 'Vérifiez le montant et la date du versement.',
      INVALID_SALE_PAYMENT: 'Les montants espèces et virement doivent correspondre au total vendu.',
      INVALID_SALE_PAYMENT_DATE: 'La date d’encaissement est invalide ou précède la vente.',
      SALE_NOT_FOUND: 'Vente introuvable.',
      SALE_CANCELLED: 'Cette vente est annulée : son encaissement ne peut plus être modifié.',
      INVALID_PAYMENT_DATE: 'Le versement ne peut pas précéder la première vente du déposant.',
      CONSIGNMENT_ITEM_NOT_FOUND: 'Article en dépôt introuvable.',
      INVALID_RETURN_DATE: 'La restitution ne peut pas précéder le dépôt.',
      AUTHORIZATION_REQUIRED: 'Indiquez l’autorisation du déposant.',
      INVALID_SALE_DATE: 'La date de vente est invalide.',
      INVALID_SALE_BATCH: 'Vérifiez les articles du panier.',
      IDEMPOTENCY_KEY_REUSED: 'Cette opération a déjà été enregistrée avec des informations différentes. Actualisez la liste.',
      SALE_BELOW_AGREED_PRICE: 'Le prix est inférieur à l’accord du déposant. Modifiez l’accord dans Dépôts avec son autorisation.',
      CONSIGNMENT_TERMS_REQUIRED: 'Modifiez le prix convenu depuis Dépôts avec l’autorisation du déposant.',
      INSUFFICIENT_BALANCE: 'Le versement dépasse le solde restant à reverser.',
      PAYMENT_EXCEEDS_BALANCE: 'Le versement dépasse le solde restant à reverser.',
      SALE_BEFORE_CONSIGNMENT: 'La vente ne peut pas précéder le dépôt.',
      ITEM_UNAVAILABLE: 'Un article n’est plus disponible. Actualisez le stock puis recommencez.',
      SALE_CONFLICT: 'Cette carte a déjà été vendue depuis un autre appareil.',
      SALE_BEFORE_PURCHASE: 'La date de vente ne peut pas précéder le rachat ou le dépôt.',
      PURCHASE_DATE_AFTER_SALE:
        'Impossible de déplacer le rachat après une vente déjà enregistrée.',
      INVALID_INVENTORY: 'Vérifiez les quantités, les montants et les champs obligatoires.',
      PRODUCT_MISMATCH: 'Le produit choisi doit avoir le même type et le même taux de TVA.',
      OPENING_ALREADY_USED: 'Des boosters de cette ouverture sont déjà sortis du stock.',
      TICKET_STALE: 'Cette version précède une modification de la vente. Régénérez le ticket.',
      EMAIL_RESULT_UNKNOWN: 'Résultat de l’envoi incertain. Vérifiez avant tout nouvel envoi.',
      ARCHIVE_UNAVAILABLE: 'Archivage indisponible. La vente reste enregistrée ; réessayez le ticket.',
      INVALID_STOCK_SELECTION: 'Sélectionnez entre 1 et 500 articles distincts.',
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
export type ReadPage<T> = { items: T[]; nextCursor: string | null; isDone: boolean };
export function readPage<T>(path: string, params: Record<string, string | number | undefined> = {}) {
  const query = new URLSearchParams({ size: '25' });
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key, String(value));
  return request<ReadPage<T>>(`${path}?${query}`);
}
export const readRecord = <T,>(path: string, id: string) => request<T>(`${path}/${encodeURIComponent(id)}`);
export const listStock = () => request<Item[]>('/stock');
export const listSales = () => request<Sale[]>('/sales');
export const listPurchases = () => request<Purchase[]>('/purchases');
export const listPurchasePage = (params: string) => request<{rows:Purchase[];page:number;totalPages:number;totalCount:number}>(`/purchases/page?${params}`);
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
    tcg?: 'pokemon' | 'riftbound' | 'other';
    series?: string;
    identifier?: string;
    marketValue: number;
    discountPercent: number;
    askingPrice: number;
    language?: 'fr' | 'en' | 'ja' | 'zh';
    condition?: 'M' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';
    gradingCompany?: GradingCompany;
    gradingGrade?: string;
    gradingCertificate?: string;
    gradingNotes?: string;
    catalogueImageUrl?: string;
  }[],
  date: number,
  reference: string,
  notes: { buyerNote?: string; sellerNote?: string } = {},
) {
  return request<{ purchaseId: string; itemIds: string[] }>('/purchases', {
    ...notes,
    operationId: Crypto.randomUUID(),
    sellerId,
    occurredAt: date,
    reference,
    items: entries.map((entry) => ({
      operationId: Crypto.randomUUID(),
      name: entry.name,
      tcg: entry.tcg ?? 'pokemon',
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

export function createSale(item: Item, price: number, date: number, settlement?: SaleSettlement) {
  return request('/sales', {
    operationId: Crypto.randomUUID(),
    itemId: item._id,
    ...settlement,
    occurredAt: date,
    salePriceCents: Math.round(price * 100),
  });
}

export function updateStockVisibility(input: { operationId: string; itemIds: string[]; hidden: boolean }) {
  return request<{ updatedCount: number }>('/stock/visibility', input);
}

export function updateAskingPrice(itemId: string, askingPriceCents: number) {
  return request('/stock/asking-price', { itemId, askingPriceCents });
}

export function createSales(items: { itemId: string; salePriceCents: number; quantity?: number }[], date: number, settlement?: SaleSettlement, operationId = Crypto.randomUUID()) {
  return request<{ids:string[]}>('/sales/bulk', {
    operationId,
    ...settlement,
    items,
    occurredAt: date,
  });
}

export function recordSalePayment(input: SalePayment & { saleId: string; operationId: string }) {
  return request('/sales/payment', input);
}

export function cancelSale(saleId: string) {
  return request('/sales/cancel', { operationId: Crypto.randomUUID(), saleId });
}

export async function uploadAttachment(field: 'purchaseId' | 'itemId' | 'supplierReceiptId' | 'giftId', id: string, file: AttachmentFile, operationId?: string) {
  const baseUrl = getApiBaseUrl();
  const token = await readSession();
  if (!baseUrl || !token) throw new Error('Reconnectez-vous avant de téléverser la photo.');
  file = await optimizeAttachment(file);
  const nativeFile = new File(file.uri);
  const form = attachmentForm(field, id, {
    name: file.name,
    mimeType: file.mimeType,
    bytes: () => nativeFile.bytes(),
  }, operationId);
  const response = await instanceFetch('/attachments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  }, true);
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
  const response = await instanceFetch(`/attachments/${encodeURIComponent(attachmentId)}/download`, {}, true);
  if (!response.ok) throw new Error(`Téléchargement refusé (${response.status}).`);
  new File(localUri).write(new Uint8Array(await response.arrayBuffer()));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Aucune app ne peut ouvrir ce fichier.');
  await Sharing.shareAsync(localUri, { mimeType: contentType, dialogTitle: filename });
}

export async function purchaseReceiptPdf(input: import('./purchaseReceipt').ReceiptInput) {
  const [signatory, identity] = await Promise.all([
    request<SignatoryProfile>('/auth/profile'),
    request<ConsignmentReceiptIdentity & { logo: ReceiptLogo }>('/receipt-identity'),
  ]);
  return btoa(createPurchaseReceiptPdf({ ...input, signatory }, identity.logo, identity));
}

export async function sharePurchaseReceipt(input: import('./purchaseReceipt').ReceiptInput, base64?: string) {
  const pdf = base64 ?? await purchaseReceiptPdf(input);
  const filename = `rachat-${input.reference.replace(/[^a-z0-9-]/gi, '-')}.pdf`;
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  if (!(await Sharing.isAvailableAsync())) throw new Error('Le partage de PDF est indisponible.');
  await FileSystem.writeAsStringAsync(uri, pdf, { encoding: FileSystem.EncodingType.Base64 });
  try {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}

export type Consignment = {
  _id: string;
  sellerId: string;
  sellerName: string;
  reference: string;
  occurredAt: number;
  notes?: string;
  flowVersion?: number;
  contractStatus?: 'awaiting_signature' | 'signed';
  contractRevision?: number;
  contractTerms?: {version:string;text:string};
  dueAt?: number;
  items: Item[];
};
export type ConsignmentBalance = {
  sellerId: string;
  sellerName: string;
  earnedCents: number;
  paidCents: number;
  balanceCents: number;
};
export type ConsignmentPayment = {
  _id: string;
  sellerId: string;
  sellerName: string;
  amountCents: number;
  occurredAt: number;
  method: string;
  reference?: string;
};
export type ConsignmentEntry = {
  operationId: string;
  name: string;
  productType: 'card' | 'sealed' | 'other';
  description?: string;
  series?: string;
  identifier?: string;
  language?: 'fr' | 'en' | 'ja' | 'zh';
  tcg?: 'pokemon' | 'riftbound' | 'other';
  condition?: 'M' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';
  gradingCompany?: GradingCompany;
  gradingGrade?: string;
  gradingCertificate?: string;
  gradingNotes?: string;
  askingPriceCents: number;
  commissionRateBps: number;
};
export const listConsignments = () => request<Consignment[]>('/consignments');
export const listConsignmentBalances = () => request<{
  balances: ConsignmentBalance[];
  payments: ConsignmentPayment[];
}>('/consignments/balances');
export const createConsignment = (input: {
  operationId: string;
  sellerId: string;
  occurredAt: number;
  reference: string;
  notes?: string;
  flowVersion?: 2;
  contractTerms?: {version:string;text:string};
  dueAt?: number;
  items: ConsignmentEntry[];
}) => request<{ consignmentId: string; itemIds: string[] }>('/consignments', input);
export const recordConsignmentPayment = (input: {
  operationId: string;
  sellerId: string;
  amountCents: number;
  occurredAt: number;
  method: string;
  reference?: string;
}) => request<{ id: string }>('/consignments/payments', input);
export const returnConsignmentItem = (itemId: string) => request<{ id: string }>('/consignments/return', {
  operationId: Crypto.randomUUID(), itemId, occurredAt: Date.now(),
});
export const updateConsignmentTerms = (input: {
  operationId: string;
  itemId: string;
  askingPriceCents: number;
  commissionRateBps: number;
  authorizationNote: string;
}) => request<{ id: string }>('/consignments/terms', input);

export async function shareConsignmentReceipt(deposit: Consignment, client: Seller | undefined) {
  const [signatory, identity] = await Promise.all([request<SignatoryProfile>('/auth/profile'), request<ConsignmentReceiptIdentity & { logo: ReceiptLogo }>('/receipt-identity')]);
  const pdf = createConsignmentReceiptPdf({ ...deposit, client: client ?? { name: deposit.sellerName }, signatory }, identity.logo, identity);
  const filename = `depot-${deposit.reference.replace(/[^a-z0-9-]/gi, '-')}.pdf`;
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, pdf, { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Le partage de PDF est indisponible.');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Bon de dépôt' });
}
