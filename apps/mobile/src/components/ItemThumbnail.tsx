import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useEffect, useState } from 'react';
import { Image, View, type ImageStyle, type StyleProp } from 'react-native';
import { getApiBaseUrl, instanceFetch } from '../auth/session';
import type { Item } from '../data/apiRepository';
import { loadItemPhoto } from '../data/itemPhoto';

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Photo illisible'));
    reader.readAsDataURL(blob);
  });
}

export function ItemThumbnail({ item, style }: { item: Item; style: StyleProp<ImageStyle> }) {
  const { colors } = useTheme();
  const base = getApiBaseUrl();
  const photoKey = JSON.stringify(item.photos ?? []);
  const identity = `${base}:${item._id}:${photoKey}`;
  const [loaded, setLoaded] = useState<{ identity: string; uri: string } | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    setLoaded(null);
    setFailed([]);
    void loadItemPhoto(JSON.parse(photoKey), async (path) => {
      // Fetch through the session layer: credentials never reach catalogue hosts.
      const response = await instanceFetch(path, {}, true);
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) {
        throw new Error('Photo indisponible');
      }
      return dataUrl(await response.blob());
    }).then((uri) => {
      if (active && uri && base === getApiBaseUrl()) setLoaded({ identity, uri });
    });
    return () => {
      active = false;
    };
  }, [base, identity, photoKey]);
  const personal = loaded?.identity === identity ? loaded.uri : undefined;
  const uri = [personal, item.catalogueImageUrl].find(
    (source) => source && !failed.includes(source),
  );
  return uri ? (
    <Image
      accessibilityLabel={`Photo de ${item.name}`}
      source={{ uri }}
      style={style}
      resizeMode="contain"
      onError={() => setFailed((previous) => [...previous, uri])}
    />
  ) : (
    <View accessible accessibilityLabel={`Photo indisponible pour ${item.name}`} style={[style, { backgroundColor: colors.raised, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }]}>
      <Ionicons name="image-outline" size={26} color={colors.secondary} />
    </View>
  );
}
