import {
  TransactionRoles,
  TransactionStatus,
  TransactionTypes,
} from '@/domain/enums/transaction'
import { AppError } from '@/domain/errors/AppError'
import { db } from '@/infra/db/connection'
import { schema } from '@/infra/db/schema'

interface IRequest {
  transactionId: string
  amount: number
  document: string
  name: string
  email?: string
  phone?: string
  publicKey: string
  secretKey: string
  webhookUrl: string
}

export interface IResponse {
  providerTransactionId: string
  qrCode: string
  copyAndPaste: string
}

export class CreatePixCashInService {
  async execute({
    transactionId,
    amount,
    document,
    name,
    email,
    phone,
    publicKey,
    secretKey,
    webhookUrl,
  }: IRequest): Promise<void> {
    const payload = {
      transactionId,
      amount,
      document,
      name,
      email,
      phone,
      publicKey,
      secretKey,
    }

    console.log('CreatePixCashInService payload:', payload)

    const [transaction] = await db
      .insert(schema.transactions)
      .values({
        role: TransactionRoles.CASH_IN,
        type: TransactionTypes.PIX,
        status: TransactionStatus.PENDING,
        providerTransactionId: "pixCashInData.providerTransactionId",
        amount,
        webhookUrl,
      })
      .returning()

    if (!transaction) {
      throw new AppError(
        'Failed to create cash-in transaction in database',
        500,
      )
    }
  }
}
