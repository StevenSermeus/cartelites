type MigrationEnvironment = Readonly<Record<string, string | undefined>>;
const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
const legacyPorts = new Set(['3001', '3210', '3211', '5174']);

/** Accept only an origin; do not let URL parsing silently discard path or credentials. */
export function assertRestoreTarget(value: string): string {
  if (!/^https?:\/\/[^/?#\\\s]+\/?$/i.test(value)) throw new Error('INVALID_RESTORE_TARGET');
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || value.includes('@')) {
    throw new Error('INVALID_RESTORE_TARGET');
  }
  const local = loopback.has(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local && url.port)) ||
      (local && legacyPorts.has(url.port))) throw new Error('INVALID_RESTORE_TARGET');
  // Reject alternative numeric spellings that URL would silently turn into loopback.
  if (url.protocol === 'http:' && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):[0-9]+\/?$/i.test(value)) {
    throw new Error('INVALID_RESTORE_TARGET');
  }
  return url.origin;
}

/** Authentication remains in the action; this pure guard runs before any dispatch. */
export function assertMigrationPolicy(env: MigrationEnvironment, payload: unknown): void {
  if (env.MIGRATION_MODE === 'isolated-rehearsal') {
    const url = new URL(env.CONVEX_CLOUD_URL ?? 'https://invalid.invalid');
    if (!loopback.has(url.hostname)) throw new Error('LOCAL_REHEARSAL_ONLY');
    return;
  }
  if (env.MIGRATION_MODE !== 'restore') throw new Error('MIGRATION_DISABLED');
  if (!env.MIGRATION_SECRET || env.MIGRATION_SECRET.length < 32) throw new Error('INVALID_MIGRATION_SECRET');
  const target = assertRestoreTarget(env.CONVEX_CLOUD_URL ?? '');
  if (env.MIGRATION_TARGET_URL !== target) throw new Error('MIGRATION_TARGET_MISMATCH');
  const digest = env.MIGRATION_SOURCE_DIGEST;
  if (!digest || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('INVALID_MIGRATION_SOURCE_DIGEST');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('MIGRATION_SOURCE_MISMATCH');
  const data = payload as Record<string, unknown>;
  if (data.batch !== `canonical-v1:${digest}` || ('sourceDigest' in data && data.sourceDigest !== digest)) {
    throw new Error('MIGRATION_SOURCE_MISMATCH');
  }
}
