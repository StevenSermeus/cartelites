type Entry = { bytes: Uint8Array; expiresAt: number };

/** Process-local LRU of immutable image objects. Authorization belongs to callers. */
export class ImageCache {
  private readonly entries = new Map<string, Entry>();
  private usedBytes = 0;

  constructor(private readonly options: {
    maxBytes: number;
    maxEntryBytes: number;
    maxEntries: number;
    ttlMs: number;
    now?: () => number;
  }) {}

  private remove(key: string) {
    const entry = this.entries.get(key);
    if (entry) this.usedBytes -= entry.bytes.byteLength;
    this.entries.delete(key);
  }

  async read(key: string, load: () => Promise<Response>): Promise<Response> {
    const now = this.options.now ?? Date.now;
    for (const [oldKey, entry] of this.entries) {
      if (entry.expiresAt <= now()) this.remove(oldKey);
    }
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      this.entries.set(key, hit);
      return new Response(hit.bytes);
    }
    const response = await load();
    if (response.status !== 200 || !response.body || this.options.maxBytes === 0) return response;
    const limit = Math.min(this.options.maxBytes, this.options.maxEntryBytes);
    const length = Number(response.headers.get('content-length'));
    if (length > limit) return response;

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.byteLength;
        if (size > limit) {
          // Preserve the full response, including bytes already read, without caching it.
          return new Response(new ReadableStream<Uint8Array>({
            start(controller) { for (const chunk of chunks) controller.enqueue(chunk); },
            async pull(controller) {
              try {
                const next = await reader.read();
                if (next.done) { reader.releaseLock(); controller.close(); }
                else controller.enqueue(next.value);
              } catch (error) { reader.releaseLock(); controller.error(error); }
            },
            async cancel(reason) { await reader.cancel(reason); reader.releaseLock(); },
          }), { status: response.status, headers: response.headers });
        }
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
      throw error;
    }
    reader.releaseLock();
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    // Another request may have loaded the same key while this one was in flight.
    this.remove(key);
    while (this.entries.size && (this.usedBytes + size > this.options.maxBytes || this.entries.size >= this.options.maxEntries)) {
      this.remove(this.entries.keys().next().value!);
    }
    if (size > 0) {
      this.entries.set(key, { bytes, expiresAt: now() + this.options.ttlMs });
      this.usedBytes += size;
    }
    return new Response(bytes, { status: response.status, headers: response.headers });
  }
}
