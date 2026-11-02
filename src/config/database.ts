import { drizzle } from 'drizzle-orm/node-postgres'
import { schema } from '@/database/schema'
import { env } from './env'

export const db = drizzle(env.DATABASE_URL, { schema })

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
export type Executor = typeof db | Transaction
