import { SeriesInput } from './SeriesInput';
import {
  FiArrowLeft,
  FiArrowRight,
  FiCheck,
  FiChevronRight,
  FiFileText,
  FiPackage,
  FiSearch,
} from 'react-icons/fi';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog';
import { ItemThumbnail } from './ItemThumbnail';
import './consignment-workspace.css';
import { shopDateInput, shopDateTimestamp } from './shopFormat';
import { currencySymbol, shopCurrency, shopTimezone } from './shopFormat';
import { GradingCompanyPicker } from './GradingCompanies';
import { ConsignmentDocuments } from './ConsignmentDocuments';
import { ReceiptSigning } from './ReceiptSigning';
import { useEffect, useRef, useState } from 'react';
import { brand } from '../../../branding/brand';
import { legal } from '../../../branding/legal';
import {
  createConsignmentReceiptPdf,
  type SignatoryProfile,
} from '../../../packages/domain/src/consignmentReceipt';
import { ClientPicker, type PickerClient } from './ClientPicker';
import { loadReceiptLogo } from './receiptLogo';
import { SubmittedAttempt, type SubmissionState } from './lib/submittedAttempt';
import { AccountRecoveryVault, type AccountBoundRequest } from './lib/accountScope';
import { submissionSummary, formatSubmissionSummary } from './lib/submissionSummary';

export type ConsignmentItem = {
  _id: string;
  name: string;
  productType: 'card' | 'sealed' | 'other';
  description?: string;
  series?: string;
  identifier?: string;
  language?: string;
  condition?: string;
  askingPriceCents: number;
  agreedPriceCents?: number;
  commissionRateBps: number;
  status: string;
  events?: {
    _id: string;
    kind: string;
    occurredAt: number;
    authorizationNote?: string;
    askingPriceCents?: number;
    commissionRateBps?: number;
  }[];
  photos?: { _id: string; filename: string }[];
};
export type Consignment = {
  _id: string;
  sellerId: string;
  sellerName: string;
  reference: string;
  occurredAt: number;
  dueAt?: number;
  notes?: string;
  flowVersion?: number;
  contractStatus?: 'awaiting_signature' | 'signed';
  contractRevision?: number;
  contractTerms?: { version: string; text: string };
  items: ConsignmentItem[];
};
export type ConsignmentBalances = {
  balances: {
    sellerId: string;
    sellerName: string;
    earnedCents: number;
    paidCents: number;
    balanceCents: number;
  }[];
  payments: {
    _id: string;
    sellerId: string;
    sellerName: string;
    amountCents: number;
    occurredAt: number;
    method: string;
    reference?: string;
  }[];
};
type Request = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
type Draft = {
  operationId: string;
  name: string;
  productType: 'card' | 'sealed' | 'other';
  description: string;
  price: string;
  rate: string;
  series: string;
  identifier: string;
  language: string;
  condition: string;
  tcg: string;
  gradingCompany: string;
  gradingGrade: string;
  gradingCertificate: string;
  photo: File | null;
};
const draft = (): Draft => ({
  operationId: crypto.randomUUID(),
  name: '',
  productType: 'sealed',
  description: '',
  price: '',
  rate: '30',
  series: '',
  identifier: '',
  language: '',
  condition: '',
  tcg: '',
  gradingCompany: '',
  gradingGrade: '',
  gradingCertificate: '',
  photo: null,
});
export const money = (cents: number) =>
  new Intl.NumberFormat('fr-BE', { style: 'currency', currency: shopCurrency }).format(cents / 100);
const number = (value: string) => Number(value.replace(',', '.'));
const validDecimal = (value: string) =>
  /^\d+(?:[.,]\d{1,2})?$/.test(value.trim()) &&
  Number.isSafeInteger(Math.round(number(value) * 100));
const today = shopDateInput;
const dateValue = (value: string) => {
  try {
    return shopDateTimestamp(value);
  } catch {
    return Number.NaN;
  }
};
const typeLabel = (type: string) =>
  ({ card: 'Carte', sealed: 'Produit scellé', other: 'Autre article' })[type] ?? 'Article';
const statusLabel = (status: string) =>
  ({ available: 'En dépôt', sold: 'Vendu', returned: 'Restitué' })[status] ?? status;
