import { ReceiptSigning } from '../components/ReceiptSigning';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ClientPicker } from '../components/ClientPicker';
import { Field } from '../components/Field';
import { Pagination } from '../components/Pagination';
import { AttachmentPreview } from '../components/AttachmentPreview';
import { pickAttachment } from '../data/pickAttachment';
import { usePagedData } from '../data/usePagedData';
import {
  type AttachmentFile,
  type Consignment,
  type ConsignmentBalance,
  type ConsignmentEntry,
  type ConsignmentPayment,
  createConsignment,
  type Item,
  listConsignmentBalances,
  listConsignments,
  openAttachment,
  recordConsignmentPayment,
  returnConsignmentItem,
  type Seller,
  shareConsignmentReceipt,
  updateConsignmentTerms,
  uploadItemAttachment,
} from '../data/apiRepository';

const money = (cents: number) => `${(cents / 100).toFixed(2)} €`;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function dateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error('Saisissez une date au format AAAA-MM-JJ.');
  const d = new Date(`${value}T12:00:00`);
  if (
    !Number.isFinite(d.getTime()) ||
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` !==
      value
  )
    throw new Error('Cette date est invalide.');
  return d.getTime();
}
function amount(value: string, label: string, max = Number.MAX_SAFE_INTEGER) {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim()))
    throw new Error(`${label} invalide (deux décimales maximum).`);
  const cents = Math.round(Number(value.trim().replace(',', '.')) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > max)
    throw new Error(`${label} invalide.`);
  return cents;
}
type Draft = {
  key: string;
  name: string;
  productType: 'card' | 'sealed' | 'other';
  description: string;
  series: string;
  identifier: string;
  language: '' | 'fr' | 'en' | 'ja';
  tcg: '' | 'pokemon' | 'riftbound';
  condition: '' | NonNullable<ConsignmentEntry['condition']>;
  gradingCompany: '' | NonNullable<ConsignmentEntry['gradingCompany']>;
  gradingGrade: string;
  gradingCertificate: string;
  price: string;
  commission: string;
  photo: AttachmentFile | null;
};
const fresh = (): Draft => ({
  key: Crypto.randomUUID(),
  name: '',
  productType: 'sealed',
  description: '',
  series: '',
  identifier: '',
  language: '',
  tcg: '',
  condition: '',
  gradingCompany: '',
  gradingGrade: '',
  gradingCertificate: '',
  price: '',
  commission: '30',
  photo: null,
});
function Button({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}
function Choices<T extends string>({
  values,
  value,
  onChange,
}: {
  values: readonly (readonly [T, string])[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.row}>
      {values.map(([id, label]) => (
        <Pressable
          key={id}
          accessibilityRole="button"
          accessibilityState={{ selected: id === value }}
          onPress={() => onChange(id)}
          style={[styles.chip, id === value && styles.selected]}
        >
          <Text style={styles.chipText}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ConsignmentScreen({
  active,
  sellers,
  refreshStock,
  onCreateClient,
}: {
  active: boolean;
  sellers: Seller[];
  refreshStock: () => Promise<void>;
  onCreateClient: () => void;
}) {
  const [tab, setTab] = useState<'history' | 'new' | 'payments'>('history');
  const [deposits, setDeposits] = useState<Consignment[]>([]);
  const [balances, setBalances] = useState<ConsignmentBalance[]>([]);
  const [payments, setPayments] = useState<ConsignmentPayment[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState(today);
  const [due, setDue] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Draft[]>(() => [fresh()]);
  const [editing, setEditing] = useState<Item | null>(null);
  const [termPrice, setTermPrice] = useState('');
  const [termRate, setTermRate] = useState('');
  const [authorization, setAuthorization] = useState('');
  const [paymentSeller, setPaymentSeller] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'due' | 'settled' | 'regularization' | 'all'>(
    'due',
  );
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState('Virement');
  const [paymentReference, setPaymentReference] = useState('');
  // Retain request keys for an unchanged retry after a lost response.
  const attempts = useRef(new Map<string, string>());
  const running = useRef(false);
  const [revision, setRevision] = useState(0);
  const [step, setStep] = useState(0);
  const historyData = usePagedData<Consignment>('/consignments', { search }, active && tab === 'history', revision);
  const balancesData = usePagedData<ConsignmentBalance>('/consignments/balances', { search: paymentSearch, status: balanceFilter }, active && tab === 'payments', revision);
  const paymentsData = usePagedData<ConsignmentPayment>('/consignments/payments', {}, active && tab === 'payments', revision);
  useEffect(() => setDeposits(historyData.items), [historyData.items]);
  useEffect(() => setBalances(balancesData.items), [balancesData.items]);
  useEffect(() => setPayments(paymentsData.items), [paymentsData.items]);

  const operation = (kind: string, input: unknown) => {
    const key = `${kind}:${JSON.stringify(input)}`;
    let id = attempts.current.get(key);
    if (!id) {
      id = Crypto.randomUUID();
      attempts.current.set(key, id);
    }
    return id;
  };
  const load = useCallback(async () => { setRevision(value => value + 1); }, []);
  const run = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Opération impossible.');
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const patch = (key: string, update: Partial<Draft>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...update } : r)));
  const refresh = async () => {
    await Promise.all([load(), refreshStock()]);
  };
  const submit = () =>
    run(async () => {
      if (!sellerId) throw new Error('Choisissez le déposant.');
      if (!reference.trim()) throw new Error('Saisissez une référence de dépôt.');
      const occurredAt = dateValue(date);
      const dueAt = due ? dateValue(due) : undefined;
      if (dueAt !== undefined && dueAt < occurredAt)
        throw new Error('L’échéance ne peut pas précéder le dépôt.');
      const items: ConsignmentEntry[] = rows.map((r) => {
        if (!r.name.trim()) throw new Error('Chaque article doit avoir un nom.');
        return {
          operationId: r.key,
          name: r.name.trim(),
          productType: r.productType,
          description: r.description.trim() || undefined,
          series: r.series.trim() || undefined,
          identifier: r.identifier.trim() || undefined,
          language: r.language || undefined,
          tcg: r.tcg || undefined,
          ...(r.productType === 'card'
            ? {
                condition: r.condition || undefined,
                gradingCompany: r.gradingCompany || undefined,
                gradingGrade: r.gradingGrade.trim() || undefined,
                gradingCertificate: r.gradingCertificate.trim() || undefined,
              }
            : {}),
          askingPriceCents: amount(r.price, 'Prix'),
          commissionRateBps: amount(r.commission, 'Commission', 10000),
        };
      });
      const input = {
        sellerId,
        occurredAt,
        dueAt,
        reference: reference.trim(),
        notes: notes.trim() || undefined,
        items,
      };
      const result = await createConsignment({
        ...input,
        operationId: operation('deposit', input),
      });
      // Clear the saved draft before optional uploads: an upload failure must never duplicate the deposit.
      const photos = rows
        .map((r, i) => ({ file: r.photo, id: result.itemIds[i] }))
        .filter((r) => r.file);
      setRows([fresh()]);
      setReference('');
      setNotes('');
      setDue('');
      setTab('history');
      let failures = 0;
      for (const photo of photos) {
        try {
          if (photo.file) await uploadItemAttachment(photo.id, photo.file);
        } catch {
          failures++;
        }
      }
      await refresh();
      setMessage(
        failures
          ? `Dépôt enregistré. ${failures} pièce(s) non téléversée(s) : utilisez « Ajouter une pièce » dans l’historique.`
          : 'Dépôt enregistré et articles disponibles dans le stock.',
      );
    });
  const pick = () => pickAttachment(true);
  const shareReceipt = (deposit: Consignment) =>
    shareConsignmentReceipt(
      deposit,
      sellers.find((client) => client._id === deposit.sellerId),
    );
  return (
    <View>
      <Choices
        value={tab}
        onChange={setTab}
        values={[
          ['history', 'Dépôts'],
          ['new', 'Nouveau'],
          ['payments', 'À reverser'],
        ]}
      />
      {message ? (
        <Text accessibilityRole="alert" style={styles.message}>
          {message}
        </Text>
      ) : null}
      {busy ? <Text style={styles.hint}>Enregistrement…</Text> : null}
      <View pointerEvents={busy ? 'none' : 'auto'}>
        {tab === 'new' && (
          <View style={styles.card}>
            <Text style={styles.title}>Nouveau dépôt</Text>
            <Choices value={String(step)} onChange={value => setStep(Number(value))} values={[["0", "Client"], ["1", "Articles"], ["2", "Vérifier"]]} />
            <View style={step === 0 ? undefined : { display: 'none' }}>
            <Text style={styles.step}>01 · DÉPOSANT</Text>
            <ClientPicker
              clients={sellers}
              value={sellerId}
              onChange={setSellerId}
              onCreate={onCreateClient}
            />
            <Field label="Référence du dépôt" value={reference} onChangeText={setReference} />
            <Field label="Date du dépôt (AAAA-MM-JJ)" value={date} onChangeText={setDate} />
            <Field label="Échéance facultative (AAAA-MM-JJ)" value={due} onChangeText={setDue} />
            <Field label="Conditions et notes" value={notes} onChangeText={setNotes} />
            </View><View style={step === 1 ? undefined : { display: 'none' }}>
            <Text style={styles.step}>02 · ARTICLES CONFIÉS</Text>
            {rows.map((r, index) => (
              <View key={r.key} style={styles.article}>
                <Text style={styles.title}>Article {index + 1}</Text>
                <Choices
                  value={r.productType}
                  onChange={(productType) => patch(r.key, { productType })}
                  values={[
                    ['sealed', 'Scellé'],
                    ['card', 'Carte'],
                    ['other', 'Autre'],
                  ]}
                />
                <Field
                  label="Nom de l’article"
                  value={r.name}
                  onChangeText={(name) => patch(r.key, { name })}
                />
                <Field
                  label="Description"
                  value={r.description}
                  onChangeText={(description) => patch(r.key, { description })}
                />
                <Field
                  label="Série (facultatif)"
                  value={r.series}
                  onChangeText={(series) => patch(r.key, { series })}
                />
                <Field
                  label="Référence ou numéro (facultatif)"
                  value={r.identifier}
                  onChangeText={(identifier) => patch(r.key, { identifier })}
                />
                <Choices
                  value={r.language}
                  onChange={(language) => patch(r.key, { language })}
                  values={[
                    ['', 'Langue libre'],
                    ['fr', 'FR'],
                    ['en', 'EN'],
                    ['ja', 'JA'],
                  ]}
                />
                <Choices
                  value={r.tcg}
                  onChange={(tcg) => patch(r.key, { tcg })}
                  values={[
                    ['', 'Sans jeu'],
                    ['pokemon', 'Pokémon'],
                    ['riftbound', 'Riftbound'],
                  ]}
                />
                {r.productType === 'card' && (
                  <>
                    <Choices
                      value={r.condition}
                      onChange={(condition) => patch(r.key, { condition })}
                      values={['', 'M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'].map(
                        (v) => [v as Draft['condition'], v || 'État libre'] as const,
                      )}
                    />
                    <Choices
                      value={r.gradingCompany}
                      onChange={(gradingCompany) => patch(r.key, { gradingCompany })}
                      values={['', 'PSA', 'CollectAura', 'PCA', 'CCC'].map(
                        (v) => [v as Draft['gradingCompany'], v || 'Non gradée'] as const,
                      )}
                    />
                    {r.gradingCompany ? (
                      <>
                        <Field
                          label="Note de gradation"
                          value={r.gradingGrade}
                          onChangeText={(gradingGrade) => patch(r.key, { gradingGrade })}
                        />
                        <Field
                          label="Certificat"
                          value={r.gradingCertificate}
                          onChangeText={(gradingCertificate) =>
                            patch(r.key, { gradingCertificate })
                          }
                        />
                      </>
                    ) : null}
                  </>
                )}
                <Field
                  label="Prix de vente convenu (€)"
                  value={r.price}
                  onChangeText={(price) => patch(r.key, { price })}
                  keyboardType="decimal-pad"
                />
                <Field
                  label="Commission (%)"
                  value={r.commission}
                  onChangeText={(commission) => patch(r.key, { commission })}
                  keyboardType="decimal-pad"
                />
                {(() => {
                  try {
                    const price = amount(r.price, 'Prix');
                    const rate = amount(r.commission, 'Commission', 10000);
                    const commission = Math.round((price * rate) / 10000);
                    return (
                      <Text style={styles.hint}>
                        Commission : {money(commission)} · Déposant : {money(price - commission)}
                      </Text>
                    );
                  } catch {
                    return null;
                  }
                })()}
                <AttachmentPreview current={r.photo} allowPdf onUse={(photo) => patch(r.key, { photo })} />
                {rows.length > 1 && (
                  <Button
                    label="Retirer cet article"
                    onPress={() =>
                      setRows((current) => current.filter((item) => item.key !== r.key))
                    }
                  />
                )}
              </View>
            ))}
            <Button
              label="Ajouter un article"
              onPress={() => setRows((current) => [...current, fresh()])}
            />
            </View>
            {step < 2 && <Button label="Continuer" disabled={step === 0 && !sellerId} onPress={() => setStep(value => value + 1)} />}
            <View style={step === 2 ? undefined : { display: 'none' }}>
            {rows.map(row => <Text key={row.key}>{row.name} · {row.price} € · {row.commission} %</Text>)}
            <Text style={styles.hint}>
              La commission porte sur le prix de vente. Les articles restent distincts des rachats à
              la marge.
            </Text>
            <Button label="Enregistrer le dépôt" disabled={busy} onPress={() => void submit()} />
            </View>
          </View>
        )}
        {tab === 'history' && (
          <>
            <Button label="Actualiser" onPress={() => void run(load)} />
            <Field label="Rechercher un dépôt" value={search} onChangeText={setSearch} /><Pagination data={historyData} />
            {deposits
              .filter((d) =>
                [d.reference, d.sellerName, ...d.items.map((i) => i.name)]
                  .join(' ')
                  .toLocaleLowerCase()
                  .includes(search.toLocaleLowerCase()),
              )
              .map((d) => (
                <View key={d._id} style={styles.card}>
                  <Text style={styles.title}>
                    {d.reference} · {d.sellerName}
                  </Text>
                  <Text style={styles.hint}>
                    {new Date(d.occurredAt).toLocaleDateString('fr-BE')}
                    {d.dueAt ? ` · Échéance ${new Date(d.dueAt).toLocaleDateString('fr-BE')}` : ''}
                  </Text>
                  {d.notes ? <Text style={styles.hint}>{d.notes}</Text> : null}
                  <Button
                    label="Partager le bon de dépôt non signé"
                    onPress={() => void run(() => shareReceipt(d))}
                  />
                  <ReceiptSigning kind="consignment" targetId={d._id} />
                  {d.items.map((item) => (
                    <View key={item._id} style={styles.article}>
                      <Text style={styles.title}>{item.name}</Text>
                      <Text style={styles.hint}>
                        {item.productType === 'sealed'
                          ? 'Scellé'
                          : item.productType === 'other'
                            ? 'Autre article'
                            : 'Carte'}{' '}
                        ·{' '}
                        {item.status === 'sold'
                          ? 'Vendu'
                          : item.status === 'returned'
                            ? 'Restitué'
                            : 'Disponible'}
                      </Text>
                      {item.description ? (
                        <Text style={styles.hint}>{item.description}</Text>
                      ) : null}
                      <Text style={styles.hint}>
                        Prix convenu {money(item.agreedPriceCents ?? item.askingPriceCents ?? 0)} ·
                        Commission {(item.commissionRateBps ?? 3000) / 100} %
                      </Text>
                      {item.events?.map((event) => (
                        <Text key={event._id} style={styles.hint}>
                          {new Date(event.occurredAt).toLocaleDateString('fr-BE')} ·{' '}
                          {event.kind === 'return'
                            ? 'Restitution au déposant'
                            : `Accord : ${money(event.askingPriceCents ?? 0)}, commission ${(event.commissionRateBps ?? 0) / 100} % · ${event.authorizationNote ?? ''}`}
                        </Text>
                      ))}
                      {item.photos?.map((p) => (
                        <Button
                          key={p._id}
                          label={p.filename}
                          onPress={() =>
                            void run(() => openAttachment(p._id, p.filename, p.contentType))
                          }
                        />
                      ))}
                      <AttachmentPreview current={null} allowPdf onUse={(photo) => {
                        if (photo) void run(async () => { await uploadItemAttachment(item._id, photo); await load(); });
                      }} />
                      {item.status === 'available' && (
                        <>
                          <Button
                            label="Modifier l’accord"
                            onPress={() => {
                              setEditing(item);
                              setTermPrice(
                                (
                                  (item.agreedPriceCents ?? item.askingPriceCents ?? 0) / 100
                                ).toFixed(2),
                              );
                              setTermRate(String((item.commissionRateBps ?? 3000) / 100));
                              setAuthorization('');
                            }}
                          />
                          <Button
                            label="Restituer au déposant"
                            onPress={() =>
                              Alert.alert(
                                'Restituer cet article ?',
                                `${item.name} sera retiré du stock disponible.`,
                                [
                                  { text: 'Annuler', style: 'cancel' },
                                  {
                                    text: 'Restituer',
                                    onPress: () =>
                                      void run(async () => {
                                        await returnConsignmentItem(item._id);
                                        await refresh();
                                        setMessage('Article restitué.');
                                      }),
                                  },
                                ],
                              )
                            }
                          />
                        </>
                      )}
                      {editing?._id === item._id && (
                        <View>
                          <Field
                            label="Nouveau prix convenu (€)"
                            value={termPrice}
                            onChangeText={setTermPrice}
                            keyboardType="decimal-pad"
                          />
                          <Field
                            label="Commission convenue (%)"
                            value={termRate}
                            onChangeText={setTermRate}
                            keyboardType="decimal-pad"
                          />
                          <Field
                            label="Autorisation du déposant (date et accord)"
                            value={authorization}
                            onChangeText={setAuthorization}
                          />
                          <Button
                            label="Enregistrer l’accord autorisé"
                            onPress={() =>
                              void run(async () => {
                                if (!authorization.trim())
                                  throw new Error('Indiquez l’autorisation du déposant.');
                                const input = {
                                  itemId: item._id,
                                  askingPriceCents: amount(termPrice, 'Prix'),
                                  commissionRateBps: amount(termRate, 'Commission', 10000),
                                  authorizationNote: authorization.trim(),
                                };
                                await updateConsignmentTerms({
                                  ...input,
                                  operationId: operation('terms', input),
                                });
                                attempts.current.delete(`terms:${JSON.stringify(input)}`);
                                setEditing(null);
                                await refresh();
                              })
                            }
                          />
                          <Button label="Fermer" onPress={() => setEditing(null)} />
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              ))}
            {!deposits.length && (
              <Text style={styles.hint}>
                Aucun dépôt enregistré. Créez le premier dans Nouveau.
              </Text>
            )}
          </>
        )}
        {tab === 'payments' && (
          <>
            <Text style={styles.hint}>
              Retrouvez les déposants à payer après encaissement de leurs ventes, puis marquez le
              versement effectué. Les ventes explicitement « À encaisser » ne sont pas encore dues.
              Les anciens encaissements non renseignés gardent leur traitement précédent.
            </Text>
            <View style={styles.card}>
              <Text style={styles.title}>
                {money(balances.reduce((sum, b) => sum + Math.max(0, b.balanceCents), 0))} à
                reverser sur cette page
              </Text>
              <Text style={styles.hint}>
                {balances.filter((b) => b.balanceCents > 0).length} déposant(s) sur cette page
              </Text>
            </View>
            <Choices
              value={balanceFilter}
              onChange={setBalanceFilter}
              values={[
                ['due', 'À payer'],
                ['settled', 'Réglés'],
                ['regularization', 'Régularisations'],
                ['all', 'Tous'],
              ]}
            />
            <Button label="Actualiser les soldes" onPress={() => void run(load)} />
            <Field
              label="Rechercher un déposant à payer"
              value={paymentSearch}
              onChangeText={setPaymentSearch}
              placeholder="Nom, e-mail ou téléphone"
            />
            <Pagination data={balancesData} />
            {balances
              .filter(
                (b) =>
                  balanceFilter === 'all' ||
                  (balanceFilter === 'due'
                    ? b.balanceCents > 0
                    : balanceFilter === 'regularization'
                      ? b.balanceCents < 0
                      : b.balanceCents === 0 && (b.earnedCents > 0 || b.paidCents > 0)),
              )
              .filter((b) => {
                const client = sellers.find((s) => s._id === b.sellerId);
                return [b.sellerName, client?.email, client?.phone]
                  .filter(Boolean)
                  .join(' ')
                  .toLocaleLowerCase('fr')
                  .includes(paymentSearch.trim().toLocaleLowerCase('fr'));
              })
              .map((b) => (
                <View key={b.sellerId} style={styles.card}>
                  <Text style={styles.title}>{b.sellerName}</Text>
                  <Text style={styles.hint}>Part déposant exigible : {money(b.earnedCents)}</Text>
                  <Text style={styles.hint}>Déjà versé : {money(b.paidCents)}</Text>
                  <Text style={styles.title}>
                    {b.balanceCents < 0
                      ? `Régularisation à récupérer : ${money(-b.balanceCents)}`
                      : `À reverser : ${money(b.balanceCents)}`}
                  </Text>
                  {b.balanceCents > 0 && (
                    <Button
                      label="Marquer payé"
                      onPress={() => {
                        setMessage('');
                        setPaymentSeller(b.sellerId);
                        setPaymentAmount((b.balanceCents / 100).toFixed(2));
                        setPaymentReference('');
                        setPaymentDate(today());
                        setPaymentMethod('Virement');
                      }}
                    />
                  )}
                </View>
              ))}
            {balanceFilter === 'due' && !balances.some((b) => b.balanceCents > 0) && (
              <Text style={styles.hint}>
                Tous les déposants sont à jour : aucune somme à reverser.
              </Text>
            )}
            {paymentSeller && (
              <Modal
                visible
                animationType="slide"
                transparent
                onRequestClose={() => {
                  if (!busy) setPaymentSeller('');
                }}
              >
                <View style={styles.modalBackdrop}>
                  <View style={styles.modalCard}>
                    <ScrollView
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={styles.modalContent}
                    >
                      <Text style={styles.title}>
                        Versement à {balances.find((b) => b.sellerId === paymentSeller)?.sellerName}
                      </Text>
                      {!!message && (
                        <Text accessibilityRole="alert" style={styles.message}>
                          {message}
                        </Text>
                      )}
                      <Field
                        label="Montant versé (€)"
                        value={paymentAmount}
                        onChangeText={setPaymentAmount}
                        keyboardType="decimal-pad"
                      />
                      <Field
                        label="Date du versement (AAAA-MM-JJ)"
                        value={paymentDate}
                        onChangeText={setPaymentDate}
                      />
                      <Text style={styles.title}>Mode du versement effectué</Text>
                      <Choices
                        value={paymentMethod}
                        onChange={setPaymentMethod}
                        values={[
                          ['Virement', 'Virement'],
                          ['Espèces', 'Espèces'],
                        ]}
                      />
                      <Field
                        label="Référence du paiement"
                        value={paymentReference}
                        onChangeText={setPaymentReference}
                      />
                      <Text style={styles.hint}>
                        Enregistrez uniquement un paiement déjà effectué. Vous pouvez réduire le
                        montant pour un versement partiel ; aucun transfert d’argent n’est
                        déclenché.
                      </Text>
                      <Button
                        disabled={busy}
                        label={busy ? 'Enregistrement…' : 'Confirmer : je l’ai payé'}
                        onPress={() =>
                          void run(async () => {
                            const amountCents = amount(paymentAmount, 'Montant');
                            if (
                              amountCents <= 0 ||
                              amountCents >
                                (balances.find((b) => b.sellerId === paymentSeller)?.balanceCents ??
                                  0)
                            )
                              throw new Error(
                                'Le montant doit être positif et ne pas dépasser le solde.',
                              );
                            if (!paymentMethod.trim())
                              throw new Error('Indiquez le mode de paiement.');
                            const input = {
                              sellerId: paymentSeller,
                              amountCents,
                              occurredAt: dateValue(paymentDate),
                              method: paymentMethod.trim(),
                              reference: paymentReference.trim() || undefined,
                            };
                            await recordConsignmentPayment({
                              ...input,
                              operationId: operation('payment', input),
                            });
                            attempts.current.delete(`payment:${JSON.stringify(input)}`);
                            setPaymentSeller('');
                            await load();
                            setMessage('Versement enregistré.');
                          })
                        }
                      />
                      <Button
                        disabled={busy}
                        label="Annuler"
                        onPress={() => setPaymentSeller('')}
                      />
                    </ScrollView>
                  </View>
                </View>
              </Modal>
            )}
            <Text style={styles.title}>Historique des versements</Text><Pagination data={paymentsData} />
            {payments.map((p) => (
              <View key={p._id} style={styles.card}>
                <Text style={styles.title}>
                  {p.sellerName} · {money(p.amountCents)}
                </Text>
                <Text style={styles.hint}>
                  {new Date(p.occurredAt).toLocaleDateString('fr-BE')} · {p.method}
                  {p.reference ? ` · ${p.reference}` : ''}
                </Text>
              </View>
            ))}
          </>
        )}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: 20,
    justifyContent: 'center',
  },
  modalCard: { maxHeight: '85%', backgroundColor: '#fff', borderRadius: 14 },
  modalContent: { padding: 20 },
  step: { color: '#60727e', fontSize: 12, fontWeight: '700', marginVertical: 12 },
  heading: { fontSize: 25, fontWeight: '700', color: '#143d59', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '700', color: '#143d59', marginBottom: 6 },
  card: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#d7e1e7',
  },
  article: { borderTopWidth: 1, borderColor: '#dbe4ea', paddingTop: 16, marginTop: 16 },
  hint: { color: '#526875', lineHeight: 21, marginVertical: 5 },
  message: {
    color: '#143d59',
    backgroundColor: '#e8f1f6',
    padding: 12,
    marginVertical: 8,
    borderRadius: 8,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    padding: 10,
    borderWidth: 1,
    borderColor: '#cbd5dc',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  selected: { backgroundColor: '#dcebf4', borderColor: '#143d59' },
  chipText: { color: '#143d59', fontWeight: '600' },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    padding: 12,
    marginVertical: 5,
    backgroundColor: '#143d59',
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
