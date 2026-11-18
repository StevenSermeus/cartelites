import { randomBytes } from 'node:crypto';
import { env } from '../env.js';

type CookieContext = {
  header: (name: string, value: string, options?: { append?: boolean }) => void;
};

function cookie(context: CookieContext, name: string, value: string, options: string) {
  context.header('Set-Cookie', `${name}=${value}; Path=/; SameSite=Lax; ${options}`, {
    append: true,
  });
}

export function setSessionCookies(context: CookieContext, token: string, existingCsrf?: string) {
  const secure = env.COOKIE_SECURE ? ' Secure;' : '';
  const maxAge = ` Max-Age=${env.JWT_TTL_SECONDS};`;
  cookie(context, 'session', encodeURIComponent(token), `HttpOnly;${secure}${maxAge}`);
  const csrfToken = existingCsrf ?? randomBytes(24).toString('hex');
  cookie(context, 'csrf', csrfToken, `${secure}${maxAge}`);
  context.header('X-CSRF-Token', csrfToken);
}

export function clearSessionCookies(context: CookieContext) {
  cookie(context, 'session', '', 'HttpOnly; Max-Age=0;');
  cookie(context, 'csrf', '', 'Max-Age=0;');
}
