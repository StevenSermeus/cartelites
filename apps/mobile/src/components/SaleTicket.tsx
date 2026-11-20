import { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { request } from '../data/apiRepository';
import { useTheme } from '../theme/ThemeProvider';
import { InventoryButton } from './InventoryManager';
import { Field } from './Field';
import { ReceiptPdfViewer } from './ReceiptPdfViewer';
type Ticket = { _id: string; createdAt: number; objectKey?: string; saleIds: string[] };
export function SaleTicket({
  saleIds,
  autoCreate = false,
}: {
  saleIds: string[];
  autoCreate?: boolean;
}) {
  const { colors } = useTheme(),
    [rows, setRows] = useState<Ticket[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [email, setEmail] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [pdf, setPdf] = useState<string | null>(null);
  const lock = useRef(false),
    generation = useRef(Crypto.randomUUID()),
    emailAttempt = useRef<{ signature: string; id: string } | null>(null),
    key = saleIds.join(',');
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ticket indisponible. La vente reste enregistrée.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function list() {
    const result = await request<Ticket[]>(
      '/sale-tickets?saleId=' + encodeURIComponent(saleIds[0]),
    );
    setRows(result);
    return result;
  }
  const generationSales = useRef<string[] | null>(null);
  async function generate() {
    generationSales.current ??= rows.find((r) => r._id === selected)?.saleIds ?? saleIds;
    const { id } = await request<{ id: string }>('/sale-tickets', {
      operationId: generation.current,
      saleIds: generationSales.current,
    });
    setSelected(id);
    await request(`/sale-tickets/${id}/pdf`);
    await list();
    generation.current = Crypto.randomUUID();
    generationSales.current = null;
    setMessage('Ticket PDF enregistré et archivé.');
  }
  useEffect(() => {
    if (!saleIds.length) return;
    void run(async () => {
      const found = await list();
      if (found.length) setSelected(found[0]._id);
      else if (autoCreate) await generate();
    });
  }, [key]);
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 16,
        padding: 16,
        gap: 8,
        marginVertical: 12,
      }}
    >
      <Text
        accessibilityRole="header"
        style={{ color: colors.text, fontSize: 20, fontWeight: '600' }}
      >
        Ticket de vente
      </Text>
      <Text style={{ color: colors.secondary }}>
        Chaque version conserve les informations au moment de sa génération. Régénérez après une
        annulation ou un encaissement.
      </Text>
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </Text>
      )}
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.success }}>
          {message}
        </Text>
      )}
      <InventoryButton
        label={rows.length ? 'Régénérer une nouvelle version' : 'Générer et archiver le ticket'}
        disabled={busy}
        onPress={() => void run(generate)}
      />
      {rows.map((r, i) => (
        <InventoryButton
          key={r._id}
          secondary={selected !== r._id}
          disabled={busy}
          label={`${i === 0 ? 'Dernière version' : 'Version archivée'} · ${new Date(r.createdAt).toLocaleString()}`}
          onPress={() => setSelected(r._id)}
        />
      ))}
      {selected && (
        <>
          <InventoryButton
            secondary
            disabled={busy}
            label="Lire le PDF"
            onPress={() =>
              void run(async () => {
                const result = await request<{ pdfBase64: string }>(
                  `/sale-tickets/${selected}/pdf`,
                );
                setPdf(result.pdfBase64);
              })
            }
          />
          <InventoryButton
            secondary
            disabled={busy}
            label="Télécharger / Partager le PDF"
            onPress={() =>
              void run(async () => {
                const r = await request<{ pdfBase64: string; filename: string }>(
                  `/sale-tickets/${selected}/pdf`,
                );
                const path = FileSystem.cacheDirectory + r.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
                await FileSystem.writeAsStringAsync(path, r.pdfBase64, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                if (!(await Sharing.isAvailableAsync())) throw new Error('Partage indisponible.');
                await Sharing.shareAsync(path, {
                  mimeType: 'application/pdf',
                  UTI: 'com.adobe.pdf',
                });
              })
            }
          />
          <Field
            label="Email du destinataire"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
          />
          <InventoryButton
            disabled={busy || !email.trim()}
            label="Envoyer par email"
            onPress={() =>
              Alert.alert('Envoyer le ticket ?', email.trim(), [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Envoyer',
                  onPress: () =>
                    void run(async () => {
                      const signature = JSON.stringify([selected, email.trim()]);
                      if (emailAttempt.current?.signature !== signature)
                        emailAttempt.current = { signature, id: Crypto.randomUUID() };
                      const result = await request<{ status: string }>(
                        `/sale-tickets/${selected}/email`,
                        { operationId: emailAttempt.current.id, recipient: email.trim() },
                      );
                      setMessage(
                        result.status === 'accepted'
                          ? 'Envoi accepté par le service email.'
                          : result.status === 'failed'
                            ? 'Le service a refusé cet envoi.'
                            : 'Envoi en cours ou résultat incertain. Vérifiez avant de renvoyer.',
                      );
                    }),
                },
              ])
            }
          />
        </>
      )}
      {pdf && (
        <ReceiptPdfViewer base64={pdf} onClose={() => setPdf(null)} backLabel="Ticket de vente" />
      )}
    </View>
  );
}
