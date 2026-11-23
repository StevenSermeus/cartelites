import { useTheme, type ThemeColors } from '../theme/ThemeProvider';
import { useEffect,useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { type AuthMode, authenticate, getApiBaseUrl, requestPasswordReset,instanceFetch } from '../auth/session';
import {loadAuthAvailability} from '../data/authAvailability';
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
  const [signupEnabled,setSignupEnabled]=useState(false),[availabilityLoading,setAvailabilityLoading]=useState(true),[availabilityError,setAvailabilityError]=useState(''),[availabilityRetry,setAvailabilityRetry]=useState(0);
  const instance=getApiBaseUrl();
  useEffect(()=>{
    let current=true;setSignupEnabled(false);setAvailabilityLoading(true);setAvailabilityError('');setMode('login');
    void loadAuthAvailability(()=>instanceFetch('/auth/status',{},false)).then(enabled=>{if(current)setSignupEnabled(enabled);}).catch(reason=>{if(current)setAvailabilityError(reason instanceof Error?reason.message:'Vérification des inscriptions impossible.');}).finally(()=>{if(current)setAvailabilityLoading(false);});
    return ()=>{current=false;};
  },[instance,availabilityRetry]);
  const submit = async () => {
    if(mode==='register'&&!signupEnabled){setError('Les inscriptions ne sont pas ouvertes sur cette instance.');return;}
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
          Sélectionnez une instance pour activer la connexion.
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
      {availabilityLoading&&<Text accessibilityLiveRegion="polite" style={styles.note}>Vérification des inscriptions…</Text>}
      {!!availabilityError&&<View style={{gap:8}}><Text accessibilityRole="alert" style={styles.error}>{availabilityError}</Text><Pressable accessibilityRole="button" onPress={()=>setAvailabilityRetry(value=>value+1)} style={{minHeight:44,justifyContent:'center'}}><Text style={styles.switchText}>Réessayer la vérification des inscriptions</Text></Pressable></View>}
      {!availabilityLoading&&!availabilityError&&!signupEnabled&&<Text style={styles.note}>Les inscriptions sont fermées. Utilisez un compte existant.</Text>}
      {signupEnabled&&<Pressable
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
      </Pressable>}
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
