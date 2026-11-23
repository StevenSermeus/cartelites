import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {createPurchaseAttemptStorage, type PurchaseJournalIO} from '../src/data/purchaseAttemptJournal';
import {SubmittedAttempts, type AttemptScope} from '../src/data/submittedAttempt';

const scope = (owner = 'instance-a/account-a'): AttemptScope => ({owner, accountId: owner.split('/')[1], assertActive() {}});
async function fixture(t: {after(fn: () => Promise<void>): void}) {
  const root = await fs.mkdtemp(join(tmpdir(), 'purchase-journal-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  let failRename = false;
  const io: PurchaseJournalIO = {
    documentDirectory: root + '/',
    hash: async value => createHash('sha256').update(value).digest('hex'),
    uuid: randomUUID,
    makeDirectoryAsync: path => fs.mkdir(path, {recursive: true}),
    readDirectoryAsync: fs.readdir,
    readAsStringAsync: path => fs.readFile(path, 'utf8'),
    writeAsStringAsync: (path, value) => fs.writeFile(path, value, 'utf8'),
    getInfoAsync: async path => ({exists: await fs.stat(path).then(() => true, () => false)}),
    copyAsync: ({from, to}) => fs.copyFile(from, to),
    moveAsync: async ({from, to}) => {
      if (failRename && to.endsWith('.json')) throw new Error('interrupted before final rename');
      // Mirror Expo's destination removal; production avoids this gap with unique names.
      await fs.rm(to, {force: true});
      await fs.rename(from, to);
    },
  };
  return {root, io, restart: () => new SubmittedAttempts(createPurchaseAttemptStorage(io)), interrupt: (value: boolean) => {failRename = value;}};
}
const payload = () => ({operationId: 'purchase-original', occurredAt: 123, items: [{operationId: 'line-original', name: 'Original card', purchasePriceCents: 500}]});

test('real filesystem: failed first final rename leaves only temporary records and sends no POST', async t => {
  const f = await fixture(t), owner = scope(), first = f.restart();
  const attempt = await first.preparePersisted(owner, '/purchases', payload(), {purchaseDraftId: 'draft-1'});
  f.interrupt(true); let sends = 0;
  await assert.rejects(first.execute(owner, attempt, async () => {sends++; return {};}), /interrupted/);
  assert.equal(sends, 0);
  const directory = join(f.root, 'purchase-attempts', await f.io.hash(owner.owner));
  const filenames = await fs.readdir(directory);
  assert.ok(filenames.some(name => name.endsWith('.tmp')));
  assert.equal(filenames.some(name => name.endsWith('.json')), false);
  f.interrupt(false);
  const restarted = f.restart(); await restarted.load(owner);
  assert.equal(restarted.list(owner.owner).length, 0);
});

test('real filesystem: interrupted confirmation restores latest complete frozen intent and durable photo', async t => {
  const f = await fixture(t), owner = scope(), first = f.restart();
  const picker = join(f.root, 'picker.jpg'); await fs.writeFile(picker, 'original image bytes');
  const body = payload();
  const attempt = await first.preparePersisted(owner, '/purchases', body, {
    purchaseDraftId: 'draft-1', files: [{target: 'itemId', index: 0, operationId: 'photo-original', file: {uri: picker, name: 'card.jpg', mimeType: 'image/jpeg'}}],
  });
  let sent = '';
  await assert.rejects(first.execute(owner, attempt, async (_path, requestBody) => {
    sent = requestBody;
    const onDisk = await createPurchaseAttemptStorage(f.io).load(owner.owner);
    assert.equal(onDisk[0].body, requestBody); assert.equal(onDisk[0].unresolved, true);
    assert.equal(await fs.readFile(onDisk[0].context.files![0].file.uri, 'utf8'), 'original image bytes');
    f.interrupt(true); return {purchaseId: 'committed', itemIds: ['item-original']};
  }), /interrupted/);
  body.items[0].name = 'Edited after submission'; await fs.rm(picker);
  f.interrupt(false);
  const restarted = f.restart(); await restarted.load(owner);
  const recovered = restarted.list(owner.owner)[0];
  assert.equal(recovered.state, 'unknown'); assert.equal(recovered.body, sent);
  assert.equal(JSON.parse(recovered.body).items[0].operationId, 'line-original');
  const photo = recovered.context.files![0];
  assert.equal(photo.operationId, 'photo-original'); assert.equal(photo.index, 0);
  assert.equal(await fs.readFile(photo.file.uri, 'utf8'), 'original image bytes');
  await assert.rejects(restarted.preparePersisted(owner, '/purchases', {...body, operationId: 'duplicate'}, {purchaseDraftId: 'draft-1'}));
  await restarted.execute(owner, recovered, async (_path, requestBody) => {
    assert.equal(requestBody, sent); return {purchaseId: 'committed', itemIds: ['item-original']};
  });
});

test('real filesystem: confirmed cleanup interruption and tombstone never permit a new purchase identity', async t => {
  const f = await fixture(t), owner = scope(), first = f.restart();
  const attempt = await first.preparePersisted(owner, '/purchases', payload(), {purchaseDraftId: 'exact-draft'});
  await first.execute(owner, attempt, async () => ({purchaseId: 'committed', itemIds: []}));
  f.interrupt(true);
  await assert.rejects(first.releasePersisted(owner, '/purchases'), /interrupted/);
  f.interrupt(false);
  const afterInterruptedCleanup = f.restart(); await afterInterruptedCleanup.load(owner);
  const confirmed = afterInterruptedCleanup.list(owner.owner)[0];
  assert.equal(confirmed.state, 'confirmed'); assert.equal(confirmed.context.purchaseDraftId, 'exact-draft');
  let sends = 0;
  await afterInterruptedCleanup.execute(owner, confirmed, async () => {sends++; return {};});
  await afterInterruptedCleanup.releasePersisted(owner, '/purchases');
  const afterCleanup = f.restart(); await afterCleanup.load(owner);
  assert.equal(afterCleanup.list(owner.owner).length, 0);
  // A draft snapshot may still exist if the app died before that independent write.
  await assert.rejects(afterCleanup.preparePersisted(owner, '/purchases', {operationId: 'new-invalid'}, {purchaseDraftId: 'exact-draft'}));
  const tombstone = afterCleanup.list(owner.owner)[0];
  assert.equal(tombstone.context.purchaseDraftId, 'exact-draft');
  assert.deepEqual(await afterCleanup.execute(owner, tombstone, async () => {sends++; return {};}), {purchaseId: 'committed', itemIds: []});
  assert.equal(sends, 0);
});

test('real filesystem: identical draft IDs are isolated by instance and account directories', async t => {
  const f = await fixture(t), owner = scope(), first = f.restart();
  const attempt = await first.preparePersisted(owner, '/purchases', payload(), {purchaseDraftId: 'shared-draft-name'});
  await assert.rejects(first.execute(owner, attempt, async () => {throw new Error('response lost');}));
  for (const other of [scope('instance-b/account-a'), scope('instance-a/account-b')]) {
    const restarted = f.restart(); await restarted.load(other);
    assert.equal(restarted.list(other.owner).length, 0);
    const next = await restarted.preparePersisted(other, '/purchases', {operationId: other.owner}, {purchaseDraftId: 'shared-draft-name'});
    await restarted.execute(other, next, async () => ({purchaseId: other.owner, itemIds: []}));
  }
  const restored = f.restart(); await restored.load(owner);
  assert.equal(restored.list(owner.owner)[0].body, JSON.stringify(payload()));
  assert.equal(restored.list(owner.owner)[0].state, 'unknown');
  assert.equal((await fs.readdir(join(f.root, 'purchase-attempts'))).length, 3);
});
