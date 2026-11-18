import { createHash } from 'node:crypto';

const apiBase = new URL(process.env.DEMO_API_URL ?? 'http://127.0.0.1:3001');
const convexUrl = process.env.CONVEX_URL ? new URL(process.env.CONVEX_URL) : undefined;
const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
const apiPrefix = '/api/v1';
const email = process.env.DEMO_SEED_EMAIL;
const password = process.env.DEMO_SEED_PASSWORD;
const clientCount = Number(process.env.DEMO_CLIENTS ?? 50);
const purchaseCount = Number(process.env.DEMO_PURCHASES ?? 200);
const cardsPerPurchase = Number(process.env.DEMO_CARDS_PER_PURCHASE ?? 5);
const sellEvery = Number(process.env.DEMO_SELL_EVERY ?? 2);

if (!localHosts.has(apiBase.hostname)) throw new Error('Refus du seed : DEMO_API_URL doit pointer vers localhost.');
if (!convexUrl || !localHosts.has(convexUrl.hostname) || convexUrl.port !== '3210')
  throw new Error('Refus du seed : CONVEX_URL doit pointer vers le Convex local sur le port 3210.');
if (!email || !password) throw new Error('Définissez DEMO_SEED_EMAIL et DEMO_SEED_PASSWORD avec un compte vendeur local.');
if (![clientCount, purchaseCount, cardsPerPurchase, sellEvery].every(Number.isSafeInteger) || clientCount < 1 || purchaseCount < 1 || cardsPerPurchase < 1 || sellEvery < 1)
  throw new Error('Les nombres de données de démo doivent être des entiers positifs.');

function stableUuid(value: string) {
  const hex = createHash('sha256').update(`tcg-marge-demo:${value}`).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 3) | 8).toString(16);
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

