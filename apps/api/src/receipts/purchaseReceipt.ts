import type {
  ConsignmentReceiptIdentity,
  ReceiptLogo,
  SignatoryProfile,
} from './consignmentReceipt.js';
import { signaturePdf, type ReceiptSignatures } from './signature.js';
export type ReceiptPdfInput = {
  buyerNote?: string;
  sellerNote?: string;
  signatory?: SignatoryProfile;
  signatures?: ReceiptSignatures;
  reference: string;
  occurredAt: number;
  status?: 'pending' | 'active' | 'cancelled';
  client: { name: string; email?: string; phone?: string; address?: string };
  items: {
    name: string;
    series: string;
    identifier: string;
    language?: string;
    condition?: string;
    gradingCompany?: string;
    gradingGrade?: string;
    gradingCertificate?: string;
    gradingNotes?: string;
    marketValueCents: number;
    discountPercent: number;
    purchasePriceCents: number;
  }[];
};

// Helvetica / WinAnsi supports French accented letters directly.
const plain = (value: string) =>
  value
    .normalize('NFC')
    .replace(/€/g, 'EUR')
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

const rgb = (hex: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex))
    throw new Error('Les couleurs du bordereau doivent être au format #RRGGBB.');
  return [1, 3, 5]
    .map((offset) => (parseInt(hex.slice(offset, offset + 2), 16) / 255).toFixed(4))
    .join(' ');
};
const pdfText = (value: string) => {
  const bytes = Array.from(plain(value), (character) => character.charCodeAt(0));
  return `<${bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')}>`;
};
const money = (cents: number) => `${(cents / 100).toFixed(2)} EUR`;

