import { defineConfig } from 'drizzle-kit'
import { env } from '@/shared/env'

export default defineConfig({
  schema: './src/infra/db/schema/index.ts',
  out: './src/infra/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  casing: 'snake_case',
})