async function call<T>(path: string, token: string | undefined, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(new URL(`${apiPrefix}${path}`, apiBase), { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} refusé (${response.status}) : ${JSON.stringify(body)}`);
  return body as T;
}

type Seller = { _id: string; name: string; email?: string };
type DemoItem = { _id: string; name: string; purchasePriceCents: number; askingPriceCents?: number };
type DemoPurchase = { _id: string; reference: string; occurredAt: number; sellerId: string; status: 'pending' | 'active' | 'cancelled'; items: DemoItem[] };
type DemoSale = { itemId: string };

const auth = await call<{ accessToken: string }>('/auth/login', undefined, {
  method: 'POST',
  headers: { 'X-Client-Platform': 'ios' },
  body: JSON.stringify({ email, password }),
});
if (!auth.accessToken) throw new Error('L’API n’a pas retourné de jeton vendeur.');
const token = auth.accessToken;

const [sellers, purchases, sales] = await Promise.all([
  call<Seller[]>('/sellers', token),
  call<DemoPurchase[]>('/purchases', token),
  call<DemoSale[]>('/sales', token),
]);
const sellerByEmail = new Map(sellers.filter((seller) => seller.email).map((seller) => [seller.email!, seller]));
const demoSellers: Seller[] = [];
for (let index = 0; index < clientCount; index++) {
  const clientEmail = `demo-client-${String(index + 1).padStart(3, '0')}@example.test`;
  const existing = sellerByEmail.get(clientEmail);
  if (existing) {
    demoSellers.push(existing);
    continue;
  }
  const result = await call<{ id: string }>('/sellers', token, {
    method: 'POST',
    body: JSON.stringify({
      operationId: stableUuid(`seller-${index + 1}`),
      name: ['Camille', 'Alex', 'Morgan', 'Noa', 'Lou'][index % 5] + ` Collection ${String(index + 1).padStart(3, '0')}`,
      email: clientEmail,
      phone: `04${String(70000000 + index).slice(0, 8)}`,
      address: `${index + 1} rue des Cartes, ${1000 + (index % 99)} Bruxelles`,
    }),
  });
  demoSellers.push({ _id: result.id, name: `Collection ${String(index + 1).padStart(3, '0')}`, email: clientEmail });
}

const existingByReference = new Map(purchases.map((purchase) => [purchase.reference, purchase]));
const soldItemIds = new Set(sales.map((sale) => sale.itemId));
const cardNames = ['Pikachu ex', 'Mew ex', 'Dracaufeu ex', 'Gardevoir ex', 'Ectoplasma', 'Évoli', 'Lugia V', 'Rayquaza VMAX', 'Noctali ex', 'Tortank ex', 'Miraidon ex', 'Mentali V'];
const series = ['151', 'Écarlate et Violet', 'Couronne Stellaire', 'Destinées de Paldea', 'Épée et Bouclier', 'Origine Perdue'];
const graders = ['PSA', 'CollectAura', 'PCA', 'CCC'] as const;
const imageUrls = [
  'https://images.pokemontcg.io/base1/58.png',
  'https://images.pokemontcg.io/base1/4.png',
  'https://images.pokemontcg.io/swsh3/25.png',
];
const anchor = Date.now();
let createdPurchases = 0;
let activatedPurchases = 0;
let createdSales = 0;

for (let index = 0; index < purchaseCount; index++) {
  const sequence = index + 1;
  const reference = `DEMO-${String(sequence).padStart(5, '0')}`;
  const seller = demoSellers[index % demoSellers.length]!;
  const occurredAt = anchor - ((sequence * 3) % 720) * 24 * 60 * 60 * 1000;
  let purchase = existingByReference.get(reference);
  if (!purchase) {
    const itemRows = Array.from({ length: cardsPerPurchase }, (_, cardIndex) => {
      const globalCard = index * cardsPerPurchase + cardIndex;
      const marketValueCents = 500 + ((globalCard * 379) % 249500);
      const discountPercent = globalCard % 7 === 0 ? 65 : 70;
      const graded = globalCard % 4 !== 0;
      const gradingCompany = graded ? graders[globalCard % graders.length] : undefined;
      return {
        operationId: stableUuid(`item-${globalCard + 1}`),
        name: `${cardNames[globalCard % cardNames.length]} · Démo ${String(globalCard + 1).padStart(4, '0')}`,
        series: series[globalCard % series.length],
        identifier: `${(globalCard % 200) + 1}/${globalCard % 3 === 0 ? 165 : 198}`,
        language: (['fr', 'en', 'ja'] as const)[globalCard % 3],
        condition: (['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'] as const)[globalCard % 7],
        marketValueCents,
        discountPercent,
        purchasePriceCents: Math.round((marketValueCents * discountPercent) / 100),
        askingPriceCents: marketValueCents,
        vatRegime: 'margin',
        catalogueImageUrl: imageUrls[globalCard % imageUrls.length],
        ...(gradingCompany ? {
          gradingCompany,
          gradingGrade: gradingCompany === 'PCA' && globalCard % 8 === 0 ? '10+ Collector' : globalCard % 3 === 0 ? '9.5' : '10',
          gradingCertificate: `${gradingCompany}-${String(70000000 + globalCard).padStart(8, '0')}`,
          gradingNotes: globalCard % 2 === 0 ? 'Centrage 10 · Coins 9 · Bords 10 · Surface 10' : 'Très léger défaut de surface au verso',
        } : {}),
      };
    });
    const created = await call<{ purchaseId: string; itemIds: string[] }>('/purchases', token, {
      method: 'POST',
      body: JSON.stringify({ operationId: stableUuid(`purchase-${sequence}`), sellerId: seller._id, occurredAt, reference, items: itemRows }),
    });
    purchase = {
      _id: created.purchaseId,
      reference,
      occurredAt,
      sellerId: seller._id,
      status: 'pending',
      items: created.itemIds.map((id, itemIndex) => ({ ...itemRows[itemIndex]!, _id: id })),
    };
    existingByReference.set(reference, purchase);
    createdPurchases++;
  }

  const shouldRemainPending = sequence % 12 === 0;
  if (purchase.status === 'pending' && !shouldRemainPending) {
    await call(`/purchases/${encodeURIComponent(purchase._id)}/validate`, token, { method: 'POST' });
    purchase.status = 'active';
    activatedPurchases++;
  }

  if (purchase.status === 'active' && sequence % sellEvery === 0) {
    const availableToSell = purchase.items.find((item) => !soldItemIds.has(item._id));
    if (availableToSell) {
      await call('/sales/bulk', token, {
        method: 'POST',
        body: JSON.stringify({
          operationId: stableUuid(`sale-batch-${sequence}`),
          occurredAt: purchase.occurredAt + 24 * 60 * 60 * 1000,
          items: [{ itemId: availableToSell._id, salePriceCents: Math.round((availableToSell.askingPriceCents ?? availableToSell.purchasePriceCents) * 1.12) }],
        }),
      });
      soldItemIds.add(availableToSell._id);
      createdSales++;
    }
  }
  if (sequence % 25 === 0) console.log(`Seed ${sequence}/${purchaseCount} rachats…`);
}

console.log(JSON.stringify({
  account: email,
  clients: demoSellers.length,
  purchasesRequested: purchaseCount,
  purchasesCreated: createdPurchases,
  pendingPurchases: Math.floor(purchaseCount / 12),
  purchasesActivated: activatedPurchases,
  cardsRequested: purchaseCount * cardsPerPurchase,
  salesCreated: createdSales,
  rerunSafe: true,
}, null, 2));
