import { randomUUID } from 'node:crypto';
import { exportJWK, importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose';
import { env } from '../env.js';

const privateKey = importPKCS8(env.JWT_PRIVATE_KEY_PEM.replace(/\\n/g, '\n'), 'RS256');
const publicKey = importSPKI(env.JWT_PUBLIC_KEY_PEM.replace(/\\n/g, '\n'), 'RS256');
export async function issueToken(subject: string, sessionVersion = 0, sessionId = randomUUID()) {
  const key = await privateKey;
  return new SignJWT({ sv: sessionVersion, refreshAfter: env.SESSION_REFRESH_INTERVAL_SECONDS })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'tcg-rs256-v1' })
    .setSubject(subject)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setJti(sessionId)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_TTL_SECONDS}s`)
    .sign(key);
}
export async function verifyToken(token: string) {
  const { payload, protectedHeader } = await jwtVerify(token, await publicKey, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    algorithms: ['RS256'],
  });
  const sessionVersion = payload.sv ?? 0;
  if (
    protectedHeader.alg !== 'RS256' ||
    payload.scope !== undefined ||
    !payload.sub ||
    !payload.jti ||
    !Number.isFinite(payload.exp) ||
    typeof sessionVersion !== 'number'
  )
    throw new Error('INVALID_SESSION');
  return {
    subject: payload.sub,
    jti: payload.jti,
    expiresAt: Number(payload.exp) * 1000,
    issuedAt: Number(payload.iat) * 1000,
    sessionVersion,
  };
}
export async function jwks() {
  const jwk = await exportJWK(await publicKey);
  return { keys: [{ ...jwk, kid: 'tcg-rs256-v1', use: 'sig', alg: 'RS256' }] };
}

// Read-only browser credential, bound to the original session and never persisted.
export async function issueRealtimeToken(token: string) {
  const session = await verifyToken(token);
  return new SignJWT({ scope: 'realtime:read', sv: session.sessionVersion, sessionJti: session.jti })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'tcg-rs256-v1' })
    .setSubject(session.subject).setIssuer(env.JWT_ISSUER).setAudience(env.JWT_AUDIENCE)
    .setJti(randomUUID()).setIssuedAt()
    .setExpirationTime(Math.min(Math.floor(session.expiresAt / 1000), Math.floor(Date.now() / 1000) + 300))
    .sign(await privateKey);
}
