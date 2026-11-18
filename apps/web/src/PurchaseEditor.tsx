import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { PurchaseDraft, CatalogCard } from './main';
import { TcgChoices } from './TcgChoices';
import type { Tcg } from '../../../packages/domain/src/riftbound';

const conditions = ['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'] as const;
const languages = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'Anglais' },
  { id: 'ja', label: 'Japonais' },
] as const;
const companies = ['PSA', 'CollectAura', 'PCA', 'CCC'] as const;
const amount = (value: string) => Number(value.replace(',', '.')) || 0;
const buyback = (row: PurchaseDraft) =>
  Math.round(amount(row.marketValue) * amount(row.discountPercent)) / 100;
const euros = (value: number) =>
  value.toLocaleString('fr-BE', { style: 'currency', currency: 'EUR' });
const fresh = (tcg: Tcg): PurchaseDraft => ({
  key: crypto.randomUUID(),
  tcg,
  name: '',
  series: '',
  identifier: '',
  marketValue: '',
  discountPercent: '70',
  askingPrice: '',
  askingPriceTouched: false,
  photo: null,
  language: tcg === 'riftbound' ? 'en' : 'fr',
});

type Props = {
  rows: PurchaseDraft[];
  setRows: Dispatch<SetStateAction<PurchaseDraft[]>>;
  search: (row: PurchaseDraft) => Promise<void>;
  select: (row: PurchaseDraft, card: CatalogCard) => Promise<void>;
  changeTcg: (row: PurchaseDraft, tcg: Tcg, reset?: boolean) => void;
  changeLanguage: (row: PurchaseDraft, language: 'fr' | 'en' | 'ja') => Promise<void>;
  save: (downloadReceipt: boolean) => Promise<void>;
  busy: boolean;
  hasClient: boolean;
};
export function PurchaseEditor({
  rows,
  setRows,
  search,
  select,
  changeTcg,
  changeLanguage,
  save,
  busy,
  hasClient,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [resultPage, setResultPage] = useState(0);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const draft = rows.find((row) => !row.included);
  const items = rows.filter((row) => row.included);
  const patch = (key: string, change: Partial<PurchaseDraft>) =>
    setRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const row of rows) if (row.photo) urls[row.key] = URL.createObjectURL(row.photo);
    setPhotoUrls(urls);
    return () => Object.values(urls).forEach(URL.revokeObjectURL);
  }, [rows]);
  const results = draft?.cardResults ?? [];
  const total = items.reduce((sum, item) => sum + Math.round(buyback(item) * 100), 0) / 100;
  function add() {
    if (!draft?.name.trim()) return;
    setRows((rows) => [
      ...rows.map((row) =>
        row.key === draft.key ? { ...row, included: true, cardResults: [], searching: false } : row,
      ),
      fresh(draft.tcg ?? 'pokemon'),
    ]);
    setExpanded(null);
    setManual(false);
    setResultPage(0);
  }
  return (
    <div className="purchase-workspace">
      <section className="purchase-composer" aria-label="Ajouter une carte">
        <div className="purchase-section-title">
          <div>
            <span className="purchase-step">01 · Ajouter</span>
            <h3>Trouvez votre carte</h3>
          </div>
          <span className="purchase-muted">Pokémon & Riftbound</span>
        </div>
        {draft && (
          <>
            <TcgChoices
              value={draft.tcg ?? 'pokemon'}
              onChange={(tcg) => {
                if (tcg !== 'all') {
                  changeTcg(draft, tcg);
                  setResultPage(0);
                }
              }}
            />
            <div className="purchase-search-bar">
              <label>
                Nom ou numéro de carte
                <input
                  type="search"
                  value={draft.cardSearch ?? ''}
                  placeholder={draft.tcg === 'riftbound' ? 'Sett, OGN-…' : 'Pikachu, 151/165…'}
                  onChange={(e) => patch(draft.key, { cardSearch: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setResultPage(0);
                      void search(draft);
                    }
                  }}
                />
              </label>
              <button
                type="button"
                disabled={draft.searching || !draft.cardSearch?.trim()}
                onClick={() => {
                  setResultPage(0);
                  void search(draft);
                }}
              >
                {draft.searching ? 'Recherche…' : 'Rechercher'}
              </button>
            </div>
            {!!results.length && (
              <div className="purchase-search-results" aria-live="polite">
                <p className="purchase-muted">
                  {results.length} résultat{results.length > 1 ? 's' : ''} · sélectionnez la version
                  exacte
                </p>
                <div className="purchase-result-grid">
                  {results.slice(resultPage * 8, resultPage * 8 + 8).map((card) => (
                    <button
                      type="button"
                      className="purchase-result"
                      key={`${card.language}-${card.id}`}
                      onClick={() => void select(draft, card)}
                    >
                      {card.image ? (
                        <img
                          src={draft.tcg === 'riftbound' ? card.image : `${card.image}/low.webp`}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <span className="purchase-no-image">Sans image</span>
                      )}
                      <strong>{card.name}</strong>
                      <span>{card.setName ?? card.id}</span>
                      <small>
                        {card.localId} · {card.language.toUpperCase()}
                      </small>
                    </button>
                  ))}
                </div>
                {results.length > 8 && (
                  <div className="purchase-result-pages">
                    <button
                      type="button"
                      className="secondary"
                      disabled={!resultPage}
                      onClick={() => setResultPage((p) => p - 1)}
                    >
                      Précédent
                    </button>
                    <span>
                      {resultPage + 1} / {Math.ceil(results.length / 8)}
                    </span>
                    <button
                      type="button"
                      className="secondary"
                      disabled={(resultPage + 1) * 8 >= results.length}
                      onClick={() => setResultPage((p) => p + 1)}
                    >
                      Suivant
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              className="purchase-text-button"
              aria-expanded={manual}
              onClick={() => setManual(!manual)}
            >
              Saisir une carte manuellement
            </button>
            {manual && (
              <div className="form-grid">
                <label>
                  Nom de la carte
                  <input
                    value={draft.name}
                    onChange={(e) => patch(draft.key, { name: e.target.value })}
                  />
                </label>
                <label>
                  Série
                  <input
                    value={draft.series}
                    onChange={(e) => patch(draft.key, { series: e.target.value })}
                  />
                </label>
                <label>
                  Numéro
                  <input
                    value={draft.identifier}
                    onChange={(e) => patch(draft.key, { identifier: e.target.value })}
                  />
                </label>
              </div>
            )}
            {draft.name.trim() && (
              <div className="purchase-selected-preview">
                <div className="purchase-card-identity">
                  {(photoUrls[draft.key] || draft.catalogueImageUrl) && <img src={photoUrls[draft.key] || draft.catalogueImageUrl} alt={`Aperçu de ${draft.name}`} />}
                  <div>
                    <strong>{draft.name}</strong>
                    <small>
                      {[draft.series, draft.identifier, draft.language?.toUpperCase()]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </div>
                </div>
                <button type="button" disabled={draft.searching} onClick={add}>
                  Ajouter au rachat
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    changeTcg(draft, draft.tcg ?? 'pokemon', true);
                    setManual(false);
                  }}
                >
                  Annuler
                </button>
              </div>
            )}
          </>
        )}
      </section>
      <section className="purchase-basket" aria-label="Cartes du rachat">
        <div className="purchase-section-title">
          <div>
            <span className="purchase-step">02 · Vérifier</span>
            <h3>Votre rachat</h3>
          </div>
          <span className="purchase-count">
            {items.length} carte{items.length > 1 ? 's' : ''}
          </span>
        </div>
        {!items.length && (
          <div className="purchase-empty">
            <strong>Votre liste est prête à accueillir des cartes</strong>
            <p>Recherchez une carte ci-dessus ou saisissez-la manuellement.</p>
          </div>
        )}
        {items.map((item) => (
          <div className="purchase-line" key={item.key}>
            <div className="purchase-line-main">
              <div className="purchase-card-identity">
                {photoUrls[item.key] || item.catalogueImageUrl ? (
                  <img src={photoUrls[item.key] || item.catalogueImageUrl} alt={`Photo de ${item.name}`} />
                ) : (
                  <span className="purchase-no-image">TCG</span>
                )}
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.tcg === 'riftbound' ? 'Riftbound' : 'Pokémon'} · {item.series} ·{' '}
                    {item.identifier} · {item.language?.toUpperCase() ?? 'FR'}
                  </small>
                </div>
              </div>
              <div className="purchase-line-prices">
                <label>
                  État
                  <select
                    value={item.condition ?? 'NM'}
                    onChange={(e) =>
                      patch(item.key, { condition: e.target.value as PurchaseDraft['condition'] })
                    }
                  >
                    {conditions.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Valeur (€)
                  <input
                    inputMode="decimal"
                    value={item.marketValue}
                    onChange={(e) =>
                      patch(item.key, {
                        marketValue: e.target.value,
                        askingPrice: item.askingPriceTouched ? item.askingPrice : e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Rachat (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={item.discountPercent}
                    onChange={(e) => patch(item.key, { discountPercent: e.target.value })}
                  />
                </label>
                <div className="purchase-line-total">
                  <small>À payer</small>
                  <strong>{euros(buyback(item))}</strong>
                </div>
              </div>
            </div>
            <div className="purchase-line-actions">
              <button
                type="button"
                className="purchase-text-button"
                aria-expanded={expanded === item.key}
                aria-controls={`details-${item.key}`}
                onClick={() => setExpanded(expanded === item.key ? null : item.key)}
              >
                {expanded === item.key ? 'Fermer les détails' : 'Détails de la carte'}
                {item.gradingCompany ? ` · ${item.gradingCompany} ${item.gradingGrade ?? ''}` : ''}
              </button>
              <button
                type="button"
                className="purchase-text-button purchase-remove"
                aria-label={`Retirer ${item.name}`}
                onClick={() => setRows((rows) => rows.filter((row) => row.key !== item.key))}
              >
                Retirer
              </button>
            </div>
            {expanded === item.key && (
              <div className="purchase-line-details" id={`details-${item.key}`}>
                <div className="form-grid">
                  <label>
                    Nom
                    <input
                      value={item.name}
                      onChange={(e) => patch(item.key, { name: e.target.value })}
                    />
                  </label>
                  <label>
                    Série
                    <input
                      value={item.series}
                      onChange={(e) => patch(item.key, { series: e.target.value })}
                    />
                  </label>
                  <label>
                    Numéro
                    <input
                      value={item.identifier}
                      onChange={(e) => patch(item.key, { identifier: e.target.value })}
                    />
                  </label>
                  <label>
                    Langue
                    <select
                      value={item.language ?? 'fr'}
                      onChange={(e) =>
                        void changeLanguage(item, e.target.value as 'fr' | 'en' | 'ja')
                      }
                    >
                      {languages
                        .filter(
                          (l) =>
                            (item.tcg !== 'riftbound' || l.id !== 'ja') &&
                            (!item.catalogueCardId || item.availableLanguages?.includes(l.id)),
                        )
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Gradation
                    <select
                      value={item.gradingCompany ?? ''}
                      onChange={(e) =>
                        patch(item.key, {
                          gradingCompany: (e.target.value ||
                            undefined) as PurchaseDraft['gradingCompany'],
                          gradingGrade: '',
                          gradingCertificate: '',
                          gradingNotes: '',
                        })
                      }
                    >
                      <option value="">Non gradée</option>
                      {companies.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  {item.gradingCompany && (
                    <>
                      <label>
                        Note
                        <input
                          value={item.gradingGrade ?? ''}
                          onChange={(e) => patch(item.key, { gradingGrade: e.target.value })}
                        />
                      </label>
                      <label>
                        Certificat
                        <input
                          value={item.gradingCertificate ?? ''}
                          onChange={(e) => patch(item.key, { gradingCertificate: e.target.value })}
                        />
                      </label>
                      <label>
                        Notes de gradation
                        <textarea
                          value={item.gradingNotes ?? ''}
                          onChange={(e) => patch(item.key, { gradingNotes: e.target.value })}
                        />
                      </label>
                    </>
                  )}
                  <label>
                    Prix de vente proposé (€)
                    <input
                      inputMode="decimal"
                      value={item.askingPriceTouched ? item.askingPrice : item.marketValue}
                      onChange={(e) =>
                        patch(item.key, { askingPrice: e.target.value, askingPriceTouched: true })
                      }
                    />
                  </label>
                  <label>
                    Photo personnelle
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      onChange={(e) => { const file = e.target.files?.[0]; if (file) patch(item.key, { photo: file }); e.target.value = ''; }}
                    />
                    {item.photo && <><small>{item.photo.name}</small><img className="purchase-photo-preview" src={photoUrls[item.key]} alt={`Aperçu de ${item.photo.name}`} /><button type="button" className="secondary" onClick={() => patch(item.key, { photo: null })}>Retirer la photo</button></>}
                  </label>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
      <div className="purchase-checkout" role="region" aria-label="Total du rachat">
        <div>
          <small>
            {items.length} carte{items.length > 1 ? 's' : ''} · Total du rachat
          </small>
          <strong>{euros(total)}</strong>
        </div>
        <div>
          <button
            type="button"
            disabled={busy || !items.length || !hasClient || !!draft?.name.trim()}
            className="secondary"
            onClick={() => void save(false)}
          >
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button
            type="button"
            disabled={busy || !items.length || !hasClient || !!draft?.name.trim()}
            onClick={() => void save(true)}
          >
            {busy ? 'Enregistrement…' : 'Enregistrer et télécharger le bordereau'}
          </button>
          <small>
            {draft?.name.trim()
              ? 'Ajoutez ou annulez la carte en cours.'
              : !hasClient
                ? 'Sélectionnez un client pour continuer.'
                : 'Le stock sera mis à jour après validation du rachat.'}
          </small>
        </div>
      </div>
    </div>
  );
}
