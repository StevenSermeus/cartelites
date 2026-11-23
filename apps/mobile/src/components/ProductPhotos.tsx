import {MotionModal as Modal} from './MotionModal';
import { instanceFetch } from '../auth/session';
import { photoDataUrl } from '../data/itemPhoto';
import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { request, uploadAttachment, type Item, type Attachment, type AttachmentFile } from '../data/apiRepository';
import { ItemThumbnail } from './ItemThumbnail';
import { MultiPhotoPicker } from './MultiPhotoPicker';
import { useTheme } from '../theme/ThemeProvider';

/** Photos save independently: retrying a file never repeats the business transaction. */
export function ProductPhotos({itemId, onChanged,onBusyChange}: {itemId: string; onChanged: () => Promise<void>;onBusyChange?:(busy:boolean)=>void}) {
  const {colors} = useTheme();
  const [detail, setDetail] = useState<{item: Item; photos: Attachment[]} | null>(null);
  const [pending, setPending] = useState<AttachmentFile[]>([]);
  const [index, setIndex] = useState<number | null>(null);
  const [fullPhoto, setFullPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), attempts = useRef(new Map<string, string>());
  async function reload() { setDetail(await request(`/stock/${encodeURIComponent(itemId)}/lots`)); }
  useEffect(() => { void reload().catch(reason => setError(String(reason))); }, [itemId]);
  const photos = detail?.photos.filter(photo => photo.contentType.startsWith('image/')) ?? [];
  const selectedPhotoId = index === null ? undefined : photos[index]?._id;
  useEffect(() => {
    let current = true; setFullPhoto(null);
    if (selectedPhotoId) void instanceFetch(`/attachments/${encodeURIComponent(selectedPhotoId)}/download`, {}, true).then(photoDataUrl).then(uri => {if (current) setFullPhoto(uri);}).catch(reason => {if (current) setError(String(reason));});
    return () => {current = false;};
  }, [selectedPhotoId]);
  async function mutate(photo: Attachment, action: 'cover' | 'remove') {
    if (lock.current) return;
    lock.current = true; setBusy(true); onBusyChange?.(true);setError('');
    try { await request('/stock/photo', {itemId, attachmentId: photo._id, action}); await reload(); await onChanged(); }
    catch (reason) { setError(String(reason)); }
    finally { lock.current = false; setBusy(false);onBusyChange?.(false); }
  }
  async function upload() {
    if (lock.current) return;
    lock.current = true; setBusy(true);onBusyChange?.(true); setError('');
    try {
      for (const photo of pending) {
        const operationId = attempts.current.get(photo.uri) ?? Crypto.randomUUID();
        attempts.current.set(photo.uri, operationId);
        await uploadAttachment('itemId', itemId, photo, operationId);
        setPending(rows => rows.filter(row => row.uri !== photo.uri));
      }
      await reload(); await onChanged();
    } catch (reason) { setError(`${String(reason)} Les fichiers déjà enregistrés sont conservés ; réessayez les fichiers restants.`); await reload().then(onChanged).catch(() => undefined); }
    finally { lock.current = false; setBusy(false);onBusyChange?.(false); }
  }
  return <View style={{gap: 12}}>
    <Text accessibilityRole="header" style={{color: colors.text, fontSize: 20, fontWeight: '600'}}>Photos du produit</Text>
    <Text style={{color: colors.secondary}}>La couverture apparaît dans le catalogue si le produit est visible. Les changements de photos sont enregistrés immédiatement.</Text>
    {!!error && <Text accessibilityRole="alert" style={{color: colors.danger}}>{error}</Text>}
    <ScrollView horizontal contentContainerStyle={{gap: 12}}>
      {photos.map((photo, i) => <View key={photo._id} style={{width: 140, gap: 6}}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Agrandir la photo ${i + 1}`} onPress={() => setIndex(i)}>
          {detail && <ItemThumbnail item={{...detail.item, photos: [photo], catalogueImageUrl: undefined}} style={{width: 140, height: 160}} />}
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy || detail?.item.coverPhotoId === photo._id} onPress={() => void mutate(photo, 'cover')} style={{minHeight: 44, justifyContent: 'center'}}><Text style={{color: colors.accent}}>{detail?.item.coverPhotoId === photo._id ? '✓ Couverture' : 'Choisir la couverture'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => Alert.alert('Retirer la photo ?', 'Cette photo sera retirée du produit et du catalogue.', [{text: 'Annuler', style: 'cancel'}, {text: 'Retirer', style: 'destructive', onPress: () => void mutate(photo, 'remove')}])} style={{minHeight: 44, justifyContent: 'center'}}><Text style={{color: colors.danger}}>Retirer</Text></Pressable>
      </View>)}
    </ScrollView>
    <MultiPhotoPicker photos={pending} onChange={setPending} disabled={busy} />
    {pending.length > 0 && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void upload()} style={{minHeight: 48, justifyContent: 'center'}}><Text style={{color: colors.accent}}>{busy ? 'Téléversement…' : `Enregistrer ${pending.length} photo(s)`}</Text></Pressable>}
    <Modal visible={index !== null} animationType="slide" onRequestClose={() => setIndex(null)} presentationStyle="pageSheet">
      <View style={{flex: 1, backgroundColor: colors.background, padding: 20, gap: 16}}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer la galerie" onPress={() => setIndex(null)} style={{minHeight: 44}}><Text style={{color: colors.accent}}>Fermer</Text></Pressable>
        {fullPhoto ? <Image source={{uri: fullPhoto}} accessibilityLabel={`Photo ${index === null ? 0 : index + 1} du produit`} resizeMode="contain" style={{flex: 1, width: "100%"}} /> : <Text style={{flex: 1, color: colors.secondary}}>Chargement de la photo…</Text>}
        <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
          <Pressable accessibilityRole="button" disabled={index === null || index === 0} onPress={() => setIndex(i => i === null ? null : Math.max(0, i - 1))} style={{minHeight: 44}}><Text style={{color: colors.accent}}>Photo précédente</Text></Pressable>
          <Text style={{color: colors.text}}>{index === null ? 0 : index + 1} / {photos.length}</Text>
          <Pressable accessibilityRole="button" disabled={index === null || index >= photos.length - 1} onPress={() => setIndex(i => i === null ? null : Math.min(photos.length - 1, i + 1))} style={{minHeight: 44}}><Text style={{color: colors.accent}}>Photo suivante</Text></Pressable>
        </View>
      </View>
    </Modal>
  </View>;
}
