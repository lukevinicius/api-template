import { timestamp } from 'drizzle-orm/pg-core'

export const timestamps = {
  updated_at: timestamp('updated_at').$onUpdate(() => new Date()),
  created_at: timestamp('created_at').defaultNow(),
  deleted_at: timestamp('deleted_at'),
}
