import type {
  ConsignmentReceiptIdentity,
  ReceiptLogo,
} from './consignmentReceipt.js';
import { signaturePdf, type ReceiptSignatures } from './signature.js';
export type ConsignmentDocumentInput = {
  title: string;
  clientLabel?: string;
  reference: string;
  occurredAt: number;
  client: { name: string; email?: string; phone?: string; address?: string };
  lines: { label: string; detail: string }[];
  totals: string[];
  notes: string[];
  signatory?: { firstName: string; lastName: string; capacity: string };
  signatures?: ReceiptSignatures;
  signatureRequired?: boolean;
};
const plain = (s: string) =>
  s
    .normalize("NFC")
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
const hex = (s: string) =>
  `<${Array.from(plain(s), (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("")}>`;
const rgb = (s: string) =>
  [1, 3, 5]
    .map((i) => (parseInt(s.slice(i, i + 2), 16) / 255).toFixed(4))
    .join(" ");
const wrap = (s: string, max = 92) => {
  const result: string[] = [];
  let line = "";
  for (let word of plain(s).split(/\s+/)) {
    if (line && line.length + word.length + 1 > max) {
      result.push(line);
      line = "";
    }
    while (word.length > max) {
      result.push(word.slice(0, max));
      word = word.slice(max);
    }
    line = line ? `${line} ${word}` : word;
  }
  if (line) result.push(line);
  return result;
};
/** Immutable accounting snapshots; deliberately no tax or payment attestation is inferred. */
export function createConsignmentDocumentPdf(
  input: ConsignmentDocumentInput,
  logo: ReceiptLogo,
  identity: ConsignmentReceiptIdentity,
): string {
  const { brand, legal } = identity;
  const rows: { text: string; bold?: boolean }[] = [];
  for (const line of input.lines) {
    rows.push(
      ...wrap(line.label).map((text) => ({ text, bold: true })),
      ...wrap(line.detail).map((text) => ({ text })),
      { text: "" },
    );
  }
  rows.push(
    ...input.totals.flatMap((t) =>
      wrap(t).map((text) => ({ text, bold: true })),
    ),
    { text: "" },
    ...input.notes.flatMap((t) => wrap(t).map((text) => ({ text }))),
  );
  const headerLines = [
    `${legal.companyName} ${legal.legalForm} | BCE ${legal.registration} | TVA ${legal.vatNumber}`,
    `${legal.address} | ${legal.email}`,
    `Référence : ${input.reference}`,
    `Date : ${new Date(input.occurredAt).toLocaleString("fr-BE", { timeZone: "Europe/Brussels" })}`,
    `${input.clientLabel ?? "Déposant"} : ${input.client.name}`,
    input.client.email ?? "",
  ].flatMap((t) => wrap(t));
  const startY = 718 - headerLines.length * 12 - 18;
  const capacity = Math.floor((startY - 60) / 13),
    finalCapacity = Math.floor((startY - 245) / 13);
  if (finalCapacity < 1)
    throw new Error("Coordonnées trop longues pour le document.");
  const signing = input.signatureRequired || !!input.signatures;
  const groups: (typeof rows)[] = [];
  for (let i = 0; i < rows.length; i += capacity)
    groups.push(rows.slice(i, i + capacity));
  if (!groups.length) groups.push([]);
  if (signing && groups.at(-1)!.length > finalCapacity) groups.push([]);
  const ids = groups.map((_, i) => 6 + i * 2);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${ids.map((id) => `${id} 0 R`).join(" ")}] /Count ${groups.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  const image = `${logo.jpegHex}>`;
  objects.push(
    `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${image.length} >>\nstream\n${image}\nendstream`,
  );
  for (const [index, lines] of groups.entries()) {
    const commands: string[] = [];
    const draw = (
      x: number,
      y: number,
      size: number,
      text: string,
      bold = false,
    ) =>
      commands.push(
        `${rgb(brand.colors.ink)} rg BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td ${hex(text)} Tj ET`,
      );
    commands.push(`${rgb(brand.colors.accent)} rg 0 830 595 12 re f`);
    const scale = Math.min(95 / logo.width, 65 / logo.height);
    commands.push(
      `q ${logo.width * scale} 0 0 ${logo.height * scale} 40 744 cm /Logo Do Q`,
    );
    draw(150, 790, 20, brand.name, true);
    draw(150, 764, 16, input.title, true);
    let y = 718;
    for (const line of headerLines) {
      draw(40, y, 9, line);
      y -= 12;
    }
    y -= 18;
    for (const row of lines) {
      draw(40, y, 9, row.text, !!row.bold);
      y -= 13;
    }
    if (signing && index === groups.length - 1) {
      const signatories = [
        `${input.signatory?.firstName ?? ""} ${input.signatory?.lastName ?? ""}`,
        input.client.name,
      ];
      for (const [i, x] of [40, 305].entries()) {
        commands.push(
          `${rgb(brand.colors.border)} RG 0.6 w ${x} 50 250 175 re S`,
        );
        draw(x + 10, 205, 10, i === 0 ? "BOUTIQUE" : "DÉPOSANT", true);
        wrap(signatories[i], 38)
          .slice(0, 3)
          .forEach((line, j) => draw(x + 10, 189 - j * 11, 9, line));
        if (input.signatures)
          commands.push(
            signaturePdf(
              i === 0 ? input.signatures.company : input.signatures.client,
              x + 20,
              82,
            ),
          );
        draw(
          x + 10,
          65,
          8,
          input.signatures
            ? `Signé le ${new Date(input.signatures.signedAt).toLocaleDateString("fr-BE", { timeZone: "Europe/Brussels" })}`
            : "Signature :",
        );
      }
    }
    draw(40, 28, 8, `${legal.companyName} ${legal.legalForm} - ${brand.name}`);
    draw(480, 28, 8, `Page ${index + 1} / ${groups.length}`);
    const stream = commands.join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Logo 5 0 R >> >> /Contents ${ids[index] + 1} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  }
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, obj] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets.slice(1))
    pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  return (
    pdf +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  );
}
