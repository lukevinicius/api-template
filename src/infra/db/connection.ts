import { drizzle } from 'drizzle-orm/node-postgres'
import { schema } from '@/infra/db/schema'
import { env } from '@/shared/env'

export const db = drizzle(env.DATABASE_URL, { schema })
