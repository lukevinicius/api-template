import type { pixKeyTypeEnum } from './clients.schema'

export type PixKeyType = (typeof pixKeyTypeEnum.enumValues)[number]

export interface CreateClientPayload {
  name: string
  document?: string | null
  phone?: string | null
  pixKey?: string | null
  pixKeyType?: PixKeyType | null
}

export interface UpdateClientPayload extends Partial<CreateClientPayload> {
  chipLimit?: number // in cents, admins only
}

export interface Client {
  id: string
  name: string
  document: string | null
  phone: string | null
  pixKey: string | null
  pixKeyType: PixKeyType | null
  chipLimit: number // in cents
  createdAt: Date
  updatedAt: Date
}

export interface ClientWithSummary extends Client {
  openOrders: number
  openAmount: number // in cents, chips owed in open orders
  availableLimit: number // in cents, chipLimit - openAmount
}

export interface ClientReport {
  totalSold: number // in cents, chips sold
  totalPaid: number // in cents, includes advances and chips returned
  totalOpen: number // in cents
  totalPayout: number // in cents, paid back to the client
  ordersCount: number
  openOrdersCount: number
}
