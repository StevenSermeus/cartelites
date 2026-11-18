import type { AuthConfig } from 'convex/server';

// Keep these aligned with apps/api/.env. Hard-coded values let a fresh local
// Convex deployment boot before deployment variables can be set.
const issuer = 'http://127.0.0.1:3001';
const audience = 'tcg-marge-clients';

const config: AuthConfig = {
  providers: [
    {
      type: 'customJwt',
      applicationID: audience,
      issuer,
      jwks: new URL('/.well-known/jwks.json', issuer).toString(),
      algorithm: 'RS256',
    },
  ],
};

export default config;
