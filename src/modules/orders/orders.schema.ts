import { createId } from '@paralleldrive/cuid2'
import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { timestamps } from '@/config/constants'
import { chips } from '../chips/chips.schema'
import { clients } from '../clients/clients.schema'
import { users } from '../users/users.schema'

export const orderStatusEnum = pgEnum('order_status', [
  'OPEN',
  'CLOSED',
  'CANCELED',
])

// CHIPS: debt settled with the chips returned by the client
export const paymentMethodEnum = pgEnum('payment_method', [
  'CASH',
  'PIX',
  'CHIPS',
])

// How the cashier pays the client back (repasse)
export const payoutMethodEnum = pgEnum('payout_method', ['CASH', 'PIX'])

// Comanda
export const orders = pgTable(
  'orders',
  {
    id: text('id')
      .$defaultFn(() => createId())
      .primaryKey(),
    code: integer('code').generatedAlwaysAsIdentity().notNull().unique(), // número da comanda
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    openedById: text('opened_by_id')
      .notNull()
      .references(() => users.id),
    closedById: text('closed_by_id').references(() => users.id),
    status: orderStatusEnum('status').default('OPEN').notNull(),
    total: integer('total').default(0).notNull(), // in cents, chips sold (total a pagar)
    paidAmount: integer('paid_amount').default(0).notNull(), // in cents, sum of payments
    returnedAmount: integer('returned_amount').default(0).notNull(), // in cents, chips given back on closing
    feeRate: integer('fee_rate'), // basis points applied on closing
    feeAmount: integer('fee_amount').default(0).notNull(), // in cents, operation fee on the returned chips
    payoutAmount: integer('payout_amount').default(0).notNull(), // in cents, total repassado
    payoutMethod: payoutMethodEnum('payout_method'),
    notes: text('notes'),
    closedAt: timestamp('closed_at'),
    ...timestamps,
  },
  (table) => [
    index('orders_status_idx').on(table.status),
    index('orders_client_id_idx').on(table.clientId),
    // A client has a single open order at a time
    uniqueIndex('orders_client_open_unique')
      .on(table.clientId)
      .where(sql`${table.status} = 'OPEN' and ${table.deletedAt} is null`),
  ],
)

// Fichas vendidas na comanda (on credit, they become the client's debt)
export const orderItems = pgTable(
  'order_items',
  {
    id: text('id')
      .$defaultFn(() => createId())
      .primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    chipId: text('chip_id')
      .notNull()
      .references(() => chips.id),
    addedById: text('added_by_id')
      .notNull()
      .references(() => users.id),
    quantity: integer('quantity').notNull(),
    unitPrice: integer('unit_price').notNull(), // in cents, snapshot of the chip value
    total: integer('total').notNull(), // in cents, quantity * unitPrice
    ...timestamps,
  },
  (table) => [
    index('order_items_order_id_idx').on(table.orderId),
    index('order_items_chip_id_idx').on(table.chipId),
  ],
)

// Pagamentos da comanda (adiantamentos, fichas devolvidas e fechamento)
export const orderPayments = pgTable(
  'order_payments',
  {
    id: text('id')
      .$defaultFn(() => createId())
      .primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    receivedById: text('received_by_id')
      .notNull()
      .references(() => users.id),
    method: paymentMethodEnum('method').notNull(),
    amount: integer('amount').notNull(), // in cents, amount applied to the debt
    receivedAmount: integer('received_amount').notNull(), // in cents, amount handed by the client
    changeAmount: integer('change_amount').default(0).notNull(), // in cents, troco
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('order_payments_order_id_idx').on(table.orderId)],
)

// Fichas devolvidas pelo cliente no fechamento
export const orderChipReturns = pgTable(
  'order_chip_returns',
  {
    id: text('id')
      .$defaultFn(() => createId())
      .primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    chipId: text('chip_id')
      .notNull()
      .references(() => chips.id),
    receivedById: text('received_by_id')
      .notNull()
      .references(() => users.id),
    quantity: integer('quantity').notNull(),
    unitPrice: integer('unit_price').notNull(), // in cents
    total: integer('total').notNull(), // in cents
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('order_chip_returns_order_id_idx').on(table.orderId),
    index('order_chip_returns_chip_id_idx').on(table.chipId),
  ],
)