export function createPurchaseReceiptPdf(
  receipt: ReceiptPdfInput,
  logo: ReceiptLogo,
  identity: ConsignmentReceiptIdentity,
): string {
  const { brand, legal } = identity;
  // Conservative wrapping leaves room for the widest Helvetica characters.
  const wrap = (text: string, maxCharacters: number): string[] => {
    const words = plain(text).split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (let word of words) {
      if (line && line.length + word.length + 1 > maxCharacters) {
        lines.push(line);
        line = '';
      }
      while (word.length > maxCharacters) {
        lines.push(word.slice(0, maxCharacters));
        word = word.slice(maxCharacters);
      }
      line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    return lines;
  };
  const value = (text: string) => text.trim() || 'À renseigner';
  const companyLines = [
    `Société : ${value(legal.companyName)} | Forme juridique : ${value(legal.legalForm)}`,
    `Nom commercial : ${brand.name}`,
    `Siège : ${value(legal.address)} | ${value(legal.country)}`,
    `BCE : ${value(legal.registration)} | TVA : ${value(legal.vatNumber)}`,
    `E-mail : ${value(legal.email)}${legal.website.trim() ? ` | Site : ${legal.website.trim()}` : ''}`,
  ].flatMap((line) => wrap(line, 92));
  const clientLines = [
    `Client : ${receipt.client.name}`,
    receipt.client.email ? `E-mail : ${receipt.client.email}` : '',
    receipt.client.phone ? `Téléphone : ${receipt.client.phone}` : '',
    receipt.client.address ? `Adresse : ${receipt.client.address}` : '',
  ]
    .filter(Boolean)
    .flatMap((line) => wrap(line, 85));
  const referenceLines = wrap(`Référence : ${receipt.reference}`, 85);
  const companyBottom = 688 - companyLines.length * 12;
  const referenceTop = companyBottom - 24;
  const dateY = referenceTop - referenceLines.length * 13;
  const clientTop = dateY - 46;
  const tableTop = clientTop - clientLines.length * 13 - 20;
  const itemLines = (item: ReceiptPdfInput['items'][number]) => [
    ...wrap(
      `${item.name} / ${item.series || '-'} / ${item.identifier || '-'} / ${item.language || 'Francais'} / ${item.condition || 'Near Mint'}`,
      61,
    ),
    ...wrap(
      item.gradingCompany
        ? `${item.gradingCompany} ${item.gradingGrade || ''} | Cert. ${item.gradingCertificate || '-'}`
        : 'Non gradee',
      61,
    ),
    ...(item.gradingNotes ? wrap(`Notes : ${item.gradingNotes}`, 61) : []),
  ];
  const itemHeight = (item: ReceiptPdfInput['items'][number]) =>
    Math.max(30, itemLines(item).length * 10 + 10);
  const buyerSignatureLines = [
    ...wrap(`Société : ${value(legal.companyName)} ${legal.legalForm}`, 38),
    ...wrap(
      `Nom et prénom : ${value([receipt.signatory?.firstName, receipt.signatory?.lastName].filter(Boolean).join(' '))}`,
      38,
    ),
    ...wrap(`Qualité : ${value(receipt.signatory?.capacity ?? '')}`, 38),
  ];
  const sellerSignatureLines = wrap(`Nom et prénom : ${receipt.client.name}`, 38);
  const signatureHeight =
    145 + Math.max(buyerSignatureLines.length, sellerSignatureLines.length) * 12;
  const signatureTop = 50 + signatureHeight;
  const sellerDeclarationLines = wrap(
    'Le vendeur déclare que les biens faisant l’objet du présent bordereau n’ont donné lieu, dans son chef, à aucune déduction ni restitution de TVA.',
    95,
  );
  const declarationHeight = 32 + sellerDeclarationLines.length * 12;
  const declarationTop = signatureTop + declarationHeight;
  // Only the final page needs space for the declaration and signatures.
  // Fill preceding pages down to the footer instead of reserving that space
  // on every page (which used to limit a page to just a few cards).
  const finalPageHeight = tableTop - declarationTop - 70;
  const availableHeight = tableTop - 70;
  if (finalPageHeight < 30)
    throw new Error('Les coordonnees du bordereau sont trop longues pour tenir sur une page.');
  const groups: ReceiptPdfInput['items'][] = [[]];
  let usedHeight = 0;
  for (const item of receipt.items) {
    const height = itemHeight(item);
    if (height > availableHeight)
      throw new Error('La description d’une carte est trop longue pour tenir sur une page.');
    if (usedHeight + height > availableHeight) {
      groups.push([]);
      usedHeight = 0;
    }
    groups[groups.length - 1].push(item);
    usedHeight += height;
  }
  const pageNotes: { text: string; bold: boolean }[][] = groups.map(() => []);
  for (const [title, note] of [['NOTE DE L’ACHETEUR', receipt.buyerNote], ['NOTE DU VENDEUR', receipt.sellerNote]]) {
    if (!note?.trim()) continue;
    const lines = note.trim().split(/\r?\n/).flatMap(line => wrap(line, 85).length ? wrap(line, 85) : ['']);
    const rows = [{ text: title!, bold: true }, ...lines.map(text => ({ text, bold: false })), { text: '', bold: false }];
    for (const [index, row] of rows.entries()) {
      if (usedHeight + (index === 0 ? 28 : 14) > availableHeight) {
        groups.push([]); pageNotes.push([]); usedHeight = 0;
      }
      pageNotes[groups.length - 1].push(row);
      usedHeight += 14;
    }
  }
  if (usedHeight > finalPageHeight) { groups.push([]); pageNotes.push([]); }
  const pageIds = groups.map((_, index) => 6 + index * 2);
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${groups.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  const logoStream = `${logo.jpegHex}>`;
  objects.push(
    `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${logoStream.length} >>\nstream\n${logoStream}\nendstream`,
  );
  for (const [pageIndex, items] of groups.entries()) {
    const pageId = 6 + pageIndex * 2;
    const contentId = pageId + 1;
    const commands: string[] = [];
    const draw = (
      x: number,
      y: number,
      size: number,
      text: string,
      bold = false,
      color = brand.colors.ink,
    ) => {
      commands.push(
        `${rgb(color)} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td ${pdfText(text)} Tj ET`,
      );
    };
    const box = (x: number, y: number, width: number, height: number, color: string) =>
      commands.push(`${rgb(color)} rg ${x} ${y} ${width} ${height} re f`);
    box(0, 830, 595, 12, brand.colors.accent);
    box(36, 716, 523, 98, brand.colors.soft);
    const logoScale = Math.min(128 / logo.width, 84 / logo.height);
    const logoWidth = logo.width * logoScale;
    const logoHeight = logo.height * logoScale;
    commands.push(
      `q ${logoWidth} 0 0 ${logoHeight} ${48 + (128 - logoWidth) / 2} ${723 + (84 - logoHeight) / 2} cm /Logo Do Q`,
    );
    draw(
      194,
      779,
      Math.min(23, 330 / Math.max(1, brand.name.length * 0.7)),
      brand.name,
      true,
      brand.colors.primary,
    );
    draw(194, 751, 18, 'Bordereau de rachat', true);
    draw(194, 732, 9, 'CARTES DE COLLECTION', false, brand.colors.muted);
    commands.push(`${rgb(brand.colors.border)} RG`);
    companyLines.forEach((line, index) => draw(48, 688 - index * 12, 9, line, index === 0));
    commands.push(`0.3 w 48 ${companyBottom} m 547 ${companyBottom} l S`);
    referenceLines.forEach((line, index) => draw(48, referenceTop - index * 13, 10, line));
    draw(
      48,
      dateY,
      10,
      `Date : ${new Date(receipt.occurredAt).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels' })}`,
    );
    draw(
      48,
      dateY - 17,
      10,
      `Statut : ${receipt.status === 'active' ? 'valide' : receipt.status === 'cancelled' ? 'annule' : 'en attente de validation du client'}`,
      true,
    );
    clientLines.forEach((line, index) => draw(48, clientTop - index * 13, 10, line, index === 0));
    if (items.length || groups.length === 1) {
      box(40, tableTop - 9, 515, 26, brand.colors.primary);
      draw(48, tableTop, 10, 'Carte / Série / Identifiant / Gradation', true, brand.colors.onPrimary);
      draw(365, tableTop, 10, 'Valeur', true, brand.colors.onPrimary);
      draw(430, tableTop, 10, 'Décote', true, brand.colors.onPrimary);
      draw(490, tableTop, 10, 'Prix payé', true, brand.colors.onPrimary);
      commands.push(`0.3 w 48 ${tableTop - 8} m 547 ${tableTop - 8} l S`);
    }
    let y = tableTop - 27;
    for (const [itemIndex, item] of items.entries()) {
      if (itemIndex % 2 === 0)
        box(40, y - itemHeight(item) + 14, 515, itemHeight(item), brand.colors.canvas);
      itemLines(item).forEach((line, index) => draw(48, y + 4 - index * 10, 8, line));
      draw(365, y, 8, money(item.marketValueCents));
      draw(430, y, 8, `${item.discountPercent}%`);
      draw(490, y, 8, money(item.purchasePriceCents));
      y -= itemHeight(item);
    }
    for (const row of pageNotes[pageIndex]) {
      draw(48, y, 9, row.text, row.bold);
      y -= 14;
    }
    if (pageIndex === groups.length - 1) {
      const total = receipt.items.reduce((sum, item) => sum + item.purchasePriceCents, 0);
      const totalY = Math.max(y - 14, declarationTop + 30);
      box(325, totalY - 12, 230, 36, brand.colors.soft);
      box(325, totalY - 12, 4, 36, brand.colors.accent);
      draw(340, totalY, 12, `Total payé : ${money(total)}`, true, brand.colors.primary);
      draw(48, declarationTop - 14, 9, 'DÉCLARATION DU VENDEUR', true, brand.colors.primary);
      sellerDeclarationLines.forEach((line, index) =>
        draw(48, declarationTop - 30 - index * 12, 9, line),
      );
      for (const [x, title, lines] of [
        [40, 'ACHETEUR · SOCIÉTÉ', buyerSignatureLines],
        [305, 'VENDEUR · CLIENT', sellerSignatureLines],
      ] as const) {
        box(x, 50, 250, signatureHeight, brand.colors.surface);
        commands.push(`${rgb(brand.colors.border)} RG 0.6 w ${x} 50 250 ${signatureHeight} re S`);
        draw(x + 10, signatureTop - 18, 9, title, true, brand.colors.primary);
        lines.forEach((line, index) => draw(x + 10, signatureTop - 36 - index * 12, 9, line));
        draw(
          x + 10,
          65,
          8,
          receipt.signatures
            ? `Signé le ${new Date(receipt.signatures.signedAt).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels' })}`
            : 'Signature :',
          false,
          brand.colors.muted,
        );
        if (receipt.signatures)
          commands.push(
            signaturePdf(
              x === 40 ? receipt.signatures.company : receipt.signatures.client,
              x + 20,
              82,
            ),
          );
      }
    }
    draw(
      48,
      28,
      8,
      `${legal.companyName} ${legal.legalForm} · ${brand.name}`,
      false,
      brand.colors.muted,
    );
    draw(480, 28, 8, `Page ${pageIndex + 1} / ${groups.length}`);
    const stream = commands.join('\n');
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Logo 5 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}
