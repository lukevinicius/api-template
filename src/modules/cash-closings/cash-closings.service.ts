import { db, type Executor } from '@/config/database'
import { AppError } from '@/shared/utils/errors/AppError'
import { formatBRL } from '@/shared/utils/money'
import { auditsService } from '../audits/audits.service'
import type { Actor } from '../audits/audits.types'
import { cashClosingsModel } from './cash-closings.model'
import { summarizeMovements } from './cash-closings.summary'
import type {
  CashClosing,
  CashClosingFilters,
  CashClosingReport,
  CashMovement,
  CreateCashClosingPayload,
  PendingBalance,
  PendingOrder,
} from './cash-closings.types'

type StoredClosing = NonNullable<
  Awaited<ReturnType<typeof cashClosingsModel.getById>>
>['closing']

function balance(orders: PendingOrder[]): PendingBalance {
  return {
    total: orders.reduce((sum, order) => sum + order.amount, 0),
    count: orders.length,
    orders,
  }
}

/** Builds the report of a set of movements plus the current balances. */
async function buildReport(
  executor: Executor,
  movements: CashMovement[],
  cash: { opening: number; counted: number | null },
  exceptClosingId?: string,
): Promise<CashClosingReport> {
  const orderIds = [...new Set(movements.map((movement) => movement.orderId))]

  const [previousDebts, ordersInfo, receivables, pendingPayouts] =
    await Promise.all([
      cashClosingsModel.getPreviousDebts(executor, orderIds, exceptClosingId),
      cashClosingsModel.getOrdersInfo(executor, orderIds),
      cashClosingsModel.getReceivables(executor),
      cashClosingsModel.getPendingPayouts(executor),
    ])

  const { totals, orders } = summarizeMovements(
    movements,
    previousDebts,
    ordersInfo,
  )
  const expected = cash.opening + totals.received.cash - totals.payouts.cash
  const sumOf = (status: PendingOrder['status']) =>
    receivables
      .filter((order) => order.status === status)
      .reduce((sum, order) => sum + order.amount, 0)

  return {
    ...totals,
    receivables: {
      ...balance(receivables),
      open: sumOf('OPEN'),
      awaitingSettlement: sumOf('AWAITING_SETTLEMENT'),
    },
    pendingPayouts: balance(pendingPayouts),
    cash: {
      opening: cash.opening,
      received: totals.received.cash,
      paidOut: totals.payouts.cash,
      expected,
      counted: cash.counted,
      difference: cash.counted === null ? null : cash.counted - expected,
    },
    pix: {
      received: totals.received.pix,
      paidOut: totals.payouts.pix,
      net: totals.received.pix - totals.payouts.pix,
    },
    orders,
  }
}

function toCashClosing(
  closing: StoredClosing,
  closedByName: string,
): CashClosing {
  const { receivables, pendingPayouts, orders } = closing.snapshot
  const sumOf = (status: PendingOrder['status']) =>
    receivables.orders
      .filter((order) => order.status === status)
      .reduce((sum, order) => sum + order.amount, 0)

  return {
    id: closing.id,
    code: closing.code,
    closedBy: { id: closing.closedById, name: closedByName },
    notes: closing.notes,
    createdAt: closing.createdAt,
    movementsCount: closing.movementsCount,
    startedAt: closing.startedAt,
    endedAt: closing.endedAt,
    sales: {
      total: closing.salesAmount,
      paid: closing.salesPaidAmount,
      onCredit: closing.salesOnCreditAmount,
    },
    previousCreditReceived: closing.previousCreditReceivedAmount,
    received: {
      cash: closing.receivedCash,
      pix: closing.receivedPix,
      chips: closing.receivedChips,
      total: closing.receivedCash + closing.receivedPix + closing.receivedChips,
    },
    chipsReturned: closing.chipsReturnedAmount,
    fee: closing.feeAmount,
    payouts: {
      cash: closing.payoutCash,
      pix: closing.payoutPix,
      total: closing.payoutCash + closing.payoutPix,
    },
    receivables: {
      ...receivables,
      open: sumOf('OPEN'),
      awaitingSettlement: sumOf('AWAITING_SETTLEMENT'),
    },
    pendingPayouts,
    cash: {
      opening: closing.openingCash,
      received: closing.receivedCash,
      paidOut: closing.payoutCash,
      expected: closing.expectedCash,
      counted: closing.countedCash,
      difference: closing.cashDifference,
    },
    pix: {
      received: closing.receivedPix,
      paidOut: closing.payoutPix,
      net: closing.receivedPix - closing.payoutPix,
    },
    orders,
  }
}

async function getOrFail(cashClosingId: string, executor: Executor = db) {
  const found = await cashClosingsModel.getById(cashClosingId, executor)

  if (!found) {
    throw new AppError('Fechamento de caixa não encontrado', 404)
  }

  return toCashClosing(found.closing, found.closedByName)
}

