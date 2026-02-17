import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(3000),
  SENTRY_DSN: z.string(),
  API_URL: z.string(),
  HASH_SECRET: z.string(),
  BACKEND_SECRET_KEY: z.string(),
  BACKEND_PUBLIC_KEY: z.string(),
})

export const env = envSchema.parse(Bun.env)
