import {captureAccountScope,getSessionScope} from '../auth/session';
import {documentVersion} from '../data/documentVersion';
import {formatCost,totalKnownCost} from '../data/inventoryCosts';
import {MotionModal as Modal} from './MotionModal';
import {shopTimezone} from '../theme/shopFormatting';
import { PageTransition } from "./PageTransition";
import { useTheme } from "../theme/ThemeProvider";
import { useRef, useState, type ComponentRef } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { SignatoryProfile } from "../../../../packages/domain/src/consignmentReceipt";
import {
  validSignature,
  type Signature,
} from "../../../../packages/domain/src/signature";
import { request,sharePdfFile } from "../data/apiRepository";
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
      purchasePriceCents?: number | null;
      askingPriceCents?: number | null;
    }[];
  };
};
type Signed = {
  version?:number;
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
type AccountScope=Awaited<ReturnType<typeof captureAccountScope>>;
const share=(pdf:string,filename:string,scope:AccountScope)=>sharePdfFile(filename,pdf,scope);
export function ReceiptSigning({
  kind,
  targetId,
  allowSigning = true,
  onSigned,
  onSignedPending,
}: {
  kind: "purchase" | "consignment" | "consignment_return";
  targetId: string;
  allowSigning?: boolean;
  onSigned?: (pdf: string) => void;
  onSignedPending?: () => void;
}) {
  const { colors } = useTheme();

  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const content = useRef<ComponentRef<typeof ScrollView>>(null);
  const [editingCompany, setEditingCompany] = useState(false);
  const [archivesOpen, setArchivesOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [summary, setSummary] = useState<{
    name: string;
    amount: number | null;
    count: number;
  } | null>(null);
  const [documentAvailable, setDocumentAvailable] = useState(false);
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
  const refresh = async (scope?:AccountScope) => {
    scope??=await captureAccountScope();scope.assertActive();
    const rows=await request<Signed[]>(`/receipts?kind=${kind}&targetId=${encodeURIComponent(targetId)}`);scope.assertActive();
    setSigned(rows.filter(row=>typeof row.signedAt==='number'));
  };
  async function run(action:(scope:AccountScope)=>Promise<void>,originalScope?:AccountScope) {
    if(lock.current)return;lock.current=true;setBusy(true);setError('');const epoch=getSessionScope();
    try{const scope=originalScope??await captureAccountScope();scope.assertActive();await action(scope);scope.assertActive();}
    catch(reason){if(epoch===getSessionScope())setError(reason instanceof Error?reason.message:'Opération impossible.');}
    finally{if(epoch===getSessionScope()){lock.current=false;setBusy(false);}}
  }
  function goStep(value: number) {
    setStep(value);
    content.current?.scrollTo({ y: 0, animated: false });
  }
  async function loadOriginal(id:string,scope?:AccountScope) {
    scope??=await captureAccountScope();scope.assertActive();
    const archived = await request<{ pdfBase64: string }>(
      `/receipts/${id}/pdf`,
    );
    scope.assertActive();
    setSignedPdf(archived.pdfBase64);
    onSigned?.(archived.pdfBase64);
    return archived.pdfBase64;
  }
  async function prepare(scope?:AccountScope) {
    scope??=await captureAccountScope();scope.assertActive();
    const p = await request<SignatoryProfile>("/auth/profile");
    scope.assertActive();
    setProfile(p);
    if (!p.firstName || !p.lastName || !p.capacity)
      throw new Error(
        "Complétez votre nom et votre qualité dans Compte → Mon signataire boutique.",
      );
    const d = await request<Draft>("/receipts/prepare", { kind, targetId });
    scope.assertActive();
    setDraft(d);
    setReference(d.snapshot.reference);
    setSummary({
      name: d.snapshot.client.name,
      count: d.snapshot.items.length,
      amount: totalKnownCost(d.snapshot.items.map(item=>kind==='purchase'?item.purchasePriceCents:item.askingPriceCents)),
    });
    setDocumentAvailable(false);
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
  async function sign(scope?:AccountScope) {
    scope??=await captureAccountScope();scope.assertActive();
    if (!draft || !read || !companyAccepted || !accepted) return;
    if (save && profile)
      await request(
        "/auth/profile",
        { ...profile, signature: company },
        "PATCH",
      );
    scope.assertActive();
    const result = await request<Signed>(`/receipts/${draft.id}/sign`, {
      company,
      client,
      accepted: true,
    });
    scope.assertActive();
    setSignedPdf(null);
    const final = { ...result, recipient: draft.snapshot.client.email };
    setCompleted(final);
    setSigned((rows) => [final, ...rows.filter((row) => row.id !== result.id)]);
    goStep(3);

    setDraft(null);
    setClient([]);
    setCompany([]);
    await publishSignedArchive(
      () => {scope.assertActive();onSignedPending?.();},
      async () => {const resultPdf=await request<{pdfBase64:string}>(`/receipts/${result.id}/pdf`);scope.assertActive();return resultPdf.pdfBase64;},
      (pdf) => {
        scope.assertActive();setSignedPdf(pdf);
        onSigned?.(pdf);
      },
    );
    await refresh(scope);
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
  async function resend(row:Signed) {
    const epoch=getSessionScope();
    try{const scope=await captureAccountScope();scope.assertActive();Alert.alert('Renvoyer cet exemplaire ?',`Destinataire : ${row.recipient}. Vérifiez Brevo si l’envoi précédent est incertain.`,[{text:'Annuler',style:'cancel'},{text:'Envoyer',onPress:()=>void run(async(current)=>{
      current.assertActive();const result=await request<{emailStatus:string;emailError?:string}>(`/receipts/${row.id}/email`,{});current.assertActive();await refresh(current);current.assertActive();if(completed?.id===row.id)setCompleted({...completed,...result});
    },scope)}]);}catch(reason){if(epoch===getSessionScope())setError(reason instanceof Error?reason.message:'Envoi indisponible.');}
  }
  const button = (
    label: string,
    onPress: () => void,
    disabled = false,
    primary = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      disabled={busy || disabled}
      onPress={onPress}
      style={{
        paddingVertical: 14,
        paddingHorizontal: 16,
        minHeight: 49,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 13,
        backgroundColor: primary ? colors.accent : colors.surface,
        opacity: busy || disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={[
          { color: colors.text },
          {
            color: primary ? colors.onAccent : colors.accent,
            fontSize: 16,
            fontWeight: "600",
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
  const check = (
    label: string,
    value: boolean,
    set: (value: boolean) => void,
  ) => (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: busy }}
      disabled={busy}
      onPress={() => set(!value)}
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        paddingVertical: 13,
        minHeight: 44,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          borderWidth: 1,
          borderColor: value ? colors.accent : colors.border,
          backgroundColor: value ? colors.accent : colors.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {value && (
          <Text
            style={[
              { color: colors.text },
              { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
            ]}
          >
            ✓
          </Text>
        )}
      </View>
      <Text
        style={[
          { color: colors.text },
          { color: colors.text, fontSize: 14, lineHeight: 20, flex: 1 },
        ]}
      >
        {label}
      </Text>
    </Pressable>
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
        void run(async (scope) => {
          const rows = await request<Signed[]>(
            `/receipts?kind=${kind}&targetId=${encodeURIComponent(targetId)}`,
          );
          scope.assertActive();
          const originals = rows
            .filter((row) => typeof row.signedAt === "number")
            .sort((a, b) => b.signedAt! - a.signedAt!);
          setSigned(originals);
          if (originals.length) {
            setCompleted(originals[0]);
            setSummary(null);
            setReference("");
            goStep(3);
            await loadOriginal(originals[0].id,scope);
          } else if (allowSigning) await prepare(scope);
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
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <View
              style={{
                minHeight: landscape ? 44 : 51,
                paddingHorizontal: 18,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Pressable
                disabled={busy}
                accessibilityRole="button"
                onPress={() => (draft && step > 0 ? goStep(step - 1) : close())}
                style={{ minHeight: 44, justifyContent: "center" }}
              >
                <Text
                  style={[
                    { color: colors.text },
                    { color: colors.accent, fontSize: 14 },
                  ]}
                >
                  ‹ Retour
                </Text>
              </Pressable>
              <Text
                style={[
                  { color: colors.text },
                  { fontSize: 15, fontWeight: "600", color: colors.text },
                ]}
              >
                {completed
                  ? "Document signé"
                  : step === 0
                    ? "Bordereau à signer"
                    : "Signatures"}
              </Text>
              <Pressable
                disabled={busy}
                accessibilityRole="button"
                onPress={close}
                style={{ minHeight: 44, justifyContent: "center" }}
              >
                <Text
                  style={[
                    { color: colors.text },
                    { color: colors.accent, fontSize: 14 },
                  ]}
                >
                  Fermer
                </Text>
              </Pressable>
            </View>
            <ScrollView
              ref={content}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: landscape ? 28 : 20,
                paddingTop: 9,
                paddingBottom: 18,
                gap: 12,
              }}
            >
              <PageTransition transitionKey={step} style={{ gap: 12 }}>
              {!!error && (
                <Text
                  accessibilityRole="alert"
                  style={[
                    { color: colors.text },
                    { padding: 16, backgroundColor: colors.warningSoft },
                  ]}
                >
                  {error}
                </Text>
              )}
              {!busy && !draft && !completed && !allowSigning && (
                <Text style={{ color: colors.text }}>
                  Aucun document signé pour ce dossier.
                </Text>
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
                <View style={{ gap: 12 }}>
                  {!(landscape && step === 2) && (
                    <>
                      {step > 0 && (
                        <Text
                          style={[
                            { color: colors.text },
                            {
                              fontSize: 32,
                              lineHeight: 36,
                              letterSpacing: -1,
                              fontWeight: "700",
                              color: colors.text,
                            },
                          ]}
                        >
                          {step === 1
                            ? "Signature boutique"
                            : "Votre signature"}
                        </Text>
                      )}
                      <Text
                        style={[
                          { color: colors.text },
                          {
                            color: colors.accent,
                            fontSize: 12,
                            fontWeight: "600",
                          },
                        ]}
                      >
                        {step === 0
                          ? "Lire le document"
                          : step === 1
                            ? "Votre confirmation"
                            : draft.snapshot.client.name}
                      </Text>
                      <Text
                        style={[
                          { color: colors.text },
                          { color: colors.secondary, fontSize: 13 },
                        ]}
                      >
                        {draft.snapshot.reference}
                        {step < 2 ? ` · ${draft.snapshot.client.name}` : ""}
                      </Text>
                    </>
                  )}
                  {step === 0 && (
                    <>
                      <ReceiptPdfPreview
                        base64={draft.pdfBase64}
                        onReady={() => setDocumentAvailable(true)}
                        onError={() => {
                          setDocumentAvailable(false);
                          setRead(false);
                        }}
                      />
                      {button("Agrandir le document", () =>
                        setPreview(draft.pdfBase64),
                      )}
                      {button(
                        "Partager le PDF",
                        () =>
                          void run(async (scope) => {
                            await share(
                              draft.pdfBase64,
                              `${draft.snapshot.reference}.pdf`,scope,
                            );
                            setDocumentAvailable(true);
                          }),
                      )}
                      {documentAvailable &&
                        check(
                          "Nous avons lu le PDF complet et vérifié les informations.",
                          read,
                          setRead,
                        )}
                    </>
                  )}
                  {step === 1 && (
                    <>
                      <View
                        style={{
                          backgroundColor: colors.surface,
                          padding: 20,
                          borderRadius: 16,
                          gap: 10,
                        }}
                      >
                        <Text
                          style={[
                            { color: colors.text },
                            {
                              alignSelf: "center",
                              paddingVertical: 4,
                              paddingHorizontal: 8,
                              backgroundColor: colors.accentSoft,
                              borderRadius: 7,
                              color: colors.accent,
                              fontSize: 11,
                              fontWeight: "600",
                            },
                          ]}
                        >
                          {editingCompany
                            ? "Nouvelle signature"
                            : "Signature enregistrée"}
                        </Text>
                        <SignaturePad
                          readOnly={!editingCompany}
                          label={
                            editingCompany ? "Dessinez votre signature" : ""
                          }
                          value={company}
                          onChange={(value) => {
                            setCompany(value);
                            setCompanyAccepted(false);
                          }}
                          disabled={busy}
                        />
                        <Text
                          style={[
                            { color: colors.text },
                            {
                              textAlign: "center",
                              fontSize: 14,
                              fontWeight: "600",
                            },
                          ]}
                        >
                          {profile?.firstName} {profile?.lastName} ·{" "}
                          {profile?.capacity}
                        </Text>
                      </View>
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

                      <Text
                        style={[
                          { color: colors.text },
                          {
                            color: colors.secondary,
                            fontSize: 12,
                            lineHeight: 18,
                          },
                        ]}
                      >
                        Votre signature enregistrée n’est jamais appliquée sans
                        votre confirmation.
                      </Text>
                    </>
                  )}
                  {step === 2 && (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={() => setPreview(draft.pdfBase64)}
                        style={{ minHeight: 44, justifyContent: "center" }}
                      >
                        <Text
                          style={[
                            { color: colors.text },
                            { color: colors.accent, fontSize: 14 },
                          ]}
                        >
                          Relire le document
                        </Text>
                      </Pressable>
                      <SignaturePad
                        label=""
                        value={client}
                        onChange={(value) => {
                          setClient(value);
                          setAccepted(false);
                        }}
                        disabled={busy}
                      />
                      {check(draft.consent, accepted, setAccepted)}
                      <Text
                        style={[
                          { color: colors.text },
                          {
                            color: colors.secondary,
                            fontSize: 12,
                            lineHeight: 18,
                          },
                        ]}
                      >
                        L’original signé sera conservé et une copie sera envoyée
                        au client.{" "}
                        {kind === "consignment_return"
                          ? "La signature retire les articles restitués du stock."
                          : kind === "consignment"
                            ? "Le contrat signé et archivé rend les articles disponibles à la vente."
                            : "La validation du stock reste distincte."}
                      </Text>
                    </>
                  )}
                </View>
              )}
              {completed && (
                <>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 32,
                      fontWeight: "700",
                      letterSpacing: -0.7,
                    }}
                  >
                    Document signé
                  </Text>
                  <View
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: 16,
                      padding: 20,
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 53,
                        height: 53,
                        borderRadius: 27,
                        backgroundColor: colors.accentSoft,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={[
                          { color: colors.text },
                          { color: colors.success, fontSize: 29 },
                        ]}
                      >
                        ✓
                      </Text>
                    </View>
                    <Text
                      style={[
                        { color: colors.text },
                        {
                          fontSize: 34,
                          fontWeight: "700",
                          letterSpacing: -0.5,
                        },
                      ]}
                    >
                      {summary && kind !== "consignment_return"
                        ? formatCost(summary.amount)
                        : kind === "consignment_return" && summary
                          ? `${summary.count} article${summary.count > 1 ? "s" : ""} restitué${summary.count > 1 ? "s" : ""}`
                          : "Signé"}
                    </Text>
                    {!!reference && (
                      <Text
                        style={[
                          { color: colors.text },
                          { fontSize: 13, color: colors.secondary },
                        ]}
                      >
                        {reference}
                      </Text>
                    )}
                    <Text
                      style={[
                        { color: colors.text },
                        {
                          fontSize: 13,
                          color: colors.secondary,
                          textAlign: "center",
                        },
                      ]}
                    >
                      {summary
                        ? summary.name
                        : "Les signatures de la boutique et du client sont enregistrées."}
                    </Text>
                  </View>
                  <View
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: 15,
                      overflow: "hidden",
                    }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() =>
                        void run(async (scope) =>
                          setPreview(
                            signedPdf ?? (await loadOriginal(completed.id,scope)),
                          ),
                        )
                      }
                      style={{
                        padding: 15,
                        minHeight: 57,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text
                          style={[
                            { color: colors.text },
                            { fontSize: 15, fontWeight: "600" },
                          ]}
                        >
                          PDF signé
                        </Text>
                        <Text
                          style={[
                            { color: colors.text },
                            { color: colors.secondary, fontSize: 12 },
                          ]}
                        >
                          {signedPdf
                            ? "Original archivé"
                            : "Recharger l’original archivé"}
                        </Text>
                      </View>
                      <Text
                        style={[
                          { color: colors.text },
                          {
                            color: colors.accent,
                            fontSize: 12,
                            backgroundColor: colors.accentSoft,
                            padding: 5,
                            borderRadius: 7,
                          },
                        ]}
                      >
                        Archivé
                      </Text>
                      <Text
                        style={[
                          { color: colors.text },
                          { color: colors.secondary, fontSize: 21 },
                        ]}
                      >
                        ›
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() =>
                        void run(async (scope) =>
                          share(
                            signedPdf ?? (await loadOriginal(completed.id,scope)),
                            `document-signe-${completed.id}.pdf`,scope,
                          ),
                        )
                      }
                      style={{
                        padding: 15,
                        minHeight: 49,
                        borderTopWidth: 0.5,
                        borderColor: colors.border,
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={[
                          { color: colors.text },
                          { fontSize: 15, color: colors.accent },
                        ]}
                      >
                        Partager l’original signé
                      </Text>
                    </Pressable>
                  </View>
                  <Text
                    style={[
                      { color: colors.text },
                      {
                        color: colors.secondary,
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                        marginHorizontal: 14,
                        marginTop: 8,
                      },
                    ]}
                  >
                    Exemplaire client
                  </Text>
                  <View
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: 15,
                      padding: 15,
                      gap: 5,
                    }}
                  >
                    <Text
                      style={[
                        { color: colors.text },
                        { fontSize: 15, fontWeight: "600" },
                      ]}
                    >
                      Envoi par e-mail
                    </Text>
                    <Text
                      style={[
                        { color: colors.text },
                        { color: colors.secondary, fontSize: 12 },
                      ]}
                    >
                      {completed.recipient || "Adresse non renseignée"}
                    </Text>
                    <Text
                      style={[
                        { color: colors.text },
                        { color: colors.accent, fontSize: 13 },
                      ]}
                    >
                      {emailLabel(completed.emailStatus)}
                    </Text>
                    {!!completed.emailError && (
                      <Text
                        accessibilityRole="alert"
                        style={[
                          { color: colors.text },
                          { color: colors.danger, fontSize: 13 },
                        ]}
                      >
                        {errorLabel(completed.emailError)}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={[
                      { color: colors.text },
                      { color: colors.secondary, fontSize: 12, lineHeight: 18 },
                    ]}
                  >
                    Le statut de l’e-mail est suivi séparément de la signature.
                    Le PDF reste archivé même si l’envoi échoue.
                  </Text>
                </>
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
                  <Text
                    style={[
                      { color: colors.text },
                      { fontSize: 20, fontWeight: "600" },
                    ]}
                  >
                    Exemplaires signés
                  </Text>
                  {!signed.length && (
                    <Text style={{ color: colors.text }}>
                      Aucun exemplaire signé.
                    </Text>
                  )}
                  {signed.map((row) => (
                    <View
                      key={row.id}
                      style={{
                        padding: 18,
                        backgroundColor: colors.surface,
                        borderRadius: 12,
                        gap: 12,
                      }}
                    >
                      <Text style={{ color: colors.text }}>
                        {documentVersion(row.version)} · {new Date(row.signedAt!).toLocaleString("fr-BE", {timeZone: shopTimezone()})}
                      </Text>
                      <Text style={{ color: colors.text }}>
                        {row.recipient || "Adresse e-mail manquante"}
                      </Text>
                      <Text style={{ color: colors.text }}>
                        {emailLabel(row.emailStatus)}
                      </Text>
                      {!!row.emailError && (
                        <Text
                          accessibilityRole="alert"
                          style={{ color: colors.text }}
                        >
                          {errorLabel(row.emailError)}
                        </Text>
                      )}
                      {button(
                        "Lire l’original signé",
                        () =>
                          void run(async (scope) => {
                            const pdf = await request<{ pdfBase64: string }>(
                              `/receipts/${row.id}/pdf`,
                            );
                            scope.assertActive();setPreview(pdf.pdfBase64);
                          }),
                      )}
                      {button(
                        "Partager l’original signé",
                        () =>
                          void run(async (scope) => {
                            const pdf = await request<{
                              pdfBase64: string;
                              filename: string;
                            }>(`/receipts/${row.id}/pdf`);
                            scope.assertActive();await share(pdf.pdfBase64,pdf.filename,scope);
                          }),
                      )}
                      {button(
                        "Envoyer / renvoyer au client",
                        () => void resend(row),
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
              </PageTransition>
            </ScrollView>
            {draft && (
              <View
                style={{
                  paddingHorizontal: landscape ? 28 : 20,
                  paddingTop: 12,
                  paddingBottom: 18,
                  borderTopWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                }}
              >
                {step === 0 &&
                  button("Passer aux signatures", () => goStep(1), !read, true)}
                {step === 1 &&
                  button(
                    "Faire signer le client",
                    () => goStep(2),
                    !companyAccepted ||
                      !validSignature(company) ||
                      editingCompany,
                    true,
                  )}
                {step === 2 &&
                  button(
                    busy ? "Archivage et envoi…" : "Valider ma signature",
                    () => void run(sign),
                    !accepted ||
                      !validSignature(client) ||
                      !validSignature(company),
                    true,
                  )}
              </View>
            )}
            {completed && (
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingTop: 12,
                  paddingBottom: 18,
                  borderTopWidth: 1,
                  borderColor: colors.border,
                }}
              >
                {button("Terminer", close, false, true)}
              </View>
            )}
          </SafeAreaView>
        )}
      </Modal>
    </View>
  );
}
