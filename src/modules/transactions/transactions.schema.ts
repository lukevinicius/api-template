import { createId } from '@paralleldrive/cuid2'
import { integer, pgEnum, pgTable, text } from 'drizzle-orm/pg-core'
import { timestamps } from '../../config/constants'

export const statusEnum = pgEnum('transaction_status', [
  'pending',
  'lost',
  'refunded',
  'won',
  'paid',
  'cash_out',
  'completed',
])

export const typesEnum = pgEnum('transaction_types', [
  'BET',
  'WIN',
  'BET_WIN',
  'REFUND',
  'END_ROUND',
])

export const transactions = pgTable('transactions', {
  id: text('id')
    .$defaultFn(() => createId())
    .primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  externalId: text('external_id').unique().notNull(),
  gameCode: text('game_code').notNull(),
  roundId: text('round_id').notNull(),
  beforeBalance: integer('before_balance').notNull(),
  afterBalance: integer('after_balance').notNull(),
  type: typesEnum('type').notNull(),
  betAmount: integer('bet_amount').notNull(),
  winAmount: integer('win_amount').notNull(),
  status: statusEnum('status').default('pending').notNull(),
  ...timestamps,
})
