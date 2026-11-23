import { RequestFailure } from './lib/submittedAttempt';
import { SeriesInput } from './SeriesInput';
import './product-workspace.css';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './components/ui/dialog';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { MarketPrices } from './MarketPrices';
import {
  attributeRows,
  attributesRecord,
  unchangedMetadata,
  type AttributeRow,
} from './lib/productMetadata';
import { currencySymbol } from './shopFormat';
import { GradingCompanyPicker } from './GradingCompanies';
import { useEffect, useId, useRef, useState } from 'react';

type Photo = { _id: string; filename: string; contentType: string };
type Product = {
  revision?: number;
  productRevision?: number;
  variant?: string;
  serialNumber?: string;
  privateNotes?: string;
  publicAttributes?: Record<string, string>;
  privateAttributes?: Record<string, string>;
  tcg?: 'pokemon' | 'riftbound' | 'other';
  _id: string;
  name: string;
  description?: string;
  series?: string;
  identifier?: string;
  language?: string;
  condition?: string;
  gradingCompany?: string;
  gradingGrade?: string;
  gradingCertificate?: string;
  askingPriceCents?: number;
  priceVisible?: boolean;
  hiddenFromCatalogue?: boolean;
  coverPhotoId?: string;
};
type Detail = { item: Product; photos: Photo[] };
type Pending = { file: File; operationId: string };
function PendingPhoto({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return <img src={url || undefined} alt={file.name} />;
}

export function ProductEditor({
  itemId,
  focusPriceVisibility = false,
  apiBase,
  request,
  upload,
  onChanged,
  onClose,
}: {
  itemId: string;
  focusPriceVisibility?: boolean;
  apiBase: string;
  request: <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
  upload: (itemId: string, file: File, operationId?: string) => Promise<void>;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const opener = useRef(document.activeElement as HTMLElement | null),
    baseline = useRef<Product | null>(null),
    lock = useRef(false);
  const [publicRows, setPublicRows] = useState<AttributeRow[]>([]),
    [privateRows, setPrivateRows] = useState<AttributeRow[]>([]);
  const [details, setDetails] = useState<Detail | null>(null),
    [draft, setDraft] = useState<Product | null>(null);
  const [price, setPrice] = useState(''),
    [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [gradingBusy, setGradingBusy] = useState(false);
  const [priceError, setPriceError] = useState('');
  const priceErrorId = useId();
  const priceInput = useRef<HTMLInputElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorSummary.current?.focus(); }, [error]);
  const photos = (details?.photos ?? []).filter((p) => p.contentType.startsWith('image/'));
  function accept(value: Detail) {
    baseline.current = value.item;
    setDetails(value);
    setDraft(value.item);
    setPrice(
      value.item.askingPriceCents === undefined
        ? ''
        : (value.item.askingPriceCents / 100).toFixed(2),
    );
    setPublicRows(attributeRows(value.item.publicAttributes));
    setPrivateRows(attributeRows(value.item.privateAttributes));
    setDirty(false);
  }
  async function reload(saved = false) {
    const value = await request<Detail>(`/stock/${encodeURIComponent(itemId)}/lots`);
    if (saved) accept(value);
    else {
      setDetails(value);
      if (baseline.current && unchangedMetadata(baseline.current, value.item)) {
        baseline.current = value.item;
        setDraft((current) =>
          current
            ? {
                ...current,
                revision: value.item.revision,
                productRevision: value.item.productRevision,
              }
            : current,
        );
      } else
        setError(
          'La fiche a changé dans une autre session. Vos modifications sont conservées ; rechargez la fiche avant de réessayer.',
        );
    }
    return value;
  }
  useEffect(() => {
    let active = true;
    void request<Detail>(`/stock/${encodeURIComponent(itemId)}/lots`)
      .then((value) => {
        if (!active) return;
        accept(value);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Chargement impossible.');
      });
    return () => {
      active = false;
    };
  }, [itemId]);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (e) {
      if (e instanceof RequestFailure && ['INVALID_PRICE', 'PRICE_BELOW_AGREEMENT'].includes(e.code ?? '')) {
        setPriceError(e.message);
        requestAnimationFrame(() => priceInput.current?.focus());
      } else setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function close() {
    if (busy || gradingBusy) return;
    if (
      (dirty || pending.length) &&
      !window.confirm('Fermer sans enregistrer les modifications et photos en attente ?')
    )
      return;
    onClose();
  }
  function change(key: keyof Product, value: string | boolean) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setDirty(true);
  }
  async function photoAction(photo: Photo, action: 'cover' | 'remove') {
    if (action === 'remove' && !window.confirm(`Supprimer la photo « ${photo.filename} » ?`))
      return;
    await run(async () => {
      await request('/stock/photo', {
        method: 'POST',
        body: JSON.stringify({ itemId, attachmentId: photo._id, action }),
      });
      await reload();
      await onChanged();
      setMessage(action === 'cover' ? 'Photo de couverture mise à jour.' : 'Photo supprimée.');
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="product-workspace-dialog"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener.current?.isConnected && opener.current !== document.body)
            opener.current.focus();
          else
            document
              .querySelector<HTMLElement>(`[data-product-id="${CSS.escape(itemId)}"]`)
              ?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="product-editor-heading">
          <DialogTitle>Modifier la fiche produit</DialogTitle>
          <DialogDescription>
            Identité, présentation publique, informations internes et photos de cet exemplaire.
          </DialogDescription>
        </div>
        {!!error && (
          <div role="alert" tabIndex={-1} ref={errorSummary} aria-label="Erreur dans la fiche">
            <p className="error">
              {error.includes('REVISION_CONFLICT')
                ? 'Cette fiche a été modifiée ailleurs. Vos valeurs sont conservées. Rechargez la version récente avant de corriger.'
                : error}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (
                  !dirty ||
                  window.confirm(
                    'Recharger la fiche et remplacer les modifications non enregistrées ?',
                  )
                )
                  void run(() => reload(true).then(() => {}));
              }}
            >
              Recharger la fiche
            </Button>
          </div>
        )}
        {!!message && <p role="status">{message}</p>}
        {!draft && !error && <p role="status">Chargement de la fiche…</p>}
        {draft && (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (gradingBusy) return;
                const askingPriceCents = Math.round(Number(price.replace(',', '.')) * 100);
                const invalidPrice = !/^\d+(?:[.,]\d{1,2})?$/.test(price.trim())
                  ? 'Saisissez un prix valide avec deux décimales au maximum.'
                  : !Number.isSafeInteger(askingPriceCents) ? 'Prix trop élevé.' : '';
                setPriceError(invalidPrice);
                if (invalidPrice) { setError(''); requestAnimationFrame(() => priceInput.current?.focus()); return; }
                void run(async () => {
                  await request('/stock/product', {
                    method: 'POST',
                    body: JSON.stringify({
                      itemId,
                      expectedRevision: draft.revision ?? 0,
                      expectedProductRevision: draft.productRevision,
                      variant: draft.variant ?? '',
                      serialNumber: draft.serialNumber ?? '',
                      privateNotes: draft.privateNotes ?? '',
                      publicAttributes: attributesRecord(publicRows),
                      privateAttributes: attributesRecord(privateRows),
                      tcg: draft.tcg ?? 'pokemon',
                      name: draft.name,
                      description: draft.description ?? '',
                      series: draft.series ?? '',
                      identifier: draft.identifier ?? '',
                      language: draft.language || undefined,
                      condition: draft.condition || undefined,
                      gradingCompany: draft.gradingCompany || undefined,
                      gradingGrade: draft.gradingGrade ?? '',
                      gradingCertificate: draft.gradingCertificate ?? '',
                      askingPriceCents,
                      priceVisible: draft.priceVisible ?? true,
                      hiddenFromCatalogue: draft.hiddenFromCatalogue ?? false,
                    }),
                  });
                  setDirty(false);
                  setMessage('Fiche produit enregistrée.');
                  await reload(true);
                  await onChanged();
                });
              }}
            >
              <fieldset disabled={busy}>
                <div className="form-grid">
                  <label>
                    Jeu de cartes
                    <select
                      value={draft.tcg ?? 'pokemon'}
                      onChange={(e) => change('tcg', e.target.value)}
                    >
                      <option value="pokemon">Pokémon</option>
                      <option value="riftbound">Riftbound</option>
                      <option value="other">Autre</option>
                    </select>
                  </label>
                  <label>
                    Nom du produit
                    <Input
                      required
                      maxLength={300}
                      value={draft.name}
                      onChange={(e) => change('name', e.target.value)}
                    />
                  </label>
                  <label>
                    Prix de vente TTC ({currencySymbol})
                    <Input
                      required
                      inputMode="decimal"
                      ref={priceInput}
                      aria-invalid={!!priceError}
                      aria-describedby={priceError ? priceErrorId : undefined}
                      value={price}
                      onChange={(e) => {
                        setPrice(e.target.value);
                        setPriceError('');
                        setDirty(true);
                      }}
                    />
                    {priceError && <span id={priceErrorId} className="error">{priceError}</span>}
                  </label>
                <label className="product-check">
                  <Input autoFocus={focusPriceVisibility} type="checkbox" checked={draft.priceVisible ?? true} onChange={(e) => change('priceVisible', e.target.checked)} />{' '}
                  Afficher le prix dans le catalogue public
                </label>
                <label className="product-check">
                  <Input
                    type="checkbox"
                    checked={draft.hiddenFromCatalogue ?? false}
                    onChange={(e) => change('hiddenFromCatalogue', e.target.checked)}
                  />{' '}
                  Masquer du catalogue public
                </label>
                  <label>
                    Série
                    <SeriesInput tcg={draft.tcg} value={draft.series ?? ''} onChange={value => change('series', value)} />
                  </label>
                  <label>
                    Numéro / identifiant
                    <Input
                      maxLength={100}
                      value={draft.identifier ?? ''}
                      onChange={(e) => change('identifier', e.target.value)}
                    />
                  </label>
                  <label>
                    Langue
                    <select
                      value={draft.language ?? ''}
                      onChange={(e) => change('language', e.target.value)}
                    >
                      <option value="">Non renseignée</option>
                      <option value="fr">Français</option>
                      <option value="en">Anglais</option>
                      <option value="ja">Japonais</option>
                      <option value="zh">Chinois</option>
                    </select>
                  </label>
                  <label>
                    État
                    <select
                      value={draft.condition ?? ''}
                      onChange={(e) => change('condition', e.target.value)}
                    >
                      <option value="">Non renseigné</option>
                      {['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <GradingCompanyPicker
                    request={request}
                    onBusyChange={setGradingBusy}
                    value={draft.gradingCompany}
                    onChange={(value) => change('gradingCompany', value)}
                  />
                  {!!draft.gradingCompany && (
                    <>
                      <label>
                        Note
                        <Input
                          maxLength={32}
                          value={draft.gradingGrade ?? ''}
                          onChange={(e) => change('gradingGrade', e.target.value)}
                        />
                      </label>
                      <label>
                        Certificat
                        <Input
                          maxLength={100}
                          value={draft.gradingCertificate ?? ''}
                          onChange={(e) => change('gradingCertificate', e.target.value)}
                        />
                      </label>
                    </>
                  )}
                </div>
                <div className="form-grid">
                  <label>
                    Variante publique
                    <Input
                      maxLength={100}
                      value={draft.variant ?? ''}
                      onChange={(e) => change('variant', e.target.value)}
                    />
                  </label>
                  <label>
                    Numéro de série interne
                    <Input
                      maxLength={100}
                      value={draft.serialNumber ?? ''}
                      onChange={(e) => change('serialNumber', e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  Description
                  <textarea
                    maxLength={3000}
                    rows={4}
                    value={draft.description ?? ''}
                    onChange={(e) => change('description', e.target.value)}
                  />
                </label>
                <AttributesEditor
                  title="Caractéristiques publiques"
                  rows={publicRows}
                  onChange={(rows) => {
                    setPublicRows(rows);
                    setDirty(true);
                  }}
                />
                <div className="product-private-fields">
                  <p className="product-private-note">
                    Informations internes, absentes du catalogue public.
                  </p>
                  <label>
                    Notes privées
                    <textarea
                      rows={3}
                      maxLength={3000}
                      value={draft.privateNotes ?? ''}
                      onChange={(e) => change('privateNotes', e.target.value)}
                    />
                  </label>
                  <AttributesEditor
                    title="Caractéristiques privées"
                    rows={privateRows}
                    onChange={(rows) => {
                      setPrivateRows(rows);
                      setDirty(true);
                    }}
                  />
                </div>
                <Button disabled={busy || gradingBusy || !dirty} type="submit">
                  Enregistrer la fiche
                </Button>
              </fieldset>
            </form>
            <MarketPrices request={request} item={draft} />
            <section aria-labelledby="product-photos-title">
              <h3 id="product-photos-title">Photos · {photos.length}/6</h3>
              <div className="product-photo-grid">
                {photos.map((photo) => (
                  <div key={photo._id}>
                    <a
                      href={`${apiBase}/attachments/${encodeURIComponent(photo._id)}/download`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={`${apiBase}/attachments/${encodeURIComponent(photo._id)}/download?size=thumbnail`}
                        alt={photo.filename}
                      />
                    </a>
                    <p>
                      {details?.item.coverPhotoId === photo._id ? 'Couverture' : photo.filename}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || details?.item.coverPhotoId === photo._id}
                      onClick={() => void photoAction(photo, 'cover')}
                    >
                      En couverture
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void photoAction(photo, 'remove')}
                    >
                      Supprimer
                    </Button>
                  </div>
                ))}
              </div>
              <label>
                Ajouter plusieurs photos
                <Input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  disabled={busy || photos.length + pending.length >= 6}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = '';
                    if (photos.length + pending.length + files.length > 6) {
                      setError('Six photos maximum par produit.');
                      return;
                    }
                    setPending((p) => [
                      ...p,
                      ...files.map((file) => ({ file, operationId: crypto.randomUUID() })),
                    ]);
                    setError('');
                  }}
                />
              </label>
              <div className="product-photo-grid">
                {pending.map((p) => (
                  <div key={p.operationId}>
                    <PendingPhoto file={p.file} />
                    <p>{p.file.name}</p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        setPending((list) => list.filter((f) => f.operationId !== p.operationId))
                      }
                    >
                      Retirer
                    </Button>
                  </div>
                ))}
              </div>
              {!!pending.length && (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      try {
                        for (const next of pending) {
                          await upload(itemId, next.file, next.operationId);
                          setPending((list) =>
                            list.filter((f) => f.operationId !== next.operationId),
                          );
                        }
                        setMessage('Photos enregistrées.');
                      } finally {
                        await reload();
                        await onChanged();
                      }
                    })
                  }
                >
                  {busy ? 'Envoi en cours…' : `Enregistrer ${pending.length} photo(s)`}
                </Button>
              )}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AttributesEditor({
  title,
  rows,
  onChange,
}: {
  title: string;
  rows: AttributeRow[];
  onChange: (rows: AttributeRow[]) => void;
}) {
  return (
    <div className="product-attributes">
      <div className="product-attributes-heading">
        <h3>{title}</h3>
        <span>{rows.length}/20</span>
      </div>
      <p>Nom de 60 caractères maximum · valeur de 500 caractères maximum.</p>
      {rows.map((row, index) => (
        <div className="product-attribute-row" key={row.id}>
          <label>
            Nom {index + 1}
            <Input
              required
              maxLength={60}
              value={row.key}
              onChange={(e) =>
                onChange(
                  rows.map((value) =>
                    value.id === row.id ? { ...value, key: e.target.value } : value,
                  ),
                )
              }
            />
          </label>
          <label>
            Valeur {index + 1}
            <Input
              maxLength={500}
              value={row.value}
              onChange={(e) =>
                onChange(
                  rows.map((value) =>
                    value.id === row.id ? { ...value, value: e.target.value } : value,
                  ),
                )
              }
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            aria-label={`Supprimer ${title.toLowerCase()} ${index + 1}`}
            onClick={() => onChange(rows.filter((value) => value.id !== row.id))}
          >
            Retirer
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={rows.length >= 20}
        onClick={() => onChange([...rows, { id: crypto.randomUUID(), key: '', value: '' }])}
      >
        Ajouter une caractéristique
      </Button>
    </div>
  );
}
