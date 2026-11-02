import { createId } from '@paralleldrive/cuid2'
import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { timestamps } from '../../config/constants'

export const pixKeyTypeEnum = pgEnum('pix_key_type', [
  'CPF',
  'CNPJ',
  'EMAIL',
  'PHONE',
  'RANDOM',
])

export const clients = pgTable(
  'clients',
  {
    id: text('id')
      .$defaultFn(() => createId())
      .primaryKey(),
    name: text('name').notNull(),
    document: text('document'),
    phone: text('phone'),
    pixKey: text('pix_key'),
    pixKeyType: pixKeyTypeEnum('pix_key_type'),
    // Max value in chips the client can owe at the same time, in cents.
    // Copied from the settings when the client is created.
    chipLimit: integer('chip_limit').notNull(),
    ...timestamps,
  },
  (table) => [
    index('clients_name_idx').on(table.name),
    uniqueIndex('clients_document_unique')
      .on(table.document)
      .where(sql`${table.deletedAt} is null and ${table.document} is not null`),
  ],
)
