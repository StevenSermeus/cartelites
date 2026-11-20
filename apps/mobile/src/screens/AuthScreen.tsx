import { useTheme, type ThemeColors } from '../theme/ThemeProvider';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { type AuthMode, authenticate, getApiBaseUrl, requestPasswordReset } from '../auth/session';
import { Field } from '../components/Field';

export function AuthScreen({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

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
      <Text style={[{ color: colors.text }, styles.title]}>
        {mode === 'login' ? 'Connexion' : 'Créer un compte'}
      </Text>
      <Text style={[{ color: colors.text }, styles.note]}>
        Une connexion Internet est nécessaire pour ouvrir une session.
      </Text>
      {!getApiBaseUrl() && (
        <Text accessibilityRole="alert" style={[{ color: colors.text }, styles.error]}>
          Configurez EXPO_PUBLIC_API_URL pour activer la connexion.
        </Text>
      )}
      <Field
        label="Adresse e-mail"
        keyboardType="email-address"
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
        <Text accessibilityRole="alert" style={[{ color: colors.text }, styles.error]}>
          {error}
        </Text>
      )}
      {resetRequested && (
        <Text style={[{ color: colors.text }, styles.note]}>
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
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={[{ color: colors.text }, styles.primaryText]}>
            {mode === 'login' ? 'Se connecter' : 'Créer le compte'}
          </Text>
        )}
      </Pressable>
      {mode === 'login' ? (
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void requestReset()}>
          <Text style={[{ color: colors.text }, styles.switchText]}>Mot de passe oublié ?</Text>
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
        <Text style={[{ color: colors.text }, styles.switchText]}>
          {mode === 'login' ? 'Créer un compte' : 'J’ai déjà un compte'}
        </Text>
      </Pressable>
    </View>
  );
}
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      padding: 18,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 20,
    },
    title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 8 },
    note: { color: colors.secondary, lineHeight: 21, marginBottom: 16 },
    error: { color: colors.danger, marginBottom: 12, lineHeight: 20 },
    primary: {
      backgroundColor: colors.accent,
      padding: 14,
      alignItems: 'center',
      borderRadius: 9,
      marginTop: 5,
    },
    primaryText: { color: colors.onAccent, fontWeight: '700' },
    switch: { padding: 14, alignItems: 'center' },
    switchText: { color: colors.accent, fontWeight: '600' },
  });
