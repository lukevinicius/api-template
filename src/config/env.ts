import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string(),
  PORT: z.string().default('3000'),
  NODE_ENV: z.string().default('development'),
  SENTRY_DSN: z.string(),
})

export const env = envSchema.parse(process.env)
