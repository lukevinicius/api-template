import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  ne,
  type SQL,
  sql,
} from 'drizzle-orm'
import { db, type Executor } from '@/config/database'
import { schema } from '@/database/schema'
import type { OrderInfo } from './cash-closings.summary'
import type {
  CashClosingFilters,
  CashMovement,
  CashMovementPayload,
  PendingOrder,
} from './cash-closings.types'

const { cashClosings, cashMovements, orders, clients, users } = schema

// Any constant key: serializes the cash closings
const CLOSING_LOCK_KEY = 7_420_001

const movementColumns = {
  id: cashMovements.id,
  type: cashMovements.type,
  method: cashMovements.method,
  amount: cashMovements.amount,
  orderId: cashMovements.orderId,
  createdAt: cashMovements.createdAt,
}

const pendingColumns = {
  orderId: orders.id,
  code: orders.code,
  status: orders.status,
  clientId: clients.id,
  clientName: clients.name,
  createdAt: orders.createdAt,
  closedAt: orders.closedAt,
}

export const cashMovementsModel = {
  /** Registers the financial movements of an order (zero amounts skipped). */
  record: async (tx: Executor, payload: CashMovementPayload[]) => {
    const values = payload.filter((movement) => movement.amount !== 0)

    if (values.length === 0) return

    await tx.insert(cashMovements).values(values)
  },
}

export const cashClosingsModel = {
  lock: async (tx: Executor) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${CLOSING_LOCK_KEY})`)
  },
  hasOpenMovements: async (executor: Executor = db) => {
    const [row] = await executor
      .select({ id: cashMovements.id })
      .from(cashMovements)
      .where(isNull(cashMovements.cashClosingId))
      .limit(1)

    return Boolean(row)
  },
  getOpenMovements: async (
    executor: Executor = db,
  ): Promise<CashMovement[]> => {
    return executor
      .select(movementColumns)
      .from(cashMovements)
      .where(isNull(cashMovements.cashClosingId))
      .orderBy(asc(cashMovements.createdAt))
  },
  /**
   * Moves every movement not closed yet to the closing, atomically: the
   * returned rows are exactly the ones closed, even with concurrent sales.
   */
  claimOpenMovements: async (
    tx: Executor,
    cashClosingId: string,
  ): Promise<CashMovement[]> => {
    return tx
      .update(cashMovements)
      .set({ cashClosingId })
      .where(isNull(cashMovements.cashClosingId))
      .returning(movementColumns)
  },
  getClosingMovements: async (
    cashClosingId: string,
    executor: Executor = db,
  ): Promise<CashMovement[]> => {
    return executor
      .select(movementColumns)
      .from(cashMovements)
      .where(eq(cashMovements.cashClosingId, cashClosingId))
  },
  /** Debt of each order (sales - payments) in the closings before. */
  getPreviousDebts: async (
    executor: Executor,
    orderIds: string[],
    exceptClosingId?: string,
  ) => {
    const debts = new Map<string, number>()

    if (orderIds.length === 0) return debts

    const conditions: SQL[] = [
      inArray(cashMovements.orderId, orderIds),
      isNotNull(cashMovements.cashClosingId),
    ]
    if (exceptClosingId)
      conditions.push(ne(cashMovements.cashClosingId, exceptClosingId))

    const rows = await executor
      .select({
        orderId: cashMovements.orderId,
        debt: sql<number>`coalesce(sum(case ${cashMovements.type} when 'SALE' then ${cashMovements.amount} when 'PAYMENT' then -${cashMovements.amount} else 0 end), 0)`.mapWith(
          Number,
        ),
      })
      .from(cashMovements)
      .where(and(...conditions))
      .groupBy(cashMovements.orderId)

    for (const row of rows) debts.set(row.orderId, row.debt)

    return debts
  },
  getOrdersInfo: async (executor: Executor, orderIds: string[]) => {
    const info = new Map<string, OrderInfo>()

    if (orderIds.length === 0) return info

    const rows = await executor
      .select({ id: orders.id, code: orders.code, clientName: clients.name })
      .from(orders)
      .innerJoin(clients, eq(clients.id, orders.clientId))
      .where(inArray(orders.id, orderIds))

    for (const row of rows) {
      info.set(row.id, { code: row.code, clientName: row.clientName })
    }

    return info
  },
  /** Orders whose client still owes the house (fiado a receber). */
  getReceivables: async (executor: Executor = db): Promise<PendingOrder[]> => {
    const amount = sql<number>`${orders.total} - ${orders.paidAmount}`
    return executor
      .select({ ...pendingColumns, amount: amount.mapWith(Number) })
      .from(orders)
      .innerJoin(clients, eq(clients.id, orders.clientId))
      .where(
        and(
          inArray(orders.status, ['OPEN', 'AWAITING_SETTLEMENT']),
          isNull(orders.deletedAt),
          sql`${amount} > 0`,
        ),
      )
      .orderBy(desc(amount))
  },
  /** Orders where the house still owes a payout to the client. */
  getPendingPayouts: async (
    executor: Executor = db,
  ): Promise<PendingOrder[]> => {
    const amount = sql<number>`${orders.payoutAmount} - ${orders.paidOutAmount}`
    return executor
      .select({ ...pendingColumns, amount: amount.mapWith(Number) })
      .from(orders)
      .innerJoin(clients, eq(clients.id, orders.clientId))
      .where(
        and(
          eq(orders.status, 'AWAITING_SETTLEMENT'),
          isNull(orders.deletedAt),
          sql`${amount} > 0`,
        ),
      )
      .orderBy(desc(amount))
  },
  create: async (
    tx: Executor,
    payload: typeof cashClosings.$inferInsert,
  ): Promise<typeof cashClosings.$inferSelect> => {
    const [closing] = await tx.insert(cashClosings).values(payload).returning()

    return closing as typeof cashClosings.$inferSelect
  },
  update: async (
    tx: Executor,
    cashClosingId: string,
    payload: Partial<typeof cashClosings.$inferInsert>,
  ) => {
    await tx
      .update(cashClosings)
      .set(payload)
      .where(eq(cashClosings.id, cashClosingId))
  },
  getById: async (cashClosingId: string, executor: Executor = db) => {
    const [closing] = await executor
      .select({ closing: cashClosings, closedByName: users.name })
      .from(cashClosings)
      .innerJoin(users, eq(users.id, cashClosings.closedById))
      .where(eq(cashClosings.id, cashClosingId))

    return closing ?? null
  },
  getLast: async (executor: Executor = db) => {
    const [closing] = await executor
      .select()
      .from(cashClosings)
      .orderBy(desc(cashClosings.code))
      .limit(1)

    return closing ?? null
  },
  fetch: async (filters: CashClosingFilters) => {
    const { snapshot: _snapshot, ...columns } = getTableColumns(cashClosings)

    const [rows, [total]] = await Promise.all([
      db
        .select({ ...columns, closedByName: users.name })
        .from(cashClosings)
        .innerJoin(users, eq(users.id, cashClosings.closedById))
        .orderBy(desc(cashClosings.code))
        .limit(filters.pageSize)
        .offset((filters.page - 1) * filters.pageSize),
      db.select({ value: count() }).from(cashClosings),
    ])

    return {
      items: rows,
      total: total?.value ?? 0,
      page: filters.page,
      pageSize: filters.pageSize,
    }
  },
}
