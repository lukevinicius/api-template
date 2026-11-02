import {
  type AnyColumn,
  and,
  asc,
  desc,
  eq,
  gte,
  isNull,
  lte,
  ne,
  type SQL,
  sql,
} from 'drizzle-orm'
import { LOW_STOCK_THRESHOLD } from '@/config/constants'
import { db } from '@/config/database'
import { schema } from '@/database/schema'

const { orders, orderItems, orderPayments, orderChipReturns, chips, clients } =
  schema

interface Period {
  from?: Date
  to?: Date
}

function periodConditions(column: AnyColumn, period: Period) {
  const conditions: SQL[] = []
  if (period.from) conditions.push(gte(column, period.from))
  if (period.to) conditions.push(lte(column, period.to))
  return conditions
}

const sumOf = (expression: SQL | AnyColumn) =>
  sql<number>`coalesce(sum(${expression}), 0)`.mapWith(Number)

export const dashboardService = {
  get: async (period: Period) => {
    // Canceled orders are not sales
    const validOrder = and(
      ne(orders.status, 'CANCELED'),
      isNull(orders.deletedAt),
    )
    const closedInPeriod = and(
      eq(orders.status, 'CLOSED'),
      isNull(orders.deletedAt),
      ...periodConditions(orders.closedAt, period),
    )
    const moneyPayments = sql`${orderPayments.method} in ('PIX', 'CASH')`

    const [
      [sold],
      [returned],
      [circulation],
      [closed],
      [received],
      topChips,
      topDebtors,
      topProfit,
      lowStock,
    ] = await Promise.all([
      db
        .select({
          total: sumOf(orderItems.total),
          quantity: sumOf(orderItems.quantity),
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(
          and(validOrder, ...periodConditions(orderItems.createdAt, period)),
        ),
      db
        .select({
          total: sumOf(orderChipReturns.total),
          quantity: sumOf(orderChipReturns.quantity),
        })
        .from(orderChipReturns)
        .where(and(...periodConditions(orderChipReturns.createdAt, period))),
      // Current state: every chip sold that has not come back yet
      db
        .select({
          sold: sumOf(orders.total),
          returned: sumOf(orders.returnedAmount),
          openDebt:
            sql<number>`coalesce(sum(${orders.total} - ${orders.paidAmount}) filter (where ${orders.status} = 'OPEN'), 0)`.mapWith(
              Number,
            ),
        })
        .from(orders)
        .where(validOrder),
      db
        .select({
          feeProfit: sumOf(orders.feeAmount),
          payout: sumOf(orders.payoutAmount),
          ordersCount: sql<number>`count(*)`.mapWith(Number),
        })
        .from(orders)
        .where(closedInPeriod),
      db
        .select({
          cash: sql<number>`coalesce(sum(${orderPayments.amount}) filter (where ${orderPayments.method} = 'CASH'), 0)`.mapWith(
            Number,
          ),
          pix: sql<number>`coalesce(sum(${orderPayments.amount}) filter (where ${orderPayments.method} = 'PIX'), 0)`.mapWith(
            Number,
          ),
        })
        .from(orderPayments)
        .where(and(...periodConditions(orderPayments.createdAt, period))),
      db
        .select({
          chipId: chips.id,
          price: chips.price,
          imageUrl: chips.imageUrl,
          quantity: sumOf(orderItems.quantity),
          total: sumOf(orderItems.total),
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .innerJoin(chips, eq(chips.id, orderItems.chipId))
        .where(
          and(validOrder, ...periodConditions(orderItems.createdAt, period)),
        )
        .groupBy(chips.id)
        .orderBy(desc(sql`sum(${orderItems.quantity})`))
        .limit(5),
      db
        .select({
          clientId: clients.id,
          name: clients.name,
          chipLimit: clients.chipLimit,
          openAmount: sumOf(sql`${orders.total} - ${orders.paidAmount}`),
        })
        .from(orders)
        .innerJoin(clients, eq(clients.id, orders.clientId))
        .where(and(eq(orders.status, 'OPEN'), isNull(orders.deletedAt)))
        .groupBy(clients.id)
        .having(sql`sum(${orders.total} - ${orders.paidAmount}) > 0`)
        .orderBy(desc(sql`sum(${orders.total} - ${orders.paidAmount})`))
        .limit(5),
      // Client profit: what was paid back minus the money the client put in
      db
        .select({
          clientId: clients.id,
          name: clients.name,
          payout: sumOf(orders.payoutAmount),
          moneyPaid:
            sql<number>`coalesce(sum((select coalesce(sum(${orderPayments.amount}), 0) from ${orderPayments} where ${orderPayments.orderId} = ${orders.id} and ${moneyPayments})), 0)`.mapWith(
              Number,
            ),
        })
        .from(orders)
        .innerJoin(clients, eq(clients.id, orders.clientId))
        .where(closedInPeriod)
        .groupBy(clients.id)
        .orderBy(
          desc(
            sql`sum(${orders.payoutAmount}) - sum((select coalesce(sum(${orderPayments.amount}), 0) from ${orderPayments} where ${orderPayments.orderId} = ${orders.id} and ${moneyPayments}))`,
          ),
        )
        .limit(5),
      db
        .select({
          id: chips.id,
          price: chips.price,
          imageUrl: chips.imageUrl,
          quantity: chips.quantity,
        })
        .from(chips)
        .where(
          and(
            isNull(chips.deletedAt),
            lte(chips.quantity, LOW_STOCK_THRESHOLD),
          ),
        )
        .orderBy(asc(chips.quantity), asc(chips.price)),
    ])

    return {
      chipsSold: { total: sold?.total ?? 0, quantity: sold?.quantity ?? 0 },
      chipsReturned: {
        total: returned?.total ?? 0,
        quantity: returned?.quantity ?? 0,
      },
      inCirculation: (circulation?.sold ?? 0) - (circulation?.returned ?? 0),
      openDebt: circulation?.openDebt ?? 0,
      feeProfit: closed?.feeProfit ?? 0,
      payout: closed?.payout ?? 0,
      closedOrdersCount: closed?.ordersCount ?? 0,
      received: { cash: received?.cash ?? 0, pix: received?.pix ?? 0 },
      topChips,
      topDebtors,
      topProfitClients: topProfit.map((row) => ({
        ...row,
        profit: row.payout - row.moneyPaid,
      })),
      lowStock,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
    }
  },
}
