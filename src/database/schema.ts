import { auditLogs } from '../modules/audits/audits.schema'
import { refreshTokens } from '../modules/auth/auth.schema'
import { chips } from '../modules/chips/chips.schema'
import { clients } from '../modules/clients/clients.schema'
import { exchangeItems, exchanges } from '../modules/exchanges/exchanges.schema'
import {
  orderChipReturns,
  orderItems,
  orderPayments,
  orders,
} from '../modules/orders/orders.schema'
import { settings } from '../modules/settings/settings.schema'
import { users } from '../modules/users/users.schema'

export * from '../modules/audits/audits.schema'
export * from '../modules/auth/auth.schema'
export * from '../modules/chips/chips.schema'
export * from '../modules/clients/clients.schema'
export * from '../modules/exchanges/exchanges.schema'
export * from '../modules/orders/orders.schema'
export * from '../modules/settings/settings.schema'
export * from '../modules/users/users.schema'

export const schema = {
  users,
  refreshTokens,
  settings,
  clients,
  chips,
  orders,
  orderItems,
  orderPayments,
  orderChipReturns,
  exchanges,
  exchangeItems,
  auditLogs,
}
