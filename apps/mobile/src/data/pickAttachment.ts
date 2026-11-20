import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Alert, Linking } from 'react-native';
import type { AttachmentFile } from './apiRepository';

export async function pickAttachment(allowPdf = false, preferredSource?: 'camera'): Promise<AttachmentFile | null> {
  const source = preferredSource ?? await new Promise<'camera' | 'gallery' | 'file' | null>(resolve => {
    Alert.alert('Ajouter une photo', 'Choisissez la source.', [
      { text: 'Prendre une photo', onPress: () => resolve('camera') },
      { text: 'Galerie', onPress: () => resolve('gallery') },
      { text: 'Importer un fichier', onPress: () => resolve('file') },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });
  if (!source) return null;
  if (source === 'file') {
    const result = await DocumentPicker.getDocumentAsync({ type: allowPdf ? ['image/*', 'application/pdf'] : ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'], copyToCacheDirectory: true });
    if (result.canceled) return null;
    const file = result.assets[0];
    return { uri: file.uri, name: file.name, mimeType: file.mimeType ?? 'application/octet-stream' };
  }
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Accès à la caméra', 'Autorisez la caméra dans les réglages, ou choisissez une photo existante.', [
        { text: 'Annuler', style: 'cancel' }, { text: 'Réglages', onPress: () => void Linking.openSettings() },
      ]);
      return null;
    }
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;
  const photo = result.assets[0];
  return { uri: photo.uri, name: photo.fileName ?? `photo-${Date.now()}.jpg`, mimeType: photo.mimeType ?? 'image/jpeg' };
}
