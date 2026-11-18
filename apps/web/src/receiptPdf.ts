export type ReceiptPdfInput = {
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

const plain = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?');
const pdfText = (value: string) => {
  const bytes = Array.from(plain(value), (character) => character.charCodeAt(0));
  return `<${bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')}>`;
};
const money = (cents: number) => `${(cents / 100).toFixed(2)} EUR`;

export function createPurchaseReceiptPdf(receipt: ReceiptPdfInput): Blob {
  const rowsPerPage = 14;
  const groups: ReceiptPdfInput['items'][] = [];
  for (let i = 0; i < receipt.items.length; i += rowsPerPage)
    groups.push(receipt.items.slice(i, i + rowsPerPage));
  if (!groups.length) groups.push([]);
  const pageIds = groups.map((_, index) => 5 + index * 2);
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${groups.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  for (const [pageIndex, items] of groups.entries()) {
    const pageId = 5 + pageIndex * 2;
    const contentId = pageId + 1;
    const commands: string[] = [];
    const draw = (x: number, y: number, size: number, text: string, bold = false) => {
      commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td ${pdfText(text)} Tj ET`);
    };
    draw(48, 790, 22, 'Bordereau de rachat', true);
    draw(48, 765, 11, `Reference : ${receipt.reference}`);
    draw(48, 748, 11, `Date : ${new Date(receipt.occurredAt).toLocaleString('fr-BE')}`);
    draw(48, 730, 10, `Statut : ${receipt.status === 'active' ? 'valide' : receipt.status === 'cancelled' ? 'annule' : 'en attente de validation du client'}`, true);
    draw(48, 710, 12, `Client : ${receipt.client.name}`, true);
    if (receipt.client.email) draw(48, 693, 10, `E-mail : ${receipt.client.email}`);
    if (receipt.client.phone) draw(48, 677, 10, `Telephone : ${receipt.client.phone}`);
    if (receipt.client.address) draw(48, 661, 10, `Adresse : ${receipt.client.address}`);
    draw(48, 628, 10, 'Carte / Serie / Identifiant / Gradation');
    draw(365, 628, 10, 'Valeur');
    draw(430, 628, 10, 'Decote');
    draw(490, 628, 10, 'Prix paye');
    commands.push('0.3 w 48 620 m 547 620 l S');
    let y = 601;
    for (const item of items) {
      const grading = item.gradingCompany ? `${item.gradingCompany} ${item.gradingGrade || ''} ${item.gradingCertificate || ''} ${item.gradingNotes || ''}` : 'Non gradee';
      const identity = `${item.name} / ${item.series || '-'} / ${item.identifier || '-'} / ${item.language || 'Francais'} / ${item.condition || 'Near Mint'}`;
      const gradeLine = item.gradingCompany
        ? `${item.gradingCompany} ${item.gradingGrade || ''} | Cert. ${item.gradingCertificate || '-'}`
        : 'Non gradee';
      draw(48, y + 4, 8, identity.slice(0, 88));
      draw(48, y - 6, 7, gradeLine.slice(0, 84));
      if (item.gradingNotes) draw(48, y - 15, 6, `Notes: ${item.gradingNotes}`.slice(0, 105));
      draw(365, y, 8, money(item.marketValueCents));
      draw(430, y, 8, `${item.discountPercent}%`);
      draw(490, y, 8, money(item.purchasePriceCents));
      y -= 30;
    }
    if (pageIndex === groups.length - 1) {
      const total = receipt.items.reduce((sum, item) => sum + item.purchasePriceCents, 0);
      draw(365, Math.max(y - 6, 118), 12, `Total paye : ${money(total)}`, true);
      commands.push('0.3 w 48 75 m 260 75 l S 335 75 m 547 75 l S');
      draw(48, 58, 9, 'Signature du vendeur');
      draw(335, 58, 9, 'Signature du client');
    }
    const stream = commands.join('\n');
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
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
  return new Blob([pdf], { type: 'application/pdf' });
}
