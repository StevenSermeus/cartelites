import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { ConvexAccountRepository } from '../db/accountRepository.js';
import { env } from '../env.js';
import { issueToken, verifyToken } from './tokens.js';
import { setSessionCookies } from './cookies.js';
export type Variables = {
  ownerId: string;
  tokenJti: string;
  tokenExpiresAt: number;
  accessToken: string;
};
export const authMiddleware = (repo: ConvexAccountRepository) =>
  createMiddleware<{ Variables: Variables }>(async (c, next) => {
    const bearer = c.req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    const token = bearer ?? getCookie(c, 'session');
    if (!token) return c.json({ error: 'UNAUTHENTICATED' }, 401);
    let session: Awaited<ReturnType<typeof verifyToken>>;
    try {
      session = await verifyToken(token);
    } catch {
      return c.json({ error: 'INVALID_SESSION' }, 401);
    }
    // A Convex/network failure here is a server failure, not an invalid user token.
    // Keep it outside the JWT catch so clients don't discard a valid session.
    if (!(await repo.isSessionValid(session.subject, session.jti, session.sessionVersion)))
      return c.json({ error: 'INVALID_SESSION' }, 401);
    if (!bearer && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
      const origin = c.req.header('origin');
      if (origin !== env.WEB_ORIGIN) return c.json({ error: 'CSRF_ORIGIN' }, 403);
      const csrfCookie = getCookie(c, 'csrf'),
        csrfHeader = c.req.header('x-csrf-token');
      if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader)
        return c.json({ error: 'CSRF_TOKEN' }, 403);
    }
    c.set('ownerId', session.subject);
    c.set('tokenJti', session.jti);
    c.set('tokenExpiresAt', session.expiresAt);
    c.set('accessToken', token);
    await next();
    // Background traffic does not extend a session. Clients only annotate recent
    // foreground input; renewal itself is entirely managed here, never by an endpoint.
    if (c.res.status < 400 && c.req.header('x-session-activity') === '1' &&
        !c.req.path.endsWith('/auth/logout') && !c.req.path.endsWith('/auth/realtime') &&
        Date.now() < session.expiresAt &&
        Date.now() - session.issuedAt >= env.SESSION_REFRESH_INTERVAL_SECONDS * 1000) {
      try {
        if (!await repo.isSessionValid(session.subject, session.jti, session.sessionVersion)) return;
        const replacement = await issueToken(session.subject, session.sessionVersion, session.jti);
        if (bearer) c.header('X-Access-Token', replacement);
        else setSessionCookies(c, replacement, getCookie(c, 'csrf'));
        c.header('Cache-Control', 'private, no-store');
      } catch {
        // A completed business operation must not look failed just because renewal failed.
        // The existing token remains valid until its original expiry; retry on later activity.
        console.warn('Session renewal unavailable');
      }
    }
  });
