import { env } from '@/config/env'
import { transactionsModel } from './transactions.model'
import type { CreateTransactionPayload, Transaction } from './transactions.types'

export const transactionsService = {
  create: async (payload: CreateTransactionPayload) => {
    const transaction = await transactionsModel.create(payload)

    return transaction
  },
  get: async (query: Partial<Transaction>,) => {
    const transaction = await transactionsModel.getByExternalId(query)

    return transaction
  },
  update: async (
    query: Partial<Transaction>,
    payload: Partial<CreateTransactionPayload>,
  ) => {
    const transaction = await transactionsModel.update(query, payload)

    return transaction
  },
  deleteAll: async () => {
    if (env.NODE_ENV !== 'test') return

    await transactionsModel.deleteAll()
  }
}
