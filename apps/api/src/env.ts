import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  CONVEX_URL: z.string().url(),
  CONVEX_AUTH_SECRET: z.string().min(32),
  MINIO_ENDPOINT: z.string().url(),
  MINIO_REGION: z.string().default('us-east-1'),
  MINIO_BUCKET: z.string().min(1),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  ATTACHMENT_MAX_BYTES: z.coerce.number().int().positive().default(10485760),
  RESEND_API_KEY: z.string().default(''),
  RESET_FROM_EMAIL: z.string().email().optional(),
  JWT_ISSUER: z.string().url(),
  JWT_AUDIENCE: z.string().min(1),
  JWT_PRIVATE_KEY_PEM: z.string().min(1),
  JWT_PUBLIC_KEY_PEM: z.string().min(1),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  WEB_ORIGIN: z.string().url(),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});
export const env = schema.parse(process.env);
