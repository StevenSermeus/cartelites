import { useState } from 'react';

export function ConventionPhoto({ id, name, hasPhoto, catalogueImageUrl, apiBase }: {
  id: string; name: string; hasPhoto?: boolean; catalogueImageUrl?: string; apiBase: string;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const sources = [
    ...(hasPhoto ? [`${apiBase}/catalogue/${encodeURIComponent(id)}/photo`] : []),
    ...(catalogueImageUrl ? [catalogueImageUrl] : []),
  ];
  const src = sources.find(source => !failed.includes(source));
  return src ? <img className="public-catalogue-image" src={src} alt={`Photo de ${name}`}
    loading="lazy" onError={() => setFailed(previous => [...previous, src])} />
    : <div className="public-catalogue-no-image" aria-label="Image indisponible">Image indisponible</div>;
}
