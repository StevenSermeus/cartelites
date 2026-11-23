import { z } from 'zod';

const schema = z.object({
  DATA_MODEL: z.enum(['legacy', 'canonical']).default('legacy'),
  PORT: z.coerce.number().int().positive().default(3001),
  CONVEX_URL: z.string().url(),
  CONVEX_AUTH_SECRET: z.string().min(32),
  R2_ENDPOINT: z.string().url(),
  R2_BUCKET: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  ATTACHMENT_MAX_BYTES: z.coerce.number().int().positive().default(10485760),
  IMAGE_CACHE_MAX_BYTES: z.coerce.number().int().nonnegative().default(67108864),
  IMAGE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  BREVO_API_KEY: z.string().trim().default(''),
  BREVO_FROM_EMAIL: z.union([z.string().email(), z.literal('')]).default(''),
  BREVO_FROM_NAME: z.string().trim().max(70).default(''),
  JWT_ISSUER: z.string().url(),
  JWT_AUDIENCE: z.string().min(1),
  JWT_PRIVATE_KEY_PEM: z.string().min(1),
  JWT_PUBLIC_KEY_PEM: z.string().min(1),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  SESSION_REFRESH_INTERVAL_SECONDS: z.coerce.number().int().positive().default(900),
  WEB_ORIGIN: z.string().url(),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
}).refine(value => value.SESSION_REFRESH_INTERVAL_SECONDS < value.JWT_TTL_SECONDS, {
  path: ['SESSION_REFRESH_INTERVAL_SECONDS'],
  message: 'Session refresh interval must be shorter than JWT_TTL_SECONDS',
});
export const env = schema.parse(process.env);
