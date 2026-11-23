import {SalePaymentRevisions} from './SalePaymentRevisions';
import {DateField} from './DateField';
import { formatShopMoney, shopCurrency, shopTimezone } from '../theme/shopFormatting';
import { useTheme, type ThemeColors } from '../theme/ThemeProvider';
import {
  buildSaleSettlement,
  emptyPaymentDraft,
  type PaymentDraft,
  paymentDay,
} from '../data/salePayment';

export { buildSaleSettlement, emptyPaymentDraft } from '../data/salePayment';

import * as Crypto from 'expo-crypto';
import { useRef, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { finishFinancialAttempt, recordSalePayment, type Sale } from '../data/apiRepository';
import type { Field as StandardField } from './Field';
import { captureAccountScope,getSessionScope,markUserActivity } from '../auth/session';
function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  editable = true,
  placeholder,
}: ComponentProps<typeof StandardField>) {
  const { colors, dark } = useTheme();
  const styles = createStyles(colors);

  return (
    <View style={styles.formRow}>
      <Text style={[{ color: colors.text }, styles.fieldLabel]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={(text) => {
          markUserActivity();
          onChangeText(text);
        }}
        keyboardType={keyboardType}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        style={[{ color: colors.text }, styles.fieldInput]}
        keyboardAppearance={dark ? 'dark' : 'light'}
      />
    </View>
  );
}

const money = (value: number) => formatShopMoney(value / 100);
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
  const { colors, dark } = useTheme();
  const styles = createStyles(colors);

  const [tendered, setTendered] = useState('');
  const [details, setDetails] = useState(false);
  const modes = [
    ['cash', 'Espèces'],
    ['transfer', 'Virement'],
    ['mixed', 'Les deux'],
    ...(allowPending ? [['pending', 'À encaisser']] : []),
  ] as [PaymentDraft['mode'], string][];
  return (
    <View style={styles.form}>
      <Text style={[{ color: colors.text }, styles.title]}>Encaissement · {money(totalCents)}</Text>
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
            <Text style={[{ color: colors.text }, styles.label]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {value.mode === 'pending' ? (
        <Text style={[{ color: colors.text }, styles.hint]}>
          Vente enregistrée sans encaissement. Vous pourrez marquer l’argent reçu depuis
          l’historique. Les dépôts concernés ne sont pas encore à reverser.
        </Text>
      ) : (
        !!value.mode && (
          <>
            {value.mode === 'mixed' ? (
              <>
                <Field
                  label={`Reçu en espèces (${shopCurrency()})`}
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
                  label={`Reçu par virement (${shopCurrency()})`}
                  value={value.transfer}
                  editable={!disabled}
                  keyboardType="decimal-pad"
                  onChangeText={(transfer) => onChange({ ...value, transfer })}
                />
              </>
            ) : (
              <Text style={[{ color: colors.text }, styles.hint]}>
                {money(totalCents)} reçus {value.mode === 'cash' ? 'en espèces' : 'par virement'}.
              </Text>
            )}
            {value.mode === 'cash' && (
              <>
                <Field
                  label={`Montant tendu (${shopCurrency()}), facultatif`}
                  keyboardType="decimal-pad"
                  value={tendered}
                  onChangeText={setTendered}
                  editable={!disabled}
                />
                {!!tendered && (
                  <Text style={[{ color: colors.text }, styles.hint]}>
                    {Number(tendered.replace(',', '.')) * 100 < totalCents
                      ? 'Le montant tendu est inférieur au total.'
                      : `Monnaie à rendre : ${money(Math.round(Number(tendered.replace(',', '.')) * 100) - totalCents)}`}
                  </Text>
                )}
              </>
            )}
            <Pressable onPress={() => setDetails(!details)}>
              <Text style={[{ color: colors.text }, styles.hint]}>
                {details ? 'Masquer les détails' : 'Date et référence du règlement'}
              </Text>
            </Pressable>
            {details && (
              <>
                <DateField
                  label="Date de réception"
                  value={value.date}
                  disabled={disabled}
                  onChange={(date) => onChange({ ...value, date })}
                />
                <Field
                  label="Référence ou note facultative"
                  value={value.reference}
                  editable={!disabled}
                  onChangeText={(reference) => onChange({ ...value, reference })}
                />
              </>
            )}
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
  const { colors, dark } = useTheme();
  const styles = createStyles(colors);

  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [draft, setDraft] = useState<PaymentDraft>(emptyPaymentDraft);
  const locked = useRef(false);
  const [revision,setRevision]=useState(0);
  const payment = sale.payment;
  async function save() {
    if(locked.current)return;
    locked.current=true;
    const epoch=getSessionScope();
    setBusy(true);
    setError('');
    try {
      const scope=await captureAccountScope();
      const settlement = buildSaleSettlement(draft, sale.salePriceCents);
      if (!settlement.payment) throw new Error('Choisissez un encaissement reçu.');
      const input = { saleId: sale._id, ...settlement.payment };
      await recordSalePayment({
        ...input,
        operationId: Crypto.randomUUID(),
      });
      scope.assertActive();
      setEditing(false);
      setRevision(value=>value+1);
      setDraft(emptyPaymentDraft());
      await finishFinancialAttempt('/sales/payment',scope);
      await onChanged().catch(()=>{scope.assertActive();setError('Encaissement enregistré. Actualisez la vente pour afficher les dernières données.');});
    } catch (error) {
      if(epoch!==getSessionScope())return;
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      if(epoch===getSessionScope()){locked.current=false;setBusy(false);}
    }
  }
  return (
    <View>
      <Text style={[{ color: colors.text }, styles.hint]}>
        {payment
          ? `Reçu : espèces ${money(payment.cashCents)} · virement ${money(payment.transferCents)} · ${new Date(payment.receivedAt).toLocaleDateString('fr-BE', {timeZone: shopTimezone()})}${payment.reference ? ` · ${payment.reference}` : ''}`
          : sale.paymentStatus === 'pending'
            ? 'À encaisser'
            : 'Encaissement non renseigné'}
      </Text>
      {sale.status === 'cancelled' && payment && (
        <Text style={[{ color: colors.text }, styles.hint]}>
          Vente annulée : encaissement conservé dans l’historique.
        </Text>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={[{ color: colors.text }, styles.error]}>
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
          <Text style={[{ color: colors.text }, styles.label]}>
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
          <Text style={[{ color: colors.text }, styles.hint]}>
            Confirmez uniquement l’argent déjà reçu. Aucun virement n’est déclenché.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={styles.choice}
            onPress={() => void save()}
          >
            <Text style={[{ color: colors.text }, styles.label]}>
              {busy ? 'Enregistrement…' : 'Confirmer l’encaissement reçu'}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => setEditing(false)}>
            <Text style={[{ color: colors.text }, styles.hint]}>Annuler</Text>
          </Pressable>
        </>
      )}
      <SalePaymentRevisions saleId={sale._id} revision={JSON.stringify([revision,sale.status,sale.paymentStatus,sale.payment])}/>
    </View>
  );
}
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    form: {
      marginVertical: 12,
      padding: 0,
      gap: 10,
    },
    formRow: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 15,
      gap: 12,
      backgroundColor: colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    fieldLabel: { flex: 1, fontSize: 14, color: colors.text },
    fieldInput: {
      width: '48%',
      minHeight: 44,
      textAlign: 'right',
      fontSize: 16,
      color: colors.text,
    },
    title: {
      color: colors.accent,
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 10,
    },
    choices: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 3,
      padding: 3,
      backgroundColor: colors.border,
      borderRadius: 9,
      marginBottom: 8,
    },
    choice: {
      paddingHorizontal: 10,
      paddingVertical: 10,
      minHeight: 44,
      borderRadius: 7,
    },
    selected: { backgroundColor: colors.surface },
    label: { color: colors.accent, fontWeight: '600' },
    hint: { color: colors.secondary, lineHeight: 20, marginVertical: 6 },
    error: { color: colors.danger, marginVertical: 6 },
  });
