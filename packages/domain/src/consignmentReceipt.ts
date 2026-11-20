import { signaturePdf, type Signature, type ReceiptSignatures } from './signature';
export type ConsignmentReceiptIdentity = {
  brand: {
    name: string;
    colors: {
      ink: string;
      accent: string;
      soft: string;
      primary: string;
      muted: string;
      border: string;
      onPrimary: string;
      canvas: string;
      surface: string;
    };
  };
  legal: {
    companyName: string;
    legalForm: string;
    address: string;
    country: string;
    registration: string;
    vatNumber: string;
    email: string;
    website: string;
  };
};

export type SignatoryProfile = {
  firstName: string;
  lastName: string;
  capacity: string;
  signature?: Signature | null;
};

export type ConsignmentReceiptInput = {
  signatory?: SignatoryProfile;
  signatures?: ReceiptSignatures;
  reference: string;
  occurredAt: number;
  dueAt?: number;
  notes?: string;
  client: { name: string; email?: string; phone?: string; address?: string };
  items: {
    name: string;
    productType?: 'card' | 'sealed' | 'other';
    description?: string;
    series?: string;
    identifier?: string;
    language?: string;
    condition?: string;
    gradingCompany?: string;
    gradingGrade?: string;
    gradingCertificate?: string;
    askingPriceCents?: number;
    agreedPriceCents?: number;
    commissionRateBps?: number;
    status?: string;
  }[];
};

// Helvetica / WinAnsi supports French accented letters directly.
const plain = (value: string) =>
  value
    .normalize('NFC')
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, '-')
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0);
      return (code >= 32 && code <= 126) || (code >= 160 && code <= 255) ? character : '?';
    })
    .join('');
export type ReceiptLogo = { width: number; height: number; jpegHex: string };
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

