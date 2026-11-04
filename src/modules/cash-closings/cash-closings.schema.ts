import { createId } from '@paralleldrive/cuid2'
import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { orders, paymentMethodEnum } from '../orders/orders.schema'
import { users } from '../users/users.schema'
import type { CashClosingSnapshot } from './cash-closings.types'

/**
 * SALE: chips sold on credit (negative on corrections and cancellations)
 * PAYMENT: what the client paid against the debt (CASH, PIX or CHIPS)
 * CHIP_RETURN: gross value of the chips the client gave back
 * FEE: operation fee charged on the returned chips
 * PAYOUT: repasse paid to the client (CASH or PIX)
 */
export const cashMovementTypeEnum = pgEnum('cash_movement_type', [
  'SALE',
  'PAYMENT',
  'CHIP_RETURN',
  'FEE',
  'PAYOUT',
])

// Fechamento de caixa: closes every movement not closed yet
export const cashClosings = pgTable('cash_closings', {
  id: text('id')
    .$defaultFn(() => createId())
    .primaryKey(),
  code: integer('code').generatedAlwaysAsIdentity().notNull().unique(),
  closedById: text('closed_by_id')
    .notNull()
    .references(() => users.id),
  startedAt: timestamp('started_at'), // first movement of the period
  endedAt: timestamp('ended_at').notNull(),
  movementsCount: integer('movements_count').notNull(),
  // All in cents
  salesAmount: integer('sales_amount').notNull(), // chips sold in the period
  salesPaidAmount: integer('sales_paid_amount').notNull(), // part of them paid in the period
  salesOnCreditAmount: integer('sales_on_credit_amount').notNull(), // vendido fiado no período
  previousCreditReceivedAmount: integer(
    'previous_credit_received_amount',
  ).notNull(), // fiado de períodos anteriores recebido agora
  receivedCash: integer('received_cash').notNull(),
  receivedPix: integer('received_pix').notNull(),
  receivedChips: integer('received_chips').notNull(), // debt paid with returned chips
  chipsReturnedAmount: integer('chips_returned_amount').notNull(),
  feeAmount: integer('fee_amount').notNull(),
  payoutCash: integer('payout_cash').notNull(),
  payoutPix: integer('payout_pix').notNull(),
  // Balances at the moment of the closing
  receivablesAmount: integer('receivables_amount').notNull(), // fiado a receber
  receivablesCount: integer('receivables_count').notNull(),
  pendingPayoutsAmount: integer('pending_payouts_amount').notNull(), // repasses a pagar
  pendingPayoutsCount: integer('pending_payouts_count').notNull(),
  // Cash drawer
  openingCash: integer('opening_cash').notNull(), // fundo de troco
  expectedCash: integer('expected_cash').notNull(),
  countedCash: integer('counted_cash').notNull(),
  cashDifference: integer('cash_difference').notNull(), // counted - expected
  snapshot: jsonb('snapshot').$type<CashClosingSnapshot>().notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// Financial ledger of the orders, closed by the cash closings
export const cashMovements = pgTable(
  'cash_movements',
  {
    id: text('id')
      .$defaultFn(() => createId())
      .primaryKey(),
    type: cashMovementTypeEnum('type').notNull(),
    method: paymentMethodEnum('method'), // PAYMENT and PAYOUT only
    amount: integer('amount').notNull(), // in cents
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    userId: text('user_id').references(() => users.id),
    cashClosingId: text('cash_closing_id').references(() => cashClosings.id),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    index('cash_movements_cash_closing_id_idx').on(table.cashClosingId),
    index('cash_movements_order_id_idx').on(table.orderId),
    index('cash_movements_open_idx')
      .on(table.createdAt)
      .where(sql`${table.cashClosingId} is null`),
  ],
)
