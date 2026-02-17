import { createId } from '@paralleldrive/cuid2'
import { integer, pgEnum, pgTable, text } from 'drizzle-orm/pg-core'
import { timestamps } from './columns.helpers'

export const rolesEnum = pgEnum("transaction_roles", ['CASH_IN', 'CASH_OUT']);

export const typesEnum = pgEnum("transaction_types", ['PIX']);

export const transactions = pgTable('transactions', {
  id: text('id')
    .$defaultFn(() => createId())
    .primaryKey(),
  providerTransactionId: text('provider_transaction_id'),
  role: rolesEnum('role').notNull(),
  type: typesEnum('type').notNull(),
  amount: integer('amount').notNull(),
  externalId: text('external_id'),
  webhookUrl: text('webhook_url').notNull(),
  status: text('status').notNull(),
  ...timestamps,
})
