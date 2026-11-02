import { createId } from '@paralleldrive/cuid2'
import { pgEnum, pgTable, text } from 'drizzle-orm/pg-core'
import { timestamps } from '@/config/constants'

export const userRoleEnum = pgEnum('user_role', ['ADMIN', 'SELLER'])

export const users = pgTable('users', {
  id: text('id')
    .$defaultFn(() => createId())
    .primaryKey(),
  name: text('name').notNull(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  role: userRoleEnum('role').default('SELLER').notNull(),
  ...timestamps,
})
