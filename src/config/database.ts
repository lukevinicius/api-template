import { drizzle } from 'drizzle-orm/node-postgres'
import { schema } from '@/database/schema'
import { env } from './env'

export const db = drizzle(env.DATABASE_URL, { schema })
