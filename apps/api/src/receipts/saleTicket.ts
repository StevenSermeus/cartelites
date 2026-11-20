import { createConsignmentDocumentPdf } from './consignmentDocument.js';
import type { receiptIdentity } from '../receiptIdentity.js';
export type TicketSnapshot = {
  reference: string;
  occurredAt: number;
  lines: {
    saleId: string;
    name: string;
    quantity: number;
    totalCents: number;
    status: string;
    paymentStatus: string;
    payment?: { cashCents: number; transferCents: number } | null;
    vatRegime: string;
    origin: string;
    taxRateBps: number | null;
  }[];
};
const money = (c: number) => (c / 100).toFixed(2).replace('.', ',') + ' EUR';
export function createSaleTicketPdf(snapshot: TicketSnapshot, identity: typeof receiptIdentity) {
  const active = snapshot.lines.filter((l) => l.status === 'active');
  const pdf = createConsignmentDocumentPdf(
    {
      title: 'Ticket de vente',
      clientLabel: 'Client',
      reference: snapshot.reference,
      occurredAt: snapshot.occurredAt,
      client: { name: 'Vente au comptoir' },
      lines: snapshot.lines.map((l) => ({
        label: `${l.quantity} x ${l.name}${l.status === 'cancelled' ? ' - ANNULEE' : ''}`,
        detail: `Total : ${money(l.totalCents)} | ${l.paymentStatus === 'received' ? 'Paiement reçu' : l.paymentStatus === 'pending' ? 'A encaisser' : 'Paiement non renseigné'}${l.origin === 'supplier' && l.taxRateBps !== null ? ` | TVA ${l.taxRateBps / 100} % incluse : ${money(Math.round((l.totalCents * l.taxRateBps) / (10000 + l.taxRateBps)))}` : l.vatRegime === 'margin' ? ' | Régime de la marge - TVA non détaillée' : ' | Régime fiscal selon dossier'}`,
      })),
      totals: [
        `Total des ventes actives : ${money(active.reduce((s, l) => s + l.totalCents, 0))}`,
        `Espèces reçues : ${money(active.reduce((s, l) => s + (l.payment?.cashCents ?? 0), 0))}`,
        `Virements reçus : ${money(active.reduce((s, l) => s + (l.payment?.transferCents ?? 0), 0))}`,
        `A encaisser : ${money(active.filter((l) => l.paymentStatus === 'pending').reduce((s, l) => s + l.totalCents, 0))}`,
      ],
      notes: [
        'Ticket de vente. Conservez ce document.',
        ...(snapshot.lines.some((l) => l.status === 'cancelled')
          ? ['Les lignes annulées sont exclues du total actif.']
          : []),
      ],
    },
    identity.logo,
    identity,
  );
  return pdf;
}
