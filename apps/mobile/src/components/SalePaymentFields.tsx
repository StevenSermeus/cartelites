import {
  buildSaleSettlement,
  emptyPaymentDraft,
  type PaymentDraft,
  paymentDay,
} from '../data/salePayment';

export { buildSaleSettlement, emptyPaymentDraft } from '../data/salePayment';

import * as Crypto from 'expo-crypto';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { recordSalePayment, type Sale } from '../data/apiRepository';
import { Field } from './Field';

const money = (value: number) => `${(value / 100).toFixed(2)} €`;
export function SalePaymentFields({
  value,
  onChange,
  totalCents,
  allowPending = true,
  disabled = false,
}: {
  value: PaymentDraft;
  onChange: (value: PaymentDraft) => void;
  totalCents: number;
  allowPending?: boolean;
  disabled?: boolean;
}) {
  const modes = [
    ['cash', 'Espèces'],
    ['transfer', 'Virement'],
    ['mixed', 'Les deux'],
    ...(allowPending ? [['pending', 'À encaisser']] : []),
  ] as [PaymentDraft['mode'], string][];
  return (
    <View style={styles.form}>
      <Text style={styles.title}>Encaissement · {money(totalCents)}</Text>
      <View style={styles.choices}>
        {modes.map(([mode, label]) => (
          <Pressable
            key={mode}
            accessibilityRole="button"
            accessibilityState={{ selected: value.mode === mode, disabled }}
            disabled={disabled}
            style={[styles.choice, value.mode === mode && styles.selected]}
            onPress={() => onChange({ ...value, mode })}
          >
            <Text style={styles.label}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {value.mode === 'pending' ? (
        <Text style={styles.hint}>
          Vente enregistrée sans encaissement. Vous pourrez marquer l’argent reçu depuis
          l’historique. Les dépôts concernés ne sont pas encore à reverser.
        </Text>
      ) : (
        !!value.mode && (
          <>
            {value.mode === 'mixed' ? (
              <>
                <Field
                  label="Reçu en espèces (€)"
                  value={value.cash}
                  editable={!disabled}
                  keyboardType="decimal-pad"
                  onChangeText={(cash) => {
                    const amount = Number(cash.replace(',', '.'));
                    onChange({
                      ...value,
                      cash,
                      transfer:
                        cash.trim() &&
                        Number.isFinite(amount) &&
                        amount >= 0 &&
                        Math.round(amount * 100) <= totalCents
                          ? ((totalCents - Math.round(amount * 100)) / 100).toFixed(2)
                          : value.transfer,
                    });
                  }}
                />
                <Field
                  label="Reçu par virement (€)"
                  value={value.transfer}
                  editable={!disabled}
                  keyboardType="decimal-pad"
                  onChangeText={(transfer) => onChange({ ...value, transfer })}
                />
              </>
            ) : (
              <Text style={styles.hint}>
                {money(totalCents)} reçus {value.mode === 'cash' ? 'en espèces' : 'par virement'}.
              </Text>
            )}
            <Field
              label="Date de réception (AAAA-MM-JJ)"
              value={value.date}
              editable={!disabled}
              onChangeText={(date) => onChange({ ...value, date })}
            />
            <Field
              label="Référence ou note facultative"
              value={value.reference}
              editable={!disabled}
              onChangeText={(reference) => onChange({ ...value, reference })}
            />
          </>
        )
      )}
    </View>
  );
}
export function SalePaymentHistory({
  sale,
  onChanged,
}: {
  sale: Sale;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [draft, setDraft] = useState<PaymentDraft>(emptyPaymentDraft);
  const attempt = useRef<{ signature: string; operationId: string } | null>(null);
  const payment = sale.payment;
  async function save() {
    setBusy(true);
    setError('');
    try {
      const settlement = buildSaleSettlement(draft, sale.salePriceCents);
      if (!settlement.payment) throw new Error('Choisissez un encaissement reçu.');
      const input = { saleId: sale._id, ...settlement.payment };
      const signature = JSON.stringify(input);
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, operationId: Crypto.randomUUID() };
      await recordSalePayment({ ...input, operationId: attempt.current.operationId });
      setEditing(false);
      attempt.current = null;
      await onChanged();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View>
      <Text style={styles.hint}>
        {payment
          ? `Reçu : espèces ${money(payment.cashCents)} · virement ${money(payment.transferCents)} · ${new Date(payment.receivedAt).toLocaleDateString('fr-BE')}${payment.reference ? ` · ${payment.reference}` : ''}`
          : sale.paymentStatus === 'pending'
            ? 'À encaisser'
            : 'Encaissement non renseigné'}
      </Text>
      {sale.status === 'cancelled' && payment && (
        <Text style={styles.hint}>Vente annulée : encaissement conservé dans l’historique.</Text>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {sale.status === 'active' && !editing && (
        <Pressable
          accessibilityRole="button"
          style={styles.choice}
          onPress={() => {
            setDraft(
              payment
                ? {
                    mode:
                      payment.cashCents && payment.transferCents
                        ? 'mixed'
                        : payment.cashCents
                          ? 'cash'
                          : 'transfer',
                    cash: (payment.cashCents / 100).toFixed(2),
                    transfer: (payment.transferCents / 100).toFixed(2),
                    date: paymentDay(payment.receivedAt),
                    reference: payment.reference ?? '',
                  }
                : emptyPaymentDraft(),
            );
            setEditing(true);
          }}
        >
          <Text style={styles.label}>
            {payment ? 'Corriger l’encaissement' : 'Marquer l’argent reçu'}
          </Text>
        </Pressable>
      )}
      {editing && (
        <>
          <SalePaymentFields
            value={draft}
            onChange={setDraft}
            totalCents={sale.salePriceCents}
            allowPending={false}
            disabled={busy}
          />
          <Text style={styles.hint}>
            Confirmez uniquement l’argent déjà reçu. Aucun virement n’est déclenché.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={styles.choice}
            onPress={() => void save()}
          >
            <Text style={styles.label}>
              {busy ? 'Enregistrement…' : 'Confirmer l’encaissement reçu'}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => setEditing(false)}>
            <Text style={styles.hint}>Annuler</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  form: {
    marginVertical: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#dbe4ea',
    borderRadius: 10,
  },
  title: { color: '#143d59', fontSize: 16, fontWeight: '700', marginBottom: 10 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  choice: {
    padding: 10,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#cbd5dc',
    borderRadius: 8,
    backgroundColor: '#f4f7f9',
  },
  selected: { backgroundColor: '#dcebf4', borderColor: '#143d59' },
  label: { color: '#143d59', fontWeight: '600' },
  hint: { color: '#526875', lineHeight: 20, marginVertical: 6 },
  error: { color: '#a12e25', marginVertical: 6 },
});
