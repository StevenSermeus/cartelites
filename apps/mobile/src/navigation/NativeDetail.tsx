import {createContext, useContext, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode} from 'react';

type Entry = {id: string; title: string; children: ReactNode; onClose: () => void};
export function createDetailStore() {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  return {
    get: (id: string) => entries.get(id) ?? null,
    subscribe: (listener: () => void) => {listeners.add(listener); return () => {listeners.delete(listener);};},
    set: (value: Entry) => {entries.set(value.id, value); [...listeners].forEach(listener => listener());},
    remove: (id: string) => {entries.delete(id); [...listeners].forEach(listener => listener());},
  };
}
export const DetailContext = createContext<{
  store: ReturnType<typeof createDetailStore>;
  open: (id: string, title: string) => void;
  dismiss: (id: string) => void;
} | null>(null);

/** Portal to a native stack route while the workflow owner retains its local draft state. */
export function NativeDetail({id, title, children, onClose}: Entry) {
  const host = useContext(DetailContext);
  if (!host) throw new Error('NativeDetail requires the native navigation host');
  const close = useRef(onClose); close.current = onClose;
  useLayoutEffect(() => {host.store.set({id, title, children, onClose: () => close.current()});}, [id, title, children, host.store]);
  useEffect(() => {
    host.open(id, title);
    return () => {host.dismiss(id); host.store.remove(id);};
  }, [id]);
  return null;
}
export function NativeDetailScene({route}: {route: {params?: {detailId?: string}}}) {
  const host = useContext(DetailContext)!;
  const entry = useSyncExternalStore(host.store.subscribe, () => host.store.get(route.params?.detailId ?? ''));
  return <>{entry?.children}</>;
}
