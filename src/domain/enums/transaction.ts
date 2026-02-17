export type PixKeyTypes = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP'

import type { rolesEnum, typesEnum } from "@/infra/db/schema"

type Roles = (typeof rolesEnum.enumValues)[number]

export const TransactionRoles: Record<string, Roles> = {
  CASH_IN: 'CASH_IN',
  CASH_OUT: 'CASH_OUT',
}

type Types = (typeof typesEnum.enumValues)[number]

export const TransactionTypes: Record<string, Types> = {
  PIX: 'PIX',
}

export const TransactionStatus = {
  PENDING: 'pending',
  PAID: 'paid',
  CANCELED: 'canceled',
  DENIED: 'denied',
  REFUND: 'REFUND',
  EXPIRED: 'expired',
  IN_PROGRESS: 'IN_PROGRESS',
  IN_ANALYSIS: 'IN_ANALYSIS',
}
