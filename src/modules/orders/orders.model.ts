import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNull,
  type SQL,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db, type Executor } from '@/config/database'
import { schema } from '@/database/schema'
import { escapeLike } from '@/shared/utils/sql'
import type { OrderDetails, OrderFilters, OrderSummary } from './orders.types'

const {
  orders,
  orderItems,
  orderPayments,
  orderChipReturns,
  clients,
  chips,
  users,
} = schema

const chipsCount = db
  .select({
    orderId: orderItems.orderId,
    value: sql<number>`sum(${orderItems.quantity})`.mapWith(Number).as('value'),
  })
  .from(orderItems)
  .groupBy(orderItems.orderId)
  .as('chips_count')

const summaryColumns = {
  id: orders.id,
  code: orders.code,
  status: orders.status,
  clientId: orders.clientId,
  clientName: clients.name,
  total: orders.total,
  paidAmount: orders.paidAmount,
  returnedAmount: orders.returnedAmount,
  feeRate: orders.feeRate,
  feeAmount: orders.feeAmount,
  payoutAmount: orders.payoutAmount,
  payoutMethod: orders.payoutMethod,
  chipsCount: sql<number>`coalesce(${chipsCount.value}, 0)`.mapWith(Number),
  notes: orders.notes,
  createdAt: orders.createdAt,
  closedAt: orders.closedAt,
}

function toSummary<T extends { total: number; paidAmount: number }>(row: T) {
  return { ...row, openAmount: row.total - row.paidAmount }
}

