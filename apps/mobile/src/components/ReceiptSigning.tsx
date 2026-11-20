import { useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { SignatoryProfile } from '../../../../packages/domain/src/consignmentReceipt';
import { validSignature, type Signature } from '../../../../packages/domain/src/signature';
import { request } from '../data/apiRepository';
import { SignaturePad } from './SignaturePad';

type Draft = {
  id: string;
  consent: string;
  pdfBase64: string;
  snapshot: {
    reference: string;
    client: { name: string; email?: string };
    items: { name: string; purchasePriceCents?: number; askingPriceCents?: number }[];
  };
};
type Signed = {
  id: string;
  signedAt?: number;
  emailStatus: string;
  emailError?: string;
  recipient?: string;
};
const errorLabel = (code?: string) =>
  ({
    account_inactive:
      'Le compte transactionnel Brevo doit être activé : contactez contact@brevo.com.',
    unauthorized_ip: 'Autorisez l’adresse IP du serveur dans Brevo.',
    invalid_key: 'La clé API Brevo est refusée.',
    permission_denied: 'La clé Brevo doit autoriser les e-mails transactionnels.',
    sender_invalid: 'L’expéditeur est refusé par Brevo.',
    quota_exceeded: 'Le quota Brevo est atteint.',
    recipient_invalid: 'L’adresse du destinataire est refusée.',
    archive_unavailable: 'Le PDF archivé est inaccessible.',
    provider_error: 'Brevo a refusé l’envoi. Consultez ses journaux.',
    network_error: 'Aucune confirmation reçue de Brevo.',
  })[code ?? ''] ?? '';
const emailLabel = (status: string) =>
  ({
    accepted: 'Accepté par Brevo (réception non confirmée)',
    pending: 'Envoi en attente',
    sending: 'Envoi en cours',
    not_configured: 'Brevo non configuré : remettre la copie manuellement',
    no_email: 'Client sans e-mail : remettre la copie manuellement',
    failed: 'Échec d’envoi : réessayez',
    unknown: 'Résultat incertain : vérifiez Brevo avant de renvoyer',
  })[status] ?? status;
async function share(pdfBase64: string, filename: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Le partage de PDF est indisponible.');
  const uri = `${FileSystem.cacheDirectory}${filename.replace(/[^a-z0-9._-]/gi, '-')}`;
  await FileSystem.writeAsStringAsync(uri, pdfBase64, { encoding: FileSystem.EncodingType.Base64 });
  try {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}
export function ReceiptSigning({
  kind,
  targetId,
  allowSigning = true,
}: {
  kind: 'purchase' | 'consignment';
  targetId: string;
  allowSigning?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null),
    [profile, setProfile] = useState<SignatoryProfile | null>(null);
  const [company, setCompany] = useState<Signature>([]),
    [client, setClient] = useState<Signature>([]);
  const [save, setSave] = useState(false),
    [accepted, setAccepted] = useState(false),
    [companyAccepted, setCompanyAccepted] = useState(false),
    [read, setRead] = useState(false);
  const [signed, setSigned] = useState<Signed[]>([]);
  const [step, setStep] = useState(0),
    [completed, setCompleted] = useState<Signed | null>(null);
  const [delivery, setDelivery] = useState<{ configured: boolean; fromEmail: string } | null>(null);
  const lock = useRef(false);
  const refresh = async () =>
    setSigned(
      await request<Signed[]>(`/receipts?kind=${kind}&targetId=${encodeURIComponent(targetId)}`),
    );
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opération impossible.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function prepare() {
    const p = await request<SignatoryProfile>('/auth/profile');
    setProfile(p);
    if (!p.firstName || !p.lastName || !p.capacity)
      throw new Error(
        'Complétez votre nom et votre qualité dans Compte → Mon signataire boutique.',
      );
    const d = await request<Draft>('/receipts/prepare', { kind, targetId });
    setDraft(d);
    setCompany(p.signature ?? []);
    setClient([]);
    setAccepted(false);
    setCompanyAccepted(false);
    setSave(false);
    setRead(false);
    setStep(0);
    setCompleted(null);
  }
  async function sign() {
    if (!draft || !read || !companyAccepted || !accepted) return;
    if (save && profile)
      await request('/auth/profile', { ...profile, signature: company }, 'PATCH');
    const result = await request<Signed>(`/receipts/${draft.id}/sign`, {
      company,
      client,
      accepted: true,
    });
    setCompleted({ ...result, recipient: draft.snapshot.client.email });
    setStep(3);
    setDraft(null);
    setClient([]);
    setCompany([]);
    await refresh();
    setSigned((rows) =>
      rows.map((row) =>
        row.id === result.id
          ? { ...row, emailStatus: result.emailStatus, emailError: result.emailError }
          : row,
      ),
    );
  }
  const button = (label: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={busy || disabled}
      onPress={onPress}
      style={{
        padding: 14,
        borderRadius: 8,
        backgroundColor: '#fbf0d9',
        opacity: busy || disabled ? 0.5 : 1,
      }}
    >
      <Text>{label}</Text>
    </Pressable>
  );
  const check = (label: string, value: boolean, set: (value: boolean) => void) => (
    <View style={{ gap: 6 }}>
      <Text>{label}</Text>
      <Switch accessibilityLabel={label} value={value} onValueChange={set} disabled={busy} />
    </View>
  );
  function close() {
    if (busy) return;
    if (draft)
      Alert.alert('Quitter la signature ?', 'Les tracés en cours seront abandonnés.', [
        { text: 'Continuer à signer' },
        {
          text: 'Quitter',
          style: 'destructive',
          onPress: () => {
            setDraft(null);
            setCompany([]);
            setClient([]);
            setOpen(false);
          },
        },
      ]);
    else setOpen(false);
  }
  return (
    <View style={{ marginVertical: 12 }}>
      {button('Ouvrir la page de signature →', () => {
        setOpen(true);
        void run(async () => {
          await refresh();
          setDelivery(await request('/receipts/delivery-config'));
        });
      })}
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={close}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f3eb' }}>
          <View style={{ padding: 16, borderBottomWidth: 1, borderColor: '#e4d9c7', gap: 10 }}>
            <Pressable disabled={busy} accessibilityRole="button" onPress={close}>
              <Text style={{ color: '#795018', paddingVertical: 8 }}>← Retour au dossier</Text>
            </Pressable>
            <Text style={{ fontSize: 26, fontWeight: '700' }}>Signature du document</Text>
            <Text>
              {step + 1} / 4 ·{' '}
              {
                ['Lire le document', 'Signature boutique', 'Signature client', 'Exemplaire signé'][
                  step
                ]
              }
            </Text>
            <Text style={{ fontSize: 12, color: '#75695c' }}>
              {delivery
                ? delivery.configured
                  ? `Envoi Brevo · ${delivery.fromEmail}`
                  : 'Brevo non configuré : aucun e-mail ne partira'
                : 'Vérification de l’envoi…'}
            </Text>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, gap: 20 }}
          >
            {!!error && (
              <Text accessibilityRole="alert" style={{ padding: 16, backgroundColor: '#fff3db' }}>
                {error} Si le document a changé ou expiré, annulez puis préparez une nouvelle
                version.
              </Text>
            )}
            {!draft && !completed && (
              <View style={{ gap: 16 }}>
                <Text style={{ fontSize: 20, fontWeight: '600' }}>
                  Vérifier, puis signer. Une étape à la fois.
                </Text>
                <Text>
                  Le document sera conservé avec les deux signatures. Son envoi par e-mail sera
                  indiqué séparément.
                </Text>
                {allowSigning && button('Préparer le document à signer', () => void run(prepare))}
              </View>
            )}
            {draft && (
              <View style={{ gap: 18 }}>
                <Text style={{ fontSize: 18, fontWeight: '600' }}>
                  {draft.snapshot.reference} · {draft.snapshot.client.name}
                </Text>
                <Text>Copie à : {draft.snapshot.client.email || 'aucune adresse renseignée'}</Text>
                {step === 0 && (
                  <>
                    <Text>
                      Vérifiez le document complet, ses conditions et l’adresse du destinataire.
                    </Text>
                    {draft.snapshot.items.map((item, i) => (
                      <Text key={i}>
                        {item.name} ·{' '}
                        {((item.purchasePriceCents ?? item.askingPriceCents ?? 0) / 100).toFixed(2)}{' '}
                        €
                      </Text>
                    ))}
                    {button(
                      'Ouvrir / partager le PDF à lire',
                      () =>
                        void run(() => share(draft.pdfBase64, `document-a-lire-${draft.id}.pdf`)),
                    )}
                    {check(
                      'Nous avons lu le PDF complet et vérifié les informations.',
                      read,
                      setRead,
                    )}
                    {button('Continuer vers ma signature →', () => setStep(1), !read)}
                  </>
                )}
                {step === 1 && (
                  <>
                    <Text style={{ fontSize: 22, fontWeight: '600' }}>
                      La signature de la boutique
                    </Text>
                    <Text>
                      {profile?.firstName} {profile?.lastName} · {profile?.capacity}
                    </Text>
                    <SignaturePad
                      label="Votre signature"
                      value={company}
                      onChange={setCompany}
                      disabled={busy}
                    />
                    {check(
                      'Enregistrer cette signature pour les prochains documents',
                      save,
                      setSave,
                    )}
                    {check(
                      'Je confirme signer ce document pour la boutique.',
                      companyAccepted,
                      setCompanyAccepted,
                    )}
                    {button(
                      'Faire signer le client →',
                      () => setStep(2),
                      !companyAccepted || !validSignature(company),
                    )}
                    {button('Retour au document', () => setStep(0))}
                  </>
                )}
                {step === 2 && (
                  <>
                    <Text style={{ fontSize: 22, fontWeight: '600' }}>Au client de signer</Text>
                    <Text>
                      {draft.snapshot.client.name}, signez au doigt dans le cadre ci-dessous.
                    </Text>
                    <SignaturePad
                      label="Signature du client"
                      value={client}
                      onChange={setClient}
                      disabled={busy}
                    />
                    {check(draft.consent, accepted, setAccepted)}
                    <Text>
                      Un original sera conservé puis son envoi par e-mail sera tenté. La validation
                      du stock reste distincte.
                    </Text>
                    {button(
                      busy ? 'Archivage et envoi…' : 'Signer et envoyer l’exemplaire',
                      () => void run(sign),
                      !accepted || !validSignature(client) || !validSignature(company),
                    )}
                    {button('Retour à ma signature', () => setStep(1))}
                  </>
                )}
                {button('Annuler la signature en cours', () =>
                  Alert.alert(
                    'Abandonner les signatures ?',
                    'Vous pourrez préparer une nouvelle version.',
                    [
                      { text: 'Continuer' },
                      {
                        text: 'Abandonner',
                        style: 'destructive',
                        onPress: () => {
                          setDraft(null);
                          setCompany([]);
                          setClient([]);
                          setStep(0);
                        },
                      },
                    ],
                  ),
                )}
              </View>
            )}
            {completed && (
              <View style={{ gap: 12, padding: 18, backgroundColor: 'white', borderRadius: 12 }}>
                <Text style={{ fontSize: 22, fontWeight: '700' }}>Le PDF signé est conservé.</Text>
                <Text>{emailLabel(completed.emailStatus)}</Text>
                {!!completed.emailError && (
                  <Text accessibilityRole="alert">{errorLabel(completed.emailError)}</Text>
                )}
                <Text>Destinataire : {completed.recipient || 'non renseigné'}</Text>
              </View>
            )}
            {!draft && (
              <View style={{ gap: 18 }}>
                <Text style={{ fontSize: 20, fontWeight: '600' }}>Exemplaires signés</Text>
                {!signed.length && <Text>Aucun exemplaire signé.</Text>}
                {signed.map((row) => (
                  <View
                    key={row.id}
                    style={{ padding: 18, backgroundColor: 'white', borderRadius: 12, gap: 12 }}
                  >
                    <Text>{new Date(row.signedAt!).toLocaleString('fr-BE')}</Text>
                    <Text>{row.recipient || 'Adresse e-mail manquante'}</Text>
                    <Text>{emailLabel(row.emailStatus)}</Text>
                    {!!row.emailError && (
                      <Text accessibilityRole="alert">{errorLabel(row.emailError)}</Text>
                    )}
                    {button(
                      'Ouvrir / partager l’original signé',
                      () =>
                        void run(async () => {
                          const pdf = await request<{ pdfBase64: string; filename: string }>(
                            `/receipts/${row.id}/pdf`,
                          );
                          await share(pdf.pdfBase64, pdf.filename);
                        }),
                    )}
                    {button(
                      'Envoyer / renvoyer au client',
                      () =>
                        Alert.alert(
                          'Renvoyer cet exemplaire ?',
                          `Destinataire : ${row.recipient}. Vérifiez Brevo si l’envoi précédent est incertain.`,
                          [
                            { text: 'Annuler' },
                            {
                              text: 'Envoyer',
                              onPress: () =>
                                void run(async () => {
                                  const result = await request<{
                                    emailStatus: string;
                                    emailError?: string;
                                  }>(`/receipts/${row.id}/email`, {});
                                  await refresh();
                                  if (completed?.id === row.id)
                                    setCompleted({ ...completed, ...result });
                                }),
                            },
                          ],
                        ),
                      !row.recipient,
                    )}
                  </View>
                ))}
                {completed &&
                  allowSigning &&
                  button('Préparer une nouvelle version', () => void run(prepare))}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
