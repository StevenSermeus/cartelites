import { useRef, useState, type ComponentRef } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { SignatoryProfile } from "../../../../packages/domain/src/consignmentReceipt";
import {
  validSignature,
  type Signature,
} from "../../../../packages/domain/src/signature";
import { request } from "../data/apiRepository";
import { publishSignedArchive } from "../data/receiptDocument";
import { SignaturePad } from "./SignaturePad";
import { ReceiptPdfPreview, ReceiptPdfViewer } from "./ReceiptPdfViewer";

type Draft = {
  id: string;
  consent: string;
  pdfBase64: string;
  snapshot: {
    reference: string;
    client: { name: string; email?: string };
    items: {
      name: string;
      purchasePriceCents?: number;
      askingPriceCents?: number;
    }[];
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
      "Le compte transactionnel Brevo doit être activé : contactez contact@brevo.com.",
    unauthorized_ip: "Autorisez l’adresse IP du serveur dans Brevo.",
    invalid_key: "La clé API Brevo est refusée.",
    permission_denied:
      "La clé Brevo doit autoriser les e-mails transactionnels.",
    sender_invalid: "L’expéditeur est refusé par Brevo.",
    quota_exceeded: "Le quota Brevo est atteint.",
    recipient_invalid: "L’adresse du destinataire est refusée.",
    archive_unavailable: "Le PDF archivé est inaccessible.",
    provider_error: "Brevo a refusé l’envoi. Consultez ses journaux.",
    network_error: "Aucune confirmation reçue de Brevo.",
  })[code ?? ""] ?? "";
const emailLabel = (status: string) =>
  ({
    accepted: "Accepté par Brevo (réception non confirmée)",
    pending: "Envoi en attente",
    sending: "Envoi en cours",
    not_configured: "Brevo non configuré : remettre la copie manuellement",
    no_email: "Client sans e-mail : remettre la copie manuellement",
    failed: "Échec d’envoi : réessayez",
    unknown: "Résultat incertain : vérifiez Brevo avant de renvoyer",
  })[status] ?? status;
