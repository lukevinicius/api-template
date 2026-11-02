import { createId } from '@paralleldrive/cuid2'
import { sql } from 'drizzle-orm'
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { users } from '../users/users.schema'

export const auditActionEnum = pgEnum('audit_action', [
  'LOGIN',
  'LOGOUT',
  'CREATE',
  'UPDATE',
  'DELETE',
  'PASSWORD_CHANGE',
  'STOCK_ADD',
  'STOCK_REMOVE',
  'ITEM_ADD',
  'ITEM_UPDATE',
  'ITEM_REMOVE',
  'PAYMENT',
  'CHIP_RETURN',
  'PAYOUT',
  'CLOSE',
  'CANCEL',
])

export const auditEntityEnum = pgEnum('audit_entity', [
  'AUTH',
  'USER',
  'CLIENT',
  'CHIP',
  'ORDER',
  'EXCHANGE',
  'SETTINGS',
])

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id')
      .$defaultFn(() => createId())
      .primaryKey(),
    userId: text('user_id').references(() => users.id),
    action: auditActionEnum('action').notNull(),
    entity: auditEntityEnum('entity').notNull(),
    entityId: text('entity_id'),
    description: text('description').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ip: text('ip'),
    // clock_timestamp() instead of now(): logs written in the same transaction
    // keep the order they happened in (now() is fixed for the transaction)
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    index('audit_logs_user_id_idx').on(table.userId),
    index('audit_logs_entity_idx').on(table.entity, table.entityId),
    index('audit_logs_created_at_idx').on(table.createdAt),
  ],
)
