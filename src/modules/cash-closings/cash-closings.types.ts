import type { OrderStatus, PaymentMethod } from '../orders/orders.types'
import type { cashMovementTypeEnum } from './cash-closings.schema'

export type CashMovementType = (typeof cashMovementTypeEnum.enumValues)[number]

export interface CashMovementPayload {
  type: CashMovementType
  amount: number // in cents
  method?: PaymentMethod | null
  orderId: string
  userId: string
}

export interface CashMovement {
  id: string
  type: CashMovementType
  method: PaymentMethod | null
  amount: number
  orderId: string
  createdAt: Date
}

export interface CreateCashClosingPayload {
  countedCash: number // in cents, cash counted in the drawer
  openingCash?: number // in cents, fundo de troco at the start of the period
  notes?: string | null
}

/** An order with money pending at the moment of the closing. */
export interface PendingOrder {
  orderId: string
  code: number
  status: OrderStatus
  clientId: string
  clientName: string
  amount: number // in cents
  createdAt: Date
  closedAt: Date | null
}

export interface PendingBalance {
  total: number
  count: number
  orders: PendingOrder[]
}

/** Balances stored with the closing, so it can be reviewed later. */
export interface CashClosingSnapshot {
  receivables: PendingBalance
  pendingPayouts: PendingBalance
  orders: OrderMovementSummary[]
}

/** What happened to one order in the period. */
export interface OrderMovementSummary {
  orderId: string
  code: number
  clientName: string
  previousDebt: number // what the order owed before the period
  sales: number
  received: number // CASH + PIX + CHIPS
  payouts: number
  fee: number
}

/** Totals of the movements of a period (see cash-closings.summary.ts). */
export interface MovementTotals {
  movementsCount: number
  startedAt: Date | null
  endedAt: Date | null
  sales: { total: number; paid: number; onCredit: number }
  previousCreditReceived: number
  received: { cash: number; pix: number; chips: number; total: number }
  chipsReturned: number
  fee: number
  payouts: { cash: number; pix: number; total: number }
}

export interface CashClosingReport extends MovementTotals {
  receivables: PendingBalance & { open: number; awaitingSettlement: number }
  pendingPayouts: PendingBalance
  cash: {
    opening: number
    received: number
    paidOut: number
    expected: number
    counted: number | null
    difference: number | null
  }
  pix: { received: number; paidOut: number; net: number }
  orders: OrderMovementSummary[]
}

export interface CashClosing extends CashClosingReport {
  id: string
  code: number
  closedBy: { id: string; name: string }
  notes: string | null
  createdAt: Date
}

export interface CashClosingFilters {
  page: number
  pageSize: number
}
