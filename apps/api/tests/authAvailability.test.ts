import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import type { ConvexAccountRepository } from '../src/db/accountRepository.js';
const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
Object.assign(process.env, {
  CONVEX_URL: 'https://example.convex.cloud',
  CONVEX_AUTH_SECRET: 'x'.repeat(32),
  R2_ENDPOINT: 'https://storage.example.test',
  R2_BUCKET: 'test',
  R2_ACCESS_KEY_ID: 'test',
  R2_SECRET_ACCESS_KEY: 'test',
  JWT_ISSUER: 'https://api.example.test',
  JWT_AUDIENCE: 'test',
  JWT_PRIVATE_KEY_PEM: keys.privateKey,
  JWT_PUBLIC_KEY_PEM: keys.publicKey,
  WEB_ORIGIN: 'https://example.test',
});
const { authRoutes } = await import('../src/routes/auth.js');
const { issueToken } = await import('../src/auth/tokens.js');

test('session status distinguishes account-store outage from invalid or revoked credentials', async () => {
  let state: 'valid' | 'revoked' | 'offline' = 'valid';
  let checks = 0;
  const app = authRoutes({
    isSignupEnabled: async () => false,
    isSessionValid: async () => {
      checks++;
      if (state === 'offline') throw new Error('transport unavailable');
      return state === 'valid';
    },
  } as unknown as ConvexAccountRepository);
  const token = await issueToken('employee'),
    headers = { Cookie: `session=${token}` };
  const valid = await app.request('/status', { headers });
  assert.equal(valid.status, 200);
  const identity = await valid.json();
  assert.equal(identity.authenticated, true);
  assert.equal(identity.accountId, 'employee');
  assert.equal(valid.headers.get('cache-control'), 'private, no-store');
  state = 'offline';
  const outage = await app.request('/status', { headers });
  assert.equal(outage.status, 503);
  assert.deepEqual(await outage.json(), { error: 'AUTH_SERVICE_UNAVAILABLE' });
  assert.equal(outage.headers.get('set-cookie'), null);
  state = 'valid';
  assert.equal(
    (await (await app.request('/status', { headers })).json()).authenticated,
    true,
    'same cookie recovers without reauthentication',
  );
  state = 'revoked';
  const revoked = await (await app.request('/status', { headers })).json();
  assert.equal(revoked.authenticated, false);
  assert.equal(revoked.accountId, undefined);
  const before = checks;
  assert.equal(
    (await (await app.request('/status', { headers: { Cookie: 'session=invalid' } })).json())
      .authenticated,
    false,
  );
  assert.equal(checks, before);
});

test('password-reset retry preserves the distinction between transient failure and consumed/expired tokens', async () => {
  let result: 'outage' | 'invalid' | 'success' = 'outage';
  const app = authRoutes({
    consumePasswordReset: async () => {
      if (result === 'outage') throw new Error('network disconnected');
      if (result === 'invalid') throw new Error('RESET_TOKEN_INVALID');
      return true;
    },
  } as unknown as ConvexAccountRepository);
  const request = () =>
    app.request('/password-reset/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'x'.repeat(43), password: 'test-password-12345' }),
    });
  const offline = await request();
  assert.equal(offline.status, 503);
  assert.deepEqual(await offline.json(), { error: 'AUTH_SERVICE_UNAVAILABLE' });
  result = 'success';
  assert.equal((await request()).status, 204);
  result = 'invalid';
  const invalid = await request();
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: 'RESET_TOKEN_INVALID' });
});

test('queued requests cannot execute under another account after the browser cookie changes', async () => {
  const { Hono } = await import('hono');
  const { authMiddleware } = await import('../src/auth/middleware.js');
  const app = new Hono();
  let writes = 0;
  app.use(
    '*',
    authMiddleware({ isSessionValid: async () => true } as unknown as ConvexAccountRepository),
  );
  app.post('/operation', (c) => {
    writes++;
    return c.json({ ok: true });
  });
  const first = await issueToken('employee-a'),
    second = await issueToken('employee-b');
  const invoke = (token: string, expected?: string) =>
    app.request('/operation', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        ...(expected ? { 'X-Expected-Account-ID': expected } : {}),
      },
    });
  assert.equal((await invoke(first, 'employee-a')).status, 200);
  const mismatch = await invoke(second, 'employee-a');
  assert.equal(mismatch.status, 403);
  assert.deepEqual(await mismatch.json(), { error: 'ACCOUNT_MISMATCH' });
  assert.equal(writes, 1);
  assert.equal(
    (await invoke(first, 'employee-a')).status,
    200,
    'same-account recovery remains permitted',
  );
  assert.equal(
    (await invoke(second)).status,
    200,
    'existing authenticated clients remain compatible',
  );
  assert.equal(writes, 3);
});
