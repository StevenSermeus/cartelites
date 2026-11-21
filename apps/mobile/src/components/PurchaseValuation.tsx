import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Field } from './Field';
import { useTheme } from '../theme/ThemeProvider';
import { purchaseValuation, applyPurchasePercent } from '../data/purchaseValuation';
import type { PurchaseDraft } from '../data/apiRepository';
const money = (n: number) => `${(n / 100).toFixed(2).replace('.', ',')} €`;
export function PurchaseValuation({
  rows,
  setRows,
}: {
  rows: PurchaseDraft[];
  setRows: Dispatch<SetStateAction<PurchaseDraft[]>>;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false),
    [value, setValue] = useState('80'),
    [keys, setKeys] = useState<string[]>([]),
    [error, setError] = useState('');
  const included = rows.filter((r) => r.included),
    totals = purchaseValuation(rows);
  let preview = null;
  try {
    preview = purchaseValuation(applyPurchasePercent(rows, keys, value));
  } catch {
    /* Incomplete input. */
  }
  const button = (label: string, action: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={action}
      style={{
        minHeight: 48,
        padding: 12,
        borderRadius: 12,
        backgroundColor: colors.accentSoft,
        justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color: colors.accent, fontWeight: '600', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ gap: 10, padding: 16, borderRadius: 16, backgroundColor: colors.surface }}>
      <Text style={{ color: colors.text, fontWeight: '600', fontSize: 18 }}>
        Estimation du rachat
      </Text>
      {totals ? (
        <>
          <Text style={{ color: colors.text }}>
            Valeur estimée des cartes : {money(totals.marketCents)}
          </Text>
          <Text style={{ color: colors.text }}>
            Total de reprise : {money(totals.purchaseCents)}
          </Text>
          <Text style={{ color: colors.success, fontWeight: '700', fontSize: 23 }}>
            Gain théorique : {money(totals.theoreticalGainCents)}
          </Text>
        </>
      ) : (
        <Text style={{ color: colors.secondary }}>
          Complétez les valeurs et pourcentages pour calculer le total.
        </Text>
      )}
      <Text style={{ color: colors.secondary, fontSize: 13 }}>
        Si toutes les cartes sont revendues à leur valeur estimée. Avant TVA, frais et commissions.
      </Text>
      {button(
        'Modifier les % en lot',
        () => {
          setKeys(included.map((r) => r.key));
          setError('');
          setOpen(true);
        },
        !included.length,
      )}
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: 20, gap: 16 }}
            >
              <Text
                accessibilityRole="header"
                style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}
              >
                Pourcentage de reprise
              </Text>
              <Field
                label="Reprise de la valeur estimée (%)"
                value={value}
                onChangeText={setValue}
                keyboardType="decimal-pad"
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[70, 75, 80, 85, 90].map((n) => (
                  <View key={n}>{button(`${n} %`, () => setValue(String(n)))}</View>
                ))}
              </View>
              {button(
                keys.length === included.length
                  ? 'Tout désélectionner'
                  : 'Sélectionner toutes les cartes',
                () => setKeys(keys.length === included.length ? [] : included.map((r) => r.key)),
              )}
              {included.map((row) => (
                <View key={row.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Text style={{ flex: 1, color: colors.text }}>
                    {row.name} · {row.discountPercent} %
                  </Text>
                  <Switch
                    accessibilityLabel={`Appliquer le pourcentage à ${row.name}`}
                    value={keys.includes(row.key)}
                    onValueChange={(checked) =>
                      setKeys((ids) =>
                        checked ? [...ids, row.key] : ids.filter((id) => id !== row.key),
                      )
                    }
                    trackColor={{ true: colors.accent }}
                  />
                </View>
              ))}
              {preview && (
                <Text style={{ color: colors.text }}>
                  Nouveau total de reprise : {money(preview.purchaseCents)}
                  {'\n'}Gain théorique : {money(preview.theoreticalGainCents)}
                </Text>
              )}
              {!!error && (
                <Text accessibilityRole="alert" style={{ color: colors.danger }}>
                  {error}
                </Text>
              )}
            </ScrollView>
            <View style={{ padding: 16, gap: 8 }}>
              {button(
                `Appliquer à ${keys.length} carte(s)`,
                () => {
                  try {
                    const next = applyPurchasePercent(rows, keys, value);
                    setRows(next);
                    setOpen(false);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Pourcentage invalide.');
                  }
                },
                !keys.length,
              )}
              {button('Annuler', () => setOpen(false))}
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
