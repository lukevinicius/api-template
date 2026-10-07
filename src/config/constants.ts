import { type AnyColumn, sql } from 'drizzle-orm'
import { timestamp } from 'drizzle-orm/pg-core'

export const timestamps = {
  updatedAt: timestamp('updated_at').notNull().$onUpdate(() => new Date()),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
}

export const increment = (column: AnyColumn, value = 1) => {
  return sql`${column} + ${value}`
}

export const decrement = (column: AnyColumn, value = 1) => {
  return sql`${column} - ${value}`
}
