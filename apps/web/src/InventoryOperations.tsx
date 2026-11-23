import './inventory-workspace.css';
import {
  FiArrowLeft,
  FiArrowRight,
  FiCheck,
  FiChevronRight,
  FiDownload,
  FiGift,
  FiPackage,
  FiRefreshCw,
  FiTruck,
} from 'react-icons/fi';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog';
import { collectCursorPages } from './lib/cursorPages';
import { shopDateInput, shopDateTimestamp } from './shopFormat';
import { currencySymbol, shopCurrency, shopTimezone } from './shopFormat';
import { InventoryRecovery, type EvidenceTarget } from './lib/inventoryRecovery';
import { AccountRecoveryVault, type AccountBoundRequest } from './lib/accountScope';
import type { SubmissionState } from './lib/submittedAttempt';
import { submissionSummary, formatSubmissionSummary } from './lib/submissionSummary';
import { useEffect, useRef, useState } from 'react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import type { Request } from './GradingCompanies';
import { API } from './realtime';
type Product = {
  name: string;
  tcg: 'pokemon' | 'riftbound' | 'other';
  productType: 'card' | 'sealed' | 'other';
  format?: 'display' | 'booster' | 'box' | 'other';
  packSize?: number;
  askingPriceCents: number;
  taxRateBps: number;
  series?: string;
  identifier?: string;
};
type Item = Product & { _id: string; origin?: string; quantity?: number };
type Line = {
  key: string;
  itemId?: string;
  product: Product;
  quantity: number;
  unitCostCents: number;
};
type Receipt = {
  _id: string;
  supplier: string;
  reference: string;
  occurredAt: number;
  totalCostCents: number | null;
  itemIds?: string[];
};
type Gift = {
  reversalAvailable?: boolean;
  _id: string;
  itemName?: string;
  note?: string;
  costCents?: number | null;
  purchaseReference?: string;
  lotSources?: { reference?: string; supplier?: string }[];
  quantity: number;
  recipient?: string;
  reason: string;
  occurredAt: number;
  cancelledAt?: number;
};
type Opening = {
  reversalAvailable?: boolean;
  itemName?: string;
  sourceId?: string;
  targetId?: string;
  allocations?: { lotId: string; quantity: number; costCents: number | null }[];
  occurredAt?: number;
  _id: string;
  quantity: number;
  packSize: number;
  cancelledAt?: number;
};
type Page<T> = { page: T[]; continueCursor: string; isDone: boolean };
const blankProduct = (): Product => ({
  name: '',
  tcg: 'pokemon',
  productType: 'sealed',
  format: 'box',
  askingPriceCents: 0,
  taxRateBps: 2100,
});
const blankLine = (): Line => ({
  key: crypto.randomUUID(),
  product: blankProduct(),
  quantity: 1,
  unitCostCents: 0,
});
const money = (cents: number | null | undefined) =>
  cents == null
    ? 'Non renseigné'
    : new Intl.NumberFormat('fr-BE', { style: 'currency', currency: shopCurrency }).format(
        cents / 100,
      );
