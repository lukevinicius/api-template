import { type AnyColumn, sql } from 'drizzle-orm'
import { timestamp } from 'drizzle-orm/pg-core'

export const timestamps = {
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
}

// Chips with this quantity or less in the cashier are flagged as low stock
export const LOW_STOCK_THRESHOLD = 20

// Initial values of the settings row (see settings module)
export const DEFAULT_FEE_RATE = 1000 // basis points: 1000 = 10%
export const DEFAULT_CHIP_LIMIT = 5_000_000 // in cents

export const increment = (column: AnyColumn, value = 1) => {
  return sql`${column} + ${value}`
}

export const decrement = (column: AnyColumn, value = 1) => {
  return sql`${column} - ${value}`
}
