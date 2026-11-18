import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
for (const failure of ['', 'env', 'deploy']) {
  test(`deployment orders environment before code and propagates ${failure || 'success'}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'tcg-deploy-test-'));
    try {
      const log = join(dir, 'calls.jsonl');
      writeFileSync(join(dir, 'pnpm'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const file = args.includes('--from-file') ? args[args.indexOf('--from-file') + 1] : null;
fs.appendFileSync(process.env.TEST_LOG, JSON.stringify({ args, file, content: file ? fs.readFileSync(file, 'utf8') : null }) + '\\n');
process.exit(args[2] === process.env.TEST_FAIL ? 7 : 0);
`, { mode: 0o755 });
      const result = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'convex-deploy.mjs')], {
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TEST_LOG: log, TEST_FAIL: failure,
          CONVEX_DEPLOY_KEY: 'test-only', CONVEX_AUTH_SECRET: 'x'.repeat(32),
          JWT_ISSUER: 'https://api.example.test', JWT_AUDIENCE: 'test-clients', JWT_PUBLIC_KEY_PEM: pem.replace(/\n/g, '\\n') },
        encoding: 'utf8',
      });
      assert.equal(result.status, failure ? 1 : 0);
      const calls = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
      assert.equal(calls.length, failure === 'env' ? 1 : 2);
      assert.deepEqual(calls[0].args.slice(0, 5), ['exec', 'convex', 'env', 'set', '--force']);
      const values = Object.fromEntries(calls[0].content.split('\n').map(line => {
        const at = line.indexOf('='); return [line.slice(0, at), JSON.parse(line.slice(at + 1))];
      }));
      assert.equal(values.JWT_ISSUER, 'https://api.example.test');
      assert.equal(values.JWT_AUDIENCE, 'test-clients');
      assert.equal(values.CONVEX_AUTH_SECRET, 'x'.repeat(32));
      const jwks = JSON.parse(Buffer.from(values.JWT_JWKS.split(',')[1], 'base64').toString());
      assert.equal(jwks.keys[0].kid, 'tcg-rs256-v1');
      assert.equal(jwks.keys[0].n, publicKey.export({ format: 'jwk' }).n);
      assert.equal(jwks.keys[0].d, undefined);
      assert.equal(values.JWT_PRIVATE_KEY_PEM, undefined);
      assert.equal(existsSync(calls[0].file), false);
      if (calls.length > 1) assert.deepEqual(calls[1].args, ['exec', 'convex', 'deploy', '--typecheck', 'enable']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
