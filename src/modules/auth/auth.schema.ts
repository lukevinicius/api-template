import { createId } from '@paralleldrive/cuid2'
import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from '../users/users.schema'

// Refresh tokens are opaque random strings. Only their SHA-256 hash is stored,
// so a database leak does not expose usable tokens.
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: text('id')
      .$defaultFn(() => createId())
      .primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    // Every token issued by rotation keeps the family of the original login,
    // which allows revoking the whole chain when token reuse is detected.
    familyId: text('family_id').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    replacedById: text('replaced_by_id'),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('refresh_tokens_user_id_idx').on(table.userId),
    index('refresh_tokens_family_id_idx').on(table.familyId),
  ],
)
