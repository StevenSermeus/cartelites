import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Hono } from 'hono';
import { SignJWT, importPKCS8, decodeJwt } from 'jose';
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
const { authMiddleware } = await import('../src/auth/middleware.js');
const { authRoutes } = await import('../src/routes/auth.js');
const { issueToken } = await import('../src/auth/tokens.js');
const { env } = await import('../src/env.js');
const signingKey = await importPKCS8(keys.privateKey, 'RS256');
async function agedToken(age: number, expiresIn = 3600 - age) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sv: 0 }).setProtectedHeader({ alg: 'RS256' }).setSubject('employee')
    .setJti('session-id').setIssuer(env.JWT_ISSUER).setAudience(env.JWT_AUDIENCE)
    .setIssuedAt(now - age).setExpirationTime(now + expiresIn).sign(signingKey);
}
function fixture() {
  const revoked = new Map<string, number>();
  const repo = {
    isSessionValid: async (_id: string, jti: string) => (revoked.get(jti) ?? 0) <= Date.now(),
    revokeJti: async (jti: string, expiresAt: number) => { revoked.set(jti, expiresAt); },
  } as unknown as ConvexAccountRepository;
  const app = new Hono();
  app.use('/work', authMiddleware(repo));
  app.get('/work', c => c.json({ saved: true }));
  app.route('/auth', authRoutes(repo));
  return { app, repo };
}
const headers = (token: string, active = true) => ({ Authorization: `Bearer ${token}`, ...(active ? { 'X-Session-Activity': '1' } : {}) });

test('one-hour default renews after fifteen minutes through middleware; refresh endpoint is removed', async () => {
  const { app } = fixture();
  assert.equal(env.JWT_TTL_SECONDS, 3600);
  assert.equal(env.SESSION_REFRESH_INTERVAL_SECONDS, 900);
  const initial = decodeJwt(await issueToken('employee'));
  assert.equal(initial.exp! - initial.iat!, 3600);
  assert.equal((await app.request('/work', { headers: headers(await agedToken(898)) })).headers.get('X-Access-Token'), null);
  const due = await app.request('/work', { headers: headers(await agedToken(901)) });
  const renewed = decodeJwt(due.headers.get('X-Access-Token')!);
  assert.equal(renewed.exp! - renewed.iat!, 3600);
  assert.equal(renewed.jti, 'session-id');
  assert.equal((await app.request('/auth/refresh', { method: 'POST' })).status, 404);
});

test('idle, expired and revoked credentials never renew', async () => {
  const { app, repo } = fixture();
  const token = await agedToken(1200);
  assert.equal((await app.request('/work', { headers: headers(token, false) })).headers.get('X-Access-Token'), null);
  assert.equal((await app.request('/work', { headers: headers(await agedToken(3601, -1)) })).status, 401);
  await repo.revokeJti('session-id', Date.now() + 3600000);
  const denied = await app.request('/work', { headers: headers(token) });
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get('X-Access-Token'), null);
});

test('concurrent renewals stay valid and logout revokes every replacement', async () => {
  const { app } = fixture();
  const original = await agedToken(1200);
  const results = await Promise.all([app.request('/work', { headers: headers(original) }), app.request('/work', { headers: headers(original) })]);
  const replacements = results.map(r => r.headers.get('X-Access-Token')!);
  for (const replacement of replacements) assert.equal((await app.request('/work', { headers: headers(replacement) })).status, 200);
  assert.equal((await app.request('/auth/logout', { method: 'POST', headers: headers(original) })).status, 204);
  for (const replacement of replacements) assert.equal((await app.request('/work', { headers: headers(replacement) })).status, 401);
});

test('web renewal extends HttpOnly cookie and preserves CSRF', async () => {
  const { app } = fixture();
  const csrf = 'a'.repeat(48);
  const response = await app.request('/work', { headers: { Cookie: `session=${await agedToken(1200)}; csrf=${csrf}`, 'X-Session-Activity': '1' } });
  const cookies = response.headers.getSetCookie();
  assert.ok(cookies.some(c => c.startsWith('session=') && c.includes('HttpOnly') && c.includes('Max-Age=3600')));
  assert.ok(cookies.some(c => c.startsWith(`csrf=${csrf};`)));
});

test('overridden durations control middleware renewal and token lifetime', async () => {
  const oldTtl = env.JWT_TTL_SECONDS, oldInterval = env.SESSION_REFRESH_INTERVAL_SECONDS;
  try {
    env.JWT_TTL_SECONDS = 7200; env.SESSION_REFRESH_INTERVAL_SECONDS = 1800;
    const { app } = fixture();
    assert.equal((await app.request('/work', { headers: headers(await agedToken(1000)) })).headers.get('X-Access-Token'), null);
    const response = await app.request('/work', { headers: headers(await agedToken(1801)) });
    const token = decodeJwt(response.headers.get('X-Access-Token')!);
    assert.equal(token.exp! - token.iat!, 7200);
  } finally { env.JWT_TTL_SECONDS = oldTtl; env.SESSION_REFRESH_INTERVAL_SECONDS = oldInterval; }
});
