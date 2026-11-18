import { createPublicKey } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
function convex(args) {
  const result = spawnSync('pnpm', ['exec', 'convex', ...args], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`Convex ${args[0]} failed (exit ${result.status ?? 'unknown'})`);
}

required('CONVEX_DEPLOY_KEY');
const issuer = required('JWT_ISSUER');
if (new URL(issuer).protocol !== 'https:') throw new Error('JWT_ISSUER must use HTTPS in production');
const publicKey = createPublicKey(required('JWT_PUBLIC_KEY_PEM').replace(/\\n/g, '\n'));
if (publicKey.asymmetricKeyType !== 'rsa') throw new Error('JWT_PUBLIC_KEY_PEM must be an RSA public key');
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'tcg-rs256-v1', use: 'sig', alg: 'RS256' };
// Inline public JWKS avoids depending on Hono before Compose is allowed to start it.
const jwks = `data:text/plain;charset=utf-8;base64,${Buffer.from(JSON.stringify({ keys: [jwk] })).toString('base64')}`;
const values = {
  JWT_ISSUER: issuer,
  JWT_AUDIENCE: required('JWT_AUDIENCE'),
  JWT_JWKS: jwks,
  CONVEX_AUTH_SECRET: required('CONVEX_AUTH_SECRET'),
};
if (values.CONVEX_AUTH_SECRET.length < 32) throw new Error('CONVEX_AUTH_SECRET must contain at least 32 characters');
const directory = mkdtempSync(join(tmpdir(), 'convex-env-'));
try {
  const file = join(directory, 'deployment.env');
  writeFileSync(file, Object.entries(values).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join('\n'), { mode: 0o600 });
  convex(['env', 'set', '--force', '--from-file', file]);
  convex(['deploy', '--typecheck', 'enable']);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
