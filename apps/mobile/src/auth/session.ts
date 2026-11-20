import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'tcg-marge.session.jwt';
const TOKEN_INSTANCE_KEY = 'tcg-marge.session.instance';
export type AuthMode = 'login' | 'register';
export type SessionResult = { accessToken: string; expiresIn: number; id: string };
const INSTANCE_KEY = 'tcg-marge.instance.api-url';
let apiBaseUrl: string | undefined;
let generation = 0;
let foreground = false;
let lastActivity = -Infinity;
export function markUserActivity() { if (foreground) lastActivity = Date.now(); }
export function setSessionForeground(value: boolean) { foreground = value; if (!value) lastActivity = -Infinity; }
function tokenExpiry(token: string): number {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return Number(JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '='))).exp) || 0;
  } catch { return 0; }
}
const requests = new Set<AbortController>();
const invalidationListeners = new Set<() => void>();
export function onSessionInvalidated(listener: () => void) {
  invalidationListeners.add(listener);
  return () => { invalidationListeners.delete(listener); };
}
function invalidateRequests() {
  lastActivity = -Infinity;
  for (const listener of invalidationListeners) listener();
  generation++;
  for (const request of requests) request.abort();
  requests.clear();
}
export async function instanceFetch(path: string, init: RequestInit = {}, authenticated = false): Promise<Response> {
  const base = apiBaseUrl, revision = generation;
  if (!base) throw new Error('Configurez l’adresse de votre instance.');
  const token = authenticated ? await readSession() : null;
  if (base !== apiBaseUrl || revision !== generation) throw new Error('L’instance a changé.');
  if (authenticated && !token) throw new Error('Votre session a expiré. Reconnectez-vous.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  requests.add(controller);
  try {
    const response = await fetch(`${base}/api/v1${path}`, { ...init, redirect: 'error', signal: controller.signal,
      headers: { ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(authenticated && foreground && Date.now() - lastActivity < 60_000 ? { 'X-Session-Activity': '1' } : {}) } });
    // React Native's Response(ArrayBuffer).text() can interpret UTF-8 bytes as Latin-1.
    // Decode JSON through the original native response; preserve bytes for attachments.
    const body = response.status === 204 ? null :
      response.headers.get('content-type')?.includes('application/json')
        ? await response.text() : await response.arrayBuffer();
    if (base !== apiBaseUrl || revision !== generation) throw new Error('L’instance a changé.');
    const replacement = response.headers.get('X-Access-Token');
    if (authenticated && replacement) {
      const current = await readSession();
      if (base === apiBaseUrl && revision === generation && current && tokenExpiry(replacement) > tokenExpiry(current)) {
        await SecureStore.setItemAsync(TOKEN_KEY, replacement, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
        if (base !== apiBaseUrl || revision !== generation) {
          if (await SecureStore.getItemAsync(TOKEN_KEY) === replacement) await SecureStore.deleteItemAsync(TOKEN_KEY);
          throw new Error('La session a changé.');
        }
      }
    }
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } finally { clearTimeout(timeout); requests.delete(controller); }
}

export function normalizeApiUrl(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('Saisissez une URL d’API valide.'); }
  if (url.username || url.password || url.search || url.hash) throw new Error('L’URL ne peut contenir ni identifiants, ni paramètres, ni fragment.');
  const local = ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && __DEV__ && local)) throw new Error('Une URL HTTPS est requise (HTTP est réservé au développement local).');
  return url.toString().replace(/\/+$/, '').replace(/\/api\/v1$/, '');
}

export async function readInstanceUrl(): Promise<string | null> {
  const saved = await SecureStore.getItemAsync(INSTANCE_KEY);
  apiBaseUrl = saved ? normalizeApiUrl(saved) : undefined;
  return apiBaseUrl ?? null;
}
export async function saveInstanceUrl(input: string): Promise<void> {
  const normalized = normalizeApiUrl(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try { response = await fetch(`${normalized}/api/v1/instance`, { redirect: 'error', signal: controller.signal }); }
  finally { clearTimeout(timeout); }
  const data = await response.json().catch(() => null) as { service?: string; apiVersion?: number } | null;
  if (!response.ok || data?.service !== 'tcg-marge-api' || data.apiVersion !== 1) throw new Error('Cette adresse ne correspond pas à une API TVA sur marge compatible.');
  await SecureStore.setItemAsync(INSTANCE_KEY, normalized);
  invalidateRequests();
  apiBaseUrl = normalized;
}

export function getApiBaseUrl() {
  return apiBaseUrl;
}
export async function readSession(): Promise<string | null> {
  const [token, origin] = await Promise.all([SecureStore.getItemAsync(TOKEN_KEY), SecureStore.getItemAsync(TOKEN_INSTANCE_KEY)]);
  return origin === apiBaseUrl ? token : null;
}
export async function clearSession(): Promise<void> {
  invalidateRequests();
  await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY), SecureStore.deleteItemAsync(TOKEN_INSTANCE_KEY)]);
}
export async function changeInstance(input: string): Promise<void> {
  const next = normalizeApiUrl(input);
  if (next !== apiBaseUrl) await clearSession();
  await saveInstanceUrl(next);
}
export async function revokeSession(): Promise<boolean> {
  lastActivity = -Infinity;
  const [token, baseUrl] = await Promise.all([readSession(), Promise.resolve(apiBaseUrl)]);
  if (!token || !baseUrl) return false;
  try {
    const response = await instanceFetch('/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }, true);
    return response.ok;
  } catch {
    return false;
  }
}
export async function authenticate(mode: AuthMode, email: string, password: string): Promise<void> {
  if (!apiBaseUrl) throw new Error('Configurez l’adresse de votre instance.');
  const base = apiBaseUrl, revision = generation;
  let response: Response;
  try {
    response = await instanceFetch(
      `/auth/${mode === 'register' ? 'register' : 'login'}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'ios' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      },
    );
  } catch {
    throw new Error('Serveur injoignable. Vérifiez votre connexion et l’URL de l’API.');
  }
  let payload: Partial<SessionResult> & { error?: string };
  try {
    payload = await response.json();
  } catch {
    throw new Error('Réponse invalide du serveur.');
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 400 || response.status === 409)
      throw new Error('Adresse e-mail ou mot de passe invalide, ou compte déjà existant.');
    throw new Error(payload.error || `Erreur serveur (${response.status}).`);
  }
  if (!payload.accessToken) throw new Error('Le serveur n’a pas retourné de jeton pour iOS.');
  if (base !== apiBaseUrl || revision !== generation) throw new Error('L’instance a changé. Reconnectez-vous.');
  await SecureStore.setItemAsync(TOKEN_KEY, payload.accessToken, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await SecureStore.setItemAsync(TOKEN_INSTANCE_KEY, base);
  markUserActivity();
  if (base !== apiBaseUrl || revision !== generation) { await clearSession(); throw new Error('L’instance a changé. Reconnectez-vous.'); }
}

export async function requestPasswordReset(email: string): Promise<void> {
  if (!apiBaseUrl) throw new Error('Configurez l’adresse de votre instance.');
  const response = await instanceFetch('/auth/password-reset/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  if (response.status === 503) throw new Error('L’envoi des e-mails n’est pas configuré.');
  if (!response.ok) throw new Error('La demande de réinitialisation a échoué.');
}
