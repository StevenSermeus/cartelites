import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import type { AttachmentFile } from './apiRepository';
import { getApiBaseUrl } from '../auth/session';

const optimized = new Map<string, Promise<AttachmentFile>>();
export async function optimizeAttachment(file: AttachmentFile): Promise<AttachmentFile> {
  if (!file.mimeType.startsWith('image/')) return file;
  const base = getApiBaseUrl();
  const key = `${base}|${file.uri}`;
  const existing = optimized.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    let webp = false;
    try {
      const response = await fetch(`${base}/api/v1/instance`, { signal: controller.signal });
      const capabilities = await response.json();
      webp = capabilities.imageUploadFormats?.includes('image/webp') === true;
    } catch { /* Existing servers accept JPEG. */ } finally { clearTimeout(timeout); }
    const context = ImageManipulator.manipulate(file.uri);
    const source = await context.renderAsync();
    let result = source;
    try {
      if (Math.max(source.width, source.height) > 2000) {
        context.resize(source.width >= source.height ? { width: 2000 } : { height: 2000 });
        result = await context.renderAsync();
      }
      let format = webp ? SaveFormat.WEBP : SaveFormat.JPEG;
      let saved;
      try { saved = await result.saveAsync({ format, compress: 0.85 }); }
      catch (reason) {
        if (!webp) throw reason;
        format = SaveFormat.JPEG;
        saved = await result.saveAsync({ format, compress: 0.85 });
      }
      const original = await FileSystem.getInfoAsync(file.uri);
      const output = await FileSystem.getInfoAsync(saved.uri);
      if (original.exists && output.exists && original.size <= output.size && Math.max(source.width, source.height) <= 2000 && ['image/jpeg', 'image/png', ...(webp ? ['image/webp'] : [])].includes(file.mimeType)) {
        await FileSystem.deleteAsync(saved.uri, { idempotent: true });
        return file; // Server still validates and strips metadata.
      }
      const extension = format === SaveFormat.WEBP ? 'webp' : 'jpg';
      return { uri: saved.uri, name: `${file.name.replace(/\.[^.]*$/, '')}.${extension}`, mimeType: format === SaveFormat.WEBP ? 'image/webp' : 'image/jpeg' };
    } finally {
      if (result !== source) result.release();
      source.release(); context.release();
    }
  })();
  optimized.set(key, pending);
  try { return await pending; } catch (error) { optimized.delete(key); throw error; }
}
