import {useEffect, useState, useSyncExternalStore} from 'react';
import {captureAccountScope, getSessionScope, onSessionInvalidated} from '../auth/session';
import {realtime} from './realtime';
import {subscribeStockSeries} from './stockSeriesSubscription';

export type SeriesTcg = 'all' | 'pokemon' | 'riftbound' | 'other';
// Invalidation fires before the session generation advances. A separate revision
// immediately hides old labels, including while an editor remains mounted.
let sessionRevision = 0;
const listeners = new Set<() => void>();
onSessionInvalidated(() => { sessionRevision++; for (const listener of listeners) listener(); });
const subscribeSession = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useStockSeries(tcg: SeriesTcg = 'all', includeUnavailable = false, resetVersion = 0) {
  const revision = useSyncExternalStore(subscribeSession, () => sessionRevision);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([getSessionScope(), revision, tcg, includeUnavailable, resetVersion, retry]);
  const [result, setResult] = useState<{key: string; series: string[]; loading: boolean; error: string}>({key: '', series: [], loading: true, error: ''});
  useEffect(() => {
    return subscribeStockSeries(captureAccountScope,
      (value, error) => realtime.subscribe<string[]>('readModels:stockSeries', {tcg, includeUnavailable}, value, error),
      (series, error) => {
        if (revision === sessionRevision) setResult({key, series, loading: false, error});
      });
  }, [key]);
  const visible = result.key === key ? result : {series: [], loading: true, error: ''};
  return {...visible, reload: () => setRetry(value => value + 1)};
}
