import {MotionModal as Modal} from './MotionModal';
import { useTheme } from '../theme/ThemeProvider';
import { useRef, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import type { AttachmentFile } from '../data/apiRepository';
import { pickAttachment } from '../data/pickAttachment';

/** Stages a newly selected image until accepted. Cancel preserves the prior file. */
export function AttachmentPreview({
  current,
  onUse,
  allowPdf = false,
}: {
  current: AttachmentFile | null;
  onUse(file: AttachmentFile | null): void;
  allowPdf?: boolean;
}) {
  const { colors } = useTheme();

  const [pending, setPending] = useState<AttachmentFile | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cameraSource, setCameraSource] = useState(false);
  const locking = useRef(false);
  const choose = async (camera = false) => {
    if (locking.current) return;
    locking.current = true;
    setBusy(true);
    setError('');
    try {
      const file = await pickAttachment(allowPdf, camera ? 'camera' : undefined);
      if (file) {
        setPending(file);
        setCameraSource(camera);
        setOpen(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible d’ouvrir le sélecteur. Réessayez.');
    } finally {
      locking.current = false;
      setBusy(false);
    }
  };
  const close = () => {
    setOpen(false);
    setPending(null);
    setError('');
  };
  const image = pending?.mimeType.startsWith('image/');
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Prendre une photo"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={() => void choose(true)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={{ color: colors.text }}>Prendre une photo</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          current ? `Modifier la pièce ${current.name}` : 'Ajouter une photo ou un justificatif'
        }
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={() => void choose()}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={{ color: colors.text }}>
          {busy
            ? 'Ouverture…'
            : current
              ? `Pièce : ${current.name}`
              : 'Ajouter une photo ou un justificatif'}
        </Text>
      </Pressable>
      {!!error && (
        <View accessibilityLiveRegion="polite">
          <Text accessibilityRole="alert" style={{ color: colors.text }}>
            {error}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Réessayer la sélection"
            onPress={() => void choose()}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: colors.text }}>Réessayer</Text>
          </Pressable>
        </View>
      )}
      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            padding: 24,
            backgroundColor: colors.overlay,
          }}
        >
          <View style={{ padding: 18, gap: 14, backgroundColor: colors.surface, borderRadius: 12 }}>
            {image && pending ? (
              <Image
                accessibilityLabel="Aperçu de la pièce sélectionnée"
                source={{ uri: pending.uri }}
                resizeMode="contain"
                style={{ height: 280 }}
              />
            ) : (
              <Text style={{ color: colors.text }}>{pending?.name}</Text>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Utiliser cette pièce"
              disabled={busy}
              onPress={() => {
                if (pending) onUse(pending);
                close();
              }}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: colors.text }}>Utiliser</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reprendre une photo"
              disabled={busy}
              onPress={() => void choose(cameraSource)}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: colors.text }}>{busy ? 'Ouverture…' : 'Reprendre'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Annuler la pièce"
              onPress={close}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: colors.text }}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}
