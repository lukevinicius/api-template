import type {
  CashMovement,
  MovementTotals,
  OrderMovementSummary,
} from './cash-closings.types'

export interface OrderInfo {
  code: number
  clientName: string
}

/**
 * Totals of the movements of a cash closing period.
 *
 * Sales are on credit (fiado): a chip sold today may be paid days later. To
 * tell them apart, the payments of each order pay its oldest debt first:
 * 1. What the order owed before the period (`previousDebts`) is paid first:
 *    it is fiado from previous periods received now
 * 2. The rest pays the sales of the period
 * 3. Sales of the period left unpaid are the new fiado (`sales.onCredit`)
 */
export function summarizeMovements(
  movements: CashMovement[],
  previousDebts: Map<string, number>,
  ordersInfo: Map<string, OrderInfo>,
): { totals: MovementTotals; orders: OrderMovementSummary[] } {
  const byOrder = new Map<
    string,
    { sales: number; received: number; payouts: number; fee: number }
  >()
  const totals: MovementTotals = {
    movementsCount: movements.length,
    startedAt: null,
    endedAt: null,
    sales: { total: 0, paid: 0, onCredit: 0 },
    previousCreditReceived: 0,
    received: { cash: 0, pix: 0, chips: 0, total: 0 },
    chipsReturned: 0,
    fee: 0,
    payouts: { cash: 0, pix: 0, total: 0 },
  }

  for (const movement of movements) {
    if (!totals.startedAt || movement.createdAt < totals.startedAt) {
      totals.startedAt = movement.createdAt
    }
    if (!totals.endedAt || movement.createdAt > totals.endedAt) {
      totals.endedAt = movement.createdAt
    }

    const order = byOrder.get(movement.orderId) ?? {
      sales: 0,
      received: 0,
      payouts: 0,
      fee: 0,
    }
    byOrder.set(movement.orderId, order)

    switch (movement.type) {
      case 'SALE':
        order.sales += movement.amount
        totals.sales.total += movement.amount
        break
      case 'PAYMENT':
        order.received += movement.amount
        totals.received.total += movement.amount
        if (movement.method === 'CASH') totals.received.cash += movement.amount
        if (movement.method === 'PIX') totals.received.pix += movement.amount
        if (movement.method === 'CHIPS')
          totals.received.chips += movement.amount
        break
      case 'CHIP_RETURN':
        totals.chipsReturned += movement.amount
        break
      case 'FEE':
        order.fee += movement.amount
        totals.fee += movement.amount
        break
      case 'PAYOUT':
        order.payouts += movement.amount
        totals.payouts.total += movement.amount
        if (movement.method === 'CASH') totals.payouts.cash += movement.amount
        if (movement.method === 'PIX') totals.payouts.pix += movement.amount
        break
    }
  }

  const orders: OrderMovementSummary[] = []

  for (const [orderId, order] of byOrder) {
    const previousDebt = Math.max(previousDebts.get(orderId) ?? 0, 0)
    const fromPrevious = Math.min(order.received, previousDebt)

    totals.previousCreditReceived += fromPrevious
    totals.sales.paid += order.received - fromPrevious

    const info = ordersInfo.get(orderId)
    orders.push({
      orderId,
      code: info?.code ?? 0,
      clientName: info?.clientName ?? '',
      previousDebt,
      ...order,
    })
  }

  totals.sales.onCredit = totals.sales.total - totals.sales.paid
  orders.sort((a, b) => a.code - b.code)

  return { totals, orders }
}
