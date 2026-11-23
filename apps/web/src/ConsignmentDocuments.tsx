import { useEffect, useRef, useState } from 'react';
import {
  FiArrowDown,
  FiChevronRight,
  FiFileText,
  FiRefreshCw,
  FiCornerUpLeft,
} from 'react-icons/fi';
import { shopDateInput, shopDateTimestamp, shopTimezone } from './shopFormat';
import { ReceiptSigning } from './ReceiptSigning';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog';
import type { Consignment } from './ConsignmentsPage';
import { DossierRecoveryVault } from './lib/dossierRecovery';
import { ConsignmentDocumentRecovery } from './lib/consignmentDocumentRecovery';
import type { AccountBoundRequest } from './lib/accountScope';
import type { SubmissionState } from './lib/submittedAttempt';
type Request = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
type Document = {
  id: string;
  kind: string;
  reference: string;
  createdAt: number;
  archived: boolean;
};
type Return = {
  _id: string;
  occurredAt: number;
  itemIds: string[];
  conditionNotes: string;
  completedAt?: number;
};
const formatDate = (value: number) =>
  new Date(value).toLocaleDateString('fr-BE', { timeZone: shopTimezone });

type ConsignmentDocumentsProps = {
  deposit: Consignment;
  request: Request;
  onChanged: () => void | Promise<void>;
};
const documentRecovery = new DossierRecoveryVault(
  (accountId) => new ConsignmentDocumentRecovery(accountId),
  (value) => value.returns.state !== 'idle' || value.statement.state !== 'idle',
);
export function ConsignmentDocuments(props: ConsignmentDocumentsProps) {
  return (
    <DocumentEditor
      key={`${(props.request as Partial<AccountBoundRequest>).accountId ?? 'anonymous'}:${props.deposit._id}`}
      {...props}
    />
  );
}
function DocumentEditor({ deposit, request, onChanged }: ConsignmentDocumentsProps) {
  const recovery = useRef(
    documentRecovery.forRequest(request as Partial<AccountBoundRequest>, deposit._id),
  ).current;
  const assertAccount = () => (request as Partial<AccountBoundRequest>).assertActive?.();
  const alive = useRef(true);
  const [returnState, setReturnState] = useState<SubmissionState>(recovery.returns.state),
    [statementState, setStatementState] = useState<SubmissionState>(recovery.statement.state);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [returns, setReturns] = useState<Return[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(shopDateInput());
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [pdf, setPdf] = useState<{ url: string; reference: string } | null>(null);
  const [returnOpen, setReturnOpen] = useState(false),
    [notice, setNotice] = useState('');
  const busyRef = useRef(false),
    pdfUrl = useRef('');
  const available = deposit.items.filter((item) => item.status === 'available');
  const load = async () => {
    const [docs, history] = await Promise.all([
      request<Document[]>(
        `/consignments/documents?sellerId=${encodeURIComponent(deposit.sellerId)}`,
      ),
      request<Return[]>(`/consignments/returns?consignmentId=${encodeURIComponent(deposit._id)}`),
    ]);
    assertAccount();
    if (!alive.current) return;
    setDocuments(docs);
    setReturns(history);
  };
  useEffect(() => {
    alive.current = true;
    let current = true;
    setLoading(true);
    Promise.all([
      request<Document[]>(
        `/consignments/documents?sellerId=${encodeURIComponent(deposit.sellerId)}`,
      ),
      request<Return[]>(`/consignments/returns?consignmentId=${encodeURIComponent(deposit._id)}`),
    ])
      .then(([docs, history]) => {
        if (current) {
          setDocuments(docs);
          setReturns(history);
        }
      })
      .catch((e) => {
        if (current) setError(e instanceof Error ? e.message : 'Documents indisponibles');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
      alive.current = false;
      if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current);
    };
  }, [deposit._id, deposit.sellerId]);
  const run = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      assertAccount();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opération impossible');
      return false;
    } finally {
      busyRef.current = false;
      setReturnState(recovery.returns.state);
      setStatementState(recovery.statement.state);
      setBusy(false);
    }
  };
  const closePdf = () => {
    if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current);
    pdfUrl.current = '';
    setPdf(null);
  };
  const open = async (id: string, reference = 'document-depot') => {
    const result = await request<{ pdfBase64: string }>(`/consignments/documents/${id}/pdf`);
    assertAccount();
    if (!alive.current) return;
    if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current);
    pdfUrl.current = URL.createObjectURL(
      new Blob([Uint8Array.from(atob(result.pdfBase64), (c) => c.charCodeAt(0))], {
        type: 'application/pdf',
      }),
    );
    setPdf({ url: pdfUrl.current, reference });
  };
  const prepareReturn = async () => {
    if (!recovery.returns.current) {
      const occurredAt = shopDateTimestamp(date);
      if (
        !selected.length ||
        selected.some((id) => !available.some((item) => item._id === id)) ||
        !notes.trim() ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(occurredAt) ||
        shopDateInput(new Date(occurredAt)) !== date
      )
        throw new Error(
          'Sélectionnez les articles disponibles, une date valide et leur état à la remise.',
        );
      const input = {
        consignmentId: deposit._id,
        itemIds: selected,
        occurredAt,
        conditionNotes: notes.trim(),
      };
      recovery.prepareReturn(input, {
        reference: deposit.reference,
        sellerName: deposit.sellerName,
        itemNames: selected.map((id) => deposit.items.find((item) => item._id === id)?.name ?? id),
        occurredAt,
        conditionNotes: notes.trim(),
      });
    }
    setReturnState(recovery.returns.state);
    await recovery.returns.execute(request);
    assertAccount();
    setReturnState('confirmed');
    setSelected([]);
    setNotes('');
    setReturnOpen(false);
    setNotice(
      'Bon de restitution préparé. Lisez et signez le bon ci-dessous pour enregistrer la remise des articles.',
    );
    await onChanged();
    assertAccount();
  };
  const recoverReturn = () =>
    void run(prepareReturn)
      .then((success) => {
        if (success) {
          assertAccount();
          recovery.returns.release();
          setReturnState('idle');
        }
      })
      .catch(() => {});
  const prepareStatement = async () => {
    recovery.prepareStatement(deposit.sellerId, {
      reference: deposit.reference,
      sellerName: deposit.sellerName,
    });
    setStatementState(recovery.statement.state);
    const result = await recovery.statement.execute(request);
    assertAccount();
    setStatementState('confirmed');
    await open(result.id, 'decompte');
    await onChanged();
    assertAccount();
  };
  const recoverStatement = () =>
    void run(prepareStatement)
      .then((success) => {
        if (success) {
          assertAccount();
          recovery.statement.release();
          setStatementState('idle');
        }
      })
      .catch(() => {});
  function returnRecoveryPanel() {
    const context = recovery.returns.current?.context;
    if (!context || returnState === 'idle') return null;
    return (
      <section className="cw-alert" role="status">
        <strong>
          Restitution soumise · {context.reference} · {context.sellerName}
        </strong>
        <p>
          {context.itemNames.length} article(s) · {formatDate(context.occurredAt)} ·{' '}
          {context.itemNames.join(' · ')}
        </p>
        <p>{context.conditionNotes}</p>
        <p>
          {returnState === 'confirmed'
            ? 'Bon préparé. Seule l’actualisation reste à terminer ; aucune remise n’est enregistrée sans signature.'
            : returnState === 'rejected'
              ? 'Le serveur a refusé cette préparation. Vous pouvez revoir les champs.'
              : 'Résultat incertain. Les articles, conditions et identifiant soumis sont conservés pour ce compte.'}
        </p>
        <Button disabled={busy} type="button" onClick={recoverReturn}>
          {returnState === 'confirmed'
            ? 'Actualiser la restitution préparée'
            : 'Reprendre la même restitution'}
        </Button>
        {returnState === 'rejected' && (
          <Button
            disabled={busy}
            type="button"
            variant="outline"
            onClick={() => {
              recovery.returns.release();
              setReturnState('idle');
              setReturnOpen(true);
            }}
          >
            Revoir la restitution refusée
          </Button>
        )}
      </section>
    );
  }
  return (
    <section className="cw-documents" aria-label="Documents et restitutions">
      {returnRecoveryPanel()}
      {statementState !== 'idle' && recovery.statement.current && (
        <section className="cw-alert" role="status">
          <strong>
            Décompte soumis · {recovery.statement.current.context.reference} ·{' '}
            {recovery.statement.current.context.sellerName}
          </strong>
          <p>
            {statementState === 'confirmed'
              ? 'Décompte créé. Reprenez uniquement son affichage et l’actualisation.'
              : 'Cette tentative reste conservée pour ce compte. Reprenez le même décompte.'}
          </p>
          <Button disabled={busy} onClick={recoverStatement}>
            Reprendre le même décompte
          </Button>
          {statementState === 'rejected' && (
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => {
                recovery.statement.release();
                setStatementState('idle');
              }}
            >
              Revoir la demande refusée
            </Button>
          )}
        </section>
      )}
      <div className="cw-section-heading">
        <div>
          <h3>Documents et restitutions</h3>
          <p>
            Décomptes et reversements de tous les dépôts de {deposit.sellerName}. Chaque document
            est figé à sa création.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          aria-label="Actualiser les documents et le dossier"
          disabled={busy || loading}
          onClick={() =>
            void run(async () => {
              await onChanged();
            })
          }
        >
          <FiRefreshCw aria-hidden="true" />
        </Button>
      </div>
      {error && (
        <p role="alert" className="cw-alert cw-alert-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="cw-alert">
          {notice}
        </p>
      )}
      <div className="cw-document-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || loading}
          onClick={recoverStatement}
        >
          <FiFileText aria-hidden="true" />
          {statementState !== 'idle' ? 'Reprendre le décompte' : 'Créer un décompte'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={
            busy || returnState !== 'idle' || statementState === 'unknown' || !available.length
          }
          onClick={() => {
            setError('');
            setReturnOpen(true);
          }}
        >
          <FiCornerUpLeft aria-hidden="true" />
          Préparer une restitution
        </Button>
      </div>
      {loading ? (
        <p role="status" className="cw-loading">
          Chargement des documents…
        </p>
      ) : (
        <div className="cw-document-list">
          {documents.map((doc) => (
            <Button
              type="button"
              className="cw-document-row"
              variant="ghost"
              key={doc.id}
              disabled={busy}
              onClick={() => void run(() => open(doc.id, doc.reference))}
            >
              <FiFileText aria-hidden="true" />
              <span>
                <strong>
                  {doc.kind === 'payment' ? 'Justificatif de reversement' : 'Décompte'}
                </strong>
                <small>
                  {doc.reference} · {formatDate(doc.createdAt)}
                </small>
              </span>
              <span className="cw-status">{doc.archived ? 'Archivé' : 'À archiver'}</span>
              <FiChevronRight aria-hidden="true" />
            </Button>
          ))}
          {!documents.length && (
            <p className="cw-inline-empty">Aucun décompte ou justificatif de reversement.</p>
          )}
        </div>
      )}
      {!!returns.length && (
        <div className="cw-returns">
          <h4>Restitutions de ce dossier</h4>
          {returns.map((record) => (
            <article className="cw-return-row" key={record._id}>
              <div>
                <strong>
                  {record.itemIds.length} article(s) · {formatDate(record.occurredAt)}
                </strong>
                <span className={`cw-status ${record.completedAt ? '' : 'cw-status-pending'}`}>
                  {record.completedAt ? 'Signée' : 'À signer'}
                </span>
                <p>{record.conditionNotes}</p>
                <small>
                  {record.itemIds
                    .map((id) => deposit.items.find((item) => item._id === id)?.name ?? id)
                    .join(' · ')}
                </small>
                {!record.completedAt && (
                  <p>Les articles restent en dépôt jusqu’à la signature du bon.</p>
                )}
              </div>
              <ReceiptSigning kind="consignment_return" targetId={record._id} request={request} />
            </article>
          ))}
        </div>
      )}
      <Dialog
        open={returnOpen}
        onOpenChange={(value) => {
          if (!busy) setReturnOpen(value);
        }}
      >
        <DialogContent data-consignment-dialog className="cw-return-dialog">
          <DialogTitle>Restituer des articles</DialogTitle>
          <DialogDescription>
            Choisissez les articles réellement remis. La restitution sera enregistrée lors de la
            signature du bon.
          </DialogDescription>
          {error && (
            <p role="alert" className="cw-alert-error">
              {error}
            </p>
          )}
          {returnRecoveryPanel()}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              recoverReturn();
            }}
          >
            <fieldset disabled={busy || returnState !== 'idle'}>
              <legend className="cw-sr-only">Articles et état à la remise</legend>
              <div className="cw-return-selection">
                {available.map((item) => (
                  <label
                    key={item._id}
                    className={selected.includes(item._id) ? 'is-selected' : ''}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(item._id)}
                      onChange={(event) =>
                        setSelected((ids) =>
                          event.target.checked
                            ? [...ids, item._id]
                            : ids.filter((id) => id !== item._id),
                        )
                      }
                    />
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {[item.series, item.identifier, item.language].filter(Boolean).join(' · ')}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              <label>
                Date de remise
                <Input
                  type="date"
                  required
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label>
                État des articles à la remise
                <textarea
                  required
                  maxLength={5000}
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="État constaté et réserves éventuelles…"
                />
              </label>
              <div className="cw-dialog-footer">
                <span>{selected.length} article(s) sélectionné(s)</span>
                <Button type="submit" disabled={busy || !selected.length || !notes.trim()}>
                  {busy ? 'Préparation…' : 'Préparer le bon à signer'}
                </Button>
              </div>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(pdf)}
        onOpenChange={(value) => {
          if (!value) closePdf();
        }}
      >
        <DialogContent data-consignment-dialog className="cw-pdf-dialog">
          <DialogTitle>Document du dépôt</DialogTitle>
          <DialogDescription>Exemplaire archivé conservé dans le dossier.</DialogDescription>
          {pdf && (
            <>
              <a
                className="cw-download"
                href={pdf.url}
                download={`${pdf.reference.replace(/[^a-z0-9_-]/gi, '-')}.pdf`}
              >
                <FiArrowDown aria-hidden="true" />
                Télécharger le PDF
              </a>
              <iframe title="Document du dépôt" src={pdf.url} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
