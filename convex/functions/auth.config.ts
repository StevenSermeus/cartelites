import type { AuthConfig } from 'convex/server';

// Set these on each Convex deployment to match the Hono API environment.
// Defaults allow a fresh local deployment to boot before variables are set.
const issuer = process.env.JWT_ISSUER ?? 'http://127.0.0.1:3001';
const audience = process.env.JWT_AUDIENCE ?? 'tcg-marge-clients';

const config: AuthConfig = {
  providers: [
    {
      type: 'customJwt',
      applicationID: audience,
      issuer,
      // Compose can supply inline public JWKS before the API is running.
      jwks: process.env.JWT_JWKS ?? new URL('/.well-known/jwks.json', issuer).toString(),
      algorithm: 'RS256',
    },
  ],
};

export default config;
