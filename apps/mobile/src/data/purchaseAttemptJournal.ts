import type {AttemptStorage, SubmittedAttempt} from './submittedAttempt';

/** The production append-only journal, with filesystem operations injected for local crash tests. */
export type PurchaseJournalIO = {
  documentDirectory: string | null;
  hash(value: string): Promise<string>;
  uuid(): string;
  makeDirectoryAsync(path: string, options: {intermediates: boolean}): Promise<unknown>;
  readDirectoryAsync(path: string): Promise<string[]>;
  readAsStringAsync(path: string): Promise<string>;
  writeAsStringAsync(path: string, value: string): Promise<unknown>;
  getInfoAsync(path: string): Promise<{exists: boolean}>;
  copyAsync(paths: {from: string; to: string}): Promise<unknown>;
  moveAsync(paths: {from: string; to: string}): Promise<unknown>;
};
export function createPurchaseAttemptStorage(io: PurchaseJournalIO): AttemptStorage {
  const revisions = new Map<string, number>();
  const writes = new Map<string, Promise<void>>();
  async function directory(owner: string) {
    if (!io.documentDirectory) throw new Error('Stockage local indisponible.');
    const hash = await io.hash(owner);
    const path = `${io.documentDirectory}purchase-attempts/${hash}/`;
    await io.makeDirectoryAsync(path, {intermediates: true});
    return path;
  }
  return {
    async load(owner) {
      await writes.get(owner);
      const path = await directory(owner), latest = new Map<string, {revision: number; attempt: SubmittedAttempt}>();
      let revision = 0;
      for (const filename of await io.readDirectoryAsync(path)) {
        if (!filename.endsWith('.json')) continue;
        const record = JSON.parse(await io.readAsStringAsync(path + filename));
        const row = record.attempt as SubmittedAttempt;
        if (record.version !== 1 || !Number.isSafeInteger(record.revision) || record.revision < 1 || row?.owner !== owner || row.path !== '/purchases' ||
            !row.context?.purchaseDraftId || typeof row.body !== 'string' ||
            !['unknown', 'confirmed', 'rejected'].includes(row.state) || !JSON.parse(row.body).operationId) {
          throw new Error('Lecture des rachats envoyés impossible. Les fichiers existants sont conservés.');
        }
        revision = Math.max(revision, record.revision);
        const previous = latest.get(row.context.purchaseDraftId!);
        if (!previous || previous.revision < record.revision) latest.set(row.context.purchaseDraftId!, record);
      }
      revisions.set(owner, revision);
      return [...latest.values()].map(record => record.attempt);
    },
    async save(attempt) {
      const write = (writes.get(attempt.owner) ?? Promise.resolve()).catch(() => undefined).then(async () => {
        const path = await directory(attempt.owner);
        if (!attempt.context.purchaseDraftId) throw new Error('Brouillon de rachat introuvable.');
        const hash = await io.hash(attempt.context.purchaseDraftId);
        // Persist picker/cache photos before the request can leave the device.
        for (const photo of attempt.context.files ?? []) {
          if (photo.file.uri.startsWith(path)) continue;
          const photoHash = await io.hash(photo.file.uri);
          const destination = `${path}photo-${photoHash}`;
          if (!(await io.getInfoAsync(destination)).exists) {
            await io.copyAsync({from: photo.file.uri, to: destination + '.tmp'});
            await io.moveAsync({from: destination + '.tmp', to: destination});
          }
          photo.file = {...photo.file, uri: destination};
        }
        const revision = (revisions.get(attempt.owner) ?? 0) + 1;
        revisions.set(attempt.owner, revision);
        const filename = `${hash}-${revision}-${io.uuid()}`;
        const temporary = `${path}${filename}.tmp`, destination = `${path}${filename}.json`;
        await io.writeAsStringAsync(temporary, JSON.stringify({version: 1, revision, attempt}));
        // Append complete records to unique names: Expo move replaces destinations by
        // deleting them first, so overwriting a journal entry would not be crash-safe.
        await io.moveAsync({from: temporary, to: destination});
      });
      writes.set(attempt.owner, write);
      await write;
    },
  };
}
