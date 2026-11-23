import { useTheme } from '../theme/ThemeProvider';
import { useEffect, useState } from 'react';
import { Text, View, Pressable, Alert, ActivityIndicator } from 'react-native';
import type { SignatoryProfile } from '../../../../packages/domain/src/consignmentReceipt';
import { request } from '../data/apiRepository';
import { SignaturePad } from './SignaturePad';
import { Field } from './Field';
export function SignatorySettings({
  onEditingChange,
}: {
  onEditingChange?: (editing: boolean) => void;
}) {
  const { colors, shopName } = useTheme();

  const [saved, setSaved] = useState<SignatoryProfile>({
    firstName: '',
    lastName: '',
    capacity: '',
  });
  const [profile, setProfile] = useState(saved);
  const [loading, setLoading] = useState(true),
    [editing, setEditing] = useState(false),
    [message, setMessage] = useState(''),
    [failed, setFailed] = useState(false);
  async function load() {
    setLoading(true);
    setFailed(false);
    setMessage('');
    try {
      const p = await request<SignatoryProfile>('/auth/profile');
      setSaved(p);
      setProfile(p);
    } catch {
      setFailed(true);
      setMessage('Impossible de charger le signataire.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    onEditingChange?.(editing);
    return () => onEditingChange?.(false);
  }, [editing, onEditingChange]);
  async function save() {
    setLoading(true);
    setMessage('');
    try {
      const p = await request<SignatoryProfile>('/auth/profile', profile, 'PATCH');
      setSaved(p);
      setProfile(p);
      setEditing(false);
      setMessage('Signataire et signature enregistrés.');
    } catch {
      setMessage('Enregistrement impossible. Vérifiez les informations et réessayez.');
    } finally {
      setLoading(false);
    }
  }
  const button = (label: string, action: () => void) => (
    <Pressable
      disabled={loading}
      accessibilityRole="button"
      onPress={action}
      style={{ padding: 14, borderRadius: 14, backgroundColor: colors.accentSoft }}
    >
      <Text style={[{ color: colors.text }, { color: colors.accent, fontWeight: '600' }]}>
        {label}
      </Text>
    </Pressable>
  );
  return (
    <View
      style={{
        gap: 12,
        marginBottom: 12,
      }}
    >
      {editing && (
        <Text style={[{ color: colors.text }, { fontSize: 21, fontWeight: '700' }]}>
          Modifier mon signataire
        </Text>
      )}
      {loading && <ActivityIndicator />}
      {failed ? (
        button('Réessayer', () => void load())
      ) : editing ? (
        <>
          {(['firstName', 'lastName', 'capacity'] as const).map((key, i) => (
            <Field
              key={key}
              label={['Prénom', 'Nom', 'Qualité / fonction'][i]}
              value={profile[key]}
              editable={!loading}
              onChangeText={(v) => setProfile({ ...profile, [key]: v })}
            />
          ))}
          <SignaturePad
            label="Ma signature"
            value={profile.signature ?? []}
            onChange={(signature) =>
              setProfile({
                ...profile,
                signature: signature.length ? signature : null,
              })
            }
            disabled={loading}
          />
          <Text style={{ color: colors.text }}>
            Cette signature sera proposée pour vos documents. Vous confirmerez chaque utilisation.
          </Text>
          {button('Enregistrer', () => void save())}
          {button('Annuler', () => {
            const discard = () => {
              setProfile(saved);
              setEditing(false);
            };
            if (JSON.stringify(saved) !== JSON.stringify(profile))
              Alert.alert(
                'Abandonner les modifications ?',
                'Votre signature enregistrée sera conservée.',
                [
                  { text: 'Continuer', style: 'cancel' },
                  {
                    text: 'Abandonner',
                    style: 'destructive',
                    onPress: discard,
                  },
                ],
              );
            else discard();
          })}
        </>
      ) : (
        <>
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 15,
              paddingVertical: 14,
              paddingHorizontal: 15,
              gap: 4,
            }}
          >
            <Text
              style={[
                { color: colors.text },
                { fontSize: 15, fontWeight: '600', color: colors.text },
              ]}
            >
              {[saved.firstName, saved.lastName].filter(Boolean).join(' ') ||
                'Signataire à configurer'}
            </Text>
            <Text style={[{ color: colors.text }, { fontSize: 12, color: colors.secondary }]}>
              {shopName}{saved.capacity ? ` · ${saved.capacity}` : ''}
            </Text>
          </View>
          <Text
            style={[
              { color: colors.text },
              {
                fontSize: 12,
                color: colors.secondary,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                marginTop: 8,
                marginHorizontal: 14,
              },
            ]}
          >
            Ma signature
          </Text>
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 16,
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 4,
              alignItems: 'stretch',
            }}
          >
            {!!saved.signature?.length && (
              <SignaturePad label="" value={saved.signature} onChange={() => {}} readOnly />
            )}
            <Text
              style={[
                { color: colors.text },
                {
                  fontSize: 13,
                  color: colors.secondary,
                  textAlign: 'center',
                  marginTop: 4,
                },
              ]}
            >
              {saved.signature?.length
                ? 'Enregistrée · confirmation à chaque document'
                : 'Ajoutez votre signature pour les prochains documents'}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={loading}
              onPress={() => setEditing(true)}
              style={{
                minHeight: 44,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text style={[{ color: colors.text }, { fontSize: 14, color: colors.accent }]}>
                Modifier mon signataire
              </Text>
            </Pressable>
          </View>
        </>
      )}
      {!!message && (
        <Text accessibilityRole="alert" style={{ color: colors.text }}>
          {message}
        </Text>
      )}
    </View>
  );
}
