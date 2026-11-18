import { ConvexClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import type { Value } from 'convex/values';

export type Connection = { url: string; token?: string };
type Listener = { fail: (error: Error) => void; stop?: () => void };

/** One shared socket per instance/session, released when the last view unmounts. */
export function createRealtime(loadConnection: () => Promise<Connection>, makeClient = (url: string) => new ConvexClient(url)) {
  let pending: Promise<ConvexClient> | undefined;
  let client: ConvexClient | undefined;
  let generation = 0;
  const listeners = new Set<Listener>();
  function close() {
    generation++;
    pending = undefined;
    if (client) void client.close();
    client = undefined;
  }
  function connect() {
    if (!pending) {
      const revision = generation;
      pending = loadConnection().then(config => {
        if (revision !== generation) throw new Error('Connexion annulée.');
        const socket = makeClient(config.url);
        client = socket;
        if (config.token) {
          let first = true;
          socket.setAuth(async () => {
            if (first) { first = false; return config.token!; }
            try {
              const fresh = await loadConnection();
              if (revision !== generation) return null;
              if (fresh.url !== config.url || !fresh.token) throw new Error('La session a changé.');
              return fresh.token;
            } catch (error) {
              if (revision === generation) for (const listener of listeners) listener.fail(asError(error));
              return null;
            }
          }, authenticated => {
            if (!authenticated && revision === generation) {
              for (const listener of listeners) listener.fail(new Error('Session expirée. Reconnectez-vous.'));
            }
          });
        }
        return socket;
      }).catch(error => {
        if (revision === generation) pending = undefined;
        throw error;
      });
    }
    return pending;
  }
  return {
    subscribe<T>(name: string, args: Record<string, Value>, update: (value: T) => void, fail: (error: Error) => void) {
      const listener: Listener = { fail };
      listeners.add(listener);
      void connect().then(socket => {
        if (!listeners.has(listener)) return;
        listener.stop = socket.onUpdate(makeFunctionReference<'query'>(name), args,
          value => { if (listeners.has(listener)) update(value as T); },
          error => { if (listeners.has(listener)) fail(error); });
      }).catch(error => { if (listeners.has(listener)) fail(asError(error)); });
      return () => {
        listener.stop?.();
        listeners.delete(listener);
        if (!listeners.size) close();
      };
    },
    reset() {
      for (const listener of listeners) {
        listener.stop?.();
        listener.fail(new Error('La session a changé. Reconnectez-vous.'));
      }
      listeners.clear();
      close();
    },
  };
}
function asError(error: unknown) { return error instanceof Error ? error : new Error('Connexion temps réel indisponible.'); }

const resources: Record<string, string> = {
  '/stock': 'stock', '/sellers': 'sellers', '/sales': 'sales', '/purchases': 'purchases',
  '/consignments': 'consignments', '/consignments/balances': 'balances', '/conflicts': 'conflicts',
  '/consignments/payments': 'payments', '/attachments/page': 'attachments', '/consignments/events': 'events',
};
export function browseArgs(path: string, params: Record<string, string | number | undefined>) {
  const resource = resources[path];
  if (!resource) throw new Error(`Lecture temps réel inconnue : ${path}`);
  const args: Record<string, Value> = { resource, size: 25, search: '' };
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) args[key] = ['size', 'from', 'to'].includes(key) ? Number(value) : value;
  }
  return args;
}
