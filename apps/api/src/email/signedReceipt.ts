import type { receiptIdentity } from '../receiptIdentity.js';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]!);

export function signedReceiptEmail(input: {
  kind: 'purchase' | 'consignment' | 'consignment_return';
  reference: string;
  clientName: string;
  signedAt?: number;
  filename: string;
  identity: typeof receiptIdentity;
}) {
  const { brand, legal } = input.identity;
  const title = input.kind === 'purchase' ? 'Votre rachat, signé et confirmé' : input.kind === 'consignment_return' ? 'Votre bon de restitution signé' : 'Votre dépôt-vente, signé et confirmé';
  const document = input.kind === 'purchase' ? 'Document de rachat' : input.kind === 'consignment_return' ? 'Bon de restitution' : 'Contrat de dépôt-vente';
  const greeting = input.clientName.trim() ? `Bonjour ${input.clientName.trim()},` : 'Bonjour,';
  const date = input.signedAt ? new Intl.DateTimeFormat('fr-BE', {
    dateStyle: 'long', timeZone: 'Europe/Brussels',
  }).format(input.signedAt) : undefined;
  const e = escapeHtml;
  const contact = legal.email;
  const subject = `${brand.name} — votre ${input.kind === 'purchase' ? 'rachat' : input.kind === 'consignment_return' ? 'bon de restitution' : 'dépôt-vente'} signé · ${input.reference}`;
  const text = `${greeting}\n\nMerci pour votre confiance. Vous trouverez en pièce jointe votre exemplaire du document signé par les deux parties.\n\n${document}\nRéférence : ${input.reference}${date ? `\nSigné le : ${date}` : ''}\nPièce jointe : ${input.filename}\n\nConservez ce PDF : il reprend les détails et les conditions de notre accord.\n\nUne question concernant votre document ? Écrivez-nous à ${contact} en rappelant la référence ${input.reference}.\n\nÀ bientôt,\nL’équipe ${brand.name}\n${legal.companyName} ${legal.legalForm} · ${legal.vatNumber}\n${legal.address} · ${legal.country}`;
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:#f7f3eb;color:#2c211b;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Votre exemplaire signé est joint à cet e-mail. Référence ${e(input.reference)}.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f3eb;"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fffdf8;border:1px solid #e4d9c7;border-radius:16px;overflow:hidden;">
<tr><td style="padding:28px 28px 24px;background:#2c211b;border-top:5px solid #efbd53;">
<p style="margin:0;color:#efbd53;font-size:28px;font-weight:700;letter-spacing:1px;">${e(brand.name)}</p>
<p style="margin:8px 0 0;color:#f7f3eb;font-size:12px;letter-spacing:2px;">CARTES &amp; COLLECTIONS</p>
</td></tr>
<tr><td style="padding:32px 28px;">
<p style="margin:0 0 14px;color:#795018;font-size:12px;font-weight:700;letter-spacing:2px;">VOTRE EXEMPLAIRE SIGNÉ</p>
<h1 style="margin:0 0 26px;font-size:28px;line-height:1.25;font-weight:700;">${e(title)}</h1>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;">${e(greeting)}</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.7;">Merci pour votre confiance. Vous trouverez en pièce jointe <strong>votre exemplaire du document signé par les deux parties</strong>.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fbf0d9;border:1px solid #e4d9c7;border-radius:10px;"><tr><td style="padding:22px;">
<p style="margin:0 0 12px;font-size:17px;font-weight:700;">${e(document)}</p>
<p style="margin:0;font-size:14px;line-height:1.8;">Référence : <strong>${e(input.reference)}</strong>${date ? `<br>Signé le : ${e(date)}` : ''}</p>
<p style="margin:16px 0 0;padding-top:14px;border-top:1px solid #e4d9c7;font-size:13px;line-height:1.6;overflow-wrap:anywhere;word-break:break-word;"><strong>PDF en pièce jointe</strong><br>${e(input.filename)}</p>
</td></tr></table>
<p style="margin:20px 0 28px;color:#75695c;font-size:14px;line-height:1.7;">Conservez ce PDF : il reprend les détails et les conditions de notre accord.</p>
<p style="margin:0 0 12px;font-size:16px;font-weight:700;">Une question concernant votre document ?</p>
<p style="margin:0 0 28px;font-size:14px;line-height:1.7;">Écrivez-nous à <a href="mailto:${e(encodeURIComponent(contact))}" style="color:#795018;text-decoration:underline;">${e(contact)}</a> en rappelant la référence <strong>${e(input.reference)}</strong>.</p>
<p style="margin:0;font-size:15px;line-height:1.7;">À bientôt,<br><strong>L’équipe ${e(brand.name)}</strong></p>
</td></tr>
<tr><td style="padding:22px 28px;border-top:1px solid #e4d9c7;background:#f7f3eb;color:#75695c;font-size:12px;line-height:1.8;">${e(legal.companyName)} ${e(legal.legalForm)} · ${e(legal.vatNumber)}<br>${e(legal.address)} · ${e(legal.country)}<br>Ce message accompagne votre document signé.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html, text };
}
