import { SeriesInput } from './SeriesInput';
import './purchase-correction.css';
import { useEffect, useRef, useState } from 'react';
import { FiArrowLeft, FiArrowRight, FiCheck, FiLock, FiPlus, FiTrash2 } from 'react-icons/fi';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog';
import { GradingCompanyPicker, type Request } from './GradingCompanies';
import { currencySymbol, formatMoney } from './shopFormat';
import { PurchaseCorrectionRecovery } from './lib/purchaseCorrectionRecovery';
import { DossierRecoveryVault } from './lib/dossierRecovery';
import type { AccountBoundRequest } from './lib/accountScope';
import type { SubmissionState } from './lib/submittedAttempt';
import {
  correctionAmount,
  correctionDraft,
  correctionError,
  correctionLine,
  correctionPlan,
  correctionPurchaseCents,
  newCorrectionDraft,
  type CorrectionDraft,
  type CorrectionLine,
  type CorrectionSnapshot,
} from './lib/purchaseCorrection';

export type PurchaseCorrectionEditorProps = {
  /** Null closes and unmounts the editor; load the authoritative snapshot when an ID is selected. */
  purchaseId: string | null;
  request: Request;
  onClose: () => void;
  /** Refresh parent history/stock. A failure can be retried without repeating the mutation. */
  onSaved: () => Promise<void>;
};
const fieldLabels: Partial<Record<keyof CorrectionLine, string>> = {
  name: 'Désignation',
  tcg: 'Jeu',
  language: 'Langue',
  condition: 'État',
  series: 'Série',
  identifier: 'Numéro',
  gradingCompany: 'Société',
  gradingGrade: 'Note',
  gradingCertificate: 'Certificat',
  gradingNotes: 'Notes privées',
  marketValueCents: 'Valeur du marché',
  discountPercent: 'Part reversée (%)',
  askingPriceCents: 'Prix de vente',
};
const valueLabel = (key: string, value: unknown) =>
  value === undefined || value === ''
    ? 'Non renseigné'
    : key.endsWith('Cents')
      ? formatMoney(Number(value))
      : String(value);

