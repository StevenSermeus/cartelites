import { shopCurrency } from './shopFormat';
import { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './components/ui/dialog';
import { Button } from './components/ui/button';
import { API, publicRealtime } from './realtime';
import { ProductGallery } from './ProductGallery';
type Product = {
  id: string;
  name: string;
  description?: string;
  variant?: string;
  publicAttributes?: Record<string, string>;
  series?: string;
  identifier?: string;
  language?: string;
  condition?: string;
  gradingCompany?: string;
  gradingGrade?: string;
  gradingCertificate?: string;
  salePriceCents?: number;
  quantity: number;
  photos: { id: string }[];
  catalogueImageUrl?: string;
};
export function PublicProductDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const opener = useRef(document.activeElement as HTMLElement | null);
  const [product, setProduct] = useState<Product | null>(null),
    [error, setError] = useState(''),
    [copyStatus, setCopyStatus] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    setProduct(null);
    setError('');
    setCopyStatus('');
    return publicRealtime.subscribe<Product | null>(
      'operations:publicProduct',
      { itemId: id },
      (value) => {
        setProduct(value);
        setError(value ? '' : 'Cet article n’est plus disponible.');
      },
      () => {
        setError('La fiche ne peut pas être chargée.');
      },
    );
  }, [id, retry]);
  const images = product
    ? [
        ...product.photos.map(
          (p) => `${API}/catalogue/${encodeURIComponent(id)}/photos/${encodeURIComponent(p.id)}`,
        ),
        ...(!product.photos.length && product.catalogueImageUrl ? [product.catalogueImageUrl] : []),
      ]
    : [];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="product-detail-dialog"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus();
        }}
      >
        <DialogTitle>{product?.name ?? 'Fiche produit'}</DialogTitle>
        <DialogDescription>
          Photos, caractéristiques et disponibilité. La consultation ne réserve pas l’article.
        </DialogDescription>
        {error ? (
          <div role="alert">
            <p>{error}</p>
            <Button variant="secondary" onClick={() => setRetry((x) => x + 1)}>
              Réessayer
            </Button>
          </div>
        ) : !product ? (
          <div className="product-detail-grid" aria-busy="true">
            <div className="product-gallery-main" aria-hidden="true" />
            <p role="status">Chargement de la fiche…</p>
          </div>
        ) : (
          <div className="product-detail-grid">
            <ProductGallery key={id} name={product.name} images={images} />
            <div>
              <p className="product-detail-price">
                {product.salePriceCents === undefined ? 'Ouvert aux offres' : new Intl.NumberFormat('fr-BE', {
                  style: 'currency',
                  currency: shopCurrency,
                }).format(product.salePriceCents / 100)}
              </p>
              <p role="status">
                {product.quantity > 0
                  ? `${product.quantity} disponible${product.quantity > 1 ? 's' : ''}`
                  : 'Indisponible'}
              </p>
              <p className="product-description">
                {product.description || 'Aucune description complémentaire.'}
              </p>
              <dl>
                {[
                  ['Série', product.series],
                  ['Variante', product.variant],
                  ['Numéro', product.identifier],
                  ['Langue', product.language],
                  ['État', product.condition],
                  [
                    'Gradation',
                    [product.gradingCompany, product.gradingGrade].filter(Boolean).join(' '),
                  ],
                  ['Certificat', product.gradingCertificate],
                ].map(([label, value]) =>
                  value ? (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{label === 'État' ? <span className="condition-badge" data-condition={value}>{value}</span> : value}</dd>
                    </div>
                  ) : null,
                )}
                {Object.entries(product.publicAttributes ?? {}).map(([key, value]) => (
                  <div key={`public-${key}`}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="actions">
                <Button asChild><a href="/boutique">Contacter la boutique</a></Button>
                <Button variant="secondary" onClick={async () => {
                  const reference = `${product.name}${product.identifier ? ` · ${product.identifier}` : ''} — Référence ${id}`;
                  try { await navigator.clipboard.writeText(reference); setCopyStatus('Référence copiée.'); }
                  catch { setCopyStatus(`Copie indisponible. Référence : ${reference}`); }
                }}>Copier la référence</Button>
              </div>
              <p role="status">{copyStatus}</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