export const cashClosingsService = {
  /** Preview of the open period: everything since the last closing. */
  current: async (openingCash = 0): Promise<CashClosingReport> => {
    const [movements, previous] = await Promise.all([
      cashClosingsModel.getOpenMovements(),
      cashClosingsModel.getLast(),
    ])
    const report = await buildReport(db, movements, {
      opening: openingCash,
      counted: null,
    })

    return {
      ...report,
      startedAt: previous?.endedAt ?? report.startedAt,
      endedAt: new Date(),
    }
  },
  fetch: async (filters: CashClosingFilters) => {
    return cashClosingsModel.fetch(filters)
  },
  get: async (cashClosingId: string): Promise<CashClosing> => {
    return getOrFail(cashClosingId)
  },
  /**
   * Closes the cashier: every movement since the last closing is moved to
   * this one, and the cash counted in the drawer is checked against the
   * expected (fundo de troco + cash received - cash payouts).
   */
  create: async (
    payload: CreateCashClosingPayload,
    actor: Actor,
  ): Promise<CashClosing> => {
    return db.transaction(async (tx) => {
      await cashClosingsModel.lock(tx)

      // Checked before creating it, so a refused closing does not take a code
      if (!(await cashClosingsModel.hasOpenMovements(tx))) {
        throw new AppError(
          'Nenhuma movimentação desde o último fechamento de caixa',
          400,
        )
      }

      const openingCash = payload.openingCash ?? 0
      const previous = await cashClosingsModel.getLast(tx)
      const closing = await cashClosingsModel.create(tx, {
        closedById: actor.id,
        endedAt: new Date(),
        movementsCount: 0,
        salesAmount: 0,
        salesPaidAmount: 0,
        salesOnCreditAmount: 0,
        previousCreditReceivedAmount: 0,
        receivedCash: 0,
        receivedPix: 0,
        receivedChips: 0,
        chipsReturnedAmount: 0,
        feeAmount: 0,
        payoutCash: 0,
        payoutPix: 0,
        receivablesAmount: 0,
        receivablesCount: 0,
        pendingPayoutsAmount: 0,
        pendingPayoutsCount: 0,
        openingCash,
        expectedCash: 0,
        countedCash: payload.countedCash,
        cashDifference: 0,
        snapshot: {
          receivables: { total: 0, count: 0, orders: [] },
          pendingPayouts: { total: 0, count: 0, orders: [] },
          orders: [],
        },
        notes: payload.notes?.trim() || null,
      })

      const movements = await cashClosingsModel.claimOpenMovements(
        tx,
        closing.id,
      )

      const report = await buildReport(
        tx,
        movements,
        { opening: openingCash, counted: payload.countedCash },
        closing.id,
      )
      // The period starts where the previous closing ended
      const startedAt = previous?.endedAt ?? report.startedAt

      await cashClosingsModel.update(tx, closing.id, {
        startedAt,
        movementsCount: report.movementsCount,
        salesAmount: report.sales.total,
        salesPaidAmount: report.sales.paid,
        salesOnCreditAmount: report.sales.onCredit,
        previousCreditReceivedAmount: report.previousCreditReceived,
        receivedCash: report.received.cash,
        receivedPix: report.received.pix,
        receivedChips: report.received.chips,
        chipsReturnedAmount: report.chipsReturned,
        feeAmount: report.fee,
        payoutCash: report.payouts.cash,
        payoutPix: report.payouts.pix,
        receivablesAmount: report.receivables.total,
        receivablesCount: report.receivables.count,
        pendingPayoutsAmount: report.pendingPayouts.total,
        pendingPayoutsCount: report.pendingPayouts.count,
        expectedCash: report.cash.expected,
        cashDifference: report.cash.difference ?? 0,
        snapshot: {
          receivables: {
            total: report.receivables.total,
            count: report.receivables.count,
            orders: report.receivables.orders,
          },
          pendingPayouts: report.pendingPayouts,
          orders: report.orders,
        },
      })

      const difference = report.cash.difference ?? 0

      await auditsService.log(
        {
          actor,
          action: 'CREATE',
          entity: 'CASH_CLOSING',
          entityId: closing.id,
          description: `Fechou o caixa #${closing.code}: ${formatBRL(report.sales.total)} vendidos (${formatBRL(report.sales.onCredit)} fiado), ${formatBRL(report.received.cash + report.received.pix)} recebidos, ${formatBRL(report.payouts.total)} repassados${difference ? `, diferença de ${formatBRL(difference)} no dinheiro` : ''}`,
          metadata: {
            movementsCount: report.movementsCount,
            sales: report.sales,
            received: report.received,
            payouts: report.payouts,
            cash: report.cash,
            receivables: report.receivables.total,
            pendingPayouts: report.pendingPayouts.total,
          },
        },
        tx,
      )

      return getOrFail(closing.id, tx)
    })
  },
}
