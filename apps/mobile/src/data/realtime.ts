import { createRealtime, type Connection } from '@tcg-marge/realtime';
import { instanceFetch, onSessionInvalidated } from '../auth/session';
export const realtime = createRealtime(async () => {
  const response = await instanceFetch('/auth/realtime', {}, true);
  if (!response.ok) throw new Error(response.status === 401 ? 'Session expirée. Reconnectez-vous.' : 'Connexion temps réel indisponible.');
  return response.json() as Promise<Connection>;
});
onSessionInvalidated(() => realtime.reset());
