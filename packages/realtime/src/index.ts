import { ConvexClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import type { Value } from 'convex/values';

export type Connection = { url: string; token?: string };
export class RealtimeAuthError extends Error {
  constructor(readonly status: 401 | 403 = 401, message = 'Session expirée. Reconnectez-vous.') {
    super(message); this.name = 'RealtimeAuthError';
  }
}
type Listener = {
  name: string; args: Record<string, Value>; update: (value: unknown) => void;
  fail: (error: Error) => void; stop?: () => void; attached?: number;
};
type RetryOptions = { retryDelayMs?: number; maxRetries?: number };

/** One shared socket per instance/session. Credential outages invalidate the socket,
 * not its mounted views: every retained query is rebound after credentials recover. */
export function createRealtime(loadConnection: () => Promise<Connection>, makeClient = (url: string) => new ConvexClient(url), options: RetryOptions = {}) {
  let pending: Promise<void> | undefined;
  let client: ConvexClient | undefined;
  let generation = 0, retryAttempt = 0;
  let expectedUrl: string | undefined, authBlocked: RealtimeAuthError | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<Listener>();
  const retryDelay = Math.max(1, options.retryDelayMs ?? 500), maxRetries = Math.max(0, options.maxRetries ?? 5);
  function clearRetry() { if (retryTimer !== undefined) clearTimeout(retryTimer); retryTimer = undefined; }
  function closeSocket() {
    generation++; pending = undefined; clearRetry();
    for (const listener of listeners) { listener.stop?.(); listener.stop = undefined; listener.attached = undefined; }
    const old = client; client = undefined;
    if (old) void old.close().catch(() => undefined);
  }
  function failed(error: unknown, revision: number) {
    if (revision !== generation) return;
    const failure = asError(error);
    closeSocket();
    if (failure instanceof RealtimeAuthError) authBlocked = failure;
    for (const listener of listeners) listener.fail(failure);
    if (!authBlocked && listeners.size && retryAttempt < maxRetries) {
      const delay = Math.min(8000, retryDelay * 2 ** retryAttempt++), nextRevision = generation;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        if (generation === nextRevision && listeners.size) connect();
      }, delay);
    }
  }
  function attach(listener: Listener, socket: ConvexClient, revision: number) {
    if (!listeners.has(listener) || revision !== generation || listener.attached === revision) return;
    listener.attached = revision;
    listener.stop = socket.onUpdate(makeFunctionReference<'query'>(listener.name), listener.args,
      value => { if (listeners.has(listener) && generation === revision && client === socket) listener.update(value); },
      error => { if (listeners.has(listener) && generation === revision && client === socket) listener.fail(error); });
  }
  function connect() {
    if (authBlocked || !listeners.size) return;
    if (client) { for (const listener of listeners) attach(listener, client, generation); return; }
    if (pending) return;
    clearRetry();
    const revision = generation;
    pending = loadConnection().then(config => {
      if (revision !== generation || !listeners.size) return;
      if (expectedUrl !== undefined && config.url !== expectedUrl) throw new RealtimeAuthError(401, 'La session a changé. Reconnectez-vous.');
      expectedUrl = config.url;
      const socket = makeClient(config.url); client = socket;
      if (config.token) {
        let first = true;
        socket.setAuth(async () => {
          if (revision !== generation) return null;
          if (first) { first = false; return config.token!; }
          try {
            const fresh = await loadConnection();
            if (revision !== generation) return null;
            if (fresh.url !== config.url || !fresh.token) throw new RealtimeAuthError(401, 'La session a changé. Reconnectez-vous.');
            return fresh.token;
          } catch (error) {
            // Invalidate BEFORE returning null: a subsequent unauthenticated callback
            // belongs to the discarded socket and must not call this a revoked session.
            failed(error, revision); return null;
          }
        }, authenticated => {
          if (!authenticated && revision === generation) failed(new RealtimeAuthError(), revision);
        });
      }
      if (revision !== generation) return;
      retryAttempt = 0;
      for (const listener of listeners) attach(listener, socket, revision);
    }).catch(error => failed(error, revision));
  }
  return {
    subscribe<T>(name: string, args: Record<string, Value>, update: (value: T) => void, fail: (error: Error) => void) {
      const listener: Listener = { name, args, update: value => update(value as T), fail };
      listeners.add(listener);
      if (authBlocked) fail(authBlocked); else connect();
      return () => {
        listener.stop?.(); listeners.delete(listener);
        if (!listeners.size) { closeSocket(); expectedUrl = undefined; authBlocked = undefined; retryAttempt = 0; }
      };
    },
    reset() {
      closeSocket();
      for (const listener of listeners) listener.fail(new RealtimeAuthError(401, 'La session a changé. Reconnectez-vous.'));
      listeners.clear(); expectedUrl = undefined; authBlocked = undefined; retryAttempt = 0;
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