export function createConsignmentReceiptPdf(
  receipt: ConsignmentReceiptInput,
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
    `Déposant : ${receipt.client.name}`,
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
  type Row = { lines: string[]; price?: number; commission?: number; rate?: number; part?: number };
  const rows: Row[] = [];
  let totalPrice = 0,
    totalCommission = 0,
    totalPart = 0;
  for (const item of receipt.items) {
    const price = item.agreedPriceCents ?? item.askingPriceCents ?? 0;
    const rate = item.commissionRateBps ?? 3000;
    if (
      !Number.isSafeInteger(price) ||
      price < 0 ||
      !Number.isInteger(rate) ||
      rate < 0 ||
      rate > 10000
    )
      throw new Error('Prix ou commission invalide pour le bon de dépôt.');
    const commission = Number((BigInt(price) * BigInt(rate) + 5000n) / 10000n);
    totalPrice += price;
    totalCommission += commission;
    totalPart += price - commission;
    const type =
      item.productType === 'sealed'
        ? 'Produit scellé'
        : item.productType === 'other'
          ? 'Autre article'
          : 'Carte';
    const status =
      item.status === 'sold' ? 'Vendu' : item.status === 'returned' ? 'Restitué' : 'En dépôt';
    const lines = [
      ...wrap(item.name, 52),
      ...wrap(
        [
          type,
          item.series,
          item.identifier,
          item.language?.toUpperCase(),
          item.productType === 'card' ? item.condition : undefined,
          status,
        ]
          .filter(Boolean)
          .join(' / '),
        52,
      ),
      ...(item.gradingCompany
        ? wrap(
            `${item.gradingCompany} ${item.gradingGrade ?? ''} | Cert. ${item.gradingCertificate ?? '-'}`,
            52,
          )
        : []),
      ...(item.description ? wrap(item.description, 52) : []),
    ];
    // Split long descriptions rather than truncating them or overflowing a page.
    for (let offset = 0; offset < lines.length; offset += 8)
      rows.push({
        lines: lines.slice(offset, offset + 8),
        ...(offset === 0 ? { price, commission, rate, part: price - commission } : {}),
      });
  }
  const conditions = [
    'MONTANTS AU PRIX CONVENU - AUCUN VERSEMENT ATTESTÉ PAR CE BON.',
    'La commission est déduite du prix de vente effectif. Le versement au déposant dépend de la vente.',
    'Toute modification du prix convenu ou du taux de commission nécessite l’accord du déposant.',
    ...(receipt.notes?.trim() ? ['CONDITIONS ET NOTES', receipt.notes] : []),
  ].flatMap((line) => wrap(line, 98));
  for (let offset = 0; offset < conditions.length; offset += 8)
    rows.push({ lines: conditions.slice(offset, offset + 8) });
  const itemHeight = (row: Row) => Math.max(34, row.lines.length * 11 + 12);
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
    135 + Math.max(buyerSignatureLines.length, sellerSignatureLines.length) * 12;
  const signatureTop = 50 + signatureHeight;
  const availableHeight = tableTop - signatureTop - 110;
  if (availableHeight < 30)
    throw new Error('Les coordonnees du bordereau sont trop longues pour tenir sur une page.');
  const normalPageHeight = tableTop - 85;
  const groups: Row[][] = [[]];
  let usedHeight = 0;
  for (const item of rows) {
    const height = itemHeight(item);
    if (height > normalPageHeight)
      throw new Error('La description d’une carte est trop longue pour tenir sur une page.');
    if (usedHeight + height > normalPageHeight) {
      groups.push([]);
      usedHeight = 0;
    }
    groups[groups.length - 1].push(item);
    usedHeight += height;
  }
  // Only the final page reserves space for totals and signatures.
  const last = groups[groups.length - 1];
  if (last.reduce((sum, row) => sum + itemHeight(row), 0) > availableHeight) {
    const tail: Row[] = [];
    let tailHeight = 0;
    while (last.length && tailHeight + itemHeight(last[last.length - 1]) <= availableHeight) {
      const row = last.pop();
      if (!row) break;
      tail.unshift(row);
      tailHeight += itemHeight(row);
    }
    groups.push(tail);
  }
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
    const box = (x: number, y: number, width: number, height: number, color: string) => {
      commands.push(`${rgb(color)} rg ${x} ${y} ${width} ${height} re f`);
    };
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
    draw(194, 751, 18, 'Bon de dépôt-vente', true);
    draw(194, 732, 9, 'ARTICLES CONFIÉS EN DÉPÔT-VENTE', false, brand.colors.muted);
    commands.push(`${rgb(brand.colors.border)} RG`);
    companyLines.forEach((line, index) => {
      draw(48, 688 - index * 12, 9, line, index === 0);
    });
    commands.push(`0.3 w 48 ${companyBottom} m 547 ${companyBottom} l S`);
    referenceLines.forEach((line, index) => {
      draw(48, referenceTop - index * 13, 10, line);
    });
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
      `Échéance : ${receipt.dueAt ? new Date(receipt.dueAt).toLocaleDateString('fr-BE', { timeZone: 'Europe/Brussels' }) : 'Non définie'}`,
      true,
    );
    clientLines.forEach((line, index) => {
      draw(48, clientTop - index * 13, 10, line, index === 0);
    });
    box(40, tableTop - 9, 515, 26, brand.colors.primary);
    draw(48, tableTop, 10, 'Article / Description', true, brand.colors.onPrimary);
    draw(325, tableTop, 9, 'Prix convenu', true, brand.colors.onPrimary);
    draw(407, tableTop, 9, 'Commission', true, brand.colors.onPrimary);
    draw(485, tableTop, 9, 'Déposant', true, brand.colors.onPrimary);
    commands.push(`0.3 w 48 ${tableTop - 8} m 547 ${tableTop - 8} l S`);
    let y = tableTop - 27;
    for (const [itemIndex, item] of items.entries()) {
      if (itemIndex % 2 === 0)
        box(40, y - itemHeight(item) + 14, 515, itemHeight(item), brand.colors.canvas);
      item.lines.forEach((line, index) => {
        draw(48, y + 4 - index * 11, 8, line);
      });
      if (item.price !== undefined) {
        draw(325, y, 8, money(item.price));
        draw(407, y, 8, money(item.commission ?? 0));
        draw(407, y - 12, 8, `${(item.rate ?? 0) / 100} %`);
        draw(485, y, 8, money(item.part ?? 0));
      }
      y -= itemHeight(item);
    }
    if (pageIndex === groups.length - 1) {
      const totalY = Math.max(y - 14, signatureTop + 68);
      box(260, totalY - 46, 295, 70, brand.colors.soft);
      box(260, totalY - 46, 4, 70, brand.colors.accent);
      draw(
        275,
        totalY + 5,
        11,
        `Total au prix convenu : ${money(totalPrice)}`,
        true,
        brand.colors.primary,
      );
      draw(275, totalY - 13, 10, `Commissions prévues : ${money(totalCommission)}`);
      draw(
        275,
        totalY - 31,
        11,
        `Part déposant prévue : ${money(totalPart)}`,
        true,
        brand.colors.primary,
      );
      for (const [x, title, lines] of [
        [40, 'DÉPOSITAIRE · SOCIÉTÉ', buyerSignatureLines],
        [305, 'DÉPOSANT · CLIENT', sellerSignatureLines],
      ] as const) {
        box(x, 50, 250, signatureHeight, brand.colors.surface);
        commands.push(`${rgb(brand.colors.border)} RG 0.6 w ${x} 50 250 ${signatureHeight} re S`);
        draw(x + 10, signatureTop - 18, 9, title, true, brand.colors.primary);
        lines.forEach((line, index) => {
          draw(x + 10, signatureTop - 36 - index * 12, 9, line);
        });
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