function newConsignmentRecovery(accountId?: string) {
  return {
    creation: new SubmittedAttempt<{ consignmentId: string; itemIds: string[] }, Draft[]>(
      accountId,
    ),
    mutation: new SubmittedAttempt<unknown>(accountId),
    photos: new WeakMap<File, string>(),
  };
}
const consignmentRecovery = new AccountRecoveryVault<ReturnType<typeof newConsignmentRecovery>>(
  (value) => value.creation.state !== 'idle' || value.mutation.state !== 'idle',
);
export default function ConsignmentsPage({
  clients,
  request,
  upload,
  apiBase,
  onChanged,
  onCreateClient,
  active,
  view = 'history',
}: {
  clients: PickerClient[];
  onCreateClient: () => void;
  active: boolean;
  view?: 'history' | 'new' | 'payouts';
  request: Request;
  upload: (itemId: string, file: File, operationId?: string) => Promise<unknown>;
  apiBase: string;
  onChanged: () => Promise<void>;
}) {
  const owner = (request as Partial<AccountBoundRequest>).accountId;
  const recovery = useRef(
    owner
      ? consignmentRecovery.forAccount(owner, () => newConsignmentRecovery(owner))
      : newConsignmentRecovery(),
  ).current;
  const assertAccount = () => (request as Partial<AccountBoundRequest>).assertActive?.();
  const [deposits, setDeposits] = useState<Consignment[]>([]);
  const [balances, setBalances] = useState<ConsignmentBalances>({ balances: [], payments: [] });
  const [rows, setRows] = useState<Draft[]>([draft()]);
  const [sellerId, setSellerId] = useState('');
  const [resolvedSeller, setResolvedSeller] = useState<PickerClient>();
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(today());
  const [due, setDue] = useState('');
  const [notes, setNotes] = useState('');
  const [contractTerms, setContractTerms] = useState('');
  const [contractVersion, setContractVersion] = useState('1');
  const [creationStep, setCreationStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createdDeposit, setCreatedDeposit] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1),
    [historyStatus, setHistoryStatus] = useState('all'),
    [selectedDepositId, setSelectedDepositId] = useState<string | null>(null),
    [itemStatus, setItemStatus] = useState('all'),
    [expandedDraft, setExpandedDraft] = useState<string | null>(null),
    [dataLoading, setDataLoading] = useState(false);
  const wizardTop = useRef<HTMLDivElement>(null);
  const historyScroll = useRef(0),
    wizardError = useRef<HTMLParagraphElement>(null);
  const filteredDeposits = deposits.filter(
    (d) =>
      [d.sellerName, d.reference, ...d.items.map((i) => i.name)]
        .join(' ')
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()) &&
      (historyStatus === 'all' ||
        (historyStatus === 'signature'
          ? d.flowVersion === 2 && d.contractStatus !== 'signed'
          : d.items.some((i) => i.status === historyStatus))),
  );
  const historyPages = Math.max(1, Math.ceil(filteredDeposits.length / 12));
  const selectedDeposit = deposits.find((d) => d._id === selectedDepositId);
  const totalPrice = rows.reduce(
    (sum, row) => sum + (validDecimal(row.price) ? Math.round(number(row.price) * 100) : 0),
    0,
  );
  function openDeposit(id: string) {
    historyScroll.current = window.scrollY;
    setSelectedDepositId(id);
    setItemStatus('all');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function closeDeposit() {
    setSelectedDepositId(null);
    requestAnimationFrame(() => window.scrollTo({ top: historyScroll.current, behavior: 'auto' }));
  }
  function stepError(step: number) {
    if (
      step === 0 &&
      (!sellerId ||
        !reference.trim() ||
        !Number.isFinite(dateValue(date)) ||
        (due && (!Number.isFinite(dateValue(due)) || dateValue(due) < dateValue(date))))
    )
      return 'Choisissez un déposant, une référence et des dates valides.';
    if (
      step === 1 &&
      (!rows.length ||
        rows.some(
          (row) =>
            !row.name.trim() ||
            !validDecimal(row.price) ||
            !validDecimal(row.rate) ||
            number(row.price) < 0 ||
            number(row.rate) < 0 ||
            number(row.rate) > 100,
        ))
    )
      return 'Chaque article nécessite un nom, un prix positif ou nul et une commission entre 0 et 100 %, avec deux décimales maximum.';
    if (step === 2 && (!contractTerms.trim() || !contractVersion.trim()))
      return 'Renseignez les conditions convenues et leur version.';
    return '';
  }
  function nextStep() {
    const message = stepError(creationStep);
    if (message) {
      setError(message);
      requestAnimationFrame(() => wizardError.current?.focus());
      return;
    }
    setError('');
    setCreationStep((step) => Math.min(3, step + 1));
    requestAnimationFrame(() => wizardTop.current?.scrollIntoView({ block: 'start' }));
  }

  const [paymentSeller, setPaymentSeller] = useState('');
  const [balanceFilter, setBalanceFilter] = useState('due');
  const paymentForm = useRef<HTMLFormElement>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState('Virement');
  const [paymentReference, setPaymentReference] = useState('');
  const [terms, setTerms] = useState<{
    itemId: string;
    name: string;
    price: string;
    rate: string;
    note: string;
  } | null>(null);
  const photoAttempts = useRef(recovery.photos);
  const uploadPhoto = (itemId: string, file: File) => {
    let id = photoAttempts.current.get(file);
    if (!id) {
      id = crypto.randomUUID();
      photoAttempts.current.set(file, id);
    }
    return upload(itemId, file, id);
  };
  const operationId = useRef(crypto.randomUUID());
  const committed = useRef<{ consignmentId: string; itemIds: string[] } | null>(
    recovery.creation.current?.state === 'confirmed'
      ? (recovery.creation.current.result ?? null)
      : null,
  );
  const creationAttempt = useRef(recovery.creation);
  const [creationState, setCreationState] = useState<SubmissionState>(recovery.creation.state);
  const creationLock = useRef(false);

  async function downloadReceipt(deposit: Consignment) {
    setBusy(true);
    setError('');
    try {
      const [logo, signatory] = await Promise.all([
        loadReceiptLogo(),
        request<SignatoryProfile>('/auth/profile'),
      ]);
      const client =
        clients.find((client) => client._id === deposit.sellerId) ??
        (await request<PickerClient>(`/sellers/${encodeURIComponent(deposit.sellerId)}`));
      assertAccount();
      const pdf = createConsignmentReceiptPdf(
        { ...deposit, client: client ?? { name: deposit.sellerName }, signatory },
        logo,
        { brand, legal },
      );
      const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `depot-${deposit.reference.replace(/[^a-z0-9-]/gi, '-')}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    const [deposits, balances] = await Promise.all([
      request<Consignment[]>('/consignments'),
      request<ConsignmentBalances>('/consignments/balances'),
    ]);
    setDeposits(deposits);
    setBalances(balances);
  }
  useEffect(() => {
    if (!active) return;
    let current = true;
    setDataLoading(true);
    Promise.all([
      request<Consignment[]>('/consignments'),
      request<ConsignmentBalances>('/consignments/balances'),
    ])
      .then(([a, b]) => {
        if (current) {
          setDeposits(a);
          setBalances(b);
        }
      })
      .catch((e) => {
        if (current) setError(String(e));
      })
      .finally(() => {
        if (current) setDataLoading(false);
      });
    return () => {
      current = false;
    };
  }, [request, active]);
  function patch(id: string, values: Partial<Draft>) {
    setRows((rows) => rows.map((row) => (row.operationId === id ? { ...row, ...values } : row)));
  }
  const pendingMutation = useRef(recovery.mutation);
  const [mutationState, setMutationState] = useState<SubmissionState>(recovery.mutation.state);
  const mutationLock = useRef(false);
  async function mutate(path: string, body: Record<string, unknown>, recovery = false) {
    if (mutationLock.current) return false;
    if (creationAttempt.current.current) {
      setError('Terminez la récupération du dépôt avant une autre opération.');
      return false;
    }
    if (pendingMutation.current.current && !recovery) {
      setError(
        'Une opération attend votre vérification. Utilisez son bouton de récupération avant de commencer une autre opération.',
      );
      return false;
    }
    mutationLock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      pendingMutation.current.prepare(path, body, undefined);
      setMutationState(pendingMutation.current.state);
      await pendingMutation.current.execute(request);
      assertAccount();
      setMutationState('confirmed');
      const committedPath = pendingMutation.current.current!.path;
      if (committedPath === '/consignments/payments') {
        setPaymentSeller('');
        setPaymentAmount('');
        setPaymentReference('');
      }
      if (committedPath === '/consignments/terms') setTerms(null);
      try {
        await refresh();
        await onChanged();
      } catch (error) {
        setError(
          `Opération enregistrée. Seule l’actualisation reste à faire : ${error instanceof Error ? error.message : String(error)}`,
        );
        return true;
      }
      assertAccount();
      pendingMutation.current.release();
      setMutationState('idle');
      setNotice('Opération enregistrée.');
      return true;
    } catch (e) {
      setMutationState(pendingMutation.current.state);
      setError(
        `${e instanceof Error ? e.message : String(e)}${pendingMutation.current.state === 'unknown' ? ' Résultat incertain : la demande et son identifiant sont conservés.' : ''}`,
      );
      return false;
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }
  function mutationRecovery() {
    if (mutationState === 'idle') return null;
    return (
      <section className="cw-alert" role="status">
        <p>
          <strong>
            {formatSubmissionSummary(
              submissionSummary(pendingMutation.current.current),
              shopCurrency,
              shopTimezone,
            )}
          </strong>
        </p>
        <p>
          {mutationState === 'confirmed'
            ? 'Opération enregistrée. Actualisez les données sans la renvoyer.'
            : mutationState === 'rejected'
              ? 'Le serveur a refusé cette opération. Vous pouvez revoir les champs.'
              : 'Une opération reste à confirmer. Les valeurs soumises sont conservées ; aucune nouvelle opération ne peut être envoyée.'}
        </p>
        <Button disabled={busy} type="button" onClick={() => void mutate('', {}, true)}>
          {mutationState === 'confirmed' ? 'Actualiser les données' : 'Reprendre la même opération'}
        </Button>
        {mutationState === 'rejected' && (
          <Button
            disabled={busy}
            type="button"
            variant="outline"
            onClick={() => {
              pendingMutation.current.release();
              setMutationState('idle');
            }}
          >
            Revoir l’opération refusée
          </Button>
        )}
      </section>
    );
  }
  useEffect(() => {
    if (mutationState === 'idle' && creationState === 'idle') return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [mutationState, creationState]);
  async function create() {
    if (creationLock.current) return;
    if (pendingMutation.current.current)
      return setError('Terminez la récupération de l’opération précédente.');
    setError('');
    setNotice('');
    if (!creationAttempt.current.current) {
      if (!contractTerms.trim() || !contractVersion.trim())
        return setError('Complétez les conditions réellement convenues et leur version.');
      if (
        !sellerId ||
        !reference.trim() ||
        !Number.isFinite(dateValue(date)) ||
        (due && (!Number.isFinite(dateValue(due)) || dateValue(due) < dateValue(date)))
      )
        return setError('Choisissez un déposant, une référence et des dates valides.');
      if (
        rows.some(
          (row) =>
            !row.name.trim() ||
            !row.price.trim() ||
            !row.rate.trim() ||
            !validDecimal(row.price) ||
            !validDecimal(row.rate) ||
            !Number.isFinite(number(row.price)) ||
            number(row.price) < 0 ||
            !Number.isFinite(number(row.rate)) ||
            number(row.rate) < 0 ||
            number(row.rate) > 100,
        )
      )
        return setError(
          'Chaque article doit avoir un nom, un prix positif ou nul et une commission entre 0 et 100 %, avec deux décimales maximum.',
        );
      creationAttempt.current.prepare(
        '/consignments',
        {
          operationId: operationId.current,
          sellerId,
          flowVersion: 2,
          contractTerms: { version: contractVersion.trim(), text: contractTerms.trim() },
          reference: reference.trim(),
          occurredAt: dateValue(date),
          dueAt: due ? dateValue(due) : undefined,
          notes: notes.trim() || undefined,
          items: rows.map((row) => ({
            operationId: row.operationId,
            name: row.name.trim(),
            productType: row.productType,
            description: row.description.trim() || undefined,
            askingPriceCents: Math.round(number(row.price) * 100),
            commissionRateBps: Math.round(number(row.rate) * 100),
            series: row.series || undefined,
            identifier: row.identifier || undefined,
            language: row.language || undefined,
            tcg: row.tcg || undefined,
            ...(row.productType === 'card'
              ? {
                  condition: row.condition || undefined,
                  gradingCompany: row.gradingCompany || undefined,
                  gradingGrade: row.gradingGrade || undefined,
                  gradingCertificate: row.gradingCertificate || undefined,
                }
              : {}),
          })),
        },
        rows.map((row) => ({ ...row })),
      );
    }
    creationLock.current = true;
    setBusy(true);
    setCreationState(creationAttempt.current.state);
    try {
      const result = await creationAttempt.current.execute(request);
      assertAccount();
      committed.current = result;
      setCreationState('confirmed');
      for (const [index, row] of creationAttempt.current.current!.context.entries())
        if (row.photo) {
          await uploadPhoto(result.itemIds[index], row.photo);
          row.photo = null;
          patch(row.operationId, { photo: null });
        }
      assertAccount();
      setCreatedDeposit(result.consignmentId);
      committed.current = null;
      creationAttempt.current.release();
      setCreationState('idle');
      operationId.current = crypto.randomUUID();
      setRows([draft()]);
      setReference('');
      setNotes('');
      setContractTerms('');
      setCreationStep(0);
      setDue('');
      try {
        await refresh();
        await onChanged();
      } catch {
        setError(
          'Dépôt enregistré. L’actualisation a échoué ; le dossier ne doit pas être recréé.',
        );
      }
      setNotice(
        'Dépôt enregistré. Ouvrez son dossier puis lisez et signez le contrat pour rendre les articles disponibles à la vente.',
      );
    } catch (e) {
      setCreationState(creationAttempt.current.state);
      setError(
        `${e instanceof Error ? e.message : String(e)}${committed.current ? ' Le dépôt est enregistré ; réessayez pour terminer les pièces jointes.' : ''}`,
      );
    } finally {
      creationLock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="consignments-page consignment-workspace">
      {mutationRecovery()}
      {creationState !== 'idle' && (
        <section className="cw-alert" role="status">
          <p>
            <strong>
              {formatSubmissionSummary(
                submissionSummary(creationAttempt.current.current),
                shopCurrency,
                shopTimezone,
              )}
            </strong>
          </p>
          <p>
            {creationState === 'confirmed'
              ? 'Dépôt enregistré. Terminez les pièces jointes restantes.'
              : creationState === 'rejected'
                ? 'Le dépôt a été refusé ; vous pouvez revoir les champs.'
                : 'Résultat du dépôt incertain. Les articles et conditions soumis sont conservés.'}
          </p>
          <Button disabled={busy} onClick={() => void create()}>
            Reprendre le même dépôt
          </Button>
          {creationState === 'rejected' && (
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => {
                creationAttempt.current.release();
                setCreationState('idle');
              }}
            >
              Revoir le dépôt refusé
            </Button>
          )}
        </section>
      )}
      {error && (
        <p ref={wizardError} tabIndex={-1} className="cw-alert cw-alert-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="cw-alert" role="status">
          {notice}
        </p>
      )}
      {createdDeposit && view === 'new' && (
        <div className="cw-created">
          <FiCheck aria-hidden="true" />
          <div>
            <strong>Dossier enregistré</strong>
            <p>Le contrat attend les signatures. Les articles restent indisponibles à la vente.</p>
          </div>
          <ReceiptSigning kind="consignment" targetId={createdDeposit} request={request} />
          <Button variant="ghost" onClick={() => setCreatedDeposit(null)}>
            Nouveau dépôt
          </Button>
        </div>
      )}
      <section className="cw-creation" hidden={view !== 'new' || Boolean(createdDeposit)}>
        <div className="cw-wizard-top" ref={wizardTop}>
          <Button
            type="button"
            variant="ghost"
            disabled={creationStep === 0 || busy || creationState !== 'idle'}
            onClick={() => {
              setCreationStep((step) => Math.max(0, step - 1));
              requestAnimationFrame(() => wizardTop.current?.scrollIntoView({ block: 'start' }));
              setError('');
            }}
          >
            <FiArrowLeft aria-hidden="true" />
            Retour
          </Button>
          <span>Étape {creationStep + 1} sur 4</span>
        </div>
        <ol className="cw-stepper" aria-label="Étapes du dépôt">
          {['Déposant', 'Articles', 'Conditions', 'Vérification'].map((label, index) => (
            <li
              key={label}
              aria-current={index === creationStep ? 'step' : undefined}
              className={index < creationStep ? 'is-complete' : ''}
            >
              <span>{index < creationStep ? <FiCheck aria-hidden="true" /> : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <div className="cw-wizard-heading">
          <span className="cw-eyebrow">Nouveau dépôt-vente</span>
          <h2>
            {
              [
                'Identifiez le déposant',
                'Détaillez les articles confiés',
                'Précisez l’accord',
                'Vérifiez avant de préparer le contrat',
              ][creationStep]
            }
          </h2>
          <p>
            {
              [
                'Le dossier et ses documents reprendront ces coordonnées.',
                'Chaque article conserve son prix, sa commission et son identité.',
                'Les conditions saisies sont celles réellement convenues avec le déposant.',
                'L’enregistrement prépare le dossier. Les signatures autoriseront ensuite sa mise en vente.',
              ][creationStep]
            }
          </p>
        </div>
        <div>
          <fieldset
            disabled={busy || creationState !== 'idle' || mutationState !== 'idle'}
            className="consignment-fieldset"
          >
            <div hidden={creationStep !== 0}>
              <ClientPicker
                request={request}
                clients={clients}
                onResolved={setResolvedSeller}
                value={sellerId}
                onChange={setSellerId}
                onCreate={onCreateClient}
              />
              <div className="form-grid">
                <label>
                  Référence
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="DEP-2026-001"
                  />
                </label>
                <label>
                  Date du dépôt
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label>
                  Échéance facultative
                  <Input
                    type="date"
                    min={date}
                    value={due}
                    onChange={(e) => setDue(e.target.value)}
                  />
                </label>
              </div>
              <label>
                Conditions et notes
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Accord sur les remises, restitution…"
                />
              </label>
            </div>
            <div hidden={creationStep !== 1}>
              <div className="purchase-section-title">
                <div>
                  <span className="purchase-step">02 · Articles</span>
                  <h3>Articles confiés</h3>
                </div>
              </div>
              {rows.map((row, index) => (
                <div className="consignment-draft cw-draft" key={row.operationId}>
                  <div className="cw-draft-heading">
                    <Button
                      type="button"
                      className="cw-draft-toggle"
                      aria-expanded={expandedDraft === row.operationId || rows.length === 1}
                      onClick={() =>
                        setExpandedDraft((value) =>
                          value === row.operationId ? null : row.operationId,
                        )
                      }
                    >
                      <span className="cw-item-index">{index + 1}</span>
                      <span>
                        <strong>{row.name || 'Nouvel article'}</strong>
                        <small>
                          {typeLabel(row.productType)} ·{' '}
                          {row.price
                            ? money(Math.round(number(row.price) * 100))
                            : 'Prix à définir'}
                        </small>
                      </span>
                      <FiChevronRight aria-hidden="true" />
                    </Button>
                  </div>
                  <div
                    className="cw-draft-body"
                    hidden={rows.length > 1 && expandedDraft !== row.operationId}
                  >
                    <div className="form-grid">
                      <label>
                        Type
                        <select
                          value={row.productType}
                          onChange={(e) =>
                            patch(row.operationId, {
                              productType: e.target.value as Draft['productType'],
                            })
                          }
                        >
                          <option value="sealed">Produit scellé</option>
                          <option value="card">Carte</option>
                          <option value="other">Autre article</option>
                        </select>
                      </label>
                      <label>
                        Désignation
                        <Input
                          value={row.name}
                          onChange={(e) => patch(row.operationId, { name: e.target.value })}
                          placeholder="Display, coffret, ETB…"
                        />
                      </label>
                      <label>
                        Prix de vente convenu ({currencySymbol})
                        <Input
                          inputMode="decimal"
                          value={row.price}
                          onChange={(e) => patch(row.operationId, { price: e.target.value })}
                        />
                      </label>
                      <label>
                        Commission (%)
                        <Input
                          inputMode="decimal"
                          value={row.rate}
                          onChange={(e) => patch(row.operationId, { rate: e.target.value })}
                        />
                      </label>
                    </div>
                    <p>
                      Commission :{' '}
                      <b>
                        {money(
                          Math.round(
                            (Math.round(number(row.price) * 100) *
                              Math.round(number(row.rate) * 100)) /
                              10000,
                          ),
                        )}
                      </b>{' '}
                      · Au déposant :{' '}
                      <b>
                        {money(
                          Math.round(number(row.price) * 100) -
                            Math.round(
                              (Math.round(number(row.price) * 100) *
                                Math.round(number(row.rate) * 100)) /
                                10000,
                            ),
                        )}
                      </b>
                    </p>
                    <label>
                      Description
                      <textarea
                        value={row.description}
                        onChange={(e) => patch(row.operationId, { description: e.target.value })}
                      />
                    </label>
                    <details>
                      <summary>Référence et informations facultatives</summary>
                      <div className="form-grid">
                        <label>
                          Jeu
                          <select
                            value={row.tcg}
                            onChange={(e) => patch(row.operationId, { tcg: e.target.value })}
                          >
                            <option value="">Non précisé</option>
                            <option value="pokemon">Pokémon</option>
                            <option value="riftbound">Riftbound</option>
                          </select>
                        </label>
                        <label>
                          Série
                          <SeriesInput tcg={row.tcg || 'pokemon'} value={row.series ?? ''} onChange={value => patch(row.operationId, { series: value })} />
                        </label>
                        <label>
                          Référence / numéro
                          <Input
                            value={row.identifier}
                            onChange={(e) => patch(row.operationId, { identifier: e.target.value })}
                          />
                        </label>
                        <label>
                          Langue
                          <select
                            value={row.language}
                            onChange={(e) => patch(row.operationId, { language: e.target.value })}
                          >
                            <option value="">Non précisée</option>
                            <option value="fr">Français</option>
                            <option value="en">Anglais</option>
                            <option value="ja">Japonais</option>
                            <option value="zh">Chinois</option>
                          </select>
                        </label>
                        {row.productType === 'card' && (
                          <>
                            <label>
                              État
                              <select
                                value={row.condition}
                                onChange={(e) =>
                                  patch(row.operationId, { condition: e.target.value })
                                }
                              >
                                <option value="">Non précisé</option>
                                {['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'].map((x) => (
                                  <option key={x}>{x}</option>
                                ))}
                              </select>
                            </label>
                            <GradingCompanyPicker
                              request={request}
                              value={row.gradingCompany}
                              onChange={(value) =>
                                patch(row.operationId, { gradingCompany: value })
                              }
                            />
                            <label>
                              Note
                              <Input
                                value={row.gradingGrade}
                                onChange={(e) =>
                                  patch(row.operationId, { gradingGrade: e.target.value })
                                }
                              />
                            </label>
                            <label>
                              Certificat
                              <Input
                                value={row.gradingCertificate}
                                onChange={(e) =>
                                  patch(row.operationId, { gradingCertificate: e.target.value })
                                }
                              />
                            </label>
                          </>
                        )}
                      </div>
                    </details>
                    <label>
                      Photo ou justificatif
                      <Input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) =>
                          patch(row.operationId, { photo: e.target.files?.[0] ?? null })
                        }
                      />
                    </label>
                    {rows.length > 1 && (
                      <Button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          setRows((rows) => rows.filter((x) => x.operationId !== row.operationId))
                        }
                      >
                        Retirer cet article
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <Button
                type="button"
                className="secondary"
                onClick={() => {
                  const next = draft();
                  setRows((rows) => [...rows, next]);
                  setExpandedDraft(next.operationId);
                }}
              >
                Ajouter un article
              </Button>
            </div>
            <div hidden={creationStep !== 2}>
              <h3>Conditions convenues</h3>
              <p>
                Renseignez les conditions réellement convenues : propriété, durée, versement,
                restitution et garde. Aucun régime TVA ni clause juridique n’est appliqué
                automatiquement.
              </p>
              <label>
                Version des conditions
                <Input
                  value={contractVersion}
                  onChange={(e) => setContractVersion(e.target.value)}
                />
              </label>
              <label>
                Conditions du contrat
                <textarea
                  rows={8}
                  maxLength={10000}
                  value={contractTerms}
                  onChange={(e) => setContractTerms(e.target.value)}
                />
              </label>
              <p>
                Commission déduite du prix effectivement vendu. Aucun frais supplémentaire ajouté
                par l’application. Une remise sous le prix convenu exige un nouvel accord.
              </p>
            </div>
            <div hidden={creationStep !== 3} className="cw-review">
              <div className="cw-review-contact">
                <span className="cw-eyebrow">Déposant et dossier</span>
                <h3>
                  {clients.find((c) => c._id === sellerId)?.name ??
                    (resolvedSeller?._id === sellerId
                      ? resolvedSeller.name
                      : 'Contact sélectionné')}
                </h3>
                <p>
                  {reference} · Déposé le {date}
                  {due ? ` · Échéance ${due}` : ''}
                </p>
                {notes && <p>{notes}</p>}
              </div>
              <div className="cw-review-items">
                {rows.map((row) => {
                  const price = Math.round(number(row.price) * 100),
                    commission = Math.round((price * Math.round(number(row.rate) * 100)) / 10000);
                  return (
                    <article key={row.operationId}>
                      <div>
                        <strong>{row.name}</strong>
                        <small>
                          {[
                            typeLabel(row.productType),
                            row.series,
                            row.identifier,
                            row.language,
                            row.condition,
                            row.gradingCompany,
                            row.gradingGrade,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                        {row.description && <p>{row.description}</p>}
                        {row.photo && <small>Pièce jointe : {row.photo.name}</small>}
                      </div>
                      <div>
                        <strong>{money(price)}</strong>
                        <small>
                          Commission {row.rate} % · {money(commission)}
                        </small>
                        <small>Part du déposant : {money(price - commission)}</small>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="cw-review-terms">
                <h3>Conditions · version {contractVersion}</h3>
                <p>{contractTerms}</p>
              </div>
              <p>Aucun versement attesté. Le dépôt sera à signer avant la mise en vente.</p>
            </div>
          </fieldset>
          <div className="cw-wizard-footer">
            <span>
              {rows.length} article(s) · {money(totalPrice)} de prix convenus
            </span>
            <Button
              type="button"
              disabled={busy}
              onClick={() => (creationStep === 3 || committed.current ? void create() : nextStep())}
            >
              {committed.current
                ? 'Terminer les pièces jointes'
                : creationStep === 3
                  ? 'Préparer le contrat'
                  : 'Continuer'}
              <FiArrowRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      </section>
      <section className="cw-payouts" hidden={view !== 'payouts'}>
        <h2>À reverser aux déposants</h2>
        <div className="consignment-due-summary">
          <strong>
            {money(
              balances.balances.reduce(
                (sum, balance) => sum + Math.max(0, balance.balanceCents),
                0,
              ),
            )}
          </strong>
          <span>
            à payer à {balances.balances.filter((balance) => balance.balanceCents > 0).length}{' '}
            déposant(s)
          </span>
        </div>
        <p>
          Les ventes « À encaisser » ne sont pas encore dues au déposant. Les ventes anciennes sans
          mode renseigné conservent leur traitement historique.
        </p>
        <label>
          Afficher
          <select value={balanceFilter} onChange={(event) => setBalanceFilter(event.target.value)}>
            <option value="due">Encore à payer</option>
            <option value="settled">Déjà payés</option>
            <option value="regularization">Régularisations</option>
            <option value="all">Tous les déposants</option>
          </select>
        </label>
        {balanceFilter === 'due' &&
          !balances.balances.some((balance) => balance.balanceCents > 0) && (
            <p role="status">Aucune somme à reverser pour les ventes encaissées.</p>
          )}
        {balances.balances
          .filter(
            (balance) =>
              balanceFilter === 'all' ||
              (balanceFilter === 'due'
                ? balance.balanceCents > 0
                : balanceFilter === 'settled'
                  ? balance.balanceCents === 0 && balance.paidCents > 0
                  : balance.balanceCents < 0),
          )
          .map((b) => (
            <article className="cw-balance-row" key={b.sellerId}>
              <div>
                <b>{b.sellerName}</b>
                <small>
                  Part des ventes encaissées : {money(b.earnedCents)} · Déjà versé :{' '}
                  {money(b.paidCents)}
                </small>
                <strong>
                  {b.balanceCents < 0
                    ? `Régularisation à récupérer : ${money(-b.balanceCents)}`
                    : b.balanceCents === 0 && b.paidCents > 0
                      ? 'Payé · solde réglé'
                      : `Solde à reverser : ${money(b.balanceCents)}`}
                </strong>
              </div>
              {b.balanceCents > 0 && (
                <Button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setPaymentSeller(b.sellerId);
                    setPaymentAmount((b.balanceCents / 100).toFixed(2));
                    setPaymentDate(today());
                    setPaymentReference('');
                    requestAnimationFrame(() =>
                      paymentForm.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
                    );
                  }}
                >
                  Enregistrer un versement
                </Button>
              )}
            </article>
          ))}
        <p>
          Un versement peut couvrir plusieurs articles du même déposant. Après annulation d’une
          vente déjà payée, le paiement reste historisé et le solde indique la régularisation.
        </p>
        {paymentSeller && view === 'payouts' && active && (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open && !busy) setPaymentSeller('');
            }}
          >
            <DialogContent className="cw-payment-dialog" data-consignment-dialog>
              <DialogTitle>Enregistrer un versement</DialogTitle>
              <DialogDescription>
                Consignez un paiement déjà effectué. Un montant partiel est possible ; l’application
                n’envoie pas d’argent.
              </DialogDescription>
              {error && (
                <p role="alert" className="cw-alert-error">
                  {error}
                </p>
              )}
              {mutationRecovery()}
              <form
                ref={paymentForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  const cents = Math.round(number(paymentAmount) * 100);
                  const balance = balances.balances.find((b) => b.sellerId === paymentSeller);
                  if (
                    !balance ||
                    !validDecimal(paymentAmount) ||
                    !Number.isSafeInteger(cents) ||
                    cents <= 0 ||
                    cents > balance.balanceCents ||
                    !Number.isFinite(dateValue(paymentDate))
                  )
                    return setError(
                      'Le versement doit être positif et ne pas dépasser le solde dû.',
                    );
                  void mutate('/consignments/payments', {
                    operationId: crypto.randomUUID(),
                    sellerId: paymentSeller,
                    amountCents: cents,
                    occurredAt: dateValue(paymentDate),
                    method: paymentMethod,
                    reference: paymentReference || undefined,
                  }).then((ok) => {
                    if (ok) {
                      setPaymentSeller('');
                      setPaymentAmount('');
                      setPaymentReference('');
                      setNotice('Versement enregistré.');
                    }
                  });
                }}
              >
                <h3>Confirmer le paiement au déposant</h3>
                <p>
                  Le montant est prérempli avec le solde dû. Vous pouvez le réduire pour enregistrer
                  un paiement partiel. Cette action note un paiement déjà effectué ; elle n’envoie
                  pas de virement.
                </p>
                <fieldset
                  disabled={busy || mutationState !== 'idle'}
                  className="consignment-fieldset"
                >
                  <ClientPicker
                    request={request}
                    clients={balances.balances
                      .filter((b) => b.balanceCents > 0)
                      .map((b) => ({
                        ...clients.find((c) => c._id === b.sellerId),
                        _id: b.sellerId,
                        name: b.sellerName,
                        detail: `À reverser : ${money(b.balanceCents)}`,
                      }))}
                    value={paymentSeller}
                    onChange={setPaymentSeller}
                    label="Rechercher le déposant à payer"
                  />
                  <div className="form-grid">
                    <label>
                      Montant versé ({currencySymbol})
                      <Input
                        required
                        inputMode="decimal"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                      />
                    </label>
                    <label>
                      Date
                      <Input
                        required
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                      />
                    </label>
                    <label>
                      Mode
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                      >
                        <option>Virement</option>
                        <option>Espèces</option>
                        <option>Autre</option>
                      </select>
                    </label>
                    <label>
                      Référence du paiement
                      <Input
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="actions">
                    <Button type="submit">Confirmer : paiement effectué</Button>
                    <Button
                      type="button"
                      className="secondary"
                      onClick={() => setPaymentSeller('')}
                    >
                      Annuler
                    </Button>
                  </div>
                </fieldset>
              </form>
            </DialogContent>
          </Dialog>
        )}
        <details className="cw-payment-history">
          <summary>Historique des versements ({balances.payments.length})</summary>
          {balances.payments.map((p) => (
            <p key={p._id}>
              {new Date(p.occurredAt).toLocaleDateString('fr-BE', { timeZone: shopTimezone })} ·{' '}
              {p.sellerName} · {money(p.amountCents)} · {p.method} {p.reference}
            </p>
          ))}
        </details>
      </section>
      <section className="cw-history" hidden={view !== 'history'}>
        {!selectedDeposit ? (
          <>
            <div className="cw-history-toolbar">
              <label className="cw-search">
                <FiSearch aria-hidden="true" />
                <span className="cw-sr-only">Rechercher les dépôts</span>
                <Input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setHistoryPage(1);
                  }}
                  placeholder="Déposant, référence ou article…"
                />
              </label>
              <select
                aria-label="Statut des dossiers"
                value={historyStatus}
                onChange={(event) => {
                  setHistoryStatus(event.target.value);
                  setHistoryPage(1);
                }}
              >
                <option value="all">Tous les dossiers</option>
                <option value="signature">À signer</option>
                <option value="available">Avec articles en dépôt</option>
                <option value="sold">Avec articles vendus</option>
                <option value="returned">Avec restitutions</option>
              </select>
              <Button
                type="button"
                variant="secondary"
                disabled={dataLoading || busy}
                onClick={() => void refresh().catch((e) => setError(e.message))}
              >
                Actualiser
              </Button>
            </div>
            <div className="cw-history-caption">{filteredDeposits.length} dossier(s)</div>
            {dataLoading ? (
              <p role="status" className="cw-loading">
                Chargement des dépôts…
              </p>
            ) : (
              <div className="cw-history-table">
                <div className="cw-history-columns" aria-hidden="true">
                  <span>Dossier et déposant</span>
                  <span>Inventaire</span>
                  <span>Contrat</span>
                  <span>Valeur convenue</span>
                </div>
                {filteredDeposits
                  .slice(
                    (Math.min(historyPage, historyPages) - 1) * 12,
                    Math.min(historyPage, historyPages) * 12,
                  )
                  .map((d) => (
                    <Button
                      type="button"
                      className="cw-history-row"
                      key={d._id}
                      onClick={() => openDeposit(d._id)}
                    >
                      <span className="cw-dossier-name">
                        <span className="cw-dossier-icon">
                          <FiFileText aria-hidden="true" />
                        </span>
                        <span>
                          <strong>{d.sellerName}</strong>
                          <small>
                            {d.reference} ·{' '}
                            {new Date(d.occurredAt).toLocaleDateString('fr-BE', {
                              timeZone: shopTimezone,
                            })}
                          </small>
                        </span>
                      </span>
                      <span className="cw-history-inventory">
                        <strong>{d.items.length} article(s)</strong>
                        <small>
                          {d.items.filter((i) => i.status === 'available').length} en dépôt ·{' '}
                          {d.items.filter((i) => i.status === 'sold').length} vendu(s)
                        </small>
                      </span>
                      <span
                        className={`cw-status ${d.flowVersion === 2 && d.contractStatus !== 'signed' ? 'cw-status-pending' : ''}`}
                      >
                        {d.flowVersion === 2
                          ? d.contractStatus === 'signed'
                            ? 'Signé'
                            : 'À signer'
                          : 'Historique'}
                      </span>
                      <span className="cw-history-value">
                        <strong>
                          {money(
                            d.items.reduce(
                              (total, item) =>
                                total + (item.agreedPriceCents ?? item.askingPriceCents),
                              0,
                            ),
                          )}
                        </strong>
                        <FiChevronRight aria-hidden="true" />
                      </span>
                    </Button>
                  ))}
              </div>
            )}
            {!dataLoading && !filteredDeposits.length && (
              <div className="cw-empty">
                <FiPackage aria-hidden="true" />
                <h3>
                  {search || historyStatus !== 'all'
                    ? 'Aucun dossier ne correspond'
                    : 'Aucun dépôt enregistré'}
                </h3>
                <p>
                  {search || historyStatus !== 'all'
                    ? 'Ajustez les filtres pour retrouver un dossier.'
                    : 'Créez un dépôt pour enregistrer les articles confiés et leurs conditions.'}
                </p>
              </div>
            )}
            <nav className="cw-pagination" aria-label="Pages des dossiers">
              <span>
                Page {Math.min(historyPage, historyPages)} sur {historyPages}
              </span>
              <div>
                <Button
                  variant="secondary"
                  disabled={historyPage <= 1}
                  onClick={() => setHistoryPage((page) => page - 1)}
                >
                  Précédent
                </Button>
                <Button
                  variant="secondary"
                  disabled={historyPage >= historyPages}
                  onClick={() => setHistoryPage((page) => page + 1)}
                >
                  Suivant
                </Button>
              </div>
            </nav>
          </>
        ) : (
          <div className="cw-dossier-detail">
            <div className="cw-dossier-top">
              <Button variant="ghost" onClick={closeDeposit}>
                <FiArrowLeft aria-hidden="true" />
                Tous les dossiers
              </Button>
              <span>{selectedDeposit.reference}</span>
            </div>
            <div className="cw-dossier-heading">
              <div>
                <span className="cw-eyebrow">Dépôt-vente</span>
                <h2>{selectedDeposit.sellerName}</h2>
                <p>
                  {selectedDeposit.reference} · {selectedDeposit.items.length} article(s)
                </p>
              </div>
              <strong>
                {money(
                  selectedDeposit.items.reduce(
                    (total, item) => total + (item.agreedPriceCents ?? item.askingPriceCents),
                    0,
                  ),
                )}
                <small>Valeur convenue des articles</small>
              </strong>
            </div>
            {[selectedDeposit].map((d) => (
              <div className="cw-dossier-content" key={d._id}>
                <p>
                  {d.flowVersion === 2
                    ? d.contractStatus === 'signed'
                      ? 'Contrat signé'
                      : 'Contrat à signer — articles indisponibles à la vente'
                    : 'Dossier historique'}
                  {d.contractRevision ? ` · révision ${d.contractRevision}` : ''}
                </p>
                {d.notes && <p>{d.notes}</p>}
                {d.contractTerms && (
                  <details className="cw-agreement">
                    <summary>Conditions du contrat · version {d.contractTerms.version}</summary>
                    <p>{d.contractTerms.text}</p>
                  </details>
                )}
                {d.dueAt && (
                  <p>
                    Échéance :{' '}
                    {new Date(d.dueAt).toLocaleDateString('fr-BE', { timeZone: shopTimezone })}
                  </p>
                )}
                <Button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void downloadReceipt(d)}
                >
                  Télécharger le bon de dépôt non signé PDF
                </Button>
                <ReceiptSigning kind="consignment" targetId={d._id} request={request} />
                {active && view === 'history' && (
                  <ConsignmentDocuments
                    deposit={d}
                    request={request}
                    onChanged={async () => {
                      await refresh();
                      await onChanged();
                    }}
                  />
                )}
                <div className="cw-item-filter">
                  <h3>Inventaire du dossier</h3>
                  <select
                    aria-label="Statut des articles du dépôt"
                    value={itemStatus}
                    onChange={(event) => setItemStatus(event.target.value)}
                  >
                    <option value="all">Tous les articles</option>
                    <option value="available">En dépôt</option>
                    <option value="sold">Vendus</option>
                    <option value="returned">Restitués</option>
                  </select>
                </div>
                {d.items
                  .filter((item) => itemStatus === 'all' || item.status === itemStatus)
                  .map((item) => (
                    <article className="cw-dossier-item" key={item._id}>
                      <div>
                        <div className="cw-item-title">
                          <ItemThumbnail name={item.name} photos={item.photos} apiBase={apiBase} />
                          <b>{item.name}</b>
                          <span className="cw-status">{statusLabel(item.status)}</span>
                        </div>
                        <small>
                          {typeLabel(item.productType)} · {statusLabel(item.status)} ·{' '}
                          {money(item.agreedPriceCents ?? item.askingPriceCents)} · Commission{' '}
                          {item.commissionRateBps / 100} %
                        </small>
                        {item.description && <p>{item.description}</p>}
                        {!!item.events?.length && (
                          <details>
                            <summary>Historique de l’accord et des restitutions</summary>
                            {item.events.map((event) => (
                              <p key={event._id}>
                                {new Date(event.occurredAt).toLocaleDateString('fr-BE', {
                                  timeZone: shopTimezone,
                                })}{' '}
                                ·{' '}
                                {event.kind === 'return'
                                  ? 'Restitution'
                                  : `Nouvel accord : ${money(event.askingPriceCents ?? 0)} · ${(event.commissionRateBps ?? 0) / 100} %`}{' '}
                                {event.authorizationNote && `— ${event.authorizationNote}`}
                              </p>
                            ))}
                          </details>
                        )}
                        {item.photos?.map((photo) => (
                          <a
                            className="item-photo-link"
                            key={photo._id}
                            href={`${apiBase}/attachments/${encodeURIComponent(photo._id)}/download`}
                          >
                            {photo.filename}
                          </a>
                        ))}
                        <label>
                          Ajouter une photo ou un justificatif
                          <Input
                            type="file"
                            disabled={busy}
                            accept="image/*,application/pdf"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setBusy(true);
                              setError('');
                              void uploadPhoto(item._id, file)
                                .then(refresh)
                                .catch((e) => setError(String(e)))
                                .finally(() => setBusy(false));
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                      {item.status === 'available' && (
                        <div className="actions">
                          <Button
                            type="button"
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              setTerms({
                                itemId: item._id,
                                name: item.name,
                                price: (
                                  (item.agreedPriceCents ?? item.askingPriceCents) / 100
                                ).toFixed(2),
                                rate: String(item.commissionRateBps / 100),
                                note: '',
                              })
                            }
                          >
                            Modifier l’accord
                          </Button>
                        </div>
                      )}
                    </article>
                  ))}
              </div>
            ))}
          </div>
        )}
      </section>
      {terms && view === 'history' && active && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setTerms(null);
          }}
        >
          <DialogContent className="cw-terms-dialog" data-consignment-dialog>
            <DialogTitle>Nouvel accord — {terms.name}</DialogTitle>
            <DialogDescription>
              L’accord modifié crée une nouvelle révision. Les signatures requises devront être
              obtenues avant de vendre selon ces conditions.
            </DialogDescription>
            {error && (
              <p role="alert" className="cw-alert-error">
                {error}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const price = Math.round(number(terms.price) * 100),
                  rate = Math.round(number(terms.rate) * 100);
                if (
                  !terms.price.trim() ||
                  !terms.rate.trim() ||
                  !validDecimal(terms.price) ||
                  !validDecimal(terms.rate) ||
                  !Number.isSafeInteger(price) ||
                  price < 0 ||
                  !Number.isSafeInteger(rate) ||
                  rate < 0 ||
                  rate > 10000 ||
                  !terms.note.trim()
                )
                  return setError('Prix, commission et accord du déposant sont requis.');
                void mutate('/consignments/terms', {
                  operationId: crypto.randomUUID(),
                  itemId: terms.itemId,
                  askingPriceCents: price,
                  commissionRateBps: rate,
                  authorizationNote: terms.note.trim(),
                }).then((ok) => {
                  if (ok) setTerms(null);
                });
              }}
            >
              {mutationRecovery()}
              <fieldset
                disabled={busy || mutationState !== 'idle'}
                className="consignment-fieldset"
              >
                <label>
                  Prix convenu ({currencySymbol})
                  <Input
                    value={terms.price}
                    onChange={(e) => setTerms({ ...terms, price: e.target.value })}
                  />
                </label>
                <label>
                  Commission (%)
                  <Input
                    value={terms.rate}
                    onChange={(e) => setTerms({ ...terms, rate: e.target.value })}
                  />
                </label>
                <label>
                  Autorisation du déposant
                  <textarea
                    required
                    value={terms.note}
                    onChange={(e) => setTerms({ ...terms, note: e.target.value })}
                    placeholder="Date, moyen de contact et accord obtenu"
                  />
                </label>
                <div className="actions">
                  <Button disabled={busy} type="submit">
                    Enregistrer l’accord
                  </Button>
                  <Button type="button" className="secondary" onClick={() => setTerms(null)}>
                    Fermer
                  </Button>
                </div>
              </fieldset>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
