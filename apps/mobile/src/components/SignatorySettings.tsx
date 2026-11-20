import { useEffect, useState } from 'react';
import { Text, View, TextInput, Pressable } from 'react-native';
import type { SignatoryProfile } from '../../../../packages/domain/src/consignmentReceipt';
import { request } from '../data/apiRepository';
import { SignaturePad } from './SignaturePad';
export function SignatorySettings() {
  const [profile, setProfile] = useState<SignatoryProfile>({
    firstName: '',
    lastName: '',
    capacity: '',
  });
  const [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    void request<SignatoryProfile>('/auth/profile')
      .then((p) => {
        if (active) setProfile(p);
      })
      .catch(() => {
        if (active) {
          setFailed(true);
          setMessage('Chargement impossible. Rouvrez le compte pour réessayer.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save() {
    setLoading(true);
    setMessage('');
    try {
      setProfile(await request<SignatoryProfile>('/auth/profile', profile, 'PATCH'));
      setMessage('Signataire et signature enregistrés pour iOS et PC.');
    } catch {
      setMessage('Enregistrement impossible. Vérifiez le nom, la qualité et la signature.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: '600' }}>Mon signataire boutique</Text>
      {(['firstName', 'lastName', 'capacity'] as const).map((key, i) => (
        <View key={key}>
          <Text>{['Prénom', 'Nom', 'Qualité / fonction'][i]}</Text>
          <TextInput
            accessibilityLabel={['Prénom', 'Nom', 'Qualité'][i]}
            editable={!loading && !failed}
            maxLength={100}
            value={profile[key]}
            onChangeText={(value) => setProfile({ ...profile, [key]: value })}
            style={{ borderWidth: 1, borderColor: '#e4d9c7', borderRadius: 8, padding: 12 }}
          />
        </View>
      ))}
      <SignaturePad
        label="Ma signature réutilisable (facultative)"
        value={profile.signature ?? []}
        onChange={(signature) =>
          setProfile({ ...profile, signature: signature.length ? signature : null })
        }
        disabled={loading || failed}
      />
      <Text>
        Votre confirmation sera requise pour chaque document. Pour supprimer la signature
        enregistrée, effacez-la puis enregistrez.
      </Text>
      <Pressable
        disabled={loading || failed}
        onPress={() => void save()}
        accessibilityRole="button"
        style={{ padding: 14, backgroundColor: '#fbf0d9' }}
      >
        <Text>{loading ? 'Chargement…' : 'Enregistrer mon signataire'}</Text>
      </Pressable>
      {!!message && <Text accessibilityRole="alert">{message}</Text>}
    </View>
  );
}
