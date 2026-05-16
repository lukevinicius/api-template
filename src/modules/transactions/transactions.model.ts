import { and, eq } from 'drizzle-orm'
import { db } from '@/config/database'
import { schema } from '@/database/schema'
import type {
  CreateTransactionModel,
  Transaction,
} from './transactions.types'

const getQueryConditions = (query: Partial<Transaction>) => {
  return and(
    query.id ? eq(schema.transactions.id, query.id) : undefined,
    query.roundId ? eq(schema.transactions.roundId, query.roundId) : undefined,
    query.userId ? eq(schema.transactions.userId, query.userId) : undefined,
    query.externalId ? eq(schema.transactions.externalId, query.externalId) : undefined,
  )
}

export const transactionsModel = {
  create: async (payload: CreateTransactionModel) => {
    const [transaction] = await db
      .insert(schema.transactions)
      .values({
        tenantId: payload.tenantId,
        userId: payload.userId,
        externalId: payload.externalId,
        gameCode: payload.gameCode,
        roundId: payload.roundId,
        type: payload.type,
        status: payload.status,
        betAmount: payload.betAmount,
        winAmount: payload.winAmount,
        afterBalance: payload.afterBalance,
        beforeBalance: payload.beforeBalance,
      })
      .returning()

    return transaction
  },
  getByExternalId: async (query: Partial<Transaction>): Promise<Transaction> => {
    const [transaction] = await db
      .select()
      .from(schema.transactions)
      .where(getQueryConditions(query))

    return transaction
  },
  update: async (query: Partial<Transaction>, payload: Partial<Transaction>) => {
    const [transaction] = await db
      .update(schema.transactions)
      .set({ ...payload })
      .where(getQueryConditions(query))
      .returning()

    return transaction
  },
  deleteAll() {
    return db.delete(schema.transactions).execute()
  }
}
