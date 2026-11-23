import type {
  MarketListing,
  MarketMoney,
  MarketPriceQuery,
  MarketPriceResult,
  MatchEvidence,
} from '../generated/marketPrices.js';
export type FetchLike = typeof fetch;
/** Validated provider page retained independently of client-side match criteria. */
export type ProviderPage = {
  provider: 'gcc' | 'vinted' | 'ebay' | 'cardmarket';
  body: unknown;
  receivedAt: number;
};
export type RetainProviderPage = (page: ProviderPage) => void;
export class ProviderError extends Error {
  constructor(readonly kind: 'timeout' | 'access' | 'rate_limit' | 'unavailable' | 'schema') {
    super(kind);
  }
}
export async function fetchJson(
  fetcher: FetchLike,
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<{ response: Response; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      ...init,
      signal: controller.signal,
      redirect: 'error',
    });
    if (response.status === 401 || response.status === 403) throw new ProviderError('access');
    if (response.status === 429) throw new ProviderError('rate_limit');
    if (!response.ok) throw new ProviderError('unavailable');
    const reader = response.body?.getReader();
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    if (!reader) throw new ProviderError('schema');
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > 2_000_000) {
        await reader.cancel();
        throw new ProviderError('schema');
      }
      chunks.push(part.value);
    }
    const joined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return { response, body: JSON.parse(new TextDecoder().decode(joined)) };
    } catch {
      throw new ProviderError('schema');
    }
  } catch (error) {
    if (controller.signal.aborted) throw new ProviderError('timeout');
    if (error instanceof ProviderError) throw error;
    throw new ProviderError('unavailable');
  } finally {
    clearTimeout(timer);
  }
}
export const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const string = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
export const date = (value: unknown): string | null =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
export const integer = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
export function moneyMinor(value: unknown, currency: unknown): MarketMoney | null {
  const amountMinor = integer(value);
  return amountMinor !== null && typeof currency === 'string' && /^[A-Z]{3}$/.test(currency)
    ? { amountMinor, currency }
    : null;
}
export function money(value: unknown): MarketMoney | null {
  const row = object(value);
  if (typeof row.amount !== 'number' || !Number.isFinite(row.amount) || row.amount < 0) return null;
  const minor = Math.round(row.amount * 100);
  if (Math.abs(row.amount * 100 - minor) > 1e-6) return null;
  return moneyMinor(minor, row.currency);
}
export function safeUrl(value: unknown, hosts: readonly string[]): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !hosts.some((host) => url.hostname === host || url.hostname.endsWith('.' + host))
    )
      return null;
    return url.toString();
  } catch {
    return null;
  }
}
const normalize = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const languages: Record<string, string> = {
  french: 'fr',
  français: 'fr',
  english: 'en',
  anglais: 'en',
  japanese: 'ja',
  japonais: 'ja',
  chinese: 'zh',
  chinois: 'zh',
  german: 'de',
  allemand: 'de',
  spanish: 'es',
  espagnol: 'es',
  italian: 'it',
  italien: 'it',
};
export const languageCode = (value: string) => languages[normalize(value)] ?? normalize(value);
const compare = (
  expected: string | undefined,
  actual: string | null,
  normalizer = normalize,
): MatchEvidence =>
  !expected || !actual
    ? 'unknown'
    : normalizer(expected) === normalizer(actual)
      ? 'match'
      : 'mismatch';
export const evidence = (
  query: MarketPriceQuery,
  row: Pick<MarketListing, 'language' | 'gradingCompany' | 'grade' | 'collectorNumber' | 'setName'>,
): MarketListing['match'] => ({
  language: compare(query.language, row.language, languageCode),
  gradingCompany: compare(query.gradingCompany, row.gradingCompany),
  grade: compare(query.grade, row.grade),
  collectorNumber: compare(query.collectorNumber, row.collectorNumber, (value) =>
    normalize(value).replace(/^#/, ''),
  ),
  setName: compare(query.setName, row.setName),
});
export function baseResult(query: MarketPriceQuery, now: number): MarketPriceResult {
  return {
    source: query.source,
    provider: null,
    query: query.query,
    mode: query.mode ?? 'sold',
    status: 'unavailable',
    listings: [],
    page: query.page ?? 1,
    nextPage: null,
    nextCursor: null,
    fetchedAt: new Date(now).toISOString(),
    cached: false,
    message: 'Source indisponible.',
    limitations: [],
  };
}
export function failure(query: MarketPriceQuery, error: unknown, now: number): MarketPriceResult {
  const result = baseResult(query, now);
  const kind = error instanceof ProviderError ? error.kind : 'unavailable';
  return {
    ...result,
    status: kind === 'access' ? 'access_required' : 'unavailable',
    message:
      kind === 'access'
        ? 'La source demande un accès autorisé.'
        : kind === 'timeout'
          ? 'La source n’a pas répondu dans le délai imparti.'
          : kind === 'rate_limit'
            ? 'La source limite temporairement les requêtes.'
            : kind === 'schema'
              ? 'Le format de la source a changé ; aucun prix non vérifié n’est affiché.'
              : 'La source est temporairement indisponible.',
    ...(kind === 'rate_limit' ? { retryAfterSeconds: 60 } : {}),
  };
}

export function matchSummary(
  match: MarketListing['match'],
): Pick<MarketListing, 'matchConfidence' | 'matchReasons'> {
  const fields: Record<keyof MarketListing['match'], string> = {
    language: 'Langue',
    gradingCompany: 'Société de gradation',
    grade: 'Note',
    collectorNumber: 'Numéro',
    setName: 'Extension',
  };
  const complete = Object.values(match).every((value) => value === 'match');
  return {
    matchConfidence: complete ? 'confirmed' : 'candidate',
    matchReasons: Object.entries(match).map(
      ([key, value]) =>
        `${fields[key as keyof typeof fields]} : ${value === 'match' ? 'correspondance structurée' : value === 'mismatch' ? 'différence à vérifier' : 'non vérifié'}`,
    ),
  };
}
