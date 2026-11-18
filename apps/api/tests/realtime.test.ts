import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import test from 'node:test';
import { ConvexHttpClient } from 'convex/browser';
import { getFunctionName } from 'convex/server';
import type { ConvexAccountRepository } from '../src/db/accountRepository.js';

// Ephemeral test keys: exercise the real auth middleware without external services.
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
const { issueToken, verifyToken } = await import('../src/auth/tokens.js');
const { decodeJwt } = await import('jose');
const token = await issueToken('employee', 3);
const repo = { isSessionValid: async () => true } as unknown as ConvexAccountRepository;
test('realtime configuration requires a valid session and returns a short-lived read-only token', async () => {
  const app = authRoutes(repo);
  assert.equal((await app.request('/realtime')).status, 401);
  for (const headers of [{ Authorization: `Bearer ${token}` }, { Cookie: `session=${token}` }]) {
    const response = await app.request('/realtime', { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const connection = await response.json() as { url: string; token: string };
    assert.equal(connection.url, process.env.CONVEX_URL);
    assert.notEqual(connection.token, token);
    const original = decodeJwt(token), claims = decodeJwt(connection.token);
    assert.equal(claims.scope, 'realtime:read');
    assert.equal(claims.sv, 3); assert.equal(claims.sessionJti, original.jti);
    assert.ok(claims.exp! <= original.exp!);
    assert.ok(claims.exp! <= Math.floor(Date.now() / 1000) + 300);
    await assert.rejects(verifyToken(connection.token), /INVALID_SESSION/);
    assert.equal((await app.request('/realtime', { headers: { Authorization: `Bearer ${connection.token}` } })).status, 401);
  }
});
test('revoked sessions cannot acquire live credentials', async () => {
  const app = authRoutes({ isSessionValid: async () => false } as unknown as ConvexAccountRepository);
  assert.equal((await app.request('/realtime', { headers: { Authorization: `Bearer ${token}` } })).status, 401);
});
