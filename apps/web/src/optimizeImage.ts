const optimized = new WeakMap<File, Map<string, Promise<File>>>();
export function optimizeUploadImage(file: File, apiBase: string): Promise<File> {
  if (!file.type.startsWith('image/')) return Promise.resolve(file);
  let cache = optimized.get(file);
  if (!cache) { cache = new Map(); optimized.set(file, cache); }
  const existing = cache.get(apiBase);
  if (existing) return existing;
  const pending = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    let supportsWebp = false;
    try {
      const response = await fetch(`${apiBase}/instance`, { signal: controller.signal });
      supportsWebp = (await response.json()).imageUploadFormats?.includes('image/webp') === true;
    } catch { /* JPEG keeps older servers compatible. */ } finally { clearTimeout(timeout); }
    const url = URL.createObjectURL(file);
    const source = new Image();
    try {
      source.src = url;
      await source.decode();
      const scale = Math.min(1, 2000 / Math.max(source.naturalWidth, source.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Optimisation de la photo indisponible.');
      if (!supportsWebp) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      let blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, supportsWebp ? 'image/webp' : 'image/jpeg', 0.85));
      if (!blob || !['image/webp', 'image/jpeg', 'image/png'].includes(blob.type)) throw new Error('Conversion de la photo impossible.');
      if (scale === 1 && blob.size >= file.size && ['image/jpeg', 'image/png', ...(supportsWebp ? ['image/webp'] : [])].includes(file.type)) return file;
      const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
      return new File([blob], `${file.name.replace(/\.[^.]*$/, '')}.${ext}`, { type: blob.type });
    } finally { URL.revokeObjectURL(url); }
  })();
  cache.set(apiBase, pending);
  void pending.catch(() => cache!.delete(apiBase));
  return pending;
}
