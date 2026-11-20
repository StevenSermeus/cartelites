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
  contractStatus?: "awaiting_signature" | "signed";
  contractRevision?: number;
  contractTerms?: {version:string;text:string};
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
  new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const number = (value: string) => Number(value.replace(',', '.'));
const validDecimal = (value: string) =>
  /^\d+(?:[.,]\d{1,2})?$/.test(value.trim()) &&
  Number.isSafeInteger(Math.round(number(value) * 100));
const today = () => new Date().toLocaleDateString('en-CA');
const dateValue = (value: string) => new Date(`${value}T12:00:00`).getTime();
const typeLabel = (type: string) =>
  ({ card: 'Carte', sealed: 'Produit scellé', other: 'Autre article' })[type] ?? 'Article';
const statusLabel = (status: string) =>
  ({ available: 'En dépôt', sold: 'Vendu', returned: 'Restitué' })[status] ?? status;
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
  upload: (itemId: string, file: File) => Promise<unknown>;
  apiBase: string;
  onChanged: () => Promise<void>;
}) {
  const [deposits, setDeposits] = useState<Consignment[]>([]);
  const [balances, setBalances] = useState<ConsignmentBalances>({ balances: [], payments: [] });
  const [rows, setRows] = useState<Draft[]>([draft()]);
  const [sellerId, setSellerId] = useState('');
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
  const [search, setSearch] = useState('');
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
  const operationId = useRef(crypto.randomUUID());
  const committed = useRef<{ consignmentId: string; itemIds: string[] } | null>(null);
  async function downloadReceipt(deposit: Consignment) {
    setBusy(true);
    setError('');
    try {
      const [logo, signatory] = await Promise.all([
        loadReceiptLogo(),
        request<SignatoryProfile>('/auth/profile'),
      ]);
      const client = clients.find((client) => client._id === deposit.sellerId) ?? await request<PickerClient>(`/sellers/${encodeURIComponent(deposit.sellerId)}`);
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
      });
    return () => {
      current = false;
    };
  }, [request, active]);
  function patch(id: string, values: Partial<Draft>) {
    setRows((rows) => rows.map((row) => (row.operationId === id ? { ...row, ...values } : row)));
  }
  const pendingMutation = useRef<{ signature: string; body: string } | null>(null);
  async function mutate(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { operationId: _operationId, ...fields } = body;
      const signature = JSON.stringify([
        path,
        path.endsWith('/return') ? { itemId: fields.itemId } : fields,
      ]);
      if (pendingMutation.current?.signature !== signature)
        pendingMutation.current = { signature, body: JSON.stringify(body) };
      await request(path, { method: 'POST', body: pendingMutation.current.body });
      await refresh();
      await onChanged();
      pendingMutation.current = null;
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    setError('');
    setNotice('');
    if (!contractTerms.trim() || !contractVersion.trim()) return setError('Complétez les conditions réellement convenues et leur version.');
    if (
      !sellerId ||
      !reference.trim() ||
      !Number.isFinite(dateValue(date)) ||
      (due && dateValue(due) < dateValue(date))
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
    setBusy(true);
    try {
      const result =
        committed.current ??
        (await request<{ consignmentId: string; itemIds: string[] }>('/consignments', {
          method: 'POST',
          body: JSON.stringify({
            operationId: operationId.current,
            sellerId,
            flowVersion: 2,
            contractTerms: {version:contractVersion.trim(),text:contractTerms.trim()},
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
          }),
        }));
      committed.current = result;
      for (const [index, row] of rows.entries())
        if (row.photo) {
          await upload(result.itemIds[index], row.photo);
          patch(row.operationId, { photo: null });
        }
      committed.current = null;
      operationId.current = crypto.randomUUID();
      setRows([draft()]);
      setReference('');
      setNotes('');
      setContractTerms('');
      setCreationStep(0);
      setDue('');
      await refresh();
      await onChanged();
      setNotice('Dépôt enregistré. Ouvrez son dossier puis lisez et signez le contrat pour rendre les articles disponibles à la vente.');
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : String(e)}${committed.current ? ' Le dépôt est enregistré ; réessayez pour terminer les pièces jointes.' : ''}`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="consignments-page">
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <section className="panel" hidden={view !== 'new'}>
        <h2>Nouveau dépôt</h2>
        <p>
          Produits scellés, cartes et autres articles confiés. Les commissions sont suivies
          séparément des marges sur rachats.
        </p>
        <div>
          <fieldset disabled={busy || !!committed.current} className="consignment-fieldset">
            <nav className="actions" aria-label="Étapes du dépôt">{['Déposant','Inventaire','Conditions','Vérifier'].map((label,i)=><button type="button" className={i===creationStep?'':'secondary'} onClick={()=>setCreationStep(i)} key={label}>{i+1}. {label}</button>)}</nav>
            <div hidden={creationStep!==0}>
            <span className="purchase-step">01 · Déposant</span>
            <ClientPicker request={request}
              clients={clients}
              value={sellerId}
              onChange={setSellerId}
              onCreate={onCreateClient}
            />
            <div className="form-grid">
              <label>
                Référence
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="DEP-2026-001"
                />
              </label>
              <label>
                Date du dépôt
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label>
                Échéance facultative
                <input
                  type="date"
                  min={date}
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </label>
            </div>
            {!clients.length && <p>Créez d’abord la fiche du déposant dans « Clients ».</p>}
            <label>
              Conditions et notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Accord sur les remises, restitution…"
              />
            </label>
            </div><div hidden={creationStep!==1}>
            <div className="purchase-section-title">
              <div>
                <span className="purchase-step">02 · Articles</span>
                <h3>Articles confiés</h3>
              </div>
            </div>
            {rows.map((row, index) => (
              <div className="consignment-draft" key={row.operationId}>
                <h3>Article {index + 1}</h3>
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
                    <input
                      value={row.name}
                      onChange={(e) => patch(row.operationId, { name: e.target.value })}
                      placeholder="Display, coffret, ETB…"
                    />
                  </label>
                  <label>
                    Prix de vente convenu (€)
                    <input
                      inputMode="decimal"
                      value={row.price}
                      onChange={(e) => patch(row.operationId, { price: e.target.value })}
                    />
                  </label>
                  <label>
                    Commission (%)
                    <input
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
                        (Math.round(number(row.price) * 100) * Math.round(number(row.rate) * 100)) /
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
                      <input
                        value={row.series}
                        onChange={(e) => patch(row.operationId, { series: e.target.value })}
                      />
                    </label>
                    <label>
                      Référence / numéro
                      <input
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
                      </select>
                    </label>
                    {row.productType === 'card' && (
                      <>
                        <label>
                          État
                          <select
                            value={row.condition}
                            onChange={(e) => patch(row.operationId, { condition: e.target.value })}
                          >
                            <option value="">Non précisé</option>
                            {['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'].map((x) => (
                              <option key={x}>{x}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Gradation
                          <select
                            value={row.gradingCompany}
                            onChange={(e) =>
                              patch(row.operationId, { gradingCompany: e.target.value })
                            }
                          >
                            <option value="">Aucune</option>
                            {['PSA', 'CollectAura', 'PCA', 'CCC'].map((x) => (
                              <option key={x}>{x}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Note
                          <input
                            value={row.gradingGrade}
                            onChange={(e) =>
                              patch(row.operationId, { gradingGrade: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Certificat
                          <input
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
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => patch(row.operationId, { photo: e.target.files?.[0] ?? null })}
                  />
                </label>
                {rows.length > 1 && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setRows((rows) => rows.filter((x) => x.operationId !== row.operationId))
                    }
                  >
                    Retirer cet article
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="secondary"
              onClick={() => setRows((rows) => [...rows, draft()])}
            >
              Ajouter un article
            </button>
            </div>
            <div hidden={creationStep!==2}><h3>Conditions convenues</h3><p>Renseignez les conditions réellement convenues : propriété, durée, versement, restitution et garde. Aucun régime TVA ni clause juridique n’est appliqué automatiquement.</p><label>Version des conditions<input value={contractVersion} onChange={e=>setContractVersion(e.target.value)}/></label><label>Conditions du contrat<textarea rows={8} maxLength={10000} value={contractTerms} onChange={e=>setContractTerms(e.target.value)}/></label><p>Commission déduite du prix effectivement vendu. Aucun frais supplémentaire ajouté par l’application. Une remise sous le prix convenu exige un nouvel accord.</p></div>
            <div hidden={creationStep!==3}><h3>Vérifier le contrat</h3><p>{clients.find(c=>c._id===sellerId)?.name} · {reference} · {date}</p><ul>{rows.map(r=><li key={r.operationId}>{r.name} · {r.price} € · commission {r.rate} %</li>)}</ul><p style={{whiteSpace:'pre-wrap'}}>Conditions version {contractVersion} : {contractTerms}</p><p>Aucun versement attesté. Le dépôt sera à signer avant la mise en vente.</p></div>
          </fieldset>
          <button type="button" disabled={busy} onClick={() => creationStep===3 ? void create() : setCreationStep(creationStep+1)}>
            {committed.current ? 'Terminer les pièces jointes' : creationStep===3 ? 'Préparer le contrat' : 'Continuer'}
          </button>
        </div>
      </section>
      <section className="panel" hidden={view !== 'payouts'}>
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
            <article key={b.sellerId}>
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
                <button
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
                  Marquer payé
                </button>
              )}
            </article>
          ))}
        <p>
          Un versement peut couvrir plusieurs articles du même déposant. Après annulation d’une
          vente déjà payée, le paiement reste historisé et le solde indique la régularisation.
        </p>
        {paymentSeller && (
          <form
            ref={paymentForm}
            onSubmit={(e) => {
              e.preventDefault();
              const cents = Math.round(number(paymentAmount) * 100);
              const balance = balances.balances.find((b) => b.sellerId === paymentSeller);
              if (
                !balance ||
                !Number.isSafeInteger(cents) ||
                cents <= 0 ||
                cents > balance.balanceCents ||
                !Number.isFinite(dateValue(paymentDate))
              )
                return setError('Le versement doit être positif et ne pas dépasser le solde dû.');
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
              Le montant est prérempli avec le solde dû. Vous pouvez le réduire pour enregistrer un
              paiement partiel. Cette action note un paiement déjà effectué ; elle n’envoie pas de
              virement.
            </p>
            <fieldset disabled={busy} className="consignment-fieldset">
              <ClientPicker request={request}
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
                  Montant versé (€)
                  <input
                    required
                    inputMode="decimal"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                  />
                </label>
                <label>
                  Date
                  <input
                    required
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                </label>
                <label>
                  Mode
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    <option>Virement</option>
                    <option>Espèces</option>
                    <option>Autre</option>
                  </select>
                </label>
                <label>
                  Référence du paiement
                  <input
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                  />
                </label>
              </div>
              <div className="actions">
                <button type="submit">Confirmer : paiement effectué</button>
                <button type="button" className="secondary" onClick={() => setPaymentSeller('')}>
                  Annuler
                </button>
              </div>
            </fieldset>
          </form>
        )}
        <details>
          <summary>Historique des versements ({balances.payments.length})</summary>
          {balances.payments.map((p) => (
            <p key={p._id}>
              {new Date(p.occurredAt).toLocaleDateString('fr-BE')} · {p.sellerName} ·{' '}
              {money(p.amountCents)} · {p.method} {p.reference}
            </p>
          ))}
        </details>
      </section>
      <section className="panel" hidden={view !== 'history'}>
        <h2>Historique des dépôts</h2>
        <label>
          Rechercher
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Déposant, référence, article"
          />
        </label>
        {deposits
          .filter((d) =>
            [d.sellerName, d.reference, ...d.items.map((i) => i.name)]
              .join(' ')
              .toLocaleLowerCase()
              .includes(search.toLocaleLowerCase()),
          )
          .map((d) => (
            <details className="consignment-history" key={d._id}>
              <summary>
                {d.reference} · {d.sellerName} ·{' '}
                {new Date(d.occurredAt).toLocaleDateString('fr-BE')} · {d.items.length} article(s)
              </summary>
              <p>{d.flowVersion===2 ? d.contractStatus==='signed'?'Contrat signé':'Contrat à signer — articles indisponibles à la vente':'Dossier historique'}{d.contractRevision ? ` · révision ${d.contractRevision}` : ''}</p>
              {d.notes && <p>{d.notes}</p>}
              {d.dueAt && <p>Échéance : {new Date(d.dueAt).toLocaleDateString('fr-BE')}</p>}
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void downloadReceipt(d)}
              >
                Télécharger le bon de dépôt non signé PDF
              </button>
              <ReceiptSigning kind="consignment" targetId={d._id} request={request} />
              <ConsignmentDocuments deposit={d} request={request} onChanged={()=>{void refresh();void onChanged();}}/>
              {d.items.map((item) => (
                <article key={item._id}>
                  <div>
                    <b>{item.name}</b>
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
                            {new Date(event.occurredAt).toLocaleDateString('fr-BE')} ·{' '}
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
                      <input
                        type="file"
                        disabled={busy}
                        accept="image/*,application/pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setBusy(true);
                          setError('');
                          void upload(item._id, file)
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
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          setTerms({
                            itemId: item._id,
                            name: item.name,
                            price: ((item.agreedPriceCents ?? item.askingPriceCents) / 100).toFixed(
                              2,
                            ),
                            rate: String(item.commissionRateBps / 100),
                            note: '',
                          })
                        }
                      >
                        Modifier l’accord
                      </button>

                    </div>
                  )}
                </article>
              ))}
            </details>
          ))}
        {!deposits.length && <p>Aucun dépôt enregistré.</p>}
      </section>
      {terms && (
        <section className="panel">
          <h2>Nouvel accord — {terms.name}</h2>
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
            <label>
              Prix convenu (€)
              <input
                value={terms.price}
                onChange={(e) => setTerms({ ...terms, price: e.target.value })}
              />
            </label>
            <label>
              Commission (%)
              <input
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
              <button disabled={busy} type="submit">
                Enregistrer l’accord
              </button>
              <button type="button" className="secondary" onClick={() => setTerms(null)}>
                Fermer
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