async function share(pdfBase64: string, filename: string) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Le partage de PDF est indisponible.");
  const uri = `${FileSystem.cacheDirectory}${filename.replace(/[^a-z0-9._-]/gi, "-")}`;
  await FileSystem.writeAsStringAsync(uri, pdfBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  try {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
    });
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(
      () => undefined,
    );
  }
}
export function ReceiptSigning({
  kind,
  targetId,
  allowSigning = true,
  onSigned,
  onSignedPending,
}: {
  kind: "purchase" | "consignment";
  targetId: string;
  allowSigning?: boolean;
  onSigned?: (pdf: string) => void;
  onSignedPending?: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const content = useRef<ComponentRef<typeof ScrollView>>(null);
  const [editingCompany, setEditingCompany] = useState(false);
  const [archivesOpen, setArchivesOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [signedPdf, setSignedPdf] = useState<string | null>(null);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
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
  const lock = useRef(false);
  const [preview, setPreview] = useState<string | null>(null);
  const refresh = async () =>
    setSigned(
      (
        await request<Signed[]>(
          `/receipts?kind=${kind}&targetId=${encodeURIComponent(targetId)}`,
        )
      ).filter((row) => typeof row.signedAt === "number"),
    );
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Opération impossible.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function goStep(value: number) {
    setStep(value);
    content.current?.scrollTo({ y: 0, animated: false });
  }
  async function loadOriginal(id: string) {
    const archived = await request<{ pdfBase64: string }>(
      `/receipts/${id}/pdf`,
    );
    setSignedPdf(archived.pdfBase64);
    onSigned?.(archived.pdfBase64);
    return archived.pdfBase64;
  }
  async function prepare() {
    const p = await request<SignatoryProfile>("/auth/profile");
    setProfile(p);
    if (!p.firstName || !p.lastName || !p.capacity)
      throw new Error(
        "Complétez votre nom et votre qualité dans Compte → Mon signataire boutique.",
      );
    const d = await request<Draft>("/receipts/prepare", { kind, targetId });
    setDraft(d);
    setReference(d.snapshot.reference);
    setSignedPdf(null);
    setEditingCompany(!p.signature || !validSignature(p.signature));
    setCompany(p.signature ?? []);
    setClient([]);
    setAccepted(false);
    setCompanyAccepted(false);
    setSave(false);
    setRead(false);
    goStep(0);
    setCompleted(null);
  }
  async function sign() {
    if (!draft || !read || !companyAccepted || !accepted) return;
    if (save && profile)
      await request(
        "/auth/profile",
        { ...profile, signature: company },
        "PATCH",
      );
    const result = await request<Signed>(`/receipts/${draft.id}/sign`, {
      company,
      client,
      accepted: true,
    });
    setSignedPdf(null);
    const final = { ...result, recipient: draft.snapshot.client.email };
    setCompleted(final);
    setSigned((rows) => [final, ...rows.filter((row) => row.id !== result.id)]);
    goStep(3);

    setDraft(null);
    setClient([]);
    setCompany([]);
    await publishSignedArchive(
      () => onSignedPending?.(),
      async () =>
        (await request<{ pdfBase64: string }>(`/receipts/${result.id}/pdf`))
          .pdfBase64,
      (pdf) => {
        setSignedPdf(pdf);
        onSigned?.(pdf);
      },
    );
    await refresh();
    setSigned((rows) =>
      rows.map((row) =>
        row.id === result.id
          ? {
              ...row,
              emailStatus: result.emailStatus,
              emailError: result.emailError,
            }
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
        padding: 16,
        minHeight: 50,
        borderRadius: 13,
        backgroundColor: "#f8ecd6",
        opacity: busy || disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color: "#815216", fontSize: 16, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
  const check = (
    label: string,
    value: boolean,
    set: (value: boolean) => void,
  ) => (
    <View style={{ gap: 6 }}>
      <Text style={{ color: "#815216", fontSize: 16, fontWeight: "600" }}>
        {label}
      </Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={set}
        disabled={busy}
      />
    </View>
  );
  function close() {
    if (busy) return;
    if (draft)
      Alert.alert(
        "Quitter la signature ?",
        "Les tracés en cours seront abandonnés.",
        [
          { text: "Continuer à signer" },
          {
            text: "Quitter",
            style: "destructive",
            onPress: () => {
              setDraft(null);
              setCompany([]);
              setClient([]);
              setOpen(false);
            },
          },
        ],
      );
    else setOpen(false);
  }
  return (
    <View style={{ marginVertical: 12 }}>
      {button("Ouvrir le document et les signatures", () => {
        setOpen(true);
        void run(async () => {
          const rows = await request<Signed[]>(
            `/receipts?kind=${kind}&targetId=${encodeURIComponent(targetId)}`,
          );
          const originals = rows
            .filter((row) => typeof row.signedAt === "number")
            .sort((a, b) => b.signedAt! - a.signedAt!);
          setSigned(originals);
          if (originals.length) {
            setCompleted(originals[0]);
            goStep(3);
            await loadOriginal(originals[0].id);
          } else if (allowSigning) await prepare();
        });
      })}
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="fullScreen"
        supportedOrientations={[
          "portrait",
          "landscape-left",
          "landscape-right",
        ]}
        onRequestClose={close}
      >
        {preview ? (
          <ReceiptPdfViewer
            embedded
            base64={preview}
            onClose={() => setPreview(null)}
          />
        ) : (
          <SafeAreaView style={{ flex: 1, backgroundColor: "#f2f2f7" }}>
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: landscape ? 4 : 12,
                borderBottomWidth: 1,
                borderColor: "#e7e7ec",
                gap: 4,
              }}
            >
              <Pressable
                disabled={busy}
                accessibilityRole="button"
                onPress={close}
              >
                <Text style={{ color: "#795018", paddingVertical: 8 }}>
                  ← Retour au dossier
                </Text>
              </Pressable>
              {!landscape && (
                <Text style={{ fontSize: 26, fontWeight: "700" }}>
                  Signature du document
                </Text>
              )}
              <Text>
                {step + 1} / 4 ·{" "}
                {
                  [
                    "Lire le document",
                    "Signature boutique",
                    "Signature client",
                    "Exemplaire signé",
                  ][step]
                }
              </Text>
            </View>
            <ScrollView
              ref={content}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                padding: landscape ? 12 : 20,
                gap: landscape ? 10 : 20,
              }}
            >
              {!!error && (
                <Text
                  accessibilityRole="alert"
                  style={{ padding: 16, backgroundColor: "#fff3db" }}
                >
                  {error}
                </Text>
              )}
              {!busy && !draft && !completed && !allowSigning && (
                <Text>Aucun document signé pour ce dossier.</Text>
              )}
              {busy && (
                <ActivityIndicator accessibilityLabel="Chargement du document" />
              )}
              {!draft &&
                !completed &&
                !busy &&
                allowSigning &&
                button("Réessayer", () => void run(prepare))}
              {draft && (
                <View style={{ gap: 18 }}>
                  {!(landscape && step === 2) && (
                    <>
                      <Text style={{ fontSize: 18, fontWeight: "600" }}>
                        {draft.snapshot.reference} ·{" "}
                        {draft.snapshot.client.name}
                      </Text>
                      <Text>
                        Copie à :{" "}
                        {draft.snapshot.client.email ||
                          "aucune adresse renseignée"}
                      </Text>
                    </>
                  )}
                  {step === 0 && (
                    <>
                      <Text>
                        Vérifiez le document complet, ses conditions et
                        l’adresse du destinataire.
                      </Text>
                      <ReceiptPdfPreview base64={draft.pdfBase64} />
                      {button("Agrandir le document", () =>
                        setPreview(draft.pdfBase64),
                      )}
                      {button(
                        "Partager le PDF",
                        () =>
                          void run(() =>
                            share(
                              draft.pdfBase64,
                              `document-a-lire-${draft.id}.pdf`,
                            ),
                          ),
                      )}
                      {check(
                        "Nous avons lu le PDF complet et vérifié les informations.",
                        read,
                        setRead,
                      )}
                    </>
                  )}
                  {step === 1 && (
                    <>
                      <Text style={{ fontSize: 22, fontWeight: "600" }}>
                        La signature de la boutique
                      </Text>
                      <Text>
                        {profile?.firstName} {profile?.lastName} ·{" "}
                        {profile?.capacity}
                      </Text>
                      <SignaturePad
                        inline={editingCompany}
                        readOnly={!editingCompany}
                        label={
                          editingCompany
                            ? "Dessinez votre signature"
                            : "Signature enregistrée"
                        }
                        value={company}
                        onChange={(value) => {
                          setCompany(value);
                          setCompanyAccepted(false);
                        }}
                        disabled={busy}
                      />
                      {button(
                        editingCompany
                          ? "Terminer la modification"
                          : "Modifier ma signature",
                        () => setEditingCompany(!editingCompany),
                        editingCompany && !validSignature(company),
                      )}
                      {editingCompany &&
                        check(
                          "Enregistrer pour les prochains documents",
                          save,
                          setSave,
                        )}
                      {check(
                        "Je confirme signer ce document pour la boutique.",
                        companyAccepted,
                        setCompanyAccepted,
                      )}

                      {button("Retour au document", () => goStep(0))}
                    </>
                  )}
                  {step === 2 && (
                    <>
                      {!landscape && (
                        <>
                          <Text style={{ fontSize: 22, fontWeight: "600" }}>
                            Au client de signer
                          </Text>
                          <Text>
                            {draft.snapshot.client.name}, signez dans le cadre
                            ci-dessous.
                          </Text>
                        </>
                      )}
                      <SignaturePad
                        inline
                        label="Signature du client"
                        value={client}
                        onChange={(value) => {
                          setClient(value);
                          setAccepted(false);
                        }}
                        disabled={busy}
                      />
                      {check(draft.consent, accepted, setAccepted)}
                      <Text>
                        Un original sera conservé puis son envoi par e-mail sera
                        tenté. La validation du stock reste distincte.
                      </Text>

                      {button("Relire le document", () =>
                        setPreview(draft.pdfBase64),
                      )}
                      {button("Retour à ma signature", () => goStep(1))}
                    </>
                  )}
                </View>
              )}
              {completed && (
                <View
                  style={{
                    gap: 12,
                    padding: 18,
                    backgroundColor: "white",
                    borderRadius: 12,
                  }}
                >
                  <Text style={{ fontSize: 22, fontWeight: "700" }}>
                    Le PDF signé est conservé.
                  </Text>
                  {!!reference && <Text>{reference}</Text>}
                  <Text>
                    Les deux signatures sont enregistrées dans l’original.
                  </Text>
                  {signedPdf ? (
                    <ReceiptPdfPreview base64={signedPdf} />
                  ) : (
                    <Text>
                      L’original signé doit être rechargé pour être consulté ou
                      partagé.
                    </Text>
                  )}
                  {button(
                    signedPdf
                      ? "Lire l’original signé"
                      : "Recharger l’original signé",
                    () =>
                      void run(async () =>
                        setPreview(
                          signedPdf ?? (await loadOriginal(completed.id)),
                        ),
                      ),
                  )}
                  {button(
                    "Partager l’original signé",
                    () =>
                      void run(async () =>
                        share(
                          signedPdf ?? (await loadOriginal(completed.id)),
                          `document-signe-${completed.id}.pdf`,
                        ),
                      ),
                  )}
                  <Text style={{ fontWeight: "600", marginTop: 8 }}>
                    Copie au client
                  </Text>
                  <Text>{emailLabel(completed.emailStatus)}</Text>
                  {!!completed.emailError && (
                    <Text accessibilityRole="alert">
                      {errorLabel(completed.emailError)}
                    </Text>
                  )}
                  <Text>
                    Destinataire : {completed.recipient || "non renseigné"}
                  </Text>
                </View>
              )}
              {!draft &&
                button(
                  archivesOpen
                    ? "Masquer les versions précédentes"
                    : "Versions et options d’envoi",
                  () => setArchivesOpen(!archivesOpen),
                )}
              {!draft && archivesOpen && (
                <View style={{ gap: 18 }}>
                  <Text style={{ fontSize: 20, fontWeight: "600" }}>
                    Exemplaires signés
                  </Text>
                  {!signed.length && <Text>Aucun exemplaire signé.</Text>}
                  {signed.map((row) => (
                    <View
                      key={row.id}
                      style={{
                        padding: 18,
                        backgroundColor: "white",
                        borderRadius: 12,
                        gap: 12,
                      }}
                    >
                      <Text>
                        {new Date(row.signedAt!).toLocaleString("fr-BE")}
                      </Text>
                      <Text>{row.recipient || "Adresse e-mail manquante"}</Text>
                      <Text>{emailLabel(row.emailStatus)}</Text>
                      {!!row.emailError && (
                        <Text accessibilityRole="alert">
                          {errorLabel(row.emailError)}
                        </Text>
                      )}
                      {button(
                        "Lire l’original signé",
                        () =>
                          void run(async () => {
                            const pdf = await request<{ pdfBase64: string }>(
                              `/receipts/${row.id}/pdf`,
                            );
                            setPreview(pdf.pdfBase64);
                          }),
                      )}
                      {button(
                        "Partager l’original signé",
                        () =>
                          void run(async () => {
                            const pdf = await request<{
                              pdfBase64: string;
                              filename: string;
                            }>(`/receipts/${row.id}/pdf`);
                            await share(pdf.pdfBase64, pdf.filename);
                          }),
                      )}
                      {button(
                        "Envoyer / renvoyer au client",
                        () =>
                          Alert.alert(
                            "Renvoyer cet exemplaire ?",
                            `Destinataire : ${row.recipient}. Vérifiez Brevo si l’envoi précédent est incertain.`,
                            [
                              { text: "Annuler" },
                              {
                                text: "Envoyer",
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
                    button(
                      "Préparer une nouvelle version",
                      () => void run(prepare),
                    )}
                </View>
              )}
            </ScrollView>
            {draft && (
              <View
                style={{
                  padding: landscape ? 8 : 16,
                  borderTopWidth: 1,
                  borderColor: "#e7e7ec",
                  backgroundColor: "#f2f2f7",
                }}
              >
                {step === 0 &&
                  button("Continuer vers ma signature", () => goStep(1), !read)}
                {step === 1 &&
                  button(
                    "Faire signer le client",
                    () => goStep(2),
                    !companyAccepted ||
                      !validSignature(company) ||
                      editingCompany,
                  )}
                {step === 2 &&
                  button(
                    busy
                      ? "Archivage et envoi…"
                      : "Signer et envoyer l’exemplaire",
                    () => void run(sign),
                    !accepted ||
                      !validSignature(client) ||
                      !validSignature(company),
                  )}
              </View>
            )}
            {completed && (
              <View style={{ padding: 16 }}>{button("Terminer", close)}</View>
            )}
          </SafeAreaView>
        )}
      </Modal>
    </View>
  );
}
