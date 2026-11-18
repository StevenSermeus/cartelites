/** Public OpenRift catalog. Keep one response for at least one hour per app session. */
export type Tcg = 'pokemon' | 'riftbound';
export type RiftCard = {
  id: string; localId: string; name: string; image?: string; setName: string;
  language: 'fr' | 'en'; availableLanguages: ('fr' | 'en')[];
};
export type RiftCatalog = {
  cards: Record<string, { name: string }>;
  sets: { id: string; name: string }[];
  printings: Record<string, {
    cardId: string; setId: string; language: string; printedName?: string | null;
    publicCode: string; shortCode: string; images: { imageId: string }[];
    artVariant: string; finish: string; isSigned: boolean;
  }>;
};
export function searchRiftCatalog(catalog: RiftCatalog, term: string): RiftCard[] {
  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const words = normalize(term).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const sets = new Map(catalog.sets.map(s => [s.id, s.name]));
  return Object.entries(catalog.printings).flatMap(([id, p]): RiftCard[] => {
    if (p.language !== 'EN' && p.language !== 'FR') return [];
    const card = catalog.cards[p.cardId];
    if (!card) return [];
    const name = p.printedName || card.name;
    const setName = sets.get(p.setId) || '';
    const text = normalize([name, card.name, p.publicCode, p.shortCode, setName].join(' '));
    if (!words.every(w => text.includes(w))) return [];
    const language = p.language === 'FR' ? 'fr' : 'en';
    const variant = [p.artVariant !== 'normal' ? p.artVariant : '', p.finish !== 'normal' ? p.finish : '', p.isSigned ? 'Signée' : ''].filter(Boolean).join(' · ');
    return [{ id, name, localId: p.publicCode, setName: [setName, variant].filter(Boolean).join(' · '),
      language, availableLanguages: [language],
      image: p.images[0] ? `https://openrift.app/media/cards/${p.images[0].imageId}-400w.webp` : undefined }];
  }).sort((a,b) => a.name.localeCompare(b.name) || a.localId.localeCompare(b.localId) || a.language.localeCompare(b.language));
}
let cached: { data: RiftCatalog; at: number } | undefined;
let pending: Promise<RiftCatalog> | undefined;
export async function searchRiftbound(term: string): Promise<RiftCard[]> {
  if (!cached || Date.now() - cached.at >= 3_600_000) {
    pending ??= fetch('https://openrift.app/api/v1/catalog?langs=EN,FR')
      .then(async response => {
        if (!response.ok) throw new Error('Catalogue Riftbound indisponible. Réessayez plus tard.');
        const data = await response.json() as RiftCatalog;
        if (!data.cards || !data.printings || !Array.isArray(data.sets)) throw new Error('Format du catalogue Riftbound invalide.');
        cached = { data, at: Date.now() };
        return data;
      }).finally(() => { pending = undefined; });
    await pending;
  }
  return searchRiftCatalog(cached!.data, term);
}
export const tcgLabel = (tcg?: Tcg) => tcg === 'riftbound' ? 'Riftbound' : 'Pokémon';
export const matchesTcg = (tcg: Tcg | undefined, filter: Tcg | 'all') => filter === 'all' || (tcg ?? 'pokemon') === filter;
