import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { type AuthMode, authenticate, getApiBaseUrl, requestPasswordReset } from '../auth/session';
import { Field } from '../components/Field';

export function AuthScreen({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await authenticate(mode, email, password);
      await onAuthenticated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  };
  const requestReset = async () => {
    setBusy(true);
    setError('');
    setResetRequested(false);
    try {
      await requestPasswordReset(email);
      setResetRequested(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La demande a échoué.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{mode === 'login' ? 'Connexion' : 'Créer un compte'}</Text>
      <Text style={styles.note}>
        Une connexion Internet est nécessaire pour ouvrir une session.
      </Text>
      {!getApiBaseUrl() && (
        <Text accessibilityRole="alert" style={styles.error}>
          Configurez EXPO_PUBLIC_API_URL pour activer la connexion.
        </Text>
      )}
      <Field
        label="Adresse e-mail"
        value={email}
        onChangeText={setEmail}
        placeholder="nom@exemple.be"
      />
      <Field
        label="Mot de passe (12 caractères minimum)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {resetRequested && (
        <Text style={styles.note}>
          Si un compte correspond à cette adresse, un lien de réinitialisation vous a été envoyé.
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={busy || !getApiBaseUrl()}
        onPress={submit}
        style={styles.primary}
      >
        {busy ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.primaryText}>
            {mode === 'login' ? 'Se connecter' : 'Créer le compte'}
          </Text>
        )}
      </Pressable>
      {mode === 'login' ? (
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void requestReset()}>
          <Text style={styles.switchText}>Mot de passe oublié ?</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => {
          setMode(mode === 'login' ? 'register' : 'login');
          setError('');
        }}
        style={styles.switch}
      >
        <Text style={styles.switchText}>
          {mode === 'login' ? 'Créer un compte' : 'J’ai déjà un compte'}
        </Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    padding: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e3e8ec',
    marginTop: 20,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#152b3a', marginBottom: 8 },
  note: { color: '#5b6d78', lineHeight: 21, marginBottom: 16 },
  error: { color: '#a12e25', marginBottom: 12, lineHeight: 20 },
  primary: {
    backgroundColor: '#143d59',
    padding: 14,
    alignItems: 'center',
    borderRadius: 9,
    marginTop: 5,
  },
  primaryText: { color: 'white', fontWeight: '700' },
  switch: { padding: 14, alignItems: 'center' },
  switchText: { color: '#164f73', fontWeight: '600' },
});
