import type { PixKeyType } from '../clients/clients.types'
import type {
  orderStatusEnum,
  paymentMethodEnum,
  payoutMethodEnum,
} from './orders.schema'
import type { Settlement } from './orders.settlement'

export type OrderStatus = (typeof orderStatusEnum.enumValues)[number]
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number]
export type PayoutMethod = (typeof payoutMethodEnum.enumValues)[number]
// Payments the client makes with money (advances and the rest of the debt)
export type MoneyMethod = Exclude<PaymentMethod, 'CHIPS'>

export interface OrderFilters {
  status?: OrderStatus
  clientId?: string
  search?: string // client name
  page?: number
  pageSize?: number
}

export interface CreateOrderPayload {
  clientId: string
  notes?: string | null
}

/** alreadyOpen: the client had an open order, which is returned instead. */
export type CreateOrderResult = OrderDetails & { alreadyOpen: boolean }

export interface UpdateOrderPayload {
  clientId?: string
  notes?: string | null
}

export interface AddItemPayload {
  chipId: string
  quantity: number
}

/**
 * One part of a payment. The client may pay with more than one method (part
 * in PIX, part in cash): each part is saved as a payment.
 */
export interface PaymentPart {
  method: MoneyMethod
  amount: number // in cents, amount applied to the order
  receivedAmount?: number // in cents, cash handed by the client (troco)
}

/** One part of a repasse to the client (part in PIX, part in cash). */
export interface PayoutPart {
  method: PayoutMethod
  amount: number // in cents
}

// Advance payment (adiantamento)
export interface PaymentPayload {
  payments: PaymentPart[]
}

export interface ClosePayload {
  returnedChips?: { chipId: string; quantity: number }[]
  // Optional: what is left can be paid now (in full or in part) or later
  payments?: PaymentPart[] // when the client still owes after the chips
  payouts?: PayoutPart[] // when the house owes the client a repasse
}

/**
 * Settlement (acerto) of an order awaiting it: `payments` when the client
 * still owes, `payouts` when the house owes the repasse.
 */
export interface SettlePayload {
  payments?: PaymentPart[]
  payouts?: PayoutPart[]
}

export interface OrderSummary {
  id: string
  code: number
  status: OrderStatus
  clientId: string
  clientName: string
  total: number
  paidAmount: number
  openAmount: number
  returnedAmount: number
  feeRate: number | null
  feeAmount: number
  payoutAmount: number
  paidOutAmount: number
  pendingPayout: number // payoutAmount - paidOutAmount
  payoutMethod: PayoutMethod | null
  chipsCount: number
  notes: string | null
  createdAt: Date
  closedAt: Date | null
  settledAt: Date | null
}

export interface OrderItemDetails {
  id: string
  chipId: string
  chipImageUrl: string | null
  quantity: number
  unitPrice: number
  total: number
  addedByName: string
  createdAt: Date
}

export interface OrderPaymentDetails {
  id: string
  method: PaymentMethod
  amount: number
  receivedAmount: number
  changeAmount: number
  receivedByName: string
  createdAt: Date
}

export interface OrderPayoutDetails {
  id: string
  method: PayoutMethod
  amount: number
  pixKey: string | null
  paidByName: string
  createdAt: Date
}

export interface OrderChipReturnDetails {
  id: string
  chipId: string
  chipImageUrl: string | null
  quantity: number
  unitPrice: number
  total: number
  receivedByName: string
  createdAt: Date
}

export interface OrderDetails extends OrderSummary {
  client: {
    id: string
    name: string
    document: string | null
    phone: string | null
    pixKey: string | null
    pixKeyType: PixKeyType | null
    chipLimit: number
  }
  openedBy: { id: string; name: string }
  closedBy: { id: string; name: string } | null
  items: OrderItemDetails[]
  payments: OrderPaymentDetails[]
  returns: OrderChipReturnDetails[]
  payouts: OrderPayoutDetails[]
}

export interface PaymentResult {
  order: OrderDetails
  changeAmount: number // troco to give back, in cents
}

export interface CloseResult extends PaymentResult {
  settlement: Settlement
}
