import { SeriesInput } from './SeriesInput';
import './acquisition-workspace.css';
import {MarketPrices} from './MarketPrices';
import { currencySymbol, shopCurrency } from './shopFormat';
import { GradingCompanyPicker, type Request } from './GradingCompanies';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { PurchaseDraft, CatalogCard } from './main';
import { TcgChoices } from './TcgChoices';
import type { Tcg } from '../../../packages/domain/src/riftbound';

const conditions = ['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'] as const;
const languages = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'Anglais' },
  { id: 'ja', label: 'Japonais' },
  { id: 'zh', label: 'Chinois' },
] as const;

const amount = (value: string) => Number(value.replace(',', '.')) || 0;
const buyback = (row: PurchaseDraft) =>
  Math.round(amount(row.marketValue) * amount(row.discountPercent)) / 100;
const euros = (value: number) =>
  value.toLocaleString('fr-BE', { style: 'currency', currency: shopCurrency });
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
  request: Request;
  invalidateSearch:(key:string)=>void;
  loadMore: (row:PurchaseDraft)=>Promise<void>;
  rows: PurchaseDraft[];
  setRows: Dispatch<SetStateAction<PurchaseDraft[]>>;
  search: (row: PurchaseDraft) => Promise<void>;
  select: (row: PurchaseDraft, card: CatalogCard) => Promise<void>;
  changeTcg: (row: PurchaseDraft, tcg: Tcg, reset?: boolean) => void;
  changeLanguage: (row: PurchaseDraft, language: 'fr' | 'en' | 'ja' | 'zh') => Promise<void>;
  save: (downloadReceipt: boolean) => Promise<void>;
  busy: boolean;
  hasClient: boolean;
  onBackToContact?: () => void;
  onStageChange?: (stage: 'items' | 'review') => void;
};
export function PurchaseEditor({
  request, loadMore, invalidateSearch,
  rows,
  setRows,
  search,
  select,
  changeTcg,
  changeLanguage,
  save,
  busy,
  hasClient,
  onBackToContact,
  onStageChange,
}: Props) {
  const [stage, setStage] = useState<'items' | 'review'>('items');
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const [reviewError, setReviewError] = useState('');
  const [gradingBusy, setGradingBusy] = useState<Set<string>>(new Set());
  const changeStage = (next: 'items' | 'review') => { setStage(next); onStageChange?.(next); setReviewError(''); };
  useEffect(() => { if (stage === 'review') reviewHeading.current?.focus(); }, [stage]);
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
  useEffect(() => { if (!items.length && stage === 'review') {setStage('items'); onStageChange?.('items');} }, [items.length]);
  function review() {
    if (gradingBusy.size) return;
    const invalid = items.some(item => !item.name.trim() || !item.marketValue.trim() || !item.discountPercent.trim() || !Number.isFinite(Number(item.marketValue.replace(',', '.'))) || Number(item.marketValue.replace(',', '.')) < 0 || !Number.isFinite(Number(item.discountPercent.replace(',', '.'))) || Number(item.discountPercent.replace(',', '.')) < 0 || Number(item.discountPercent.replace(',', '.')) > 100);
    if (invalid) {setReviewError('Vérifiez le nom, la valeur et le pourcentage de chaque carte avant de continuer.'); return;}
    changeStage('review');
  }
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
    <div className={`purchase-workspace acquisition-workspace acquisition-stage-${stage}`}>
      <div className="acquisition-flow-nav">
        {stage === 'review' ? <Button type="button" variant="link" disabled={busy} onClick={() => changeStage('items')}>← Retour aux cartes</Button> : onBackToContact ? <Button type="button" variant="link" disabled={busy} onClick={onBackToContact}>← Retour au contact</Button> : <span />}
        <span>{stage === 'items' ? 'Composition du rachat' : 'Vérification avant enregistrement'}</span>
      </div>
      {stage === 'items' && <>
      <section className="purchase-composer" aria-label="Ajouter une carte">
        <div className="purchase-section-title">
          <div>
            <span className="purchase-step">CATALOGUE ET SAISIE</span>
            <h3>Ajouter des cartes</h3><p className="acquisition-section-description">Retrouvez la version exacte, puis renseignez sa valeur.</p>
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
            <label>Langue du catalogue<select value={draft.language??'fr'} onChange={e=>{invalidateSearch(draft.key);patch(draft.key,{language:e.target.value as PurchaseDraft['language'],cardResults:[],providerHasMore:false,providerPage:1,searching:false});}}>{languages.map(l=><option key={l.id} value={l.id}>{l.label}</option>)}</select></label><div className="purchase-search-bar">
              <label>
                Nom, numéro ou promo
                <Input
                  type="search"
                  value={draft.cardSearch ?? ''}
                  placeholder={draft.tcg === 'riftbound' ? 'Sett, OGN-…' : '60/106 · XY95 · 001/XY-P'}
                  onChange={(e) => {invalidateSearch(draft.key);patch(draft.key, { cardSearch: e.target.value,cardResults:[],providerHasMore:false,providerPage:1,searching:false });setResultPage(0);}}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setResultPage(0);
                      void search(draft);
                    }
                  }}
                />
              </label>
              <Button
                type="button"
                disabled={draft.searching || !draft.cardSearch?.trim()}
                onClick={() => {
                  setResultPage(0);
                  void search(draft);
                }}
              >
                {draft.searching ? 'Recherche…' : 'Rechercher'}
              </Button>
            </div>
            {!!results.length && (
              <div className="purchase-search-results" aria-live="polite">
                <p className="purchase-muted">
                  {results.length} résultat{results.length > 1 ? 's' : ''} · sélectionnez la version
                  exacte
                </p>
                <div className="purchase-result-grid">
                  {results.slice(resultPage * 8, resultPage * 8 + 8).map((card) => (
                    <Button
                      type="button"
                      variant="ghost" className="purchase-result"
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
                    </Button>
                  ))}
                </div>
                {results.length > 8 && (
                  <div className="purchase-result-pages">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!resultPage}
                      onClick={() => setResultPage((p) => p - 1)}
                    >
                      Précédent
                    </Button>
                    <span>
                      {resultPage + 1} / {Math.ceil(results.length / 8)}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={(resultPage + 1) * 8 >= results.length}
                      onClick={() => setResultPage((p) => p + 1)}
                    >
                      Suivant
                    </Button>
                  </div>
                )}
              </div>
            )}
            {draft.providerHasMore && <Button type="button" variant="secondary" disabled={draft.searching} onClick={()=>void loadMore(draft)}>Charger les résultats suivants du catalogue</Button>}
            <Button
              type="button"
              variant="link" className="purchase-text-button"
              aria-expanded={manual}
              onClick={() => setManual(!manual)}
            >
              Saisir une carte manuellement
            </Button>
            {manual && (
              <div className="form-grid">
                <label>
                  Nom de la carte
                  <Input
                    value={draft.name}
                    onChange={(e) => patch(draft.key, { name: e.target.value })}
                  />
                </label>
                <label>
                  Série
                  <SeriesInput tcg={draft.tcg} value={draft.series ?? ''} onChange={value => patch(draft.key, { series: value })} />
                </label>
                <label>
                  Numéro
                  <Input
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
                <Button type="button" disabled={draft.searching} onClick={add}>
                  Ajouter au rachat
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    changeTcg(draft, draft.tcg ?? 'pokemon', true);
                    setManual(false);
                  }}
                >
                  Annuler
                </Button>
              </div>
            )}
          </>
        )}
        {draft?.name.trim()&&<MarketPrices key={draft.key} request={request} item={draft}/>}
      </section>
      <section className="purchase-basket" aria-label="Cartes du rachat">
        <div className="purchase-section-title">
          <div>
            <span className="purchase-step">ÉVALUATION DU RACHAT</span>
            <h3>Cartes sélectionnées</h3><p className="acquisition-section-description">Vérifiez l’état, la cote et le montant de chaque reprise.</p>
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
                    {item.tcg === 'other' ? 'Autre' : item.tcg === 'riftbound' ? 'Riftbound' : 'Pokémon'} · {item.series} ·{' '}
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
                  Valeur ({currencySymbol})
                  <Input
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
                  <Input
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
              <Button
                type="button"
                variant="link" className="purchase-text-button"
                aria-expanded={expanded === item.key}
                aria-controls={`details-${item.key}`}
                onClick={() => setExpanded(expanded === item.key ? null : item.key)}
              >
                {expanded === item.key ? 'Fermer les détails' : 'Détails de la carte'}
                {item.gradingCompany ? ` · ${item.gradingCompany} ${item.gradingGrade ?? ''}` : ''}
              </Button>
              <Button
                type="button"
                variant="ghost" className="purchase-text-button purchase-remove"
                aria-label={`Retirer ${item.name}`}
                onClick={() => setRows((rows) => rows.filter((row) => row.key !== item.key))}
              >
                Retirer
              </Button>
            </div>
            {expanded === item.key && (
              <div className="purchase-line-details" id={`details-${item.key}`}>
                <div className="form-grid">
                  <label>
                    Nom
                    <Input
                      value={item.name}
                      onChange={(e) => patch(item.key, { name: e.target.value })}
                    />
                  </label>
                  <label>
                    Série
                    <SeriesInput tcg={item.tcg} value={item.series ?? ''} onChange={value => patch(item.key, { series: value })} />
                  </label>
                  <label>
                    Numéro
                    <Input
                      value={item.identifier}
                      onChange={(e) => patch(item.key, { identifier: e.target.value })}
                    />
                  </label>
                  <label>
                    Langue
                    <select
                      value={item.language ?? 'fr'}
                      onChange={(e) =>
                        void changeLanguage(item, e.target.value as 'fr' | 'en' | 'ja' | 'zh')
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
                  <GradingCompanyPicker request={request} value={item.gradingCompany} onBusyChange={pending=>setGradingBusy(current=>{const next=new Set(current);pending?next.add(item.key):next.delete(item.key);return next;})} onChange={value=>patch(item.key,{gradingCompany:value||undefined,...(!value?{gradingGrade:'',gradingCertificate:'',gradingNotes:''}:{})})} />
                  {item.gradingCompany && (
                    <>
                      <label>
                        Note
                        <Input
                          value={item.gradingGrade ?? ''}
                          onChange={(e) => patch(item.key, { gradingGrade: e.target.value })}
                        />
                      </label>
                      <label>
                        Certificat
                        <Input
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
                    Prix de vente proposé ({currencySymbol})
                    <Input
                      inputMode="decimal"
                      value={item.askingPriceTouched ? item.askingPrice : item.marketValue}
                      onChange={(e) =>
                        patch(item.key, { askingPrice: e.target.value, askingPriceTouched: true })
                      }
                    />
                  </label>
                  <label>
                    Photo personnelle
                    <Input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => { const file = e.target.files?.[0]; if (file) patch(item.key, { photo: file }); e.target.value = ''; }}
                    />
                    {item.photo && <><small>{item.photo.name}</small><img className="purchase-photo-preview" src={photoUrls[item.key]} alt={`Aperçu de ${item.photo.name}`} /><Button type="button" variant="outline" onClick={() => patch(item.key, { photo: null })}>Retirer la photo</Button></>}
                  </label>
                  <div style={{gridColumn:"1 / -1"}}><MarketPrices request={request} item={item}/></div>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
      </>}
      {stage === 'review' && <section className="acquisition-review" aria-labelledby="acquisition-review-title">
        <header className="purchase-section-title"><div><span className="purchase-step">RÉCAPITULATIF</span><h3 id="acquisition-review-title" ref={reviewHeading} tabIndex={-1}>Vérifier le rachat</h3><p className="acquisition-section-description">Relisez les cartes et les montants. Les valeurs restent modifiables en revenant à l’étape précédente.</p></div><span className="purchase-count">{items.length} carte(s)</span></header>
        <div className="acquisition-review-table"><table><thead><tr><th>Carte</th><th>État</th><th>Cote</th><th>Reprise</th><th>À payer</th></tr></thead><tbody>{items.map(item => <tr key={item.key}><td><strong>{item.name}</strong><small>{[item.series, item.identifier, item.language?.toUpperCase(), item.gradingCompany && `${item.gradingCompany} ${item.gradingGrade ?? ''}`].filter(Boolean).join(' · ')}</small>{item.photo && <small>Photo jointe : {item.photo.name}</small>}</td><td>{item.condition ?? 'NM'}</td><td>{euros(amount(item.marketValue))}</td><td>{item.discountPercent} %</td><td><strong>{euros(buyback(item))}</strong></td></tr>)}</tbody></table></div>
        <p className="acquisition-review-note">L’enregistrement conserve le rachat et ses pièces. La validation de l’entrée en stock et la signature du bordereau restent des étapes distinctes.</p>
      </section>}
      {reviewError && <p className="acquisition-error acquisition-flow-error" role="alert">{reviewError}</p>}
      <div className="purchase-checkout acquisition-checkout" role="region" aria-label="Total du rachat">
        <div>
          <small>
            {items.length} carte{items.length > 1 ? 's' : ''} · Total du rachat
          </small>
          <strong>{euros(total)}</strong><span className="acquisition-total-note">Montant à verser au vendeur</span>
        </div>
        <div>
          {stage === 'items' ? <Button type="button" disabled={busy || gradingBusy.size > 0 || !items.length || !hasClient || !!draft?.name.trim()} onClick={review}>Vérifier le rachat →</Button> : <>
          <Button
            type="button"
            disabled={busy || !items.length || !hasClient || !!draft?.name.trim()}
            variant="outline"
            onClick={() => void save(false)}
          >
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          <Button
            type="button"
            disabled={busy || !items.length || !hasClient || !!draft?.name.trim()}
            onClick={() => void save(true)}
          >
            {busy ? 'Enregistrement…' : 'Enregistrer avec bordereau'}
          </Button>
          </>}
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
