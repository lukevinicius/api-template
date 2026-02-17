import axios from 'axios'
import { and, eq, ne } from 'drizzle-orm'
import { AppError } from '@/domain/errors/AppError'
import { db } from '@/infra/db/connection'
import { schema } from '@/infra/db/schema'

interface IRequest {
  providerTransactionId: string
  status: string
}

interface IResponse {
  providerTransactionId: string
  status: string
}

export class UpdateTransactionService {
  async execute({ providerTransactionId, status }: IRequest): Promise<IResponse> {
    const [transaction] = await db
      .update(schema.transactions)
      .set({ status })
      .where(
        and(
          eq(schema.transactions.providerTransactionId, providerTransactionId),
          ne(schema.transactions.status, status),
        ),
      )
      .returning({
        providerTransactionId: schema.transactions.providerTransactionId,
        status: schema.transactions.status,
        webhookUrl: schema.transactions.webhookUrl,
      })

    if (!transaction || !transaction.webhookUrl || !transaction.providerTransactionId) {
      throw new AppError('Transaction not found', 404)
    }

    await axios.post(transaction.webhookUrl, {
      providerTransactionId: transaction.providerTransactionId,
      status: transaction.status,
    })

    return {
      providerTransactionId: transaction.providerTransactionId,
      status: transaction.status,
    }
  }
}
