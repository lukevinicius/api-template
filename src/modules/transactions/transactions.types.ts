import type { statusEnum, typesEnum } from "@/modules/transactions/transactions.schema"

export type TransactionStatusEnum = (typeof statusEnum.enumValues)[number]

export enum TransactionStatus {
  PENDING = 'pending',
  LOST = 'lost',
  REFUNDED = 'refunded',
  WON = 'won',
  PAID = 'paid',
  CASH_OUT = 'cash_out',
  COMPLETED = 'completed',
}

export type TransactionsTypesEnum = (typeof typesEnum.enumValues)[number]

export enum TransactionsTypes {
  BET_WIN = 'BET_WIN',
  WIN = 'WIN',
  BET = 'BET',
  REFUND = 'REFUND',
  END_ROUND = 'END_ROUND',
}

export interface CreateTransactionPayload {
  tenantId: string
  userId: string
  externalId: string
  gameCode: string
  roundId: string
  type: TransactionsTypesEnum
  status: TransactionStatusEnum
  betAmount: number
  winAmount: number
  beforeBalance: number
  afterBalance: number
}

export interface CreateTransactionModel {
  tenantId: string
  userId: string
  externalId: string
  gameCode: string
  roundId: string
  beforeBalance: number
  afterBalance: number
  type: TransactionsTypesEnum
  status: TransactionStatusEnum
  betAmount: number
  winAmount: number
}

export interface Transaction {
  id: string
  tenantId: string
  userId: string
  externalId: string
  gameCode: string
  roundId: string
  type: TransactionsTypesEnum
  status: TransactionStatusEnum
  betAmount: number
  winAmount: number
  beforeBalance: number
  afterBalance: number
}