const correctionRecovery = new DossierRecoveryVault(
  (accountId) => new PurchaseCorrectionRecovery(accountId),
  (value) => value.state !== 'idle',
);
export function PurchaseCorrectionEditor(props: PurchaseCorrectionEditorProps) {
  // A keyed child prevents a late response from one dossier from becoming another dossier's draft.
  return props.purchaseId ? (
    <Editor
      key={`${(props.request as Partial<AccountBoundRequest>).accountId ?? 'anonymous'}:${props.purchaseId}`}
      {...props}
      purchaseId={props.purchaseId}
    />
  ) : null;
}
function Editor({
  purchaseId,
  request,
  onClose,
  onSaved,
}: PurchaseCorrectionEditorProps & { purchaseId: string }) {
  const attempt = useRef(
    correctionRecovery.forRequest(request as Partial<AccountBoundRequest>, purchaseId),
  );
  const retained = attempt.current.current?.context;
  const assertAccount = () => (request as Partial<AccountBoundRequest>).assertActive?.();
  const [submissionState, setSubmissionState] = useState<SubmissionState>(attempt.current.state);
  const [gradingBusy, setGradingBusy] = useState<Set<string>>(new Set());
  const [snapshot, setSnapshot] = useState<CorrectionSnapshot | null>(retained?.snapshot ?? null),
    [rows, setRows] = useState<CorrectionDraft[]>(retained?.rows ?? []);
  const [loading, setLoading] = useState(!retained),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [stage, setStage] = useState<'edit' | 'review'>(retained ? 'review' : 'edit'),
    [discard, setDiscard] = useState(false),
    [reloadPrompt, setReloadPrompt] = useState(false);
  const [committed, setCommitted] = useState(attempt.current.state === 'confirmed'),
    [refreshed, setRefreshed] = useState(false),
    [stale, setStale] = useState(false);
  const lock = useRef(false),
    generation = useRef(0),
    alive = useRef(true);
  const opener = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const heading = useRef<HTMLHeadingElement>(null),
    errorNode = useRef<HTMLDivElement>(null);
  const requestRef = useRef(request);
  requestRef.current = request;
  const initial = useRef('');
  const dirty = Boolean(snapshot) && JSON.stringify(rows) !== initial.current;
  const locked = snapshot?.items.filter((item) => snapshot.lockedIds.includes(item._id)) ?? [];
  const plan = (() => {
    try {
      return (
        attempt.current.current?.context.plan ?? (snapshot ? correctionPlan(snapshot, rows) : null)
      );
    } catch {
      return null;
    }
  })();
  const changed = Boolean(plan && (plan.items.length || plan.removedIds.length));
  const canEdit = snapshot?.purchase.status !== 'cancelled';
  async function load() {
    if (attempt.current.current) {
      setError(
        'Reprenez la correction soumise ou revoyez explicitement une demande refusée avant de recharger.',
      );
      return;
    }
    const current = ++generation.current;
    setLoading(true);
    setError('');
    setReloadPrompt(false);
    try {
      const value = await requestRef.current<CorrectionSnapshot>(
        `/purchases/${encodeURIComponent(purchaseId)}/edit`,
      );
      if (!alive.current || current !== generation.current) return;
      const drafts = value.items
        .filter((item) => !value.lockedIds.includes(item._id))
        .map(correctionDraft);
      setSnapshot(value);
      setRows(drafts);
      initial.current = JSON.stringify(drafts);
      setStale(false);
      setStage('edit');
      setSubmissionState('idle');
    } catch (e) {
      if (alive.current && current === generation.current) setError(correctionError(e));
    } finally {
      if (alive.current && current === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    if (!attempt.current.current) void load();
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, [purchaseId]);
  useEffect(() => {
    if (stage === 'review') heading.current?.focus({ preventScroll: true });
  }, [stage]);
  function patch(key: string, change: Partial<CorrectionDraft>) {
    setRows((values) => values.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }
  function review() {
    if (gradingBusy.size) return;
    setError('');
    try {
      if (!snapshot) return;
      const next = correctionPlan(snapshot, rows);
      if (!next.items.length && !next.removedIds.length)
        throw new Error('Aucune modification à enregistrer.');
      setStage('review');
    } catch (e) {
      setError(correctionError(e));
      requestAnimationFrame(() => errorNode.current?.focus());
    }
  }
  async function refreshAfterSave() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await onSaved();
      assertAccount();
      if (attempt.current.state === 'confirmed') attempt.current.release();
      if (alive.current) {
        setRefreshed(true);
        setSubmissionState('idle');
      }
    } catch (e) {
      if (alive.current)
        setError(`La correction est enregistrée. L’actualisation a échoué : ${correctionError(e)}`);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function save() {
    if (lock.current || !snapshot || committed) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      attempt.current.prepareCorrection(purchaseId, snapshot, rows);
      setSubmissionState(attempt.current.state);
      await attempt.current.execute(request);
      assertAccount();
      if (!alive.current) return;
      setCommitted(true);
      setSubmissionState('confirmed');
      initial.current = JSON.stringify(rows);
      try {
        await onSaved();
        assertAccount();
        attempt.current.release();
        if (alive.current) {
          setRefreshed(true);
          setSubmissionState('idle');
        }
      } catch (e) {
        if (alive.current)
          setError(
            `La correction est enregistrée. L’actualisation a échoué : ${correctionError(e)}`,
          );
      }
    } catch (e) {
      if (alive.current) {
        setSubmissionState(attempt.current.state);
        setError(correctionError(e));
        if (
          /PURCHASE_CHANGED|PURCHASE_ITEM_LOCKED|PURCHASE_NOT_EDITABLE/.test(
            e instanceof Error ? e.message : String(e),
          )
        )
          setStale(true);
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function close() {
    if (busy) return;
    if (attempt.current.current) {
      onClose();
      return;
    }
    if (dirty && !committed) {
      setDiscard(true);
      return;
    }
    onClose();
  }
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value) close();
      }}
    >
      <DialogContent
        className="purchase-correction-dialog"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
        }}
        onEscapeKeyDown={(event) => {
          if (busy) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <div className="pc-header">
          <DialogTitle ref={heading} tabIndex={-1}>
            {committed
              ? 'Correction enregistrée'
              : stage === 'review'
                ? 'Vérifier la correction'
                : 'Corriger le rachat'}
            {snapshot ? ` · ${snapshot.purchase.reference}` : ''}
          </DialogTitle>
          <DialogDescription>
            Les cartes déjà vendues, données ou mouvementées restent protégées. Les exemplaires PDF
            signés conservent leur version d’origine.
          </DialogDescription>
        </div>
        {error && (
          <div role="alert" tabIndex={-1} ref={errorNode} className="pc-notice pc-error">
            {error}
            {stale && !committed && submissionState === 'idle' && (
              <div className="pc-actions">
                <Button variant="outline" disabled={busy} onClick={() => setReloadPrompt(true)}>
                  Recharger la version actuelle
                </Button>
              </div>
            )}
          </div>
        )}
        {(submissionState === 'unknown' || submissionState === 'rejected') &&
          attempt.current.current && (
            <section className="pc-notice" role="status">
              <strong>
                Correction soumise · {attempt.current.current.context.snapshot.purchase.reference}
              </strong>
              <p>
                {attempt.current.current.context.plan.updatedCount} modification(s),{' '}
                {attempt.current.current.context.plan.addedCount} ajout(s),{' '}
                {attempt.current.current.context.plan.removedIds.length} retrait(s) ·{' '}
                {formatMoney(attempt.current.current.context.plan.beforeCents)} →{' '}
                {formatMoney(attempt.current.current.context.plan.afterCents)}
              </p>
              <p>
                {submissionState === 'rejected'
                  ? 'Le serveur a refusé cette demande. Vous pouvez revoir la saisie.'
                  : 'Résultat incertain. La correction, sa version attendue et son identifiant sont conservés pour ce compte, même en fermant cette fenêtre.'}
              </p>
              <Button disabled={busy} onClick={() => void save()}>
                Reprendre la même correction
              </Button>
              {submissionState === 'rejected' && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    attempt.current.release();
                    setSubmissionState('idle');
                    setStage('edit');
                  }}
                >
                  Revoir la correction refusée
                </Button>
              )}
            </section>
          )}
        {discard && (
          <div className="pc-notice" role="alert">
            <p>Fermer abandonnera les modifications non enregistrées de cette fenêtre.</p>
            <div className="pc-actions">
              <Button variant="outline" onClick={() => setDiscard(false)}>
                Continuer la correction
              </Button>
              <Button variant="destructive" onClick={onClose}>
                Abandonner et fermer
              </Button>
            </div>
          </div>
        )}
        {reloadPrompt && (
          <div className="pc-notice" role="alert">
            <p>
              Recharger remplacera votre saisie par la version actuelle du dossier. Vos changements
              ne seront pas appliqués automatiquement.
            </p>
            <div className="pc-actions">
              <Button variant="outline" onClick={() => setReloadPrompt(false)}>
                Garder ma saisie
              </Button>
              <Button onClick={() => void load()}>Recharger le dossier</Button>
            </div>
          </div>
        )}
        {loading ? (
          <p role="status" className="pc-busy">
            Chargement du dossier et des protections…
          </p>
        ) : !snapshot ? (
          <Button variant="outline" onClick={() => void load()}>
            Réessayer le chargement
          </Button>
        ) : committed ? (
          <>
            <div role="status" className="pc-success">
              <FiCheck aria-hidden="true" />
              <div>
                <strong>Le rachat et le stock ont été corrigés.</strong>
                <p>
                  {refreshed
                    ? 'Les données de l’espace de gestion sont actualisées.'
                    : 'L’enregistrement est confirmé ; seule l’actualisation reste à terminer.'}
                </p>
              </div>
            </div>
            <div className="pc-actions">
              {!refreshed && (
                <Button disabled={busy} onClick={() => void refreshAfterSave()}>
                  Réessayer l’actualisation
                </Button>
              )}
              <Button variant="outline" disabled={busy} onClick={onClose}>
                Fermer
              </Button>
            </div>
          </>
        ) : !canEdit ? (
          <p className="pc-notice">Ce rachat est annulé et ne peut plus être corrigé.</p>
        ) : (
          <>
            {stage === 'review' && (
              <Button
                className="pc-review-back"
                variant="ghost"
                disabled={busy || submissionState !== 'idle'}
                onClick={() => {
                  setStage('edit');
                  setError('');
                }}
              >
                <FiArrowLeft aria-hidden="true" />
                Retour aux cartes
              </Button>
            )}
            {!!locked.length && (
              <details className="pc-protected">
                <summary>
                  {locked.length} carte(s) protégée(s), conservée(s) sans modification
                </summary>
                <p>
                  Une vente ou un don, même annulé, conserve une référence à ces cartes. Elles ne
                  peuvent être modifiées ou retirées du rachat.
                </p>
                {locked.map((item) => (
                  <div className="pc-locked-row" key={item._id}>
                    <div>
                      <strong>
                        <FiLock aria-hidden="true" />
                        {item.name}
                      </strong>
                      <small>
                        {[
                          item.series,
                          item.identifier,
                          item.language,
                          item.gradingCompany,
                          item.gradingGrade,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </div>
                    <strong>
                      {item.purchasePriceCents == null
                        ? 'Coût inconnu'
                        : formatMoney(item.purchasePriceCents)}
                    </strong>
                  </div>
                ))}
              </details>
            )}
            {stage === 'edit' ? (
              <fieldset disabled={busy || stale || submissionState !== 'idle'}>
                <div className="pc-list">
                  {rows.map((row, index) => {
                    let amount: string;
                    try {
                      const line = correctionLine(row);
                      amount = formatMoney(
                        correctionPurchaseCents(
                          line,
                          snapshot.items.find((item) => item._id === row.itemId),
                        ),
                      );
                    } catch {
                      amount = 'À compléter';
                    }
                    return (
                      <article className="pc-card" key={row.key}>
                        <div className="pc-card-heading">
                          <div>
                            <strong>{row.name || `Nouvelle carte ${index + 1}`}</strong>
                            <small>{row.itemId ? 'Carte existante' : 'Ajout au rachat'}</small>
                          </div>
                          <span>{amount}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Retirer ${row.name || `la carte ${index + 1}`}`}
                            onClick={() =>
                              setRows((values) => values.filter((item) => item.key !== row.key))
                            }
                          >
                            <FiTrash2 aria-hidden="true" />
                          </Button>
                        </div>
                        <div className="pc-card-body">
                          <div className="pc-fields">
                            <label>
                              Désignation
                              <Input
                                maxLength={300}
                                value={row.name}
                                onChange={(event) => patch(row.key, { name: event.target.value })}
                              />
                            </label>
                            <label>
                              Valeur du marché ({currencySymbol})
                              <Input
                                inputMode="decimal"
                                value={row.marketInput}
                                onChange={(event) =>
                                  patch(row.key, { marketInput: event.target.value })
                                }
                              />
                            </label>
                            <label>
                              Part reversée (%)
                              <Input
                                inputMode="decimal"
                                value={row.percentInput}
                                onChange={(event) =>
                                  patch(row.key, { percentInput: event.target.value })
                                }
                              />
                            </label>
                          </div>
                          <details className="pc-more">
                            <summary>Identité, gradation et prix de vente</summary>
                            <div className="pc-fields">
                              <label>
                                Jeu
                                <select
                                  value={row.tcg ?? ''}
                                  onChange={(event) =>
                                    patch(row.key, {
                                      tcg: event.target.value as CorrectionDraft['tcg'],
                                    })
                                  }
                                >
                                  {!row.tcg && <option value="">Non renseigné</option>}
                                  <option value="pokemon">Pokémon</option>
                                  <option value="riftbound">Riftbound</option>
                                  <option value="other">Autre</option>
                                </select>
                              </label>
                              <label>
                                Langue
                                <select
                                  value={row.language ?? ''}
                                  onChange={(event) =>
                                    patch(row.key, {
                                      language: event.target.value as CorrectionDraft['language'],
                                    })
                                  }
                                >
                                  {!row.language && <option value="">Non renseignée</option>}
                                  <option value="fr">Français</option>
                                  <option value="en">Anglais</option>
                                  <option value="ja">Japonais</option>
                                  <option value="zh">Chinois</option>
                                </select>
                              </label>
                              <label>
                                État
                                <select
                                  value={row.condition ?? ''}
                                  onChange={(event) =>
                                    patch(row.key, {
                                      condition: event.target.value as CorrectionDraft['condition'],
                                    })
                                  }
                                >
                                  {!row.condition && <option value="">Non renseigné</option>}
                                  {(['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'] as const).map(
                                    (value) => (
                                      <option key={value}>{value}</option>
                                    ),
                                  )}
                                </select>
                              </label>
                              <label>
                                Série
                                <SeriesInput tcg={row.tcg} value={row.series ?? ''} onChange={value => patch(row.key, { series: value })} />
                              </label>
                              <label>
                                Numéro / référence
                                <Input
                                  maxLength={100}
                                  value={row.identifier ?? ''}
                                  onChange={(event) =>
                                    patch(row.key, { identifier: event.target.value })
                                  }
                                />
                              </label>
                              <label>
                                Prix de vente ({currencySymbol})
                                <Input
                                  inputMode="decimal"
                                  placeholder={row.itemId ? 'Vide = prix conservé' : 'Facultatif'}
                                  value={row.askingInput}
                                  onChange={(event) =>
                                    patch(row.key, { askingInput: event.target.value })
                                  }
                                />
                              </label>
                              <GradingCompanyPicker
                                request={request}
                                onBusyChange={pending => setGradingBusy(current => { const next = new Set(current); pending ? next.add(row.key) : next.delete(row.key); return next; })}
                                value={row.gradingCompany ?? ''}
                                onChange={(value) =>
                                  patch(row.key, {
                                    gradingCompany: value || undefined,
                                    ...(!value ? {gradingGrade: undefined, gradingCertificate: undefined, gradingNotes: undefined} : {}),
                                  })
                                }
                              />
                              <label>
                                Note de gradation
                                <Input
                                  disabled={!row.gradingCompany}
                                  maxLength={32}
                                  value={row.gradingGrade ?? ''}
                                  onChange={(event) =>
                                    patch(row.key, { gradingGrade: event.target.value })
                                  }
                                  placeholder="9.5, Authentic…"
                                />
                              </label>
                              <label>
                                Certificat
                                <Input
                                  disabled={!row.gradingCompany}
                                  maxLength={64}
                                  value={row.gradingCertificate ?? ''}
                                  onChange={(event) =>
                                    patch(row.key, { gradingCertificate: event.target.value })
                                  }
                                />
                              </label>
                            </div>
                            <label>
                              Notes privées de gradation
                              <textarea
                                disabled={!row.gradingCompany}
                                maxLength={500}
                                value={row.gradingNotes ?? ''}
                                onChange={(event) =>
                                  patch(row.key, { gradingNotes: event.target.value })
                                }
                              />
                            </label>
                          </details>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <div className="pc-actions" style={{ marginTop: 16 }}>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={rows.length + locked.length >= 500}
                    onClick={() => setRows((values) => [...values, newCorrectionDraft()])}
                  >
                    <FiPlus aria-hidden="true" />
                    Ajouter une carte
                  </Button>
                  {plan?.removedIds.length ? (
                    <span>{plan.removedIds.length} carte(s) retirée(s) à la validation.</span>
                  ) : null}
                </div>
              </fieldset>
            ) : (
              plan && (
                <div>
                  <dl className="pc-summary">
                    <div>
                      <dt>Total actuel</dt>
                      <dd>{formatMoney(plan.beforeCents)}</dd>
                    </div>
                    <div>
                      <dt>Total après correction</dt>
                      <dd>{formatMoney(plan.afterCents)}</dd>
                    </div>
                    <div>
                      <dt>Écart</dt>
                      <dd>{formatMoney(plan.afterCents - plan.beforeCents)}</dd>
                    </div>
                  </dl>
                  <p className="pc-notice" style={{ marginTop: 16 }}>
                    {plan.updatedCount} carte(s) modifiée(s), {plan.addedCount} ajoutée(s),{' '}
                    {plan.removed.length} retirée(s). Les totaux incluent les {locked.length}{' '}
                    carte(s) protégée(s), inchangée(s).
                  </p>
                  {plan.items.map((item) => {
                    const original = snapshot.items.find((old) => old._id === item.itemId);
                    const before = original ? correctionLine(correctionDraft(original)) : null;
                    return (
                      <section className="pc-diff" key={item.operationId}>
                        <h4>
                          {item.itemId ? 'Modification' : 'Ajout'} · {item.name}
                        </h4>
                        <dl>
                          {Object.entries(fieldLabels)
                            .filter(
                              ([key]) =>
                                !before ||
                                before[key as keyof CorrectionLine] !==
                                  item[key as keyof CorrectionLine],
                            )
                            .map(([key, label]) => (
                              <div key={key} style={{ display: 'contents' }}>
                                <dt>{label}</dt>
                                <dd>
                                  <del>
                                    {before
                                      ? valueLabel(key, before[key as keyof CorrectionLine])
                                      : '—'}
                                  </del>
                                </dd>
                                <dd>
                                  <ins>{valueLabel(key, item[key as keyof CorrectionLine])}</ins>
                                </dd>
                              </div>
                            ))}
                          <dt>Montant du rachat</dt>
                          <dd>
                            {original?.purchasePriceCents == null
                              ? 'Coût inconnu'
                              : formatMoney(original.purchasePriceCents)}
                          </dd>
                          <dd>
                            <strong>{formatMoney(correctionPurchaseCents(item, original))}</strong>
                          </dd>
                        </dl>
                      </section>
                    );
                  })}
                  {plan.removed.map((item) => (
                    <section className="pc-diff" key={item._id}>
                      <h4>Retrait · {item.name}</h4>
                      <p>
                        {item.purchasePriceCents == null
                          ? 'Coût inconnu'
                          : formatMoney(item.purchasePriceCents)}{' '}
                        retirés du total. La trace de l’article et les documents historiques sont
                        conservés.
                      </p>
                    </section>
                  ))}
                </div>
              )
            )}
            <div className="pc-footer">
              <span>
                {plan
                  ? `${formatMoney(plan.afterCents)} après correction`
                  : 'Complétez les informations requises.'}
              </span>
              {stage === 'edit' ? (
                <Button
                  disabled={
                    busy || gradingBusy.size > 0 || stale || submissionState !== 'idle' || (!changed && Boolean(plan))
                  }
                  onClick={review}
                >
                  Vérifier la correction
                  <FiArrowRight aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  disabled={busy || stale || submissionState !== 'idle' || !changed}
                  onClick={() => void save()}
                >
                  {busy ? 'Enregistrement…' : 'Confirmer la correction'}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
