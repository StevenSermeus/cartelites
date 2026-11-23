import { useState } from 'react';
import { Button } from './components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './components/ui/dialog';

/** Selection follows the photo identity when realtime updates reorder or remove photos. */
export function ProductGallery({ name, images }: { name: string; images: string[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const current = selected && images.includes(selected) ? selected : images[0];
  const index = current ? images.indexOf(current) : -1;
  const move = (direction: number) => {
    if (images.length) setSelected(images[(index + direction + images.length) % images.length]);
  };
  const picture = () => current && !failed.has(current) ? (
    <img key={current} src={current} alt={`${name}, vue ${index + 1}`}
      onError={() => setFailed(previous => new Set(previous).add(current))} />
  ) : <span>Image indisponible</span>;

  return <div className="product-gallery">
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="product-gallery-main product-gallery-open"
          aria-label={`Agrandir la photo de ${name}`} disabled={!current}>
          {picture()}
          {current && <span className="product-gallery-hint">Agrandir</span>}
        </button>
      </DialogTrigger>
      <DialogContent className="product-photo-dialog" onKeyDown={event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          move(event.key === 'ArrowLeft' ? -1 : 1);
        }
      }}>
        <DialogTitle>{name}</DialogTitle>
        <DialogDescription>Photos du produit. Utilisez les flèches pour changer de vue.</DialogDescription>
        <div className="product-photo-enlarged">{picture()}</div>
        <div className="product-photo-navigation">
          <Button variant="secondary" disabled={images.length < 2} onClick={() => move(-1)} aria-label="Photo précédente">←</Button>
          <span role="status">{images.length ? `Photo ${index + 1} sur ${images.length}` : 'Aucune photo disponible'}</span>
          <Button variant="secondary" disabled={images.length < 2} onClick={() => move(1)} aria-label="Photo suivante">→</Button>
        </div>
        {current && failed.has(current) && <Button variant="secondary" onClick={() => setFailed(previous => {
          const next = new Set(previous); next.delete(current); return next;
        })}>Réessayer de charger la photo</Button>}
      </DialogContent>
    </Dialog>
    <div className="product-gallery-thumbs" role="group" aria-label="Photos du produit">
      {images.map((url, position) => <Button key={url}
        variant={url === current ? 'default' : 'secondary'} aria-pressed={url === current}
        aria-label={`Afficher la photo ${position + 1}`} onClick={() => setSelected(url)}>
        {position + 1}
      </Button>)}
    </div>
  </div>;
}
