import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { DEFAULT_CHIP_LIMIT, DEFAULT_FEE_RATE } from '@/config/constants'
import { users } from '../users/users.schema'

// Single row (id = 1) with the operation settings
export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1),
  feeRate: integer('fee_rate').default(DEFAULT_FEE_RATE).notNull(), // basis points, 1000 = 10%
  chipLimit: integer('chip_limit').default(DEFAULT_CHIP_LIMIT).notNull(), // in cents, default limit of new clients
  updatedById: text('updated_by_id').references(() => users.id),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
