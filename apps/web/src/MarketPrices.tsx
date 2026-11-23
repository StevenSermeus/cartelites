import { useEffect, useRef, useState } from 'react';
import type {
  MarketMoney,
  MarketPriceMode,
  MarketPriceQuery,
  MarketPriceResult,
  MarketPriceSource,
} from '../../../packages/domain/src/marketPrices';
import type { Request } from './GradingCompanies';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import './market-prices.css';
import {
  marketIdentityKey,
  marketQuery,
  buildMarketQuery,
  selectMarketProduct,
  type MarketIdentity,
} from './lib/marketPriceQuery';
const sources: { id: MarketPriceSource; label: string }[] = [
  { id: 'gcc', label: 'GCC · cartes gradées' },
  { id: 'ebay_fr', label: 'eBay.fr' },
  { id: 'ebay_us', label: 'eBay.com' },
  { id: 'cardmarket', label: 'Cardmarket' },
  { id: 'vinted', label: 'Vinted France' },
];
const money = (value: MarketMoney | null) =>
  value
    ? new Intl.NumberFormat('fr-BE', { style: 'currency', currency: value.currency }).format(
        value.amountMinor / 100,
      )
    : 'Non renseigné';
const basis = {
  asking: 'Prix demandé',
  current_bid: 'Enchère en cours',
  provider_sold: 'Prix de vente affiché',
  accepted_offer_unknown: 'Prix demandé · offre acceptée inconnue',
  unknown: 'Nature du prix non vérifiée',
};
export function MarketPrices({ request, item }: { request: Request; item: MarketIdentity }) {
  const [open, setOpen] = useState(false),
    [source, setSource] = useState<MarketPriceSource>('gcc'),
    [mode, setMode] = useState<MarketPriceMode>('sold'),
    [query, setQuery] = useState(() => marketQuery(item)),
    [productUrl, setProductUrl] = useState(''),
    [result, setResult] = useState<MarketPriceResult | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [pages, setPages] = useState<MarketPriceQuery[]>([]);
  const generation = useRef(0),
    committed = useRef<MarketPriceQuery | null>(null);
  const identity = marketIdentityKey(item);
  useEffect(() => {
    generation.current++;
    setQuery(marketQuery(item));
    setProductUrl('');
    setResult(null);
    setPages([]);
    setError('');
    setBusy(false);
    committed.current = null;
  }, [identity]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  function invalidate(clearProduct = true) {
    if (clearProduct) setProductUrl('');
    generation.current++;
    setResult(null);
    setPages([]);
    setError('');
    setBusy(false);
    committed.current = null;
  }
  async function search(next?: MarketPriceQuery, history: MarketPriceQuery[] = []) {
    const current = ++generation.current;
    let input: MarketPriceQuery;
    try {
      input = next ?? buildMarketQuery(item, source, mode, query, productUrl);
    } catch (reason) {
      setBusy(false);
      setError(reason instanceof Error ? reason.message : 'URL de produit invalide.');
      return;
    }
    if (!input.query) return;
    setBusy(true);
    setError('');
    setPages(history);
    committed.current = input;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(input))
      if (value !== undefined && value !== '') params.set(key, String(value));
    try {
      const value = await request<MarketPriceResult>(`/market-prices?${params}`, {
        headers: { 'X-Market-Research': '1' },
      });
      if (current !== generation.current) return;
      setResult(value);
      setPages(history);
    } catch (reason) {
      if (current === generation.current) {
        setError(
          reason instanceof Error && reason.message !== 'Failed to fetch'
            ? reason.message
            : 'La recherche ne peut pas joindre le serveur. Réessayez dans quelques instants.',
        );
        setResult(null);
      }
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <section className="market-prices" aria-label="Annonces et prix du marché">
      <header>
        <div>
          <h3>Annonces et prix du marché</h3>
          <p>Comparez les versions et les montants affichés avant votre évaluation.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Replier' : 'Consulter'}
        </Button>
      </header>
      {open && (
        <>
          <div className="market-price-controls">
            <label>
              Recherche
              <Input
                value={query}
                maxLength={200}
                onChange={(e) => {
                  invalidate();
                  setQuery(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void search();
                  }
                }}
              />
            </label>
            <label>
              Source
              <select
                value={source}
                onChange={(e) => {
                  invalidate();
                  const next = e.target.value as MarketPriceSource;
                  setSource(next);
                  setMode(next === 'vinted' || next === 'cardmarket' ? 'active' : 'sold');
                }}
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type d’annonce
              <select
                value={mode}
                onChange={(e) => {
                  invalidate(false);
                  setMode(e.target.value as MarketPriceMode);
                }}
              >
                <option value="sold">Ventes terminées</option>
                <option value="active">Annonces actives</option>
              </select>
            </label>
            {source === 'cardmarket' && (
              <label className="market-product-url">
                URL exacte du produit Cardmarket (facultative)
                <Input
                  type="url"
                  value={productUrl}
                  maxLength={2048}
                  placeholder="https://www.cardmarket.com/fr/Pokemon/Products/…"
                  onChange={(event) => {
                    invalidate(false);
                    setProductUrl(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void search();
                    }
                  }}
                />
                <small>
                  Collez une fiche produit ou choisissez une version parmi les résultats. Les offres
                  seront recherchées sur ce produit uniquement.
                </small>
              </label>
            )}
          </div>
          {source === 'cardmarket' && productUrl && (
            <div className="market-price-actions">
              <Button type="button" variant="link" onClick={() => invalidate()}>
                Effacer le produit choisi
              </Button>
            </div>
          )}
          <div className="market-price-actions">
            <Button type="button" disabled={busy || !query.trim()} onClick={() => void search()}>
              {busy ? 'Recherche…' : 'Rechercher les annonces'}
            </Button>
            {result && (
              <small>
                {result.cached ? 'Résultats en cache · ' : ''}Page {result.page} ·{' '}
                {new Date(result.fetchedAt).toLocaleString('fr-BE')}
              </small>
            )}
          </div>
          <div className="market-price-results" aria-busy={busy}>
            {busy && <p role="status">Recherche auprès de la source sélectionnée…</p>}
            {error && (
              <div role="alert">
                <p>{error}</p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void search(committed.current ?? undefined, pages)}
                >
                  Réessayer
                </Button>
              </div>
            )}
            {result && !busy && (
              <>
                <div className="market-price-status" role="status">
                  {result.message}
                  {result.status === 'pending' && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void search(committed.current ?? undefined, pages)}
                    >
                      Vérifier la recherche
                    </Button>
                  )}
                  {result.status === 'unavailable' && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void search(committed.current ?? undefined, pages)}
                    >
                      Réessayer
                    </Button>
                  )}
                </div>
                {source === 'cardmarket' && !!result.productCandidates?.length && (
                  <section
                    className="market-product-candidates"
                    aria-label="Choisir le produit Cardmarket"
                  >
                    <h4>Choisissez la version exacte</h4>
                    <p>
                      Ces fiches identifient des produits. Aucun prix minimum ne constitue une
                      annonce de vendeur.
                    </p>
                    <ul>
                      {result.productCandidates.map((candidate) => (
                        <li key={candidate.url}>
                          <Button
                            type="button"
                            variant="outline"
                            className="market-product-choice"
                            onClick={() => {
                              try {
                                const input = selectMarketProduct(
                                  committed.current ?? buildMarketQuery(item, source, mode, query),
                                  candidate.url,
                                );
                                setProductUrl(input.productUrl ?? '');
                                void search(input);
                              } catch (reason) {
                                setError(
                                  reason instanceof Error
                                    ? reason.message
                                    : 'Fiche produit invalide.',
                                );
                              }
                            }}
                          >
                            {candidate.imageUrl && (
                              <img src={candidate.imageUrl} alt="" loading="lazy" />
                            )}
                            <span>
                              {candidate.title}
                              <small>Rechercher les offres de ce produit →</small>
                            </span>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <ul>
                  {result.listings.map((listing) => (
                    <li key={`${listing.source}-${listing.id}`} className="market-price-row">
                      {listing.imageUrl ? (
                        <img
                          className="market-price-image"
                          src={listing.imageUrl}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.visibility = 'hidden';
                          }}
                        />
                      ) : (
                        <span className="market-price-image" aria-label="Sans image" />
                      )}
                      <div>
                        <h4>
                          <a href={listing.url} target="_blank" rel="noopener noreferrer">
                            {listing.title} ↗
                          </a>
                        </h4>
                        <span className="market-price-badge">
                          {listing.state === 'sold'
                            ? 'Vendu'
                            : listing.state === 'active'
                              ? 'En vente'
                              : 'Statut inconnu'}{' '}
                          ·{' '}
                          {listing.matchConfidence === 'confirmed'
                            ? '5 caractéristiques concordantes'
                            : 'Correspondance à vérifier'}
                        </span>
                        <small>
                          {[
                            listing.gradingCompany,
                            listing.grade,
                            listing.language,
                            listing.collectorNumber,
                            listing.setName,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Caractéristiques non renseignées'}
                        </small>
                        {listing.soldAt && (
                          <small>
                            Vente affichée : {new Date(listing.soldAt).toLocaleDateString('fr-BE')}
                          </small>
                        )}
                        <details>
                          <summary>Correspondance et limites</summary>
                          <ul>
                            {[...listing.matchReasons, ...listing.warnings].map((note, i) => (
                              <li key={i}>{note}</li>
                            ))}
                          </ul>
                        </details>
                      </div>
                      <div className="market-price-money">
                        {listing.priceRange
                          ? `${money(listing.priceRange.minimum)} – ${money(listing.priceRange.maximum)}`
                          : money(listing.price)}
                        <small>{basis[listing.priceBasis]}</small>
                        <small>Livraison : {money(listing.shipping)}</small>
                        {listing.buyerProtectionFee && (
                          <small>Protection acheteur : {money(listing.buyerProtectionFee)}</small>
                        )}
                        {listing.totalBeforeShipping && (
                          <small>Total hors livraison : {money(listing.totalBeforeShipping)}</small>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {result.limitations.map((note, index) => (
                  <p key={index}>{note}</p>
                ))}
                {(pages.length > 0 || result.nextPage) && (
                  <nav className="market-price-pages" aria-label="Pages des annonces">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!pages.length}
                      onClick={() => void search(pages[pages.length - 1], pages.slice(0, -1))}
                    >
                      Précédent
                    </Button>
                    <span>Page {result.page}</span>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!result.nextPage}
                      onClick={() => {
                        if (committed.current && result.nextPage)
                          void search(
                            {
                              ...committed.current,
                              page: result.nextPage,
                              cursor: result.nextCursor ?? undefined,
                            },
                            [...pages, committed.current],
                          );
                      }}
                    >
                      Suivant
                    </Button>
                  </nav>
                )}
              </>
            )}
          </div>
          <p className="market-price-warning">
            Les résultats ne modifient ni la valeur de rachat ni le prix de vente. Une offre
            acceptée, un port inconnu ou une version différente nécessite une vérification.
          </p>
        </>
      )}
    </section>
  );
}
