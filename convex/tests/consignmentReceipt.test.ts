import assert from 'node:assert/strict';
import test from 'node:test';
import { brand } from '../../branding/brand';
import { legal } from '../../branding/legal';
import { createConsignmentReceiptPdf } from '../../packages/domain/src/consignmentReceipt';

const logo = { width: 1, height: 1, jpegHex: 'ffd8ffd9' };
const input = {
  reference: 'DEP-TEST',
  occurredAt: 1795000000000,
  client: { name: 'Élodie Déposante', email: 'elodie@example.test' },
  signatory: { firstName: 'Alex', lastName: 'Martin', capacity: 'Gérant' },
  items: [
    {
      name: 'Coffret scellé',
      productType: 'sealed' as const,
      agreedPriceCents: 8990,
      commissionRateBps: 2500,
    },
  ],
};
const text = (pdf: string) =>
  [...pdf.matchAll(/<([0-9a-f]+)> Tj/g)]
    .map((match) => Buffer.from(match[1], 'hex').toString('latin1'))
    .join('\n');
test('deposit receipt shows agreed amounts and rounded commission, not an amount paid', () => {
  const pdf = createConsignmentReceiptPdf(input, logo, { brand, legal });
  const content = text(pdf);
  for (const value of [
    'Bon de dépôt-vente',
    'Élodie Déposante',
    'Alex Martin',
    'Gérant',
    '89.90 EUR',
    '22.48 EUR',
    '67.42 EUR',
    'AUCUN VERSEMENT ATTESTÉ',
  ])
    assert.ok(content.includes(value), value);
  assert.ok(!content.includes('Total payé'));
  assert.ok(!content.includes('Near Mint'));
  assert.ok(content.includes('Non définie'));
  const start = Number(pdf.match(/startxref\n(\d+)/)?.[1]);
  assert.equal(pdf.slice(start, start + 4), 'xref');
  assert.equal(
    Buffer.byteLength(pdf),
    pdf.length,
    'ASCII streams preserve PDF offsets on mobile UTF-8 writes',
  );
});
test('long receipts retain every article and paginate with signatures only on final page', () => {
  const pdf = createConsignmentReceiptPdf(
    {
      ...input,
      items: Array.from({ length: 30 }, (_, i) => ({
        ...input.items[0],
        name: `Article unique ${i}`,
        description: 'Description détaillée. '.repeat(30),
      })),
      notes: 'Conditions convenues. '.repeat(200),
    },
    logo,
    { brand, legal },
  );
  const content = text(pdf);
  for (let i = 0; i < 30; i++) assert.ok(content.includes(`Article unique ${i}`));
  assert.equal(content.match(/DÉPOSITAIRE/g)?.length, 1);
  assert.equal(content.match(/DÉPOSANT · CLIENT/g)?.length, 1);
  assert.ok(Number(pdf.match(/\/Count (\d+)/)?.[1]) > 1);
  assert.ok(content.includes('Total au prix convenu : 2697.00 EUR'));
  assert.ok(content.includes('Part déposant prévue : 2022.60 EUR'));
});
