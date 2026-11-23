import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ConvexHttpClient } from 'convex/browser';
import { importConvex } from '../scripts/migration/import-convex.js';
import { normalize } from '../scripts/migration/normalize.js';

const target = 'https://restore-fixture.convex.cloud';
const secret = 'local-test-secret-for-restore-only-000000';
const migration = () => normalize({ sellers: Array.from({length: 55}, (_, i) => ({ _id: `contact-${i}`, name: `Contact ${i}`, createdAt: 1 })) });

test('remote dry-run is offline; real import requires explicit restore, matching source and secret', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('Unexpected network'); });
  const data = migration();
  await assert.rejects(importConvex(data, {url: target, secret}), /loopback/);
  const result = await importConvex(data, {url: target, secret: '', mode: 'restore', dryRun: true});
  assert.equal(result.networkImported, false);
  assert.equal(result.sourceDigest, data.sourceDigest);
  assert.equal(result.counts.contacts, 55);
  await assert.rejects(importConvex(data, {url: target, secret, mode: 'restore'}), /EXPECTED_SOURCE_DIGEST_REQUIRED/);
  await assert.rejects(importConvex(data, {url: target, secret, mode: 'restore', expectedSourceDigest: 'a'.repeat(64)}), /SOURCE_DIGEST_MISMATCH/);
  await assert.rejects(importConvex(data, {url: target, secret: 'short', mode: 'restore', expectedSourceDigest: data.sourceDigest}), /MIGRATION_SECRET/);
  assert.equal(calls, 0);
});

test('wrong backend model is rejected before any restore action', async t => {
  let mutations = 0;
  t.mock.method(ConvexHttpClient.prototype, 'query', async () => ({dataModel: 'legacy', schemaVersion: 1}));
  t.mock.method(ConvexHttpClient.prototype, 'action', async () => { mutations++; });
  const data = migration();
  await assert.rejects(importConvex(data, {url: target, secret, mode: 'restore', expectedSourceDigest: data.sourceDigest}), /CANONICAL_SCHEMA_V1_REQUIRED/);
  assert.equal(mutations, 0);
});

test('interrupted batches replay exact records and activity indexing resumes after completion', async t => {
  t.mock.method(ConvexHttpClient.prototype, 'query', async () => ({dataModel: 'canonical', schemaVersion: 1}));
  const stored = new Set<string>(), phases: string[] = [];
  let fail = true, activityChunks = 0;
  t.mock.method(ConvexHttpClient.prototype, 'action', async (_ref: unknown, args: any) => {
    assert.equal(args.secret, secret); phases.push(args.operation);
    if (args.operation === 'batch') {
      if (stored.size >= 50 && fail) { fail = false; throw new Error('Simulated lost connection'); }
      let inserted = 0, replayed = 0;
      for (const entry of args.payload.entries) {
        const key = `${entry.table}/${entry.row.id}`;
        if (stored.has(key)) replayed++; else { stored.add(key); inserted++; }
      }
      return {inserted, replayed};
    }
    if (args.operation === 'reconcile') return {errors: []};
    if (args.operation === 'rebuildActivity') return {complete: ++activityChunks === 2};
    return {};
  });
  const data = migration(), options = {url: target, secret, mode: 'restore' as const, expectedSourceDigest: data.sourceDigest};
  await assert.rejects(importConvex(data, options), /Simulated lost connection/);
  assert.equal(phases.includes('complete'), false);
  const result = await importConvex(data, options);
  assert.equal(result.networkImported, true);
  if (!result.networkImported) assert.fail('Import did not complete');
  assert.equal(result.replayed, 50);
  assert.equal(stored.size, result.inserted + result.replayed);
  assert.ok(phases.lastIndexOf('reconcile') < phases.lastIndexOf('complete'));
  assert.ok(phases.lastIndexOf('complete') < phases.indexOf('rebuildActivity'));
  assert.equal(result.activity?.complete, true);
});

test('PDF backup bytes must exist and match before remote writes; restore does not upload or regenerate them', async t => {
  let network = 0;
  t.mock.method(globalThis, 'fetch', async () => { network++; throw new Error('Unexpected network'); });
  const directory = await mkdtemp(join(tmpdir(), 'restore-objects-'));
  try {
    const data = normalize({ attachments: [{_id: 'pdf', objectKey: 'original.pdf', filename: 'original.pdf', contentType: 'application/pdf', size: 3, createdAt: 1}] });
    assert.deepEqual(data.errors, []);
    const options = {url: target, secret, mode: 'restore' as const, expectedSourceDigest: data.sourceDigest};
    await assert.rejects(importConvex(data, options), /OBJECT_BACKUP_REQUIRED/);
    await assert.rejects(importConvex(data, {...options, objectDirectory: directory}), /OBJECT_BACKUP_INVALID/);
    await writeFile(join(directory, 'original.pdf'), 'pdf');
    const preview = await importConvex(data, {...options, objectDirectory: directory, dryRun: true});
    assert.equal(preview.objects.checked, 1);
    assert.equal(preview.objects.uploaded, 0);
    data.tables.files[0].sha256 = 'a'.repeat(64);
    await assert.rejects(importConvex(data, {...options, objectDirectory: directory, dryRun: true}), /OBJECT_BACKUP_INVALID/);
    assert.equal(network, 0);
  } finally { await rm(directory, {recursive: true, force: true}); }
});

test('CLI private config overrides inherited target and dry-run writes a private report without credentials', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'restore-cli-'));
  try {
    const input = join(directory, 'export.json'), config = join(directory, 'restore.env'), report = join(directory, 'report.json');
    await writeFile(input, '{}');
    await writeFile(config, `MIGRATION_TARGET_URL=${target}\nMIGRATION_SECRET=${secret}\n`, {mode: 0o600});
    const result = spawnSync(process.execPath, ['--import', './apps/api/node_modules/tsx/dist/loader.mjs', 'apps/api/scripts/migration/import-convex.ts', input,
      '--config', config, '--restore', '--dry-run', '--report', report], {
      cwd: new URL('../../..', import.meta.url), encoding: 'utf8', env: {...process.env, MIGRATION_TARGET_URL: 'http://wrong-target.invalid', MIGRATION_SOURCE_DIGEST: 'b'.repeat(64)},
    });
    assert.equal(result.status, 0, result.stderr);
    const {readFile, stat} = await import('node:fs/promises');
    const saved = await readFile(report, 'utf8');
    assert.equal(JSON.parse(saved).target, target);
    assert.equal(JSON.parse(saved).networkImported, false);
    assert.equal((await stat(report)).mode & 0o777, 0o600);
    assert.equal((saved + result.stdout + result.stderr).includes(secret), false);
  } finally { await rm(directory, {recursive: true, force: true}); }
});
