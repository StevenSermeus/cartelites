import { createRealtime, RealtimeAuthError, type Connection } from '@tcg-marge/realtime';
const base = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
export const API = base.endsWith('/api/v1') ? base : `${base}/api/v1`;
async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, { credentials: 'include', cache: 'no-store' });
  if (response.status === 401 || response.status === 403) throw new RealtimeAuthError(response.status);
  if (!response.ok) throw new Error('Connexion temps réel indisponible.');
  return response.json();
}
export const realtime = createRealtime(() => get<Connection>('/auth/realtime'));
export const publicRealtime = createRealtime(async () => ({ url: (await get<{ convexUrl: string }>('/instance')).convexUrl }));
