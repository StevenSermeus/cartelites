import { useState } from 'react';
type Photo = { _id: string; filename: string; contentType?: string };
export function ItemThumbnail({ name, catalogueImageUrl, photos, apiBase }: { name: string; catalogueImageUrl?: string; photos?: Photo[]; apiBase: string }) {
  const sources = [...(photos ?? []).filter(photo => photo.contentType?.startsWith('image/') || /\.(jpe?g|png|webp|heic|avif)$/i.test(photo.filename)).map(photo => `${apiBase}/attachments/${encodeURIComponent(photo._id)}/download`), ...(catalogueImageUrl ? [catalogueImageUrl] : [])];
  const [failed, setFailed] = useState<string[]>([]);
  const src = sources.find(source => !failed.includes(source));
  return <div className="item-thumbnail">{src ? <img src={src} alt={name} loading="lazy" onError={() => setFailed(previous => [...previous, src])} /> : <span role="img" aria-label={`Photo indisponible : ${name}`}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m4 18 5-5 4 4 3-3 5 5"/></svg><small>Sans photo</small></span>}</div>;
}
