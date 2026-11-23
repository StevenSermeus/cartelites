/** Set labels are shared by imported/manual stock and the public catalogue.
 * Older OpenRift imports appended printing variants to the extension label.
 * Keep those variants on the product; group them only for series filtering.
 */
export type SeriesItem = { series?: string; tcg?: string; productType?: string };
export function seriesLabel(item: SeriesItem): string {
  const label = item.series?.trim() ?? '';
  return item.tcg === 'riftbound' ? label.split(' · ')[0].trim() : label;
}
export const seriesKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr');
export function matchesSeries(item: SeriesItem, series?: string): boolean {
  return !series || seriesKey(seriesLabel(item)) === seriesKey(series);
}
export function itemTcg(item: SeriesItem): string {
  return item.tcg ?? ((item.productType ?? 'card') === 'card' ? 'pokemon' : 'other');
}
export function seriesOptions(items: readonly SeriesItem[], tcg?: string): string[] {
  const labels = new Map<string, string>();
  for (const item of items) {
    if (tcg && tcg !== 'all' && itemTcg(item) !== tcg) continue;
    const label = seriesLabel(item);
    if (label && !labels.has(seriesKey(label))) labels.set(seriesKey(label), label);
  }
  return [...labels.values()].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' }));
}
