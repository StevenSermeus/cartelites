import { browseArgs } from '@tcg-marge/realtime';
import { realtime } from './realtime';
import { useEffect, useState, type ReactNode } from 'react';
const emptyItems: never[] = [];
type Page<T> = { items: T[]; nextCursor: string | null; isDone: boolean };
export function useReadPage<T>(request: <R>(path: string) => Promise<R>, path: string, params: Record<string, string>, enabled: boolean, revision = 0) {
  const key = JSON.stringify([path, params]);
  const [navigation, setNavigation] = useState<{ key: string; cursors: (string | undefined)[] }>({ key, cursors: [undefined] });
  const cursors = navigation.key === key ? navigation.cursors : [undefined];
  const cursor = cursors[cursors.length - 1];
  const [result, setResult] = useState<{ key: string; cursor?: string; page: Page<T> }>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const page = result?.key === key && result.cursor === cursor ? result.page : undefined;
  useEffect(() => {
    if (!enabled) { setResult(undefined); return; }
    let active = true;
    setBusy(true); setError('');
    let unsubscribe: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      unsubscribe = realtime.subscribe<Page<T>>('readModels:browse', browseArgs(path, { ...params, cursor }), value => {
        if (active) { setResult({ key, cursor, page: value }); setBusy(false); setError(''); }
      }, e => { if (active) { setError(e.message); setResult(undefined); setBusy(false); } });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); unsubscribe?.(); };
  }, [key, cursor, enabled, revision, retry, request]);
  return { items: page?.items ?? emptyItems, busy, error, number: cursors.length,
    hasPrevious: cursors.length > 1, hasNext: !!page?.nextCursor,
    previous: () => setNavigation({ key, cursors: cursors.slice(0, -1) }),
    next: () => { if (page?.nextCursor) setNavigation({ key, cursors: [...cursors, page.nextCursor] }); },
    reload: () => setRetry(v => v + 1) };
}
export function ReadPagination({ data, emptyState }: { data: ReturnType<typeof useReadPage>; emptyState?: ReactNode }) {
  return <div aria-live="polite">
    {data.busy && <p role="status">Chargement…</p>}
    {data.error && <p className="error" role="alert">{data.error} <button onClick={data.reload}>Réessayer</button></p>}
    {!data.busy && !data.error && !data.items.length && (emptyState !== undefined ? emptyState : <p>{data.hasNext ? 'Aucun résultat dans cette page. Poursuivez la recherche avec Suivant.' : 'Aucun résultat.'}</p>)}
    <nav className="purchase-result-pages" aria-label="Pagination des résultats">
      <button className="secondary" disabled={data.busy || !data.hasPrevious} onClick={data.previous}>Précédent</button>
      <span>Page {data.number}</span>
      <button className="secondary" disabled={data.busy || !data.hasNext} onClick={data.next}>Suivant</button>
    </nav>
  </div>;
}
