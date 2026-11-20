import { useRef, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { pickAttachments } from '../data/pickAttachment';
import type { AttachmentFile } from '../data/apiRepository';
import { useTheme } from '../theme/ThemeProvider';

export function MultiPhotoPicker({
  photos,
  onChange,
  limit = 6,
  disabled = false,
}: {
  photos: AttachmentFile[];
  onChange: (photos: AttachmentFile[]) => void;
  limit?: number;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const locked = useRef(false);
  async function choose() {
    if (locked.current || disabled || photos.length >= limit) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const picked = await pickAttachments(false, undefined, limit - photos.length);
      onChange([
        ...photos,
        ...picked.filter((p) => !photos.some((existing) => existing.uri === p.uri)),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sélection impossible.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {photos.map((photo, index) => (
          <View key={photo.uri} style={{ width: 100, gap: 4 }}>
            <Image
              source={{ uri: photo.uri }}
              accessibilityLabel={`Photo ${index + 1}`}
              style={{ width: 100, height: 100, borderRadius: 12 }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Retirer la photo ${index + 1}`}
              disabled={busy || disabled}
              onPress={() => onChange(photos.filter((_, i) => i !== index))}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: colors.danger }}>Retirer</Text>
            </Pressable>
          </View>
        ))}
      </View>
      {photos.length < limit && (
        <Pressable
          accessibilityRole="button"
          disabled={busy || disabled}
          onPress={() => void choose()}
          style={{ minHeight: 48, justifyContent: 'center' }}
        >
          <Text style={{ color: colors.accent }}>
            {busy ? 'Ouverture…' : `Ajouter des photos · ${limit - photos.length} disponible(s)`}
          </Text>
        </Pressable>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </Text>
      )}
    </View>
  );
}