export const ordersModel = {
  fetch: async (filters: OrderFilters) => {
    const page = filters.page ?? 1
    const pageSize = filters.pageSize ?? 20
    const conditions: SQL[] = [isNull(orders.deletedAt)]

    if (filters.status) conditions.push(eq(orders.status, filters.status))
    if (filters.clientId) conditions.push(eq(orders.clientId, filters.clientId))
    if (filters.search)
      conditions.push(ilike(clients.name, `%${escapeLike(filters.search)}%`))

    const where = and(...conditions)

    const [rows, [total]] = await Promise.all([
      db
        .select(summaryColumns)
        .from(orders)
        .innerJoin(clients, eq(clients.id, orders.clientId))
        .leftJoin(chipsCount, eq(chipsCount.orderId, orders.id))
        .where(where)
        // Open orders first, newest first
        .orderBy(sql`${orders.status} = 'OPEN' desc`, desc(orders.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ value: count() })
        .from(orders)
        .innerJoin(clients, eq(clients.id, orders.clientId))
        .where(where),
    ])

    return {
      items: rows.map(toSummary) as OrderSummary[],
      total: total?.value ?? 0,
      page,
      pageSize,
    }
  },
  getDetails: async (
    orderId: string,
    executor: Executor = db,
  ): Promise<OrderDetails | null> => {
    const openedBy = alias(users, 'opened_by')
    const closedBy = alias(users, 'closed_by')

    const [order] = await executor
      .select({
        ...summaryColumns,
        client: {
          id: clients.id,
          name: clients.name,
          document: clients.document,
          phone: clients.phone,
          pixKey: clients.pixKey,
          pixKeyType: clients.pixKeyType,
          chipLimit: clients.chipLimit,
        },
        openedById: openedBy.id,
        openedByName: openedBy.name,
        closedById: closedBy.id,
        closedByName: closedBy.name,
      })
      .from(orders)
      .innerJoin(clients, eq(clients.id, orders.clientId))
      .innerJoin(openedBy, eq(openedBy.id, orders.openedById))
      .leftJoin(closedBy, eq(closedBy.id, orders.closedById))
      .leftJoin(chipsCount, eq(chipsCount.orderId, orders.id))
      .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)))

    if (!order) {
      return null
    }

    const [items, payments, returns] = await Promise.all([
      executor
        .select({
          id: orderItems.id,
          chipId: orderItems.chipId,
          chipImageUrl: chips.imageUrl,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
          total: orderItems.total,
          addedByName: users.name,
          createdAt: orderItems.createdAt,
        })
        .from(orderItems)
        .innerJoin(chips, eq(chips.id, orderItems.chipId))
        .innerJoin(users, eq(users.id, orderItems.addedById))
        .where(eq(orderItems.orderId, orderId))
        .orderBy(desc(orderItems.unitPrice)),
      executor
        .select({
          id: orderPayments.id,
          method: orderPayments.method,
          amount: orderPayments.amount,
          receivedAmount: orderPayments.receivedAmount,
          changeAmount: orderPayments.changeAmount,
          receivedByName: users.name,
          createdAt: orderPayments.createdAt,
        })
        .from(orderPayments)
        .innerJoin(users, eq(users.id, orderPayments.receivedById))
        .where(eq(orderPayments.orderId, orderId))
        .orderBy(asc(orderPayments.createdAt)),
      executor
        .select({
          id: orderChipReturns.id,
          chipId: orderChipReturns.chipId,
          chipImageUrl: chips.imageUrl,
          quantity: orderChipReturns.quantity,
          unitPrice: orderChipReturns.unitPrice,
          total: orderChipReturns.total,
          receivedByName: users.name,
          createdAt: orderChipReturns.createdAt,
        })
        .from(orderChipReturns)
        .innerJoin(chips, eq(chips.id, orderChipReturns.chipId))
        .innerJoin(users, eq(users.id, orderChipReturns.receivedById))
        .where(eq(orderChipReturns.orderId, orderId))
        .orderBy(desc(orderChipReturns.unitPrice)),
    ])

    const { openedById, openedByName, closedById, closedByName, ...summary } =
      order

    return {
      ...toSummary(summary),
      openedBy: { id: openedById, name: openedByName },
      closedBy:
        closedById && closedByName
          ? { id: closedById, name: closedByName }
          : null,
      items,
      payments,
      returns,
    }
  },
  lock: async (tx: Executor, orderId: string) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)))
      .for('update')

    return order ?? null
  },
  /** The open order of the client: there is at most one. */
  getOpenByClient: async (tx: Executor, clientId: string) => {
    const [order] = await tx
      .select({ id: orders.id, code: orders.code })
      .from(orders)
      .where(
        and(
          eq(orders.clientId, clientId),
          eq(orders.status, 'OPEN'),
          isNull(orders.deletedAt),
        ),
      )

    return order ?? null
  },
  /**
   * Value of the chips sold and not returned yet, in cents. Exchanges always
   * balance, so they do not change it.
   */
  create: async (tx: Executor, payload: typeof orders.$inferInsert) => {
    const [order] = await tx.insert(orders).values(payload).returning()

    return order
  },
  update: async (
    tx: Executor,
    orderId: string,
    payload: Partial<typeof orders.$inferInsert>,
  ) => {
    await tx.update(orders).set(payload).where(eq(orders.id, orderId))
  },
  sumItems: async (tx: Executor, orderId: string) => {
    const [result] = await tx
      .select({
        total: sql<number>`coalesce(sum(${orderItems.total}), 0)`.mapWith(
          Number,
        ),
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))

    return result?.total ?? 0
  },
  getItems: async (tx: Executor, orderId: string) => {
    return tx.select().from(orderItems).where(eq(orderItems.orderId, orderId))
  },
  getItem: async (tx: Executor, orderId: string, itemId: string) => {
    const [item] = await tx
      .select()
      .from(orderItems)
      .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)))

    return item ?? null
  },
  insertItem: async (tx: Executor, payload: typeof orderItems.$inferInsert) => {
    const [item] = await tx.insert(orderItems).values(payload).returning()

    return item
  },
  updateItem: async (
    tx: Executor,
    itemId: string,
    payload: Partial<typeof orderItems.$inferInsert>,
  ) => {
    await tx.update(orderItems).set(payload).where(eq(orderItems.id, itemId))
  },
  deleteItem: async (tx: Executor, itemId: string) => {
    await tx.delete(orderItems).where(eq(orderItems.id, itemId))
  },
  insertPayment: async (
    tx: Executor,
    payload: typeof orderPayments.$inferInsert,
  ) => {
    const [payment] = await tx.insert(orderPayments).values(payload).returning()

    return payment
  },
  insertReturns: async (
    tx: Executor,
    payload: (typeof orderChipReturns.$inferInsert)[],
  ) => {
    if (payload.length === 0) return

    await tx.insert(orderChipReturns).values(payload)
  },
}
