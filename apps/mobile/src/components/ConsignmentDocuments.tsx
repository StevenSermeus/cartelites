import {documentVersion} from '../data/documentVersion';
import {MotionModal as Modal} from './MotionModal';
import {captureAccountScope,getSessionScope} from '../auth/session';
import {shopDay,shopDayTimestamp} from '../data/shopCalendar';
import {DateField} from './DateField';
import { shopTimezone } from '../theme/shopFormatting';
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import { useTheme } from "../theme/ThemeProvider";
import { request, finishFinancialAttempt, sharePdfFile, type Consignment } from "../data/apiRepository";
import { ReceiptSigning } from "./ReceiptSigning";
import { ReceiptPdfViewer } from "./ReceiptPdfViewer";
import { Field } from "./Field";
type Document = {
  version?:number;
  id: string;
  kind: string;
  reference: string;
  createdAt: number;
  archived: boolean;
};
type Return = {
  _id: string;
  occurredAt: number;
  itemIds: string[];
  conditionNotes: string;
  completedAt?: number;
};
export function ConsignmentDocuments({
  deposit,
  onChanged,
}: {
  deposit: Consignment;
  onChanged: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const [documents, setDocuments] = useState<Document[]>([]),
    [returns, setReturns] = useState<Return[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [notes, setNotes] = useState(""),
    [date, setDate] = useState(shopDay());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [pdf, setPdf] = useState<{ pdfBase64: string; filename: string } | null>(
      null,
    ),
    [returnOpen, setReturnOpen] = useState(false),
    [viewPdf, setViewPdf] = useState(false);
  const locked = useRef(false);
  const load = () =>
    Promise.all([
      request<Document[]>(
        `/consignments/documents?sellerId=${encodeURIComponent(deposit.sellerId)}`,
      ).then(setDocuments),
      request<Return[]>(
        `/consignments/returns?consignmentId=${encodeURIComponent(deposit._id)}`,
      ).then(setReturns),
    ]);
  useEffect(() => {
    void load().catch((e) => setError(String(e.message ?? e)));
  }, [deposit._id]);
  const run = async (fn: () => Promise<void>) => {
    const epoch=getSessionScope();
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      if(epoch!==getSessionScope())return;
      await load().catch(()=>{if(epoch===getSessionScope())setError('Opération terminée. Actualisation des documents indisponible ; réessayez leur lecture.');});
    } catch (e) {
      if(epoch!==getSessionScope())return;
      setError(e instanceof Error ? e.message : "Opération impossible");
    } finally {
      if(epoch===getSessionScope()){locked.current=false;setBusy(false);}
    }
  };
  const button = (label: string, action: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={busy || disabled}
      onPress={action}
      style={{
        minHeight: 49,
        justifyContent: "center",
        padding: 12,
        borderRadius: 13,
        backgroundColor: colors.accentSoft,
        opacity: busy || disabled?.valueOf() ? 0.5 : 1,
      }}
    >
      <Text style={{ color: colors.accent, fontSize: 15, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
  const open = async (id: string) => {
    setPdf(await request(`/consignments/documents/${id}/pdf`));
    setViewPdf(true);
  };
  const prepare = async () => {
    const scope=await captureAccountScope();
    const occurredAt = shopDayTimestamp(date);
    if (
      !selected.length ||
      !notes.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      occurredAt === undefined
    )
      throw new Error(
        "Choisissez les articles, une date valide et leur état à la remise.",
      );
    const input = {
        consignmentId: deposit._id,
        itemIds: selected,
        occurredAt,
        conditionNotes: notes.trim(),
      };
    await request("/consignments/returns/prepare", {
      ...input,
      operationId: Crypto.randomUUID(),
    });
    scope.assertActive();
    setReturnOpen(false);
    setSelected([]);
    setNotes("");
    await finishFinancialAttempt('/consignments/returns/prepare',scope);
  };
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: colors.text, fontSize: 19, fontWeight: "700" }}>
        Documents et restitution
      </Text>
      <Text style={{ color: colors.secondary, fontSize: 13 }}>
        Décomptes et reversements : tous les dépôts de {deposit.sellerName}. Les
        montants sont figés à la création du document.
      </Text>
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </Text>
      )}
      {button(
        "Générer le décompte PDF",
        () =>
          void run(async () => {
            const { id } = await request<{ id: string }>(
              "/consignments/documents/statement",
              { operationId: Crypto.randomUUID(), sellerId: deposit.sellerId },
            );
            await open(id);
          }),
      )}
      {documents.map((d) => (
        <View key={d.id}>
          {button(
            `${d.kind === "payment" ? "Justificatif de reversement" : "Décompte"} · ${documentVersion(d.version)} · ${new Date(d.createdAt).toLocaleDateString("fr-BE", {timeZone: shopTimezone()})}`,
            () => void run(() => open(d.id)),
          )}
        </View>
      ))}
      {button("Restituer des articles", () => setReturnOpen(true))}
      {returns.map((r) => (
        <View
          key={r._id}
          style={{
            padding: 12,
            borderRadius: 15,
            backgroundColor: colors.surface,
          }}
        >
          <Text style={{ color: colors.text }}>
            Restitution du {new Date(r.occurredAt).toLocaleDateString("fr-BE", {timeZone: shopTimezone()})}{" "}
            · {r.itemIds.length} article(s)
          </Text>
          <Text style={{ color: colors.secondary }}>
            {r.completedAt ? "Signée" : "À signer — articles encore en dépôt"}
          </Text>
          <ReceiptSigning
            kind="consignment_return"
            targetId={r._id}
            onSigned={() => {
              void load();
              void onChanged();
            }}
          />
        </View>
      ))}
      {!!pdf &&
        button(
          "Partager le dernier document",
          () =>
            void run(async () => {
              await sharePdfFile(pdf.filename,pdf.pdfBase64);
            }),
        )}
      {button(
        "Actualiser les documents",
        () =>
          void run(async () => {
            await onChanged();
          }),
      )}
      <Modal
        visible={returnOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setReturnOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View
            style={{
              height: 51,
              paddingHorizontal: 20,
              justifyContent: "center",
            }}
          >
            {button("‹ Dossier", () => setReturnOpen(false))}
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, gap: 12 }}
          >
            <Text
              style={{ color: colors.text, fontSize: 32, fontWeight: "700" }}
            >
              Restitution
            </Text>
            <Text style={{ color: colors.secondary }}>
              Le bon sera lu et signé avant de retirer les articles du stock.
            </Text>
            {deposit.items
              .filter((i) => i.status === "available")
              .map((i) => (
                <Pressable
                  key={i._id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected.includes(i._id) }}
                  onPress={() =>
                    setSelected((ids) =>
                      ids.includes(i._id)
                        ? ids.filter((id) => id !== i._id)
                        : [...ids, i._id],
                    )
                  }
                  style={{
                    padding: 16,
                    minHeight: 57,
                    borderRadius: 15,
                    backgroundColor: colors.surface,
                  }}
                >
                  <Text style={{ color: colors.text }}>
                    {selected.includes(i._id) ? "☑" : "☐"} {i.name}
                  </Text>
                </Pressable>
              ))}
            <DateField
              label="Date de remise"
              value={date}
              onChange={setDate}
            />
            <Field
              label="État des articles à la remise"
              value={notes}
              onChangeText={setNotes}
              multiline
            />
            {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
          </ScrollView>
          <View style={{ padding: 20 }}>
            {button(
              "Préparer le bon à lire et signer",
              () => void run(prepare),
              !selected.length || !notes.trim(),
            )}
          </View>
        </SafeAreaView>
      </Modal>
      {viewPdf && pdf && (
        <ReceiptPdfViewer
          base64={pdf.pdfBase64}
          onClose={() => setViewPdf(false)}
          backLabel="Revenir aux documents"
        />
      )}
    </View>
  );
}
