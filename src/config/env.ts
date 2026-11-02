import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string(),
  PORT: z.string().default('3333'),
  NODE_ENV: z.string().default('development'),
  SENTRY_DSN: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must have at least 32 characters'),
  JWT_ISSUER: z.string().default('binder-manager-api'),
  JWT_AUDIENCE: z.string().default('binder-manager-web'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(60 * 15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),
  // Hosts accepted for image URLs (chip photos)
  FILE_URL_HOSTS: z
    .string()
    .default('files.edgestore.dev')
    .transform((hosts) => hosts.split(',').map((host) => host.trim())),
})

export const env = envSchema.parse(process.env)
