import { useTheme } from '../theme/ThemeProvider';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Pdf from 'react-native-pdf';

export function ReceiptPdfPreview({
  base64,
  onReady,
  onError,
}: {
  base64: string;
  onReady?: () => void;
  onError?: () => void;
}) {
  const { colors } = useTheme();

  const source = useMemo(
    () => ({ uri: `data:application/pdf;base64,${base64}`, cache: false }),
    [base64],
  );
  const [error, setError] = useState(false);
  useEffect(() => setError(false), [base64]);
  return error ? (
    <Text accessibilityRole="alert" style={{ color: colors.text }}>
      Aperçu indisponible. Utilisez le partage pour ouvrir le PDF.
    </Text>
  ) : (
    <Pdf
      source={source}
      style={{ height: 420, width: '100%' }}
      trustAllCerts={false}
      onLoadComplete={onReady}
      onError={() => {
        setError(true);
        onError?.();
      }}
    />
  );
}

export function ReceiptPdfViewer({
  base64,
  onClose,
  backLabel = 'Revenir à la signature',
  embedded = false,
}: {
  embedded?: boolean;
  base64: string;
  onClose: () => void;
  backLabel?: string;
}) {
  const { colors } = useTheme();

  const source = useMemo(
    () => ({ uri: `data:application/pdf;base64,${base64}`, cache: false }),
    [base64],
  );
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState(false);
  useEffect(() => setError(false), [base64]);
  const content = (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingHorizontal: 18,
          minHeight: 51,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={{ minHeight: 44, justifyContent: 'center', flexShrink: 1 }}
        >
          <Text style={[{ color: colors.text }, { color: colors.accent, fontSize: 14 }]}>
            ‹ {backLabel}
          </Text>
        </Pressable>
        <Text style={[{ color: colors.text }, { color: colors.secondary, fontSize: 12 }]}>
          {pages ? `${page} / ${pages}` : 'Chargement…'}
        </Text>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={[{ color: colors.text }, { padding: 24 }]}>
          Impossible d’afficher ce PDF. Revenez à la signature et utilisez « Partager le PDF » pour
          l’ouvrir dans votre lecteur.
        </Text>
      ) : (
        <Pdf
          source={source}
          style={{ flex: 1, width: '100%' }}
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
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose}
    >
      {content}
    </Modal>
  );
}
