import { describe, expect, it } from 'bun:test'
import { calculateSettlement } from './orders.settlement'

const K = 1000 * 100 // 1K in cents
const FEE_10 = 1000 // 10% in basis points

describe('calculateSettlement', () => {
  it('discounts the fee and the open debt from the returned chips', () => {
    // Client takes 25K in chips and comes back with 100K
    const result = calculateSettlement({
      total: 25 * K,
      paidAmount: 0,
      returnedAmount: 100 * K,
      feeRate: FEE_10,
    })

    expect(result.feeAmount).toBe(10 * K)
    expect(result.netReturned).toBe(90 * K)
    expect(result.chipsApplied).toBe(25 * K)
    expect(result.remainingDebt).toBe(0)
    expect(result.payoutAmount).toBe(65 * K)
  })

  it('pays back the net value when the client bought no chips', () => {
    const result = calculateSettlement({
      total: 0,
      paidAmount: 0,
      returnedAmount: 100 * K,
      feeRate: FEE_10,
    })

    expect(result.feeAmount).toBe(10 * K)
    expect(result.chipsApplied).toBe(0)
    expect(result.payoutAmount).toBe(90 * K)
  })

  it('considers the advance payments', () => {
    // 25K in chips, 10K paid in advance: 15K still open
    const result = calculateSettlement({
      total: 25 * K,
      paidAmount: 10 * K,
      returnedAmount: 100 * K,
      feeRate: FEE_10,
    })

    expect(result.debt).toBe(15 * K)
    expect(result.chipsApplied).toBe(15 * K)
    expect(result.payoutAmount).toBe(75 * K)
  })

  it('keeps the rest of the debt open when the chips do not cover it', () => {
    const result = calculateSettlement({
      total: 25 * K,
      paidAmount: 0,
      returnedAmount: 10 * K,
      feeRate: FEE_10,
    })

    expect(result.chipsApplied).toBe(9 * K)
    expect(result.remainingDebt).toBe(16 * K)
    expect(result.payoutAmount).toBe(0)
  })

  it('charges nothing when no chips are returned', () => {
    const result = calculateSettlement({
      total: 25 * K,
      paidAmount: 5 * K,
      returnedAmount: 0,
      feeRate: FEE_10,
    })

    expect(result.feeAmount).toBe(0)
    expect(result.remainingDebt).toBe(20 * K)
    expect(result.payoutAmount).toBe(0)
  })
})
