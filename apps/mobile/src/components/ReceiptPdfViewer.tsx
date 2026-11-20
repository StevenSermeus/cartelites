import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Pdf from "react-native-pdf";

export function ReceiptPdfPreview({ base64 }: { base64: string }) {
  const source = useMemo(
    () => ({ uri: `data:application/pdf;base64,${base64}`, cache: false }),
    [base64],
  );
  const [error, setError] = useState(false);
  useEffect(() => setError(false), [base64]);
  return error ? (
    <Text accessibilityRole="alert">
      Aperçu indisponible. Utilisez le partage pour ouvrir le PDF.
    </Text>
  ) : (
    <Pdf
      source={source}
      style={{ height: 420, width: "100%" }}
      trustAllCerts={false}
      onError={() => setError(true)}
    />
  );
}

export function ReceiptPdfViewer({
  base64,
  onClose,
  backLabel = "Revenir à la signature",
  embedded = false,
}: {
  embedded?: boolean;
  base64: string;
  onClose: () => void;
  backLabel?: string;
}) {
  const source = useMemo(
    () => ({ uri: `data:application/pdf;base64,${base64}`, cache: false }),
    [base64],
  );
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState(false);
  useEffect(() => setError(false), [base64]);
  const content = (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f2f2f7" }}>
      <View style={{ padding: 12, gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={{ padding: 12 }}
        >
          <Text>← {backLabel}</Text>
        </Pressable>
        <Text>
          {pages
            ? `Page ${page} / ${pages} · Pincez pour zoomer`
            : "Chargement du document…"}
        </Text>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={{ padding: 24 }}>
          Impossible d’afficher ce PDF. Revenez à la signature et utilisez «
          Partager le PDF » pour l’ouvrir dans votre lecteur.
        </Text>
      ) : (
        <Pdf
          source={source}
          style={{ flex: 1, width: "100%" }}
          trustAllCerts={false}
          onLoadComplete={(count) => setPages(count)}
          onPageChanged={(current) => setPage(current)}
          onError={() => setError(true)}
        />
      )}
    </SafeAreaView>
  );
  return embedded ? (
    content
  ) : (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      supportedOrientations={["portrait", "landscape-left", "landscape-right"]}
      onRequestClose={onClose}
    >
      {content}
    </Modal>
  );
}
