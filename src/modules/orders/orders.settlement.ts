export interface SettlementInput {
  total: number // chips sold, in cents
  paidAmount: number // advances already paid, in cents
  returnedAmount: number // chips the client gives back, in cents
  feeRate: number // basis points, 1000 = 10%
}

export interface Settlement {
  feeAmount: number // operation fee on the returned chips
  netReturned: number // returned chips minus the fee
  debt: number // what the client still owed before returning the chips
  chipsApplied: number // part of the net returned value that pays the debt
  remainingDebt: number // still owed after the chips: paid in PIX or cash
  payoutAmount: number // repasse: what the cashier pays back to the client
}

/**
 * Closing math of an order:
 * 1. The fee is charged on the returned chips (100K - 10% = 90K)
 * 2. The net value pays the open debt first (90K - 25K)
 * 3. What is left is paid back to the client (65K)
 * When the net value does not cover the debt, the rest must be paid.
 */
export function calculateSettlement({
  total,
  paidAmount,
  returnedAmount,
  feeRate,
}: SettlementInput): Settlement {
  const feeAmount = Math.round((returnedAmount * feeRate) / 10_000)
  const netReturned = returnedAmount - feeAmount
  const debt = Math.max(total - paidAmount, 0)
  const chipsApplied = Math.min(netReturned, debt)

  return {
    feeAmount,
    netReturned,
    debt,
    chipsApplied,
    remainingDebt: debt - chipsApplied,
    payoutAmount: netReturned - chipsApplied,
  }
}
