import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/config/database'
import { schema } from '@/database/schema'

const { refreshTokens } = schema

export const authModel = {
  create: async (payload: typeof refreshTokens.$inferInsert) => {
    const [token] = await db.insert(refreshTokens).values(payload).returning()

    return token
  },
  getByHash: async (tokenHash: string) => {
    const [token] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))

    return token ?? null
  },
  /**
   * Marks the token as rotated only if it is still active. Returns false when
   * another request already rotated it (race between concurrent refreshes).
   */
  markReplaced: async (tokenId: string, replacedById: string) => {
    const result = await db
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedById })
      .where(
        and(eq(refreshTokens.id, tokenId), isNull(refreshTokens.revokedAt)),
      )
      .returning({ id: refreshTokens.id })

    return result.length > 0
  },
  revoke: async (tokenId: string) => {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(refreshTokens.id, tokenId), isNull(refreshTokens.revokedAt)),
      )
  },
  revokeFamily: async (familyId: string) => {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.familyId, familyId),
          isNull(refreshTokens.revokedAt),
        ),
      )
  },
  revokeAllForUser: async (userId: string) => {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)),
      )
  },
  deleteById: async (tokenId: string) => {
    await db.delete(refreshTokens).where(eq(refreshTokens.id, tokenId))
  },
}
