import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { request, type Item } from '../data/apiRepository';
import { parsePriceInput } from '../data/productProfit';
import { useTheme } from '../theme/ThemeProvider';
import { Field } from './Field';

function Choices({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.text, fontWeight: '600' }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map(([key, title]) => (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityState={{ checked: (value ?? '') === key }}
            onPress={() => onChange(key)}
            style={{
              minHeight: 44,
              paddingHorizontal: 14,
              justifyContent: 'center',
              borderRadius: 10,
              backgroundColor: value === key || (!value && !key) ? colors.accent : colors.raised,
            }}
          >
            <Text
              style={{ color: value === key || (!value && !key) ? colors.onAccent : colors.text }}
            >
              {title}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function ProductEditor({
  itemId,
  onClose,
  onChanged,
}: {
  itemId: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<Item | null>(null),
    [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [dirty, setDirty] = useState(false),
    [retry, setRetry] = useState(0);
  const locked = useRef(false),
    scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    let active = true;
    setError('');
    void request<{ item: Item }>(`/stock/${encodeURIComponent(itemId)}/lots`)
      .then(({ item }) => {
        if (!active) return;
        setDraft(item);
        setPrice(
          item.askingPriceCents === undefined ? '' : (item.askingPriceCents / 100).toFixed(2),
        );
        setDirty(false);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Chargement impossible.');
      });
    return () => {
      active = false;
    };
  }, [itemId, retry]);
  function change(key: keyof Item, value: string | boolean | undefined) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setDirty(true);
  }
  function close() {
    if (locked.current) return;
    if (!dirty) return onClose();
    Alert.alert('Abandonner les modifications ?', 'La fiche enregistrée restera inchangée.', [
      { text: 'Continuer la modification', style: 'cancel' },
      { text: 'Abandonner', style: 'destructive', onPress: onClose },
    ]);
  }
  async function save() {
    if (!draft || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    Keyboard.dismiss();
    try {
      const amount = parsePriceInput(price);
      if (!draft.name.trim() || draft.name.length > 300)
        throw new Error('Indiquez un nom de 1 à 300 caractères.');
      if (amount === null)
        throw new Error('Indiquez un prix valide, avec deux décimales au maximum.');
      if (
        (draft.description?.length ?? 0) > 3000 ||
        (draft.series?.length ?? 0) > 300 ||
        (draft.identifier?.length ?? 0) > 100 ||
        (draft.gradingGrade?.length ?? 0) > 32 ||
        (draft.gradingCertificate?.length ?? 0) > 100
      )
        throw new Error('Un champ est trop long. Raccourcissez la description ou les détails.');
      if (
        draft.origin === 'consignment' &&
        amount < (draft.agreedPriceCents ?? draft.askingPriceCents ?? 0)
      )
        throw new Error(
          'Ce prix est inférieur à l’accord du déposant. Modifiez d’abord l’accord dans Dépôts.',
        );
      await request('/stock/product', {
        itemId,
        tcg: draft.tcg ?? 'pokemon',
        name: draft.name.trim(),
        description: draft.description ?? '',
        series: draft.series ?? '',
        identifier: draft.identifier ?? '',
        language: draft.language,
        condition: draft.condition,
        gradingCompany: draft.gradingCompany,
        gradingGrade: draft.gradingGrade ?? '',
        gradingCertificate: draft.gradingCertificate ?? '',
        askingPriceCents: amount,
        hiddenFromCatalogue: draft.hiddenFromCatalogue ?? false,
      });
      setDirty(false);
      await onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Modification impossible.');
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal visible animationType="slide" onRequestClose={close}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={{
              minHeight: 52,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              gap: 16,
            }}
          >
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={close}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: colors.accent }}>Annuler</Text>
            </Pressable>
            <Text
              accessibilityRole="header"
              style={{ color: colors.text, fontSize: 18, fontWeight: '600', flex: 1 }}
            >
              Modifier la fiche
            </Text>
          </View>
          <ScrollView
            ref={scroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 16, gap: 16 }}
          >
            {!!error && (
              <Text accessibilityRole="alert" style={{ color: colors.danger }}>
                {error}
              </Text>
            )}
            {!draft ? (
              <>
                <Text style={{ color: colors.secondary }}>
                  {error ? 'La fiche n’a pas pu être chargée.' : 'Chargement de la fiche…'}
                </Text>
                {!!error && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setRetry((n) => n + 1)}
                    style={{ minHeight: 44 }}
                  >
                    <Text style={{ color: colors.accent }}>Réessayer</Text>
                  </Pressable>
                )}
              </>
            ) : (
              <View
                pointerEvents={busy ? 'none' : 'auto'}
                style={{ gap: 18, opacity: busy ? 0.6 : 1 }}
              >
                <Field
                  label="Nom du produit"
                  value={draft.name}
                  onChangeText={(value) => change('name', value)}
                />
                <Choices
                  label="Jeu de cartes"
                  value={draft.tcg ?? 'pokemon'}
                  options={[
                    ['pokemon', 'Pokémon'],
                    ['riftbound', 'Riftbound'],
                    ['other', 'Autre'],
                  ]}
                  onChange={(value) => change('tcg', value)}
                />
                <Field
                  label="Prix de vente TTC (€)"
                  value={price}
                  keyboardType="decimal-pad"
                  onChangeText={(value) => {
                    setPrice(value);
                    setDirty(true);
                  }}
                />
                <Field
                  label="Série"
                  value={draft.series ?? ''}
                  onChangeText={(value) => change('series', value)}
                />
                <Field
                  label="Numéro / identifiant"
                  value={draft.identifier ?? ''}
                  onChangeText={(value) => change('identifier', value)}
                />
                <Choices
                  label="Langue"
                  value={draft.language}
                  options={[
                    ['', 'Non renseignée'],
                    ['fr', 'Français'],
                    ['en', 'Anglais'],
                    ['ja', 'Japonais'],
                    ['zh', 'Chinois'],
                  ]}
                  onChange={(value) => change('language', value || undefined)}
                />
                <Choices
                  label="État"
                  value={draft.condition}
                  options={[
                    ['', 'Non renseigné'],
                    ...['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'].map(
                      (v) => [v, v] as [string, string],
                    ),
                  ]}
                  onChange={(value) => change('condition', value || undefined)}
                />
                <Choices
                  label="Gradation"
                  value={draft.gradingCompany}
                  options={[
                    ['', 'Non gradé'],
                    ...['PSA', 'CollectAura', 'PCA', 'CCC'].map((v) => [v, v] as [string, string]),
                  ]}
                  onChange={(value) => change('gradingCompany', value || undefined)}
                />
                {!!draft.gradingCompany && (
                  <>
                    <Field
                      label="Note"
                      value={draft.gradingGrade ?? ''}
                      onChangeText={(value) => change('gradingGrade', value)}
                    />
                    <Field
                      label="Certificat"
                      value={draft.gradingCertificate ?? ''}
                      onChangeText={(value) => change('gradingCertificate', value)}
                    />
                  </>
                )}
                <View style={{ gap: 8 }}>
                  <Text style={{ color: colors.text }}>Description</Text>
                  <TextInput
                    accessibilityLabel="Description"
                    multiline
                    maxLength={3000}
                    value={draft.description ?? ''}
                    onChangeText={(value) => change('description', value)}
                    style={{
                      minHeight: 110,
                      padding: 12,
                      borderRadius: 12,
                      color: colors.text,
                      backgroundColor: colors.surface,
                      textAlignVertical: 'top',
                    }}
                  />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Text style={{ color: colors.text, flex: 1 }}>Masquer du catalogue public</Text>
                  <Switch
                    accessibilityLabel="Masquer du catalogue public"
                    trackColor={{ true: colors.accent }}
                    value={draft.hiddenFromCatalogue ?? false}
                    onValueChange={(value) => change('hiddenFromCatalogue', value)}
                  />
                </View>
              </View>
            )}
          </ScrollView>
          <View style={{ padding: 16, backgroundColor: colors.surface }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || !draft || !dirty }}
              disabled={busy || !draft || !dirty}
              onPress={() => void save()}
              style={{
                minHeight: 50,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.accent,
                opacity: busy || !draft || !dirty ? 0.5 : 1,
              }}
            >
              <Text style={{ color: colors.onAccent, fontSize: 17, fontWeight: '600' }}>
                {busy ? 'Enregistrement…' : 'Enregistrer les modifications'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
