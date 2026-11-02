import { createId } from '@paralleldrive/cuid2'
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { timestamps } from '@/config/constants'
import { chips } from '../chips/chips.schema'
import { clients } from '../clients/clients.schema'
import { users } from '../users/users.schema'

export const exchangeStatusEnum = pgEnum('exchange_status', [
  'DONE',
  'CANCELED',
])

// IN: chips the client hands to the cashier. OUT: chips the client receives.
export const exchangeDirectionEnum = pgEnum('exchange_direction', ['IN', 'OUT'])

// Troca de fichas: e.g. one 5K chip for five 1K chips
export const exchanges = pgTable(
  'exchanges',
  {
    id: text('id')
      .$defaultFn(() => createId())
      .primaryKey(),
    code: integer('code').generatedAlwaysAsIdentity().notNull().unique(),
    clientId: text('client_id').references(() => clients.id),
    createdById: text('created_by_id')
      .notNull()
      .references(() => users.id),
    canceledById: text('canceled_by_id').references(() => users.id),
    status: exchangeStatusEnum('status').default('DONE').notNull(),
    total: integer('total').notNull(), // in cents, value exchanged on each side
    notes: text('notes'),
    canceledAt: timestamp('canceled_at'),
    ...timestamps,
  },
  (table) => [index('exchanges_client_id_idx').on(table.clientId)],
)

export const exchangeItems = pgTable(
  'exchange_items',
  {
    id: text('id')
      .$defaultFn(() => createId())
      .primaryKey(),
    exchangeId: text('exchange_id')
      .notNull()
      .references(() => exchanges.id, { onDelete: 'cascade' }),
    chipId: text('chip_id')
      .notNull()
      .references(() => chips.id),
    direction: exchangeDirectionEnum('direction').notNull(),
    quantity: integer('quantity').notNull(),
    unitPrice: integer('unit_price').notNull(), // in cents
    total: integer('total').notNull(), // in cents
  },
  (table) => [index('exchange_items_exchange_id_idx').on(table.exchangeId)],
)
