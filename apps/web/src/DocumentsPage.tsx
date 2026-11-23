import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './components/ui/dialog';
import type { Request } from './GradingCompanies';
import { formatDate, shopDateTimestamp } from './shopFormat';
import { FiFileText, FiSearch, FiArrowUpRight, FiDownload, FiMail } from 'react-icons/fi';
import './transaction-history.css';
import { ticketEmailRecovery } from './lib/ticketEmailRecovery';
type Kind = 'all' | 'receipt' | 'consignment' | 'ticket';
type DocumentRecord = {
  id: string;
  kind: Exclude<Kind, 'all'>;
  documentKind?: string;
  reference: string;
  createdAt: number;
  signedAt?: number;
  status: string;
  filename?: string;
  downloadPath?: string;
  emailPath?: string;
  targetId?: string;
  emailStatus?: string;
  version?: number;
  emails?: { status: string; createdAt: number; recipient?: string; error?: string }[];
  emailHistoryScope?: string;
};
type Page = { items: DocumentRecord[]; nextCursor: string | null; isDone: boolean };
const kinds = {
  all: 'Tous les documents',
  receipt: 'Bordereaux signés',
  consignment: 'Documents de dépôt',
  ticket: 'Tickets de vente',
};
const status = (value: string) =>
  ({
    archived: 'Archivé',
    signed: 'Signé · archivage à vérifier',
    prepared: 'Préparé',
    accepted: 'Accepté par le prestataire',
    sent: 'Accepté par le prestataire',
    delivered: 'Livré',
    failed: 'Échec',
    unknown: 'Résultat incertain',
    pending: 'En attente',
  })[value] ?? value;
