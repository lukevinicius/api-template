import {
  type PixKeyTypes,
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
  name: string
  document: string
  email: string
  phone: string
  publicKey: string
  secretKey: string
  webhookUrl: string
  pixKey: string
  pixKeyType: PixKeyTypes
}

export interface IResponse {
  providerTransactionId: string
}

export class CreatePixCashOutService {
  async execute({
    transactionId,
    amount,
    name,
    document,
    email,
    phone,
    publicKey,
    secretKey,
    webhookUrl,
    pixKey,
    pixKeyType,
  }: IRequest): Promise<void> {
    const payload = {
      transactionId,
      amount,
      name,
      document,
      email,
      phone,
      publicKey,
      secretKey,
      pixKey,
      pixKeyType,
    }

    console.log('CreatePixCashOutService payload:', payload)

    await db
      .insert(schema.transactions)
      .values({
        role: TransactionRoles.CASH_OUT,
        amount,
        status: TransactionStatus.PENDING,
        type: TransactionTypes.PIX,
        webhookUrl,
        externalId: transactionId,
        providerTransactionId: "pixCashOutData.providerTransactionId",
      })
  }
}
