import { browseArgs } from '@tcg-marge/realtime';
import { realtime } from './realtime';
import {getSessionScope} from '../auth/session';
import { useEffect, useMemo, useState } from 'react';
import { type ReadPage } from './apiRepository';
import {visiblePage} from './pagedSnapshot';

export function usePagedData<T>(path: string, params: Record<string, string | number | undefined>, enabled = true, revision = 0) {
  const key = JSON.stringify([getSessionScope(),path, params]);
  const [position, setPosition] = useState<{ key: string; cursors: (string | undefined)[] }>({ key, cursors: [undefined] });
  const cursors = position.key === key ? position.cursors : [undefined];
  const cursor = cursors.at(-1);
  const [result, setResult] = useState<{ key: string; cursor?: string; page: ReadPage<T> }>({ key: '', page: { items: [], nextCursor: null, isDone: true } });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    // Keep the same scoped page mounted behind a native detail/basket route.
    // A new session/query key remains invisible through `current` below.
    if (!enabled) { setLoading(false); return; }
    setLoading(true); setError('');
    let unsubscribe: (() => void) | undefined;
    const timer = setTimeout(() => {
      unsubscribe = realtime.subscribe<ReadPage<T>>('readModels:browse', browseArgs(path, { ...params, cursor }), page => {
        if (active) { setResult({ key, cursor, page }); setLoading(false); setError(''); }
      }, e => { if (active) { setResult({ key, cursor, page: { items: [], nextCursor: null, isDone: true } }); setError(e.message); setLoading(false); } });
    }, 250);
    return () => { active = false; clearTimeout(timer); unsubscribe?.(); };
  }, [key, cursor, enabled, revision, retry]);
  const current = useMemo(() => visiblePage(result,key,cursor), [result, key, cursor]);
  return { ...current, loading, error, page: cursors.length, hasPrevious: cursors.length > 1,
    previous: () => setPosition({ key, cursors: cursors.slice(0, -1) }),
    next: () => { if (current.nextCursor) setPosition({ key, cursors: [...cursors, current.nextCursor] }); },
    reload: () => setRetry(r => r + 1) };
}
