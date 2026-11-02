import type {
  exchangeDirectionEnum,
  exchangeStatusEnum,
} from './exchanges.schema'

export type ExchangeStatus = (typeof exchangeStatusEnum.enumValues)[number]
export type ExchangeDirection =
  (typeof exchangeDirectionEnum.enumValues)[number]

export interface ExchangeItemPayload {
  chipId: string
  direction: ExchangeDirection
  quantity: number
}

export interface ExchangePayload {
  clientId?: string | null
  notes?: string | null
  items: ExchangeItemPayload[]
}

export interface ExchangeFilters {
  status?: ExchangeStatus
  search?: string // client name
  page?: number
  pageSize?: number
}

export interface ExchangeItemDetails {
  id: string
  chipId: string
  chipImageUrl: string | null
  direction: ExchangeDirection
  quantity: number
  unitPrice: number
  total: number
}

export interface Exchange {
  id: string
  code: number
  status: ExchangeStatus
  clientId: string | null
  clientName: string | null
  total: number
  notes: string | null
  createdByName: string
  canceledAt: Date | null
  createdAt: Date
  updatedAt: Date
  items: ExchangeItemDetails[]
}
