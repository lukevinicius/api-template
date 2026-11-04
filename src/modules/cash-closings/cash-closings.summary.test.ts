import { describe, expect, it } from 'bun:test'
import { summarizeMovements } from './cash-closings.summary'
import type { CashMovement } from './cash-closings.types'

const K = 1000 * 100 // 1K in cents
let sequence = 0

function movement(
  type: CashMovement['type'],
  amount: number,
  method: CashMovement['method'] = null,
  orderId = 'order-1',
): CashMovement {
  sequence += 1
  return {
    id: `m${sequence}`,
    type,
    method,
    amount,
    orderId,
    createdAt: new Date(2026, 10, 4, 20, sequence),
  }
}

const info = new Map([
  ['order-1', { code: 1, clientName: 'Ana' }],
  ['order-2', { code: 2, clientName: 'Bruno' }],
])

describe('summarizeMovements', () => {
  it('separates the sales paid in the period from the ones on credit', () => {
    const { totals } = summarizeMovements(
      [
        movement('SALE', 50 * K),
        movement('PAYMENT', 20 * K, 'PIX'),
        movement('SALE', 30 * K, null, 'order-2'),
      ],
      new Map(),
      info,
    )

    expect(totals.sales).toEqual({
      total: 80 * K,
      paid: 20 * K,
      onCredit: 60 * K,
    })
    expect(totals.previousCreditReceived).toBe(0)
    expect(totals.received.pix).toBe(20 * K)
  })

  it('pays the debt of previous periods first', () => {
    // The order owed 25K from yesterday, sold 10K more and received 30K
    const { totals, orders } = summarizeMovements(
      [
        movement('SALE', 10 * K),
        movement('PAYMENT', 15 * K, 'CASH'),
        movement('PAYMENT', 15 * K, 'CHIPS'),
      ],
      new Map([['order-1', 25 * K]]),
      info,
    )

    expect(totals.previousCreditReceived).toBe(25 * K)
    expect(totals.sales.paid).toBe(5 * K)
    expect(totals.sales.onCredit).toBe(5 * K)
    expect(totals.received).toEqual({
      cash: 15 * K,
      pix: 0,
      chips: 15 * K,
      total: 30 * K,
    })
    expect(orders[0]?.previousDebt).toBe(25 * K)
  })

  it('totals returns, fee and payouts by method', () => {
    const { totals, orders } = summarizeMovements(
      [
        movement('CHIP_RETURN', 100 * K, null, 'order-2'),
        movement('FEE', 10 * K, null, 'order-2'),
        movement('PAYOUT', 50 * K, 'CASH', 'order-2'),
        movement('PAYOUT', 40 * K, 'PIX', 'order-2'),
      ],
      new Map(),
      info,
    )

    expect(totals.chipsReturned).toBe(100 * K)
    expect(totals.fee).toBe(10 * K)
    expect(totals.payouts).toEqual({ cash: 50 * K, pix: 40 * K, total: 90 * K })
    expect(orders).toEqual([
      {
        orderId: 'order-2',
        code: 2,
        clientName: 'Bruno',
        previousDebt: 0,
        sales: 0,
        received: 0,
        payouts: 90 * K,
        fee: 10 * K,
      },
    ])
  })

  it('counts corrections and cancellations as negative sales', () => {
    const { totals } = summarizeMovements(
      [movement('SALE', 20 * K), movement('SALE', -20 * K)],
      new Map(),
      info,
    )

    expect(totals.sales).toEqual({ total: 0, paid: 0, onCredit: 0 })
    expect(totals.movementsCount).toBe(2)
  })
})
