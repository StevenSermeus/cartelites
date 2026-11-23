import { createRealtime, RealtimeAuthError, type Connection } from '@tcg-marge/realtime';
import { instanceFetch, onSessionInvalidated } from '../auth/session';
export const realtime = createRealtime(async () => {
  const response = await instanceFetch('/auth/realtime', {}, true);
  if (response.status === 401 || response.status === 403) throw new RealtimeAuthError(response.status);
  if (!response.ok) throw new Error('Connexion temps réel indisponible.');
  return response.json() as Promise<Connection>;
});
onSessionInvalidated(() => realtime.reset());