const cents = (value: string) => Math.round(Number(value) * 100);
const inventoryRecovery = new AccountRecoveryVault<InventoryRecovery<File>>(
  (value) => value.state !== 'idle',
);
export function InventoryOperations({
  request,
  upload,
  onChanged,
}: {
  request: Request;
  upload: (
    target: { supplierReceiptId?: string; giftId?: string },
    file: File,
    operationId: string,
  ) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const owner = (request as Partial<AccountBoundRequest>).accountId;
  const recovery = useRef(
    owner
      ? inventoryRecovery.forAccount(owner, () => new InventoryRecovery<File>(owner))
      : new InventoryRecovery<File>(),
  ).current;
  const assertAccount = () => (request as Partial<AccountBoundRequest>).assertActive?.();
  const initialKind = recovery.context?.kind;
  const [tab, setTab] = useState<'receive' | 'gift' | 'open' | 'history'>(
      initialKind === 'reverse' ? 'history' : (initialKind ?? 'receive'),
    ),
    [items, setItems] = useState<Item[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [supplier, setSupplier] = useState(''),
    [reference, setReference] = useState(''),
    [date, setDate] = useState(shopDateInput),
    [lines, setLines] = useState<Line[]>([blankLine()]);
  const [itemId, setItemId] = useState(''),
    [quantity, setQuantity] = useState(1),
    [recipient, setRecipient] = useState(''),
    [reason, setReason] = useState(''),
    [note, setNote] = useState(''),
    [packs, setPacks] = useState(36),
    [boosterName, setBoosterName] = useState(''),
    [boosterPrice, setBoosterPrice] = useState(0),
    [targetBoosterId, setTargetBoosterId] = useState('');
  const [receipts, setReceipts] = useState<Receipt[]>([]),
    [gifts, setGifts] = useState<Gift[]>([]),
    [receiptCursor, setReceiptCursor] = useState<string | null>(null),
    [giftCursor, setGiftCursor] = useState<string | null>(null),
    [receiptDone, setReceiptDone] = useState(false),
    [giftDone, setGiftDone] = useState(false),
    [openings, setOpenings] = useState<Opening[]>([]);
  const [receiptEvidence, setReceiptEvidence] = useState<File | null>(
      initialKind === 'receive' ? (recovery.context?.file ?? null) : null,
    ),
    [giftEvidence, setGiftEvidence] = useState<File | null>(
      initialKind === 'gift' ? (recovery.context?.file ?? null) : null,
    );
  const evidence = recovery.context
    ? recovery.context.file
    : tab === 'receive'
      ? receiptEvidence
      : giftEvidence;
  const setEvidence = tab === 'receive' ? setReceiptEvidence : setGiftEvidence;
  const [savedTarget, setSavedTarget] = useState<EvidenceTarget | null>(
    recovery.context?.target ?? null,
  );
  const lock = useRef(false);
  const [committed, setCommitted] = useState(recovery.state === 'confirmed');
  const [submissionState, setSubmissionState] = useState<SubmissionState>(recovery.state);
  const [products, setProducts] = useState<Item[]>([]),
    [productCursor, setProductCursor] = useState<string | null>(null),
    [productDone, setProductDone] = useState(false);
  const [allOpenings, setAllOpenings] = useState<Opening[]>([]),
    [openingCursor, setOpeningCursor] = useState<string | null>(null),
    [openingDone, setOpeningDone] = useState(false);
  type Preview = {
    quantity: number;
    packSize: number;
    boosterQuantity: number;
    totalCostCents: number | null;
    costParts: { quantity: number; unitCostCents: number }[];
  };
  const [preview, setPreview] = useState<Preview | null>(null),
    [previewError, setPreviewError] = useState(''),
    [previewBusy, setPreviewBusy] = useState(false);
  const selected = items.find((i) => i._id === itemId);
  const [step, setStep] = useState(0),
    [historyKind, setHistoryKind] = useState<'receive' | 'gift' | 'open'>('receive'),
    [historySearch, setHistorySearch] = useState('');
  const [detail, setDetail] = useState<
    | { kind: 'receive'; record: Receipt }
    | { kind: 'gift'; record: Gift }
    | { kind: 'open'; record: Opening }
    | null
  >(null);
  const [detailBusy, setDetailBusy] = useState(false),
    [detailError, setDetailError] = useState(''),
    [confirmReverse, setConfirmReverse] = useState(false);
  const [receiptLots, setReceiptLots] = useState<
    { name: string; received: number; remaining: number; totalCostCents: number | null }[]
  >([]);
  const detailGeneration = useRef(0),
    wizardTop = useRef<HTMLDivElement>(null);
  const finalStep = tab === 'receive' ? 2 : 1;
  const receiptTotal = lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0);
  const formatDate = (value?: number) =>
    value
      ? new Date(value).toLocaleDateString('fr-BE', { timeZone: shopTimezone })
      : 'Date non renseignée';
  function stepError() {
    try {
      shopDateTimestamp(date);
    } catch {
      return 'Choisissez une date valide.';
    }
    if (tab === 'receive') {
      if (!supplier.trim() || !reference.trim())
        return 'Renseignez le fournisseur et la référence de facture.';
      if (
        step > 0 &&
        (lines.length === 0 ||
          lines.some(
            (line) =>
              !line.product.name.trim() ||
              !Number.isInteger(line.quantity) ||
              line.quantity < 1 ||
              line.quantity > 100000 ||
              !Number.isSafeInteger(line.unitCostCents) ||
              line.unitCostCents < 0 ||
              !Number.isSafeInteger(line.product.askingPriceCents) ||
              line.product.askingPriceCents < 0 ||
              !Number.isSafeInteger(line.product.taxRateBps) ||
              line.product.taxRateBps < 0 ||
              line.product.taxRateBps > 10000,
          ) ||
          !Number.isSafeInteger(receiptTotal))
      )
        return 'Chaque ligne nécessite un produit, une quantité entière positive et des montants valides.';
    } else {
      if (
        !selected ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > (selected.quantity ?? 1)
      )
        return 'Choisissez un article et une quantité disponible entière.';
      if (tab === 'gift' && !reason.trim()) return 'Précisez le motif du don.';
      if (
        tab === 'open' &&
        (!Number.isInteger(packs) ||
          packs < 1 ||
          packs > 1000 ||
          (!targetBoosterId &&
            (!boosterName.trim() || !Number.isSafeInteger(boosterPrice) || boosterPrice < 0)))
      )
        return 'Vérifiez le nombre de boosters, leur destination et leur prix.';
      if (tab === 'open' && (!preview || previewBusy || previewError))
        return 'Attendez le calcul exact des coûts avant de continuer.';
    }
    return '';
  }
  function advance() {
    const issue = stepError();
    if (issue) {
      setError(issue);
      window.scrollTo({ top: 0 });
      return;
    }
    setError('');
    setStep((value) => Math.min(finalStep, value + 1));
    requestAnimationFrame(() => wizardTop.current?.scrollIntoView({ block: 'start' }));
  }
  async function openDetail(value: NonNullable<typeof detail>) {
    setDetail(value);
    setConfirmReverse(false);
    setDetailError('');
    setEvidenceLinks([]);
    setReceiptLots([]);
    setDetailBusy(true);
    const generation = ++detailGeneration.current;
    try {
      if (value.kind === 'receive') {
        const [files, details] = await Promise.all([
          request<{ _id: string; filename: string }[]>(
            `/inventory/evidence?receiptId=${encodeURIComponent(value.record._id)}`,
          ),
          Promise.all(
            (value.record.itemIds ?? []).map((id) =>
              request<{
                item: Item;
                lots: {
                  receiptId?: string;
                  received: number;
                  remaining: number;
                  totalCostCents: number | null;
                }[];
              }>(`/stock/${encodeURIComponent(id)}/lots`),
            ),
          ),
        ]);
        if (generation !== detailGeneration.current) return;
        setEvidenceLinks(files);
        setReceiptLots(
          details.flatMap((data) =>
            data.lots
              .filter((lot) => lot.receiptId === value.record._id)
              .map((lot) => ({ ...lot, name: data.item.name })),
          ),
        );
      } else if (value.kind === 'gift') {
        const files = await request<{ _id: string; filename: string }[]>(
          `/inventory/evidence?giftId=${encodeURIComponent(value.record._id)}`,
        );
        if (generation === detailGeneration.current) setEvidenceLinks(files);
      }
    } catch (e) {
      if (generation === detailGeneration.current)
        setDetailError(e instanceof Error ? e.message : 'Détail indisponible.');
    } finally {
      if (generation === detailGeneration.current) setDetailBusy(false);
    }
  }
  async function reverseDetail() {
    if (!detail || detail.kind === 'receive') return;
    recovery.prepare(
      'reverse',
      '/stock/reverse',
      detail.kind === 'gift' ? { giftId: detail.record._id } : { openingId: detail.record._id },
      null,
    );
    setSubmissionState(recovery.state);
    await finishPending();
  }

  async function loadProducts(append = false) {
    const page = await request<Page<Item>>(
      `/inventory/products${append && productCursor ? `?cursor=${encodeURIComponent(productCursor)}` : ''}`,
    );
    setProducts((old) =>
      append ? [...new Map([...old, ...page.page].map((i) => [i._id, i])).values()] : page.page,
    );
    setProductCursor(page.continueCursor);
    setProductDone(page.isDone);
  }
  async function loadOpenings(append = false) {
    const page = await request<Page<Opening>>(
      `/stock-openings${append && openingCursor ? `?cursor=${encodeURIComponent(openingCursor)}` : ''}`,
    );
    setAllOpenings((old) =>
      append ? [...new Map([...old, ...page.page].map((i) => [i._id, i])).values()] : page.page,
    );
    setOpeningCursor(page.continueCursor);
    setOpeningDone(page.isDone);
  }
  useEffect(() => {
    void loadProducts().catch((e) => setError(e.message));
  }, [request]);
  useEffect(() => {
    setPreview(null);
    setPreviewError('');
    if (tab !== 'open' || !itemId) return;
    let active = true;
    setPreviewBusy(true);
    const timer = setTimeout(() => {
      let occurredAt: number;
      try {
        occurredAt = shopDateTimestamp(date);
      } catch (e) {
        setPreviewError('Date invalide.');
        setPreviewBusy(false);
        return;
      }
      void request<Preview>(
        `/stock/${encodeURIComponent(itemId)}/open-preview?quantity=${quantity}&packSize=${packs}&occurredAt=${occurredAt}`,
      )
        .then((value) => {
          if (active) setPreview(value);
        })
        .catch((e) => {
          if (active) setPreviewError(e.message);
        })
        .finally(() => {
          if (active) setPreviewBusy(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [itemId, quantity, packs, date, tab, request]);
  async function loadStock() {
    setItems(await request<Item[]>('/stock'));
  }
  useEffect(() => {
    void loadStock().catch((e) => setError(e.message));
  }, [request]);
  useEffect(() => {
    setOpenings([]);
    if (!itemId) return;
    let active = true;
    void request<{ openings: Opening[] }>(`/stock/${encodeURIComponent(itemId)}/lots`)
      .then((v) => {
        if (active) setOpenings(v.openings);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [itemId, request, message]);
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opération impossible.');
    } finally {
      setSubmissionState(recovery.state);
      setCommitted(recovery.state === 'confirmed');
      setBusy(false);
      lock.current = false;
    }
  }
  async function saveEvidence(_target?: EvidenceTarget) {
    await recovery.saveEvidence(upload, assertAccount);
    setReceiptEvidence(null);
    setGiftEvidence(null);
    setSavedTarget(null);
    setMessage('Opération et justificatif enregistrés.');
  }
  async function finishPending() {
    await recovery.execute(request);
    assertAccount();
    setSubmissionState('confirmed');
    setCommitted(true);
    const context = recovery.context!;
    setSavedTarget(context.file ? context.target : null);
    const messages = {
      receive: 'Réception enregistrée. Les nouveaux produits sont masqués au catalogue.',
      gift: 'Don enregistré.',
      open: 'Display ouvert. Le coût FIFO exact a été transféré aux boosters.',
      reverse: 'Annulation enregistrée ; allocations restaurées.',
    };
    setMessage(messages[context.kind]);
    if (context.file) await saveEvidence();
    if (context.kind === 'reverse') {
      setDetail(null);
      setConfirmReverse(false);
      setTab('history');
      await history();
    }
    await loadStock();
    await onChanged();
    assertAccount();
  }
  async function submit() {
    if (recovery.state !== 'idle')
      throw new Error('Reprenez l’opération en attente avant d’en commencer une autre.');
    const issue = stepError();
    if (issue) throw new Error(issue);
    const occurredAt = shopDateTimestamp(date);
    if (!Number.isFinite(occurredAt)) throw new Error('Date invalide.');
    if (tab === 'receive')
      recovery.prepare(
        'receive',
        '/supplier-receipts',
        { supplier, reference, occurredAt, lines: lines.map(({ key, ...line }) => line) },
        receiptEvidence,
      );
    else if (tab === 'gift')
      recovery.prepare(
        'gift',
        '/stock/donate',
        { itemId, quantity, occurredAt, recipient, reason, note },
        giftEvidence,
      );
    else if (tab === 'open') {
      if (!selected || !preview || previewBusy)
        throw new Error('Vérifiez l’aperçu des coûts avant de confirmer.');
      recovery.prepare(
        'open',
        '/stock/open',
        {
          itemId,
          quantity,
          packSize: packs,
          occurredAt,
          ...(targetBoosterId
            ? { targetId: targetBoosterId }
            : {
                product: {
                  name: boosterName,
                  tcg: selected.tcg ?? 'pokemon',
                  productType: 'sealed',
                  format: 'booster',
                  askingPriceCents: boosterPrice,
                  taxRateBps: selected.taxRateBps,
                },
              }),
        },
        null,
      );
    } else return;
    setSubmissionState(recovery.state);
    await finishPending();
  }
  async function history(append = false) {
    const [r, g] = await Promise.all([
      request<Page<Receipt>>(
        `/supplier-receipts${append && receiptCursor ? `?cursor=${encodeURIComponent(receiptCursor)}` : ''}`,
      ),
      request<Page<Gift>>(
        `/gifts?from=0&to=${Date.now()}${append && giftCursor ? `&cursor=${encodeURIComponent(giftCursor)}` : ''}`,
      ),
    ]);
    setReceipts((old) =>
      append ? [...new Map([...old, ...r.page].map((x) => [x._id, x])).values()] : r.page,
    );
    setGifts((old) =>
      append ? [...new Map([...old, ...g.page].map((x) => [x._id, x])).values()] : g.page,
    );
    setReceiptCursor(r.continueCursor);
    setGiftCursor(g.continueCursor);
    setReceiptDone(r.isDone);
    setGiftDone(g.isDone);
    await loadOpenings(append);
  }
  const [evidenceLinks, setEvidenceLinks] = useState<{ _id: string; filename: string }[]>([]);
  function patchLine(key: string, patch: Partial<Line>) {
    setLines((rows) => rows.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  async function exportGifts() {
    const to = Date.now();
    const allGifts = await collectCursorPages<Gift>((cursor) =>
      request<Page<Gift>>(
        `/gifts?from=0&to=${to}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      ),
    );
    const csv = [
      `Date;Article;Quantité;Destinataire;Motif;Note;Coût connu ${shopCurrency};Référence achat;Fournisseur;Statut`,
      ...allGifts.map((g) =>
        [
          new Date(g.occurredAt).toISOString(),
          g.itemName ?? '',
          g.quantity,
          g.recipient ?? '',
          g.reason,
          g.note ?? '',
          g.costCents == null ? 'Non renseigné' : (g.costCents / 100).toFixed(2),
          g.purchaseReference || (g.lotSources ?? []).map((l) => l.reference ?? '').join(' / '),
          (g.lotSources ?? []).map((l) => l.supplier ?? '').join(' / '),
          g.cancelledAt ? 'Annulé' : 'Actif',
        ]
          .map(
            (v) =>
              '"' +
              String(v)
                .replace(/^[\s]*[=+@-]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(';'),
      ),
      `;TOTAL COÛTS CONNUS DES DONS ACTIFS;;;;;${(allGifts.filter((g) => !g.cancelledAt).reduce((sum, g) => sum + (g.costCents ?? 0), 0) / 100).toFixed(2)};;;`,
      `;DONS ACTIFS AU COÛT INCONNU;${allGifts.filter((g) => !g.cancelledAt && g.costCents == null).length};;;;;;;`,
    ].join('\r\n');
    assertAccount();
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `dons-complets-${shopDateInput()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function recoveryPanel() {
    if (submissionState !== 'unknown' && submissionState !== 'rejected') return null;
    return (
      <section role="status" className="iw-alert">
        <p>
          <strong>
            {formatSubmissionSummary(
              submissionSummary(recovery.attempt.current),
              shopCurrency,
              shopTimezone,
            )}
          </strong>
        </p>
        <p>
          {submissionState === 'rejected'
            ? 'Le serveur a refusé cette opération. Vous pouvez revoir les champs.'
            : 'Résultat incertain : la demande, son identifiant et son justificatif sont conservés pour ce compte.'}
        </p>
        <Button disabled={busy} type="button" onClick={() => void run(finishPending)}>
          Reprendre la même opération
        </Button>
        {submissionState === 'rejected' && (
          <Button
            disabled={busy}
            type="button"
            variant="outline"
            onClick={() => {
              recovery.release();
              setSubmissionState('idle');
            }}
          >
            Revoir l’opération refusée
          </Button>
        )}
      </section>
    );
  }
  return (
    <section className="inventory-operations inventory-workspace">
      {recoveryPanel()}
      <nav className="iw-tabs" aria-label="Opérations de stock">
        {(
          [
            ['receive', 'Réception fournisseur', FiTruck],
            ['gift', 'Don', FiGift],
            ['open', 'Ouvrir un display', FiPackage],
            ['history', 'Historique', FiRefreshCw],
          ] as const
        ).map(([value, label, Icon]) => (
          <Button
            type="button"
            variant="ghost"
            key={value}
            aria-current={tab === value ? 'page' : undefined}
            disabled={
              busy ||
              submissionState === 'unknown' ||
              submissionState === 'rejected' ||
              Boolean(savedTarget && evidence)
            }
            onClick={() => {
              setTab(value);
              setStep(0);
              setError('');
              if (value === 'history') void run(() => history());
            }}
          >
            <Icon aria-hidden="true" />
            {label}
          </Button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="iw-alert iw-alert-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="iw-alert">
          {message}
        </p>
      )}
      {committed && (
        <div className="iw-success">
          <FiCheck aria-hidden="true" />
          <div>
            <h3>Opération confirmée</h3>
            <p>
              {formatSubmissionSummary(
                submissionSummary(recovery.attempt.current),
                shopCurrency,
                shopTimezone,
              )}
            </p>
            <p>
              Le mouvement est enregistré. Consultez son historique ou commencez une nouvelle
              opération.
            </p>
          </div>
          <Button
            disabled={
              busy ||
              submissionState === 'unknown' ||
              submissionState === 'rejected' ||
              Boolean(savedTarget && evidence)
            }
            variant="secondary"
            onClick={() => {
              recovery.release();
              setSubmissionState('idle');
              setLines([blankLine()]);
              setReference('');
              setReceiptEvidence(null);
              setGiftEvidence(null);
              setCommitted(false);
              setSavedTarget(null);
              setItemId('');
              setReason('');
              setRecipient('');
              setNote('');
              setQuantity(1);
              setStep(0);
              setMessage('');
            }}
          >
            Nouvelle opération
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await loadStock();
                await loadProducts();
                await onChanged();
                setMessage('Stock actualisé.');
              })
            }
          >
            Actualiser le stock
          </Button>
        </div>
      )}
      {savedTarget && evidence ? (
        <div className="iw-alert" role="alert">
          <p>
            Le mouvement est enregistré. Le justificatif reste à envoyer ; ne recréez pas
            l’opération.
          </p>
          <Button disabled={busy} onClick={() => void run(() => saveEvidence(savedTarget))}>
            Réessayer l’envoi du justificatif
          </Button>
        </div>
      ) : tab !== 'history' && !committed ? (
        <div className="iw-wizard">
          <div className="iw-wizard-top" ref={wizardTop}>
            <Button
              type="button"
              variant="ghost"
              disabled={step === 0 || busy || submissionState !== 'idle'}
              onClick={() => {
                setStep((value) => Math.max(0, value - 1));
                setError('');
                requestAnimationFrame(() => wizardTop.current?.scrollIntoView({ block: 'start' }));
              }}
            >
              <FiArrowLeft aria-hidden="true" />
              Retour
            </Button>
            <span>
              Étape {step + 1} sur {finalStep + 1}
            </span>
          </div>
          <ol className="iw-steps" aria-label="Étapes du mouvement">
            {(tab === 'receive'
              ? ['Fournisseur et facture', 'Articles reçus', 'Vérification']
              : ['Détails du mouvement', 'Vérification']
            ).map((label, index) => (
              <li key={label} aria-current={step === index ? 'step' : undefined}>
                <span>{index < step ? <FiCheck aria-hidden="true" /> : index + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          <div className="iw-step-heading">
            <h3>
              {step === finalStep
                ? 'Vérifiez le mouvement'
                : tab === 'receive'
                  ? step === 0
                    ? 'Identifiez la réception'
                    : 'Détaillez les articles reçus'
                  : tab === 'gift'
                    ? 'Enregistrez un don'
                    : 'Transformez un display en boosters'}
            </h3>
            <p>
              {step === finalStep
                ? 'Vérifiez les quantités et les montants avant de modifier le stock.'
                : tab === 'receive'
                  ? 'La facture et chaque lot restent associés aux produits pour leur traçabilité.'
                  : tab === 'gift'
                    ? 'Le don retire les articles du stock en conservant leur coût et leur provenance.'
                    : 'Les coûts des lots sont répartis exactement entre les boosters créés.'}
            </p>
          </div>
          <form
            className="iw-form-body"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (step < finalStep) advance();
              else void run(submit);
            }}
          >
            <fieldset disabled={busy || submissionState !== 'idle'}>
              <div className="iw-step-body" hidden={step !== 0}>
                <label>
                  Date du mouvement
                  <Input
                    required
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>
                {tab === 'receive' ? (
                  <>
                    <div className="form-grid">
                      <label>
                        Fournisseur
                        <Input
                          required
                          value={supplier}
                          maxLength={200}
                          onChange={(event) => setSupplier(event.target.value)}
                        />
                      </label>
                      <label>
                        Référence facture
                        <Input
                          required
                          value={reference}
                          maxLength={200}
                          onChange={(event) => setReference(event.target.value)}
                        />
                      </label>
                    </div>
                    <label>
                      Facture fournisseur · facultative
                      <Input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        onChange={(event) => {
                          setEvidence(event.target.files?.[0] ?? null);
                        }}
                      />
                    </label>
                    {evidence && <p>{evidence.name}</p>}
                  </>
                ) : (
                  <>
                    {' '}
                    <label>
                      Article
                      <select
                        required
                        value={itemId}
                        onChange={(e) => {
                          setItemId(e.target.value);
                          setTargetBoosterId('');
                          setQuantity(1);
                          const item = items.find((i) => i._id === e.target.value);
                          setPacks(item?.packSize ?? 36);
                          setBoosterName(item ? `${item.name} — booster` : '');
                        }}
                      >
                        <option value="">Choisir un article</option>
                        {items
                          .filter((i) =>
                            tab === 'gift'
                              ? i.origin !== 'consignment'
                              : i.origin === 'supplier' && i.format === 'display',
                          )
                          .map((i) => (
                            <option value={i._id} key={i._id}>
                              {i.name} · {i.quantity ?? 1} disponible(s)
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Quantité
                      <Input
                        required
                        type="number"
                        min="1"
                        max={selected?.quantity ?? 1}
                        value={quantity}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                      />
                    </label>
                    {tab === 'gift' ? (
                      <>
                        <label>
                          Destinataire
                          <Input
                            value={recipient}
                            maxLength={300}
                            onChange={(e) => setRecipient(e.target.value)}
                          />
                        </label>
                        <label>
                          Motif
                          <Input
                            required
                            value={reason}
                            maxLength={1000}
                            onChange={(e) => setReason(e.target.value)}
                          />
                        </label>
                        <label>
                          Notes
                          <textarea
                            value={note}
                            maxLength={3000}
                            onChange={(e) => setNote(e.target.value)}
                          />
                        </label>
                      </>
                    ) : (
                      <>
                        <label>
                          Boosters par display
                          <Input
                            required
                            type="number"
                            min="1"
                            max="1000"
                            value={packs}
                            onChange={(e) => setPacks(Number(e.target.value))}
                          />
                        </label>
                        <label>
                          Destination des boosters
                          <select
                            value={targetBoosterId}
                            onChange={(e) => setTargetBoosterId(e.target.value)}
                          >
                            <option value="">Créer un nouveau produit booster</option>
                            {products
                              .filter(
                                (p) =>
                                  p.format === 'booster' &&
                                  (p.tcg ?? 'pokemon') === (selected?.tcg ?? 'pokemon') &&
                                  p.taxRateBps === selected?.taxRateBps,
                              )
                              .map((p) => (
                                <option key={p._id} value={p._id}>
                                  {p.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        {!productDone && (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void run(() => loadProducts(true))}
                          >
                            Charger davantage de boosters existants
                          </Button>
                        )}
                        {!targetBoosterId && (
                          <>
                            <label>
                              Nom du booster créé
                              <Input
                                required
                                value={boosterName}
                                onChange={(e) => setBoosterName(e.target.value)}
                              />
                            </label>
                            <label>
                              Prix de vente par booster ({currencySymbol})
                              <Input
                                required
                                type="number"
                                min="0"
                                step="0.01"
                                value={boosterPrice / 100}
                                onChange={(e) => setBoosterPrice(cents(e.target.value))}
                              />
                            </label>
                          </>
                        )}
                        <p>
                          {quantity} display(s) retiré(s), {quantity * packs} boosters créés. Le
                          coût FIFO est conservé au centime près.
                        </p>
                      </>
                    )}
                    {tab === 'gift' && (
                      <label>
                        Justificatif du don · facultatif
                        <Input
                          type="file"
                          accept="application/pdf,image/jpeg,image/png,image/webp"
                          onChange={(event) => {
                            setEvidence(event.target.files?.[0] ?? null);
                          }}
                        />
                      </label>
                    )}
                  </>
                )}
              </div>
              {tab === 'receive' && (
                <div hidden={step !== 1}>
                  {!productDone && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void run(() => loadProducts(true))}
                    >
                      Charger davantage de produits existants, y compris épuisés
                    </Button>
                  )}{' '}
                  {lines.map((line) => (
                    <div key={line.key} className="supplier-line">
                      <div className="iw-line-title">
                        <strong>{line.product.name || `Article ${lines.indexOf(line) + 1}`}</strong>
                        <span>
                          {line.quantity} × {money(line.unitCostCents)}
                        </span>
                      </div>
                      <div className="iw-line-body">
                        <label>
                          Produit
                          <select
                            value={line.itemId ?? ''}
                            onChange={(e) => {
                              const item = products.find((i) => i._id === e.target.value);
                              patchLine(line.key, {
                                itemId: item?._id,
                                product: item
                                  ? {
                                      name: item.name,
                                      tcg: item.tcg ?? 'pokemon',
                                      productType: item.productType,
                                      format: item.format,
                                      askingPriceCents: item.askingPriceCents,
                                      taxRateBps: item.taxRateBps,
                                      packSize: item.packSize,
                                    }
                                  : blankProduct(),
                              });
                            }}
                          >
                            <option value="">Créer un produit</option>
                            {products
                              .filter((i) => i.origin === 'supplier')
                              .map((i) => (
                                <option value={i._id} key={i._id}>
                                  {i.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        {!line.itemId && (
                          <div className="form-grid">
                            <label>
                              Nom
                              <Input
                                required
                                maxLength={300}
                                value={line.product.name}
                                onChange={(e) =>
                                  patchLine(line.key, {
                                    product: { ...line.product, name: e.target.value },
                                  })
                                }
                              />
                            </label>
                            <label>
                              Jeu
                              <select
                                value={line.product.tcg}
                                onChange={(e) =>
                                  patchLine(line.key, {
                                    product: {
                                      ...line.product,
                                      tcg: e.target.value as Product['tcg'],
                                    },
                                  })
                                }
                              >
                                <option value="pokemon">Pokémon</option>
                                <option value="riftbound">Riftbound</option>
                                <option value="other">Autre</option>
                              </select>
                            </label>
                            <label>
                              Type
                              <select
                                value={line.product.productType}
                                onChange={(e) =>
                                  patchLine(line.key, {
                                    product: {
                                      ...line.product,
                                      productType: e.target.value as Product['productType'],
                                      format: e.target.value === 'sealed' ? 'box' : undefined,
                                    },
                                  })
                                }
                              >
                                <option value="sealed">Scellé</option>
                                <option value="card">Carte</option>
                                <option value="other">Autre</option>
                              </select>
                            </label>
                            {line.product.productType === 'sealed' && (
                              <label>
                                Format
                                <select
                                  value={line.product.format}
                                  onChange={(e) =>
                                    patchLine(line.key, {
                                      product: {
                                        ...line.product,
                                        format: e.target.value as Product['format'],
                                      },
                                    })
                                  }
                                >
                                  <option value="display">Display</option>
                                  <option value="booster">Booster</option>
                                  <option value="box">Coffret</option>
                                  <option value="other">Autre</option>
                                </select>
                              </label>
                            )}
                            <label>
                              Prix de vente unitaire ({currencySymbol})
                              <Input
                                required
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.product.askingPriceCents / 100}
                                onChange={(e) =>
                                  patchLine(line.key, {
                                    product: {
                                      ...line.product,
                                      askingPriceCents: cents(e.target.value),
                                    },
                                  })
                                }
                              />
                            </label>
                            <label>
                              TVA sur vente (%)
                              <Input
                                required
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={line.product.taxRateBps / 100}
                                onChange={(e) =>
                                  patchLine(line.key, {
                                    product: { ...line.product, taxRateBps: cents(e.target.value) },
                                  })
                                }
                              />
                            </label>
                          </div>
                        )}
                        <div className="form-grid">
                          <label>
                            Quantité
                            <Input
                              required
                              type="number"
                              min="1"
                              max="100000"
                              value={line.quantity}
                              onChange={(e) =>
                                patchLine(line.key, { quantity: Number(e.target.value) })
                              }
                            />
                          </label>
                          <label>
                            Coût unitaire HT ({currencySymbol})
                            <Input
                              required
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.unitCostCents / 100}
                              onChange={(e) =>
                                patchLine(line.key, { unitCostCents: cents(e.target.value) })
                              }
                            />
                          </label>
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={lines.length === 1}
                          onClick={() => setLines((rows) => rows.filter((l) => l.key !== line.key))}
                        >
                          Retirer cette ligne
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={lines.length >= 50}
                    onClick={() => setLines((rows) => [...rows, blankLine()])}
                  >
                    Ajouter une ligne
                  </Button>
                  <p>
                    Total HT :{' '}
                    <strong>
                      {money(lines.reduce((s, l) => s + l.quantity * l.unitCostCents, 0))}
                    </strong>
                  </p>
                </div>
              )}
              <div hidden={step !== finalStep} className="iw-review">
                {tab === 'receive' ? (
                  <>
                    <div className="iw-review-header">
                      <h4>{supplier}</h4>
                      <p>
                        {reference} · {date} · {lines.reduce((sum, line) => sum + line.quantity, 0)}{' '}
                        unités
                      </p>
                    </div>
                    {lines.map((line) => (
                      <article className="iw-review-row" key={line.key}>
                        <div>
                          <strong>{line.product.name}</strong>
                          <small>
                            {line.itemId
                              ? 'Réapprovisionnement d’un produit existant'
                              : 'Nouveau produit · masqué au catalogue'}
                          </small>
                          <small>
                            {line.product.tcg} · {line.product.productType} · TVA{' '}
                            {line.product.taxRateBps / 100} %
                          </small>
                        </div>
                        <div>
                          <strong>{money(line.quantity * line.unitCostCents)} HT</strong>
                          <small>
                            {line.quantity} × {money(line.unitCostCents)} HT
                          </small>
                          <small>
                            Prix de vente unitaire : {money(line.product.askingPriceCents)}
                          </small>
                        </div>
                      </article>
                    ))}
                    <p className="iw-total">
                      Total réception HT<strong>{money(receiptTotal)}</strong>
                    </p>
                    <p className="iw-review-note">
                      {evidence ? `Facture jointe : ${evidence.name}` : 'Aucune facture jointe.'} La
                      validation crée les lots et actualise les quantités.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="iw-review-header">
                      <h4>{selected?.name}</h4>
                      <p>
                        {date} · {quantity} {tab === 'open' ? 'display(s)' : 'unité(s)'} retiré(s)
                        du stock
                      </p>
                    </div>
                    {tab === 'gift' ? (
                      <>
                        <dl className="iw-detail-meta">
                          <div>
                            <dt>Destinataire</dt>
                            <dd>{recipient || 'Non renseigné'}</dd>
                          </div>
                          <div>
                            <dt>Motif</dt>
                            <dd>{reason}</dd>
                          </div>
                        </dl>
                        {note && <p className="iw-review-note">{note}</p>}
                        <p className="iw-review-note">
                          {evidence
                            ? `Justificatif : ${evidence.name}`
                            : 'Aucun justificatif joint.'}{' '}
                          Les allocations de stock et les coûts seront conservés dans l’historique
                          du don.
                        </p>
                      </>
                    ) : (
                      <>
                        <article className="iw-review-row">
                          <div>
                            <strong>
                              {targetBoosterId
                                ? products.find((product) => product._id === targetBoosterId)?.name
                                : boosterName}
                            </strong>
                            <small>
                              {targetBoosterId
                                ? 'Produit booster existant'
                                : 'Nouveau produit booster'}
                            </small>
                          </div>
                          <div>
                            <strong>{quantity * packs} boosters</strong>
                            <small>{packs} boosters par display</small>
                            {!targetBoosterId && (
                              <small>Prix de vente : {money(boosterPrice)}</small>
                            )}
                          </div>
                        </article>
                      </>
                    )}
                  </>
                )}
              </div>
              {tab === 'open' && (
                <div className="iw-preview" aria-live="polite">
                  {previewBusy ? (
                    <p>Calcul des coûts FIFO…</p>
                  ) : previewError ? (
                    <p role="alert">{previewError}</p>
                  ) : preview ? (
                    <>
                      <h3>Transfert de coût</h3>
                      <p>
                        {preview.quantity} display(s) → {preview.boosterQuantity} boosters. Coût
                        total transféré : <strong>{money(preview.totalCostCents)}</strong>.
                      </p>
                      <ul>
                        {preview.costParts
                          .filter((part) => part.quantity > 0)
                          .map((part, index) => (
                            <li key={index}>
                              {part.quantity} booster(s) à {money(part.unitCostCents)} de coût
                              unitaire.
                            </li>
                          ))}
                      </ul>
                      <p>
                        Les disponibilités et coûts seront à nouveau vérifiés lors de la
                        confirmation.
                      </p>
                    </>
                  ) : null}
                </div>
              )}

              <div className="iw-footer">
                <span>
                  {tab === 'receive'
                    ? `${lines.length} ligne(s) · ${money(receiptTotal)} HT`
                    : tab === 'gift'
                      ? `${quantity} unité(s)`
                      : `${quantity} display(s) → ${quantity * packs} boosters`}
                </span>
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    submissionState !== 'idle' ||
                    (tab === 'open' && (!preview || previewBusy))
                  }
                >
                  {busy
                    ? 'Enregistrement…'
                    : step < finalStep
                      ? 'Continuer'
                      : tab === 'receive'
                        ? 'Confirmer la réception'
                        : tab === 'gift'
                          ? 'Confirmer le don'
                          : 'Confirmer l’ouverture'}
                  <FiArrowRight aria-hidden="true" />
                </Button>
              </div>
            </fieldset>
          </form>
        </div>
      ) : null}
      {tab === 'history' && (
        <div className="iw-history">
          <div className="iw-history-toolbar">
            <select
              aria-label="Type de mouvements"
              value={historyKind}
              onChange={(event) => {
                setHistoryKind(event.target.value as typeof historyKind);
                setHistorySearch('');
              }}
            >
              <option value="receive">Réceptions fournisseur</option>
              <option value="gift">Dons</option>
              <option value="open">Ouvertures de displays</option>
            </select>
            <Input
              type="search"
              aria-label="Rechercher dans les mouvements chargés"
              placeholder="Rechercher dans les mouvements chargés…"
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
            />
            <Button variant="secondary" disabled={busy} onClick={() => void run(() => history())}>
              <FiRefreshCw aria-hidden="true" />
              Actualiser
            </Button>
            {historyKind === 'gift' && (
              <Button variant="secondary" disabled={busy} onClick={() => void run(exportGifts)}>
                <FiDownload aria-hidden="true" />
                Exporter tous les dons
              </Button>
            )}
          </div>
          <p className="iw-history-caption">
            {historyKind === 'receive'
              ? receipts.length
              : historyKind === 'gift'
                ? gifts.length
                : allOpenings.length}{' '}
            mouvement(s) chargé(s). La recherche porte sur ces résultats.
          </p>
          <div className="iw-history-table">
            <div className="iw-history-columns">
              <span>{historyKind === 'receive' ? 'Référence et fournisseur' : 'Article'}</span>
              <span>Date</span>
              <span>{historyKind === 'receive' ? 'Total HT' : 'Quantité'}</span>
              <span>Statut</span>
              <span />
            </div>
            {historyKind === 'receive' &&
              receipts
                .filter((record) =>
                  `${record.reference} ${record.supplier}`
                    .toLocaleLowerCase()
                    .includes(historySearch.toLocaleLowerCase()),
                )
                .map((record) => (
                  <Button
                    type="button"
                    className="iw-history-row"
                    key={record._id}
                    onClick={() => void openDetail({ kind: 'receive', record })}
                  >
                    <span>
                      <strong>{record.reference}</strong>
                      <small>{record.supplier}</small>
                    </span>
                    <span>{formatDate(record.occurredAt)}</span>
                    <span>{money(record.totalCostCents)}</span>
                    <span className="iw-state">Enregistrée</span>
                    <FiChevronRight aria-hidden="true" />
                  </Button>
                ))}
            {historyKind === 'gift' &&
              gifts
                .filter((record) =>
                  `${record.itemName} ${record.recipient} ${record.reason}`
                    .toLocaleLowerCase()
                    .includes(historySearch.toLocaleLowerCase()),
                )
                .map((record) => (
                  <Button
                    type="button"
                    className="iw-history-row"
                    key={record._id}
                    onClick={() => void openDetail({ kind: 'gift', record })}
                  >
                    <span>
                      <strong>{record.itemName ?? 'Article archivé'}</strong>
                      <small>{record.reason}</small>
                    </span>
                    <span>{formatDate(record.occurredAt)}</span>
                    <span>{record.quantity} unité(s)</span>
                    <span className="iw-state">{record.cancelledAt ? 'Annulé' : 'Enregistré'}</span>
                    <FiChevronRight aria-hidden="true" />
                  </Button>
                ))}
            {historyKind === 'open' &&
              allOpenings
                .filter((record) =>
                  (record.itemName ?? '')
                    .toLocaleLowerCase()
                    .includes(historySearch.toLocaleLowerCase()),
                )
                .map((record) => (
                  <Button
                    type="button"
                    className="iw-history-row"
                    key={record._id}
                    onClick={() => void openDetail({ kind: 'open', record })}
                  >
                    <span>
                      <strong>{record.itemName ?? 'Article archivé'}</strong>
                      <small>{record.packSize} boosters/display</small>
                    </span>
                    <span>{formatDate(record.occurredAt)}</span>
                    <span>{record.quantity} display(s)</span>
                    <span className="iw-state">
                      {record.cancelledAt ? 'Annulée' : 'Enregistrée'}
                    </span>
                    <FiChevronRight aria-hidden="true" />
                  </Button>
                ))}
            {!(historyKind === 'receive' ? receipts : historyKind === 'gift' ? gifts : allOpenings)
              .length && (
              <p className="iw-empty">
                {busy ? 'Chargement des mouvements…' : 'Aucun mouvement enregistré.'}
              </p>
            )}
          </div>
          <div className="iw-more">
            {!(historyKind === 'receive'
              ? receiptDone
              : historyKind === 'gift'
                ? giftDone
                : openingDone) && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run(() => (historyKind === 'open' ? loadOpenings(true) : history(true)))
                }
              >
                Charger les mouvements suivants
              </Button>
            )}
          </div>
        </div>
      )}
      {tab === 'open' && !committed && openings.length > 0 && (
        <details className="iw-source-history">
          <summary>{openings.length} ouverture(s) pour cet article</summary>
          {openings.map((record) => (
            <Button
              type="button"
              variant="secondary"
              key={record._id}
              onClick={() =>
                void openDetail({ kind: 'open', record: { ...record, itemName: selected?.name } })
              }
            >
              {formatDate(record.occurredAt)} · {record.quantity} display(s) ·{' '}
              {record.cancelledAt ? 'Annulée' : 'Consulter'}
            </Button>
          ))}
        </details>
      )}
      <Dialog
        open={Boolean(detail)}
        onOpenChange={(value) => {
          if (!value && !busy) {
            setDetail(null);
            detailGeneration.current++;
          }
        }}
      >
        <DialogContent data-inventory-dialog>
          <DialogTitle>
            {detail?.kind === 'receive'
              ? `Réception ${detail.record.reference}`
              : detail?.kind === 'gift'
                ? 'Détail du don'
                : 'Ouverture de display'}
          </DialogTitle>
          <DialogDescription>
            {detail?.kind === 'receive'
              ? detail.record.supplier
              : (detail?.record.itemName ?? 'Mouvement de stock')}{' '}
            · {formatDate(detail?.record.occurredAt)}
          </DialogDescription>
          {error && (
            <p role="alert" className="iw-alert iw-alert-error">
              {error}
            </p>
          )}
          {detailError && (
            <div className="iw-alert iw-alert-error" role="alert">
              {detailError}
              <Button variant="secondary" onClick={() => detail && void openDetail(detail)}>
                Réessayer
              </Button>
            </div>
          )}
          {detail?.kind === 'receive' ? (
            <>
              <dl className="iw-detail-meta">
                <div>
                  <dt>Coût total HT</dt>
                  <dd>{money(detail.record.totalCostCents)}</dd>
                </div>
                <div>
                  <dt>Produits reçus</dt>
                  <dd>{detail.record.itemIds?.length ?? 'Non renseigné'}</dd>
                </div>
              </dl>
              <section className="iw-detail-section">
                <h3>Lots de cette réception</h3>
                {detailBusy ? (
                  <p role="status">Chargement des lots…</p>
                ) : (
                  receiptLots.map((lot, index) => (
                    <article className="iw-review-row" key={index}>
                      <div>
                        <strong>{lot.name}</strong>
                        <small>
                          {lot.received} reçu(s) · {lot.remaining} restant(s) dans ce lot
                        </small>
                      </div>
                      <strong>{money(lot.totalCostCents)} HT</strong>
                    </article>
                  ))
                )}
              </section>
            </>
          ) : detail?.kind === 'gift' ? (
            <>
              <dl className="iw-detail-meta">
                <div>
                  <dt>Quantité</dt>
                  <dd>{detail.record.quantity}</dd>
                </div>
                <div>
                  <dt>Coût enregistré</dt>
                  <dd>
                    {detail.record.costCents == null
                      ? 'Non renseigné'
                      : money(detail.record.costCents)}
                  </dd>
                </div>
                <div>
                  <dt>Destinataire</dt>
                  <dd>{detail.record.recipient || 'Non renseigné'}</dd>
                </div>
                <div>
                  <dt>Statut</dt>
                  <dd>{detail.record.cancelledAt ? 'Annulé' : 'Enregistré'}</dd>
                </div>
              </dl>
              <section className="iw-detail-section">
                <h3>{detail.record.reason}</h3>
                {detail.record.note && <p>{detail.record.note}</p>}
                <p>
                  Provenance :{' '}
                  {detail.record.purchaseReference ||
                    (detail.record.lotSources ?? [])
                      .map((lot) => [lot.supplier, lot.reference].filter(Boolean).join(' · '))
                      .join(' / ') ||
                    'Non renseignée'}
                </p>
              </section>
            </>
          ) : detail?.kind === 'open' ? (
            <>
              <dl className="iw-detail-meta">
                <div>
                  <dt>Displays consommés</dt>
                  <dd>{detail.record.quantity}</dd>
                </div>
                <div>
                  <dt>Boosters créés</dt>
                  <dd>{detail.record.quantity * detail.record.packSize}</dd>
                </div>
                <div>
                  <dt>Coût transféré</dt>
                  <dd>
                    {detail.record.allocations?.every((allocation) => allocation.costCents != null)
                      ? money(
                          detail.record.allocations.reduce(
                            (sum, allocation) => sum + (allocation.costCents ?? 0),
                            0,
                          ),
                        )
                      : 'Non renseigné'}
                  </dd>
                </div>
                <div>
                  <dt>Statut</dt>
                  <dd>{detail.record.cancelledAt ? 'Annulée' : 'Enregistrée'}</dd>
                </div>
              </dl>
              <p>
                {detail.record.packSize} boosters par display. Une annulation est possible
                uniquement si les lots générés peuvent être restaurés intégralement.
              </p>
            </>
          ) : null}
          {detail && detail.kind !== 'open' && (
            <section className="iw-detail-section iw-evidence">
              <h3>{detail.kind === 'receive' ? 'Factures et pièces jointes' : 'Justificatifs'}</h3>
              {detailBusy ? (
                <p role="status">Chargement des justificatifs…</p>
              ) : evidenceLinks.length ? (
                evidenceLinks.map((file) => (
                  <a
                    key={file._id}
                    href={`${API}/attachments/${encodeURIComponent(file._id)}/download`}
                  >
                    <FiDownload aria-hidden="true" />
                    {file.filename}
                  </a>
                ))
              ) : (
                !detailError && <p>Aucun justificatif joint.</p>
              )}
            </section>
          )}
          {detail && detail.kind !== 'receive' && !detail.record.cancelledAt && (
            <div className="iw-detail-footer">
              {recoveryPanel()}
              {detail.record.reversalAvailable === false && (
                <p>
                  Les allocations historiques sont incomplètes. Un rapprochement des lots est
                  nécessaire avant de pouvoir annuler ce mouvement.
                </p>
              )}
              {confirmReverse ? (
                <div className="iw-confirm-reversal">
                  <p>
                    {detail.kind === 'gift'
                      ? 'Annuler ce don restaurera les articles et leurs allocations de stock.'
                      : 'Annuler cette ouverture retirera les boosters générés et restaurera les displays. Les mouvements ultérieurs peuvent empêcher cette annulation.'}{' '}
                    L’historique sera conservé.
                  </p>
                  <div>
                    <Button
                      disabled={busy || submissionState !== 'idle'}
                      variant="destructive"
                      onClick={() => void run(reverseDetail)}
                    >
                      Confirmer l’annulation
                    </Button>
                    <Button
                      disabled={busy}
                      variant="secondary"
                      onClick={() => setConfirmReverse(false)}
                    >
                      Conserver le mouvement
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  disabled={
                    busy || submissionState !== 'idle' || detail.record.reversalAvailable === false
                  }
                  onClick={() => setConfirmReverse(true)}
                >
                  {detail.kind === 'gift' ? 'Annuler le don' : 'Annuler l’ouverture'}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
