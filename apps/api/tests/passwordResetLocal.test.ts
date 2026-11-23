import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Explicit opt-in: creates one disposable account in the local canonical rehearsal.
// Brevo is intercepted before importing the routes; every other remote URL is denied.
test('local canonical API reset invalidates all sessions and permits only the replacement password', {
  skip: process.env.RUN_LOCAL_AUTH_REHEARSAL !== '1',
}, async () => {
  assert.equal(process.env.CONVEX_URL, 'http://127.0.0.1:3220');
  assert.equal(process.env.DATA_MODEL, 'canonical');
  process.env.BREVO_API_KEY = 'local-intercept-only';
  process.env.BREVO_FROM_EMAIL = 'qa@example.invalid';
  const originalFetch = globalThis.fetch;
  const messages: { textContent: string; to: { email: string }[] }[] = [];
  let blocked = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    if (url.href === 'https://api.brevo.com/v3/smtp/email') {
      messages.push(JSON.parse(String(init?.body)));
      return Response.json({ messageId: `local-${messages.length}` }, { status: 201 });
    }
    if (!['http://127.0.0.1:3220', 'http://127.0.0.1:3002'].includes(url.origin)) {
      blocked++;
      throw new Error('EXTERNAL_NETWORK_FORBIDDEN');
    }
    return originalFetch(input, init);
  };
  try {
    const [
      { ConvexHttpClient },
      { makeFunctionReference },
      { default: argon2 },
      { authRoutes },
      { ConvexAccountRepository },
    ] = await Promise.all([
      import('convex/browser'),
      import('convex/server'),
      import('argon2'),
      import('../src/routes/auth.js'),
      import('../src/db/accountRepository.js'),
    ]);
    const client = new ConvexHttpClient(process.env.CONVEX_URL!);
    const email = `reset-qa-${randomUUID()}@example.invalid`;
    const before = `Before-${randomUUID()}`,
      after = `After-${randomUUID()}`;
    // Trusted setup of this synthetic fixture does not change the closed shop policy.
    await client.action(makeFunctionReference<'action'>('authService:execute'), {
      secret: process.env.CONVEX_AUTH_SECRET!,
      operation: 'createAccount',
      payload: { email, passwordHash: await argon2.hash(before), registrationPolicy: 'open' },
    });
    const repo = new ConvexAccountRepository(),
      app = authRoutes(repo);
    const post = (path: string, body: unknown) =>
      app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const login = async (password: string) =>
      fetch('http://127.0.0.1:3002/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client-platform': 'ios' },
        body: JSON.stringify({ email, password }),
      });
    const initial = await login(before);
    assert.equal(initial.status, 200);
    const oldCookie = `session=${(await initial.json()).accessToken}`;
    const secondLogin = await login(before);
    assert.equal(secondLogin.status, 200);
    const secondCookie = `session=${(await secondLogin.json()).accessToken}`;
    const status = async (cookie: string) =>
      (await fetch('http://127.0.0.1:3002/api/v1/auth/status', { headers: { cookie } })).json();
    assert.equal((await status(oldCookie)).authenticated, true);
    assert.equal(
      (await post('/password-reset/request', { email: `absent-${randomUUID()}@example.invalid` }))
        .status,
      202,
    );
    assert.equal(messages.length, 0);
    const requestReset = async () => {
      assert.equal((await post('/password-reset/request', { email })).status, 202);
      const message = messages.at(-1)!;
      assert.equal(message.to[0].email, email);
      return new URL(message.textContent.match(/https?:\/\/\S+/)![0]).searchParams.get('reset')!;
    };
    const replaced = await requestReset(),
      token = await requestReset();
    assert.equal(
      (await post('/password-reset/complete', { token: replaced, password: after })).status,
      400,
    );
    assert.equal((await status(oldCookie)).authenticated, true);
    const outcomes = await Promise.all(
      [1, 2].map(() => post('/password-reset/complete', { token, password: after })),
    );
    assert.deepEqual(outcomes.map((r) => r.status).sort(), [204, 400]);
    assert.equal((await status(oldCookie)).authenticated, false);
    assert.equal((await status(secondCookie)).authenticated, false);
    assert.equal((await login(before)).status, 401);
    const renewed = await login(after);
    assert.equal(renewed.status, 200);
    assert.equal(
      (await status(`session=${(await renewed.json()).accessToken}`)).authenticated,
      true,
    );
    assert.equal((await post('/password-reset/complete', { token, password: before })).status, 400);
    assert.equal((await repo.byEmail(email))?.sessionVersion, 1);
    assert.equal(messages.length, 2);
    assert.equal(blocked, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
