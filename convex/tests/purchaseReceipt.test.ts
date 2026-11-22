import assert from 'node:assert/strict';
import test from 'node:test';
import { brand } from '../../branding/brand';
import { legal } from '../../branding/legal';
import { createPurchaseReceiptPdf, type ReceiptPdfInput } from '../../packages/domain/src/purchaseReceipt';

const logo = { width: 1, height: 1, jpegHex: 'ffd8ffd9' };
const receipt = (count: number): ReceiptPdfInput => ({
  reference: 'R-PAGINATION', occurredAt: 1795000000000,
  client: { name: 'Élodie Test', email: 'elodie@example.test' },
  signatory: { firstName: 'Alex', lastName: 'Martin', capacity: 'Gérant' },
  items: Array.from({ length: count }, (_, i) => ({
    name: `Carte unique ${i + 1}`, series: 'Collection anniversaire', identifier: `${i + 1}`,
    language: 'fr', condition: 'NM', marketValueCents: 1000, discountPercent: 80,
    purchasePriceCents: 800,
  })),
});
const pages = (input: ReceiptPdfInput) => {
  const pdf = createPurchaseReceiptPdf(input, logo, { brand, legal });
  assert.equal(pdf.slice(Number(pdf.match(/startxref\n(\d+)/)?.[1]), -1).startsWith('xref'), true);
  return [...pdf.matchAll(/stream\n([\s\S]*?)\nendstream/g)]
    .filter((match) => match[1].includes(' Tf '))
    .map((match) => [...match[1].matchAll(/<([0-9a-f]+)> Tj/g)]
      .map((text) => Buffer.from(text[1], 'hex').toString('latin1')).join('\n'));
};

test('small purchase keeps cards, total, VAT declaration and signatures on one page', () => {
  const result = pages(receipt(3));
  assert.equal(result.length, 1);
  assert.ok(result[0].includes('Total payé : 24.00 EUR'));
  assert.ok(result[0].includes('déduction ni restitution de TVA'));
  assert.ok(result[0].includes('VENDEUR · CLIENT'));
});
test('ten cards fill page one before a separate signature page', () => {
  const result = pages(receipt(10));
  assert.equal(result.length, 2);
  for (let i = 1; i <= 10; i++) assert.ok(result[0].includes(`Carte unique ${i} /`));
  assert.ok(!result[0].includes('DÉCLARATION DU VENDEUR'));
  assert.ok(!result[1].includes('Carte / Série / Identifiant'));
  assert.ok(result[1].includes('Total payé : 80.00 EUR'));
  assert.ok(result[1].includes('DÉCLARATION DU VENDEUR'));
  assert.ok(result[1].includes('VENDEUR · CLIENT'));
});
test('long receipts keep each card once and reserve signatures only on the final page', () => {
  const result = pages(receipt(30));
  assert.equal(result.length, 3);
  const all = result.join('\n');
  for (let i = 1; i <= 30; i++) assert.equal(all.split(`Carte unique ${i} /`).length - 1, 1);
  assert.ok(result.at(-1)!.includes('Total payé : 240.00 EUR'));
  assert.equal(all.split('VENDEUR · CLIENT').length - 1, 1);
  assert.ok(result.slice(0, -1).every((page) => !page.includes('DÉCLARATION DU VENDEUR')));
});
test('a description larger than the final-page space may use a full card page', () => {
  const input = receipt(1);
  input.items[0].gradingNotes = 'Description détaillée. '.repeat(45);
  const result = pages(input);
  assert.equal(result.length, 2);
  assert.ok(result[0].includes('Description détaillée.'));
  assert.ok(result[1].includes('VENDEUR · CLIENT'));
});

test('optional agreement notes appear before signatures without changing the total', () => {
  const result = pages({ ...receipt(2), buyerNote: 'Complément de 100 € par carte si PSA 10.\nCartes : 1 et 2.', sellerNote: 'Accord du vendeur.' });
  const text = result.join('\n');
  assert.ok(text.includes('Complément de 100 EUR par carte si PSA 10.'));
  assert.ok(text.includes('Cartes : 1 et 2.'));
  assert.ok(text.includes('Accord du vendeur.'));
  assert.ok(text.includes('Total payé : 16.00 EUR'));
  assert.ok(text.indexOf('Accord du vendeur.') < text.indexOf('DÉCLARATION DU VENDEUR'));
  assert.ok(!pages(receipt(2)).join('\n').includes("NOTE DE L'ACHETEUR"));
});

test('long multiline notes paginate without losing text or signatures', () => {
  const note = Array.from({ length: 100 }, (_, i) => `Condition ${i + 1}`).join('\n');
  const result = pages({ ...receipt(10), buyerNote: note, sellerNote: 'Dernière condition.' });
  const text = result.join('\n');
  for (let i = 1; i <= 100; i++) assert.ok(text.includes(`Condition ${i}\n`));
  assert.ok(text.includes('Dernière condition.'));
  assert.ok(result.at(-1)?.includes('VENDEUR · CLIENT'));
});
