import { createId } from '@paralleldrive/cuid2'
import { sql } from 'drizzle-orm'
import { integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { timestamps } from '../../config/constants'

// Ficha: each value has its own stock in the cashier
export const chips = pgTable(
  'chips',
  {
    id: text('id')
      .$defaultFn(() => createId())
      .primaryKey(),
    price: integer('price').notNull(), // value of one chip, in cents
    quantity: integer('quantity').notNull(), // chips available in the cashier
    imageUrl: text('image_url'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('chips_price_unique')
      .on(table.price)
      .where(sql`${table.deletedAt} is null`),
  ],
)
