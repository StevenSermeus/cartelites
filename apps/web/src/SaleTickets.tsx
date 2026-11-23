import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FiDownload, FiFileText, FiMail } from 'react-icons/fi';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './components/ui/dialog';
import { OperationAttempt } from './lib/operationAttempt';
import { ticketEmailRecovery } from './lib/ticketEmailRecovery';
import { formatDate } from './shopFormat';
import type { Request } from './GradingCompanies';
type Ticket = {
  _id: string;
  createdAt: number;
  objectKey?: string;
  snapshot: { reference: string };
};
export function SaleTickets({ saleIds, request }: { saleIds: string[]; request: Request }) {
  const recovery = ticketEmailRecovery(request as Request & {accountId?: string});
  useSyncExternalStore(recovery.subscribe, recovery.getRevision);
  const pending = recovery.pending;
  const emailStatus = recovery.attempt.status;
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<Ticket[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [revision, setRevision] = useState(0);
  const [recipient, setRecipient] = useState(pending?.recipient ?? ''),
    [emailId, setEmailId] = useState<string | null>(pending?.ticketId ?? null);
  const attempt = useRef(new OperationAttempt()), lock = useRef(false);
  useEffect(() => {
    if (pending) { setRecipient(pending.recipient); setEmailId(pending.ticketId); }
  }, [pending?.operationId, pending?.recipient, pending?.ticketId]);
  const opener = useRef<HTMLButtonElement>(null);
  const key = JSON.stringify(saleIds);
  useEffect(() => {
    if (!open || !saleIds.length) return;
    let active = true;
    setError('');
    setBusy(true);
    void request<Ticket[]>(`/sale-tickets?saleId=${encodeURIComponent(saleIds[0])}`)
      .then((value) => {
        if (active) setRows(value);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Tickets indisponibles.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [open, key, revision, request]);
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action impossible.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function download(id: string) {
    const pdf = await request<{ filename: string; pdfBase64: string }>(
      `/sale-tickets/${encodeURIComponent(id)}/pdf`,
    );
    const url = URL.createObjectURL(
      new Blob([Uint8Array.from(atob(pdf.pdfBase64), (c) => c.charCodeAt(0))], {
        type: 'application/pdf',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = pdf.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    setMessage('Ticket PDF téléchargé. Les exemplaires précédents sont conservés.');
    setRevision((v) => v + 1);
  }
  async function create() {
    const current = attempt.current.prepare('/sale-tickets', { saleIds });
    const result = current.confirmed
      ? (current.result as { id: string })
      : await request<{ id: string }>('/sale-tickets', { method: 'POST', body: current.body });
    attempt.current.confirm(result);
    setRevision((v) => v + 1);
    await download(result.id);
    attempt.current.reset();
  }
  async function send() {
    if (!emailId) return;
    try {
      await recovery.send(request, emailId, recipient, emailStatus === 'failed');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Vérification impossible.');
      if (error instanceof Error && error.message === 'INVALID_EMAIL')
        setError('Vérifiez l’adresse du destinataire.');
      if (error instanceof Error && error.message === 'EMAIL_DELIVERY_UNAVAILABLE')
        setError('L’envoi d’e-mails n’est pas disponible pour cette boutique.');
      if (error instanceof Error && error.message === 'TICKET_STALE' && recovery.attempt.status === 'stale')
        setMessage('Ce ticket précède une modification de la vente. Aucun envoi n’a été effectué. Préparez ou sélectionnez le ticket actuel.');
      // A preflight failure may leave a different ticket's accepted result in the registry.
      // Never present that old result as the outcome of this requested send.
      return;
    }
    const status = recovery.attempt.status;
    if (status === 'accepted') {
      setMessage(
        'Envoi accepté par le prestataire. La livraison au destinataire n’est pas encore confirmée.',
      );
      setEmailId(null);
    } else if (status === 'stale') {
      setMessage('Ce ticket précède une modification de la vente. Aucun envoi n’a été effectué. Préparez ou sélectionnez le ticket actuel.');
    } else if (status === 'failed') {
      setMessage(
        'L’échec de cette tentative est confirmé. Vous pouvez lancer une nouvelle tentative avec « Réessayer l’envoi ».',
      );
    } else if (status === 'unknown') {
      setMessage(
        'Résultat incertain ou traitement en cours. Vérifiez cette tentative avant tout nouvel envoi.',
      );
    }
  }
  return (
    <>
      <Button ref={opener} variant="outline" onClick={() => setOpen(true)}>
        <FiFileText />
        Tickets de vente
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) {
            setOpen(value);
          }
        }}
      >
        <DialogContent
          className="transaction-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
        >
          <DialogTitle>Tickets de vente</DialogTitle>
          <DialogDescription>
            Créez un exemplaire avec l’état actuel de la vente. Les versions déjà archivées restent
            inchangées.
          </DialogDescription>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
          <Button disabled={busy} onClick={() => void run(create)}>
            <FiFileText />
            {busy ? 'Chargement…' : 'Préparer et télécharger le ticket actuel'}
          </Button>
          <div className="ticket-history">
            {rows.map((ticket, index) => (
              <div key={ticket._id}>
                <div>
                  <strong>{ticket.snapshot.reference}</strong>
                  <small>
                    {formatDate(ticket.createdAt)} · Exemplaire {rows.length - index}
                    {ticket.objectKey ? ' · Archivé' : ' · Préparé'}
                  </small>
                </div>
                <div className="actions">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void run(() => download(ticket._id))}
                  >
                    <FiDownload />
                    PDF
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy || emailStatus === 'unknown' || emailStatus === 'failed' || emailStatus === 'stale'}
                    onClick={() => {
                      setEmailId(ticket._id);
                      setRecipient('');
                      setMessage('');
                    }}
                  >
                    <FiMail />
                    E-mail
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {emailId && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(send);
              }}
            >
              {pending && <p>Tentative conservée pour le ticket {pending.ticketId}.</p>}
              <label>
                Destinataire
                <Input
                  type="email"
                  required
                  maxLength={300}
                  disabled={busy || emailStatus === 'unknown'}
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </label>
              <p>
                Seul un ticket correspondant encore à l’état actuel de la vente peut être envoyé. Les 20 derniers envois de cet exemplaire sont vérifiés avant chaque tentative. Une tentative conservée dans cet onglet reste liée à son ticket et son destinataire.
              </p>
              {emailStatus === 'stale' && <Button type="button" disabled={busy} onClick={() => {
                void run(async () => {
                  recovery.releaseStale();
                  setEmailId(null);
                  setMessage('Préparez le ticket actuel, puis sélectionnez son action E-mail. Les originaux restent conservés.');
                });
              }}>Choisir le ticket actuel</Button>}
              <Button disabled={busy || emailStatus === 'stale'} type="submit">
                {emailStatus === 'failed'
                  ? 'Réessayer l’envoi'
                  : emailStatus === 'unknown'
                    ? 'Vérifier l’état de cette tentative'
                    : 'Confirmer l’envoi'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