export default function DocumentsPage({ request }: { request: Request }) {
  const recovery = ticketEmailRecovery(request as Request & {accountId?: string});
  useSyncExternalStore(recovery.subscribe, recovery.getRevision);
  const pending = recovery.pending;
  const emailStatus = recovery.attempt.status;
  const pendingEmail: DocumentRecord | null = pending ? {id:pending.ticketId, kind:'ticket', reference:`Ticket ${pending.ticketId}`, createdAt:0, status:'prepared', emailPath:`/sale-tickets/${encodeURIComponent(pending.ticketId)}/email`} : null;
  const [kind, setKind] = useState<Kind>('all'),
    [cursor, setCursor] = useState<string | null>(null),
    [previous, setPrevious] = useState<(string | null)[]>([]),
    [snapshot, setSnapshot] = useState<{key: string; page: Page} | null>(null),
    [search, setSearch] = useState(''),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState<string | null>(null);
  const [emailDocument, setEmailDocument] = useState<DocumentRecord | null>(null),
    [recipient, setRecipient] = useState(pending?.recipient ?? '');
  const [archiveStatus, setArchiveStatus] = useState('all'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const queryKey = JSON.stringify([kind, cursor, search, archiveStatus, from, to]);
  const page: Page = snapshot?.key === queryKey ? snapshot.page : {items: [], nextCursor: null, isDone: true};
  const documentOpener = useRef<HTMLElement | null>(null);
  const openDocument = (id: string) => {
    documentOpener.current = document.activeElement as HTMLElement;
    setSelectedId(id);
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = page.items.find((row) => row.id === selectedId);
  const resetPages = () => {
    setCursor(null);
    setPrevious([]);
    setSelectedId(null);
  };
  useEffect(() => {
    if (pending) {
      setRecipient(pending.recipient);
      setEmailDocument(current => current?.kind === 'ticket' ? pendingEmail : current);
    }
  }, [pending?.operationId, pending?.recipient, pending?.ticketId]);
  const actionLock = useRef(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ kind, search, status: archiveStatus });
    if (from) params.set('from', String(shopDateTimestamp(from, undefined, 0)));
    if (to) params.set('to', String(shopDateTimestamp(to, undefined, 23, 59, 59) + 999));
    if (cursor) params.set('cursor', cursor);
    void request<Page>(`/documents?${params}`)
      .then((value) => {
        if (active) setSnapshot({key: queryKey, page: value});
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Chargement impossible.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind, cursor, request, refresh, search, archiveStatus, from, to, queryKey]);
  async function action(id: string, fn: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(id);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action impossible.');
    } finally {
      actionLock.current = false;
      setBusy(null);
    }
  }
  async function download(row: DocumentRecord) {
    if (!row.downloadPath) return;
    const file = await request<{ pdfBase64: string; filename?: string }>(row.downloadPath);
    const bytes = Uint8Array.from(atob(file.pdfBase64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename ?? row.filename ?? `${row.reference}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Original archivé téléchargé.');
  }
  async function send() {
    if (!emailDocument?.emailPath) return;
    const row = emailDocument;
    if (row.kind === 'ticket') {
      try {
        await recovery.send(request, row.id, recipient, emailStatus === 'failed');
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Vérification impossible.');
        if (error instanceof Error && error.message === 'INVALID_EMAIL')
          setError('Vérifiez l’adresse du destinataire.');
        if (error instanceof Error && error.message === 'EMAIL_DELIVERY_UNAVAILABLE')
          setError('L’envoi d’e-mails n’est pas disponible pour cette boutique.');
        if (error instanceof Error && error.message === 'TICKET_STALE' && recovery.attempt.status === 'stale')
          setMessage('Ce ticket précède une modification de la vente. Aucun envoi n’a été effectué. Préparez le ticket actuel depuis la vente, puis sélectionnez-le.');
        // Failed history reads do not establish a delivery result for the selected document.
        return;
      }
      const outcome = recovery.attempt.status;
      setMessage(
        outcome === 'accepted'
          ? 'Envoi accepté par le prestataire. La livraison au destinataire n’est pas encore confirmée.'
          : outcome === 'stale'
            ? 'Ce ticket précède une modification de la vente. Aucun envoi n’a été effectué. Préparez le ticket actuel depuis la vente, puis sélectionnez-le.'
          : outcome === 'failed'
            ? 'Échec confirmé. Utilisez « Réessayer l’envoi » pour lancer une nouvelle tentative.'
            : outcome === 'unknown' ? 'Résultat incertain. Vérifiez cette tentative avant tout nouvel envoi.' : '',
      );
      if (outcome === 'accepted') {
        setEmailDocument(null);
      }
      setRefresh((n) => n + 1);
      return;
    }
    const result = await request<{ status?: string; emailStatus?: string }>(row.emailPath!, {
      method: 'POST',
    });
    setMessage(
      `E-mail : ${status(result.emailStatus ?? result.status ?? 'unknown')}. Aucun nouvel envoi automatique.`,
    );
    setEmailDocument(null);
    setRefresh((n) => n + 1);
  }
  return (
    <section className="documents-workspace transaction-history">
      <div className="history-filters">
        <label className="history-search">
          <FiSearch aria-hidden="true" />
          <span className="sr-only">Rechercher un document</span>
          <Input
            type="search"
            placeholder="Référence ou nom du fichier…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPages();
            }}
          />
        </label>
        <label>
          Type
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as Kind);
              resetPages();
            }}
          >
            {Object.entries(kinds).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Archivage
          <select
            value={archiveStatus}
            onChange={(e) => {
              setArchiveStatus(e.target.value);
              resetPages();
            }}
          >
            <option value="all">Tous</option>
            <option value="archived">Archivés</option>
            <option value="signed">Signés, à archiver</option>
            <option value="prepared">Préparés</option>
          </select>
        </label>
        <label>
          Du
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              resetPages();
            }}
          />
        </label>
        <label>
          Au
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              resetPages();
            }}
          />
        </label>
      </div>
      <div className="history-count">
        <span>Originaux conservés · classés par type puis date</span>
        <Button variant="link" disabled={loading} onClick={() => setRefresh((n) => n + 1)}>
          Actualiser
        </Button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {pendingEmail && !emailDocument && (
        <p role="status">
          Tentative pour {pendingEmail.reference} · {status(emailStatus)}.{' '}
          <Button variant="outline" onClick={() => setEmailDocument(pendingEmail)}>
            Reprendre la tentative
          </Button>
        </p>
      )}
      {loading ? (
        <p role="status">Chargement des documents…</p>
      ) : (
        <div className="history-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th>Création</th>
                <th>Archivage</th>
                <th>Envoi</th>
                <th>
                  <span className="sr-only">Ouvrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button className="history-product" onClick={() => openDocument(row.id)}>
                      <FiFileText aria-hidden="true" />
                      <span>
                        <strong>{row.reference}</strong>
                        <small>
                          {kinds[row.kind]} ·{' '}
                          {row.version ? `Version ${row.version}` : row.id.slice(-8)}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>{formatDate(row.createdAt)}</td>
                  <td>{status(row.status)}</td>
                  <td>{row.emailStatus ? status(row.emailStatus) : 'Aucun envoi enregistré'}</td>
                  <td>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Ouvrir ${row.reference}${row.version ? `, version ${row.version}` : ''}`}
                      onClick={() => openDocument(row.id)}
                    >
                      <FiArrowUpRight />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!page.items.length && (
            <div className="workspace-empty">
              <FiFileText />
              <h2>Aucun document dans cette page</h2>
              <p>
                {page.nextCursor
                  ? 'Poursuivez avec Suivant pour parcourir les autres documents correspondant aux filtres.'
                  : 'Modifiez les filtres pour élargir la recherche.'}
              </p>
            </div>
          )}
        </div>
      )}
      <nav className="purchase-result-pages" aria-label="Pages des documents">
        <Button
          variant="outline"
          disabled={loading || !previous.length}
          onClick={() => {
            const prior = [...previous];
            setCursor(prior.pop() ?? null);
            setPrevious(prior);
            setSelectedId(null);
          }}
        >
          Précédent
        </Button>
        <span>Page {previous.length + 1}</span>
        <Button
          variant="outline"
          disabled={loading || page.isDone || !page.nextCursor}
          onClick={() => {
            setPrevious((p) => [...p, cursor]);
            setCursor(page.nextCursor);
            setSelectedId(null);
          }}
        >
          Suivant
        </Button>
      </nav>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !busy) setSelectedId(null);
        }}
      >
        <DialogContent
          className="transaction-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!emailDocument) documentOpener.current?.focus({ preventScroll: true });
          }}
        >
          <DialogTitle>{selected?.reference}</DialogTitle>
          <DialogDescription>
            {selected?.version ? `Version ${selected.version} · ` : ''}
            {selected && kinds[selected.kind]} · {selected && formatDate(selected.createdAt)}
          </DialogDescription>
          {selected && (
            <>
              <dl className="document-facts">
                <div>
                  <dt>Archivage</dt>
                  <dd>{status(selected.status)}</dd>
                </div>
                {selected.signedAt && (
                  <div>
                    <dt>Signature</dt>
                    <dd>{formatDate(selected.signedAt)}</dd>
                  </div>
                )}
                {selected.filename && (
                  <div>
                    <dt>Fichier</dt>
                    <dd>{selected.filename}</dd>
                  </div>
                )}
                <div>
                  <dt>Identifiant de l’exemplaire</dt>
                  <dd>{selected.id}</dd>
                </div>
              </dl>
              <div className="actions">
                <Button
                  variant="outline"
                  disabled={!!busy || !selected.downloadPath}
                  onClick={() => void action(selected.id, () => download(selected))}
                >
                  <FiDownload />
                  Télécharger l’original
                </Button>
                {selected.emailPath && (
                  <Button
                    variant="outline"
                    disabled={!!busy || !!pendingEmail}
                    onClick={() => {
                      setEmailDocument(selected);
                      setSelectedId(null);
                      setRecipient('');
                    }}
                  >
                    <FiMail />
                    Envoyer par e-mail
                  </Button>
                )}
              </div>
              {!selected.downloadPath && (
                <p>Ce document est préparé, mais aucun original archivé n’est disponible ici.</p>
              )}
              {selected.kind === 'receipt' &&
                selected.targetId &&
                ['purchase', 'consignment', 'consignment_return'].includes(
                  selected.documentKind ?? '',
                ) && (
                  <a
                    href={`/admin/signature/${selected.documentKind}/${encodeURIComponent(selected.targetId)}`}
                  >
                    Versions, signatures et envois →
                  </a>
                )}
              <section className="document-deliveries">
                <h3>
                  {selected.emailHistoryScope === 'latest'
                    ? 'Dernier envoi enregistré'
                    : 'Envois récents'}
                </h3>
                {selected.emails?.length ? (
                  selected.emails.map((email, index) => (
                    <div key={`${email.createdAt}-${index}`}>
                      <strong>{status(email.status)}</strong>
                      <span>
                        {formatDate(email.createdAt)}
                        {email.recipient ? ` · ${email.recipient}` : ''}
                      </span>
                      {email.error && <small>{email.error}</small>}
                    </div>
                  ))
                ) : (
                  <p>Aucun envoi enregistré pour cet exemplaire.</p>
                )}
              </section>
            </>
          )}
        </DialogContent>
      </Dialog>
      {emailDocument && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setEmailDocument(null);
          }}
        >
          <DialogContent
            className="transaction-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              documentOpener.current?.focus({ preventScroll: true });
            }}
          >
            <DialogTitle>Envoyer {emailDocument.reference}</DialogTitle>
            <DialogDescription>
              {emailDocument.kind === 'receipt'
                ? 'L’original sera envoyé au destinataire enregistré dans le document.'
                : 'L’original archivé sera transmis au destinataire indiqué.'}{' '}
              Un résultat incertain doit être vérifié avant un nouvel envoi. Les 20 derniers envois du ticket sont vérifiés ; la tentative conservée dans cet onglet garde son identifiant et son destinataire.
            </DialogDescription>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(emailDocument.id, send);
              }}
            >
              {emailDocument.kind === 'ticket' && (
                <label>
                  Adresse e-mail
                  <Input
                    type="email"
                    required
                    maxLength={300}
                    disabled={!!busy || emailStatus === 'unknown'}
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                  />
                </label>
              )}
              {error && <p role="alert">{error}</p>}
              {message && <p role="status">{message}</p>}
              {emailStatus === 'stale' && <Button type="button" disabled={!!busy} onClick={() => {
                void action(emailDocument.id, async () => {
                  recovery.releaseStale();
                  setEmailDocument(null);
                  setMessage('Sélectionnez le ticket actuel. Vous pouvez le préparer depuis les tickets de la vente.');
                });
              }}>Choisir le ticket actuel</Button>}
              <Button type="submit" disabled={Boolean(busy) || emailStatus === 'stale'}>
                {busy
                  ? 'Traitement…'
                  : emailStatus === 'unknown'
                    ? 'Vérifier l’état de cette tentative'
                    : emailStatus === 'failed'
                      ? 'Réessayer l’envoi'
                      : 'Confirmer l’envoi'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
