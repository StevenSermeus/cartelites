import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'tcg-marge.session.jwt';
export type AuthMode = 'login' | 'register';
export type SessionResult = { accessToken: string; expiresIn: number; id: string };
const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');

export function getApiBaseUrl() {
  return apiBaseUrl;
}
export async function readSession(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
export async function revokeSession(): Promise<boolean> {
  const [token, baseUrl] = await Promise.all([readSession(), Promise.resolve(apiBaseUrl)]);
  if (!token || !baseUrl) return false;
  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}
export async function authenticate(mode: AuthMode, email: string, password: string): Promise<void> {
  if (!apiBaseUrl) throw new Error('EXPO_PUBLIC_API_URL n’est pas configurée.');
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl}/api/v1/auth/${mode === 'register' ? 'register' : 'login'}`,
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
  await SecureStore.setItemAsync(TOKEN_KEY, payload.accessToken, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function requestPasswordReset(email: string): Promise<void> {
  if (!apiBaseUrl) throw new Error('EXPO_PUBLIC_API_URL n’est pas configurée.');
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/password-reset/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  if (response.status === 503) throw new Error('L’envoi des e-mails n’est pas configuré.');
  if (!response.ok) throw new Error('La demande de réinitialisation a échoué.');
}
