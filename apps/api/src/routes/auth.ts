import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import argon2 from 'argon2';
import { getCookie } from 'hono/cookie';
import { clearSessionCookies, setSessionCookies } from '../auth/cookies.js';
import { authMiddleware, type Variables } from '../auth/middleware.js';
import { issueToken, verifyToken } from '../auth/tokens.js';
import type { ConvexAccountRepository } from '../db/accountRepository.js';
import { env } from '../env.js';

const creds = z.object({ email: z.string().email(), password: z.string().min(12).max(256) });
const resetRequest = z.object({ email: z.string().email() });
const resetComplete = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(12).max(256),
});
const signupSetting = z.object({ enabled: z.boolean() });
const dummyPasswordHash = argon2.hash(randomUUID(), { type: argon2.argon2id });
export function authRoutes(repo: ConvexAccountRepository) {
  const app = new OpenAPIHono<{ Variables: Variables }>();
  app.openapi(
    createRoute({
      method: 'post',
      path: '/password-reset/request',
      request: { body: { content: { 'application/json': { schema: resetRequest } } } },
      responses: {
        202: { description: 'Demande acceptée si le compte existe' },
        503: { description: 'Envoi d’e-mail non configuré' },
      },
    }),
    async (c) => {
      if (!env.RESEND_API_KEY || !env.RESET_FROM_EMAIL)
        return c.json({ error: 'EMAIL_DELIVERY_UNAVAILABLE' }, 503);
      const email = c.req.valid('json').email.trim().toLowerCase();
      const emailHash = createHmac('sha256', env.CONVEX_AUTH_SECRET).update(email).digest('hex');
      if (await repo.canAttemptLogin(emailHash)) {
        const rawToken = randomBytes(32).toString('base64url');
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');
        try {
          const account = await repo.createPasswordReset(
            email,
            tokenHash,
            Date.now() + 60 * 60 * 1000,
          );
          if (account) {
            const resetUrl = new URL('/', env.WEB_ORIGIN);
            resetUrl.searchParams.set('reset', rawToken);
            const sent = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: env.RESET_FROM_EMAIL,
                to: [account.email],
                subject: 'Réinitialisation de votre mot de passe',
                html: `<p>Utilisez ce lien dans l’heure pour choisir un nouveau mot de passe :</p><p><a href="${resetUrl.toString()}">Réinitialiser mon mot de passe</a></p><p>Si vous n’avez pas demandé ce changement, ignorez ce message.</p>`,
              }),
            });
            if (!sent.ok) console.error('Password reset email delivery failed:', sent.status);
          }
        } catch (error) {
          console.error(
            'Password reset request failed:',
            error instanceof Error ? error.message : 'unknown',
          );
        }
      }
      return c.json({ ok: true }, 202);
    },
  );
  app.openapi(
    createRoute({
      method: 'post',
      path: '/password-reset/complete',
      request: { body: { content: { 'application/json': { schema: resetComplete } } } },
      responses: {
        204: { description: 'Mot de passe remplacé' },
        400: { description: 'Jeton invalide ou expiré' },
      },
    }),
    async (c) => {
      const { token, password } = c.req.valid('json');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      try {
        await repo.consumePasswordReset(
          tokenHash,
          await argon2.hash(password, { type: argon2.argon2id }),
        );
      } catch {
        return c.json({ error: 'RESET_TOKEN_INVALID' }, 400);
      }
      return c.body(null, 204);
    },
  );
  app.openapi(
    createRoute({
      method: 'get',
      path: '/csrf',
      responses: {
        200: { description: 'Jeton CSRF de la session web' },
        401: { description: 'Pas de session web' },
      },
    }),
    async (c) => {
      const csrfToken = getCookie(c, 'csrf');
      if (!csrfToken) return c.json({ error: 'CSRF_TOKEN_MISSING' }, 401);
      c.header('X-CSRF-Token', csrfToken);
      return c.json({ ok: true });
    },
  );
  app.openapi(
    createRoute({
      method: 'get',
      path: '/status',
      responses: { 200: { description: 'État de la session et de la création de compte' } },
    }),
    async (c) => {
      const signupEnabled = await repo.isSignupEnabled();
      const token = getCookie(c, 'session');
      if (!token) return c.json({ authenticated: false, signupEnabled });
      try {
        const session = await verifyToken(token);
        const authenticated = await repo.isSessionValid(
          session.subject,
          session.jti,
          session.sessionVersion,
        );
        return c.json({ authenticated, signupEnabled });
      } catch {
        return c.json({ authenticated: false, signupEnabled });
      }
    },
  );
  app.openapi(
    createRoute({
      method: 'patch',
      path: '/signup-status',
      middleware: [authMiddleware(repo)],
      request: { body: { content: { 'application/json': { schema: signupSetting } } } },
      responses: { 200: { description: 'Paramètre d’inscription modifié' } },
    }),
    async (c) => {
      const { enabled } = c.req.valid('json');
      await repo.setSignupEnabled(enabled);
      return c.json({ enabled });
    },
  );
  app.openapi(
    createRoute({
      method: 'post',
      path: '/register',
      request: { body: { content: { 'application/json': { schema: creds } } } },
      responses: {
        201: { description: 'Compte créé' },
        400: { description: 'Identifiants invalides' },
        409: { description: 'Adresse déjà utilisée' },
        403: { description: 'Création de compte désactivée' },
      },
    }),
    async (c) => {
      const { email, password } = c.req.valid('json');
      if (!(await repo.isSignupEnabled())) return c.json({ error: 'SIGNUP_DISABLED' }, 403 as const);
      const normalized = email.trim().toLowerCase();
      if (await repo.byEmail(normalized))
        return c.json({ error: 'INVALID_CREDENTIALS' }, 400 as const);
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      let account: Awaited<ReturnType<typeof repo.create>>;
      try {
        account = await repo.create(normalized, passwordHash);
      } catch (error) {
        if (error instanceof Error && error.message.includes('SIGNUP_DISABLED'))
          return c.json({ error: 'SIGNUP_DISABLED' }, 403 as const);
        return c.json({ error: 'INVALID_CREDENTIALS' }, 400 as const);
      }
      const token = await issueToken(account.id, account.sessionVersion);
      setSessionCookies(c, token);
      return c.json(
        {
          id: account.id,
          email: account.email,
          ...(c.req.header('x-client-platform') === 'ios' ? { accessToken: token } : {}),
          expiresIn: env.JWT_TTL_SECONDS,
        },
        201,
      );
    },
  );
  app.openapi(
    createRoute({
      method: 'post',
      path: '/login',
      request: { body: { content: { 'application/json': { schema: creds } } } },
      responses: {
        200: { description: 'Session créée' },
        401: { description: 'Identifiants invalides' },
        429: { description: 'Trop de tentatives' },
      },
    }),
    async (c) => {
      const { email, password } = c.req.valid('json');
      const normalized = email.trim().toLowerCase();
      const emailHash = createHmac('sha256', env.CONVEX_AUTH_SECRET)
        .update(normalized)
        .digest('hex');
      if (!(await repo.canAttemptLogin(emailHash)))
        return c.json({ error: 'INVALID_CREDENTIALS' }, 429);
      const account = await repo.byEmail(normalized);
      const passwordMatches = await argon2
        .verify(account?.passwordHash ?? (await dummyPasswordHash), password)
        .catch(() => false);
      if (!account || !passwordMatches) {
        return c.json({ error: 'INVALID_CREDENTIALS' }, 401 as const);
      }
      await repo.clearLoginFailures(emailHash);
      const token = await issueToken(account.id, account.sessionVersion);
      setSessionCookies(c, token);
      return c.json(
        {
          id: account.id,
          email: account.email,
          ...(c.req.header('x-client-platform') === 'ios' ? { accessToken: token } : {}),
          expiresIn: env.JWT_TTL_SECONDS,
        },
        200,
      );
    },
  );
  app.openapi(
    createRoute({
      method: 'post',
      path: '/logout',
      middleware: [authMiddleware(repo)],
      responses: { 204: { description: 'Session révoquée' } },
    }),
    async (c) => {
      await repo.revokeJti(c.get('tokenJti'), c.get('tokenExpiresAt'));
      clearSessionCookies(c);
      return c.body(null, 204);
    },
  );
  app.openapi(
    createRoute({
      method: 'post',
      path: '/refresh',
      middleware: [authMiddleware(repo)],
      responses: { 200: { description: 'Jeton renouvelé' } },
    }),
    async (c) => {
      await repo.revokeJti(c.get('tokenJti'), c.get('tokenExpiresAt'));
      const account = await repo.byId(c.get('ownerId'));
      if (!account) return c.json({ error: 'UNAUTHENTICATED' }, 401);
      const token = await issueToken(account.id, account.sessionVersion);
      setSessionCookies(c, token);
      return c.json({
        ...(c.req.header('x-client-platform') === 'ios' ? { accessToken: token } : {}),
        expiresIn: env.JWT_TTL_SECONDS,
      });
    },
  );
  return app;
}
