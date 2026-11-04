import { and, asc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { db, type Executor } from '@/config/database'
import { schema } from '@/database/schema'
import { escapeLike } from '@/shared/utils/sql'
import type {
  Client,
  ClientReport,
  ClientWithSummary,
  CreateClientPayload,
  UpdateClientPayload,
} from './clients.types'

const { clients, orders } = schema

const notDeleted = isNull(clients.deletedAt)

const columns = {
  id: clients.id,
  name: clients.name,
  document: clients.document,
  phone: clients.phone,
  pixKey: clients.pixKey,
  pixKeyType: clients.pixKeyType,
  chipLimit: clients.chipLimit,
  createdAt: clients.createdAt,
  updatedAt: clients.updatedAt,
}

export const clientsModel = {
  create: async (
    payload: CreateClientPayload & { chipLimit: number },
  ): Promise<Client> => {
    const [client] = await db.insert(clients).values(payload).returning(columns)

    return client as Client
  },
  getByDocument: async (document: string): Promise<Client | null> => {
    const [client] = await db
      .select(columns)
      .from(clients)
      .where(and(eq(clients.document, document), notDeleted))

    return client ?? null
  },
  getById: async (
    clientId: string,
    executor: Executor = db,
  ): Promise<Client | null> => {
    const [client] = await executor
      .select(columns)
      .from(clients)
      .where(and(eq(clients.id, clientId), notDeleted))

    return client ?? null
  },
  /**
   * Locks the client row until the transaction ends, so concurrent chip sales
   * for the same client cannot exceed the limit together.
   */
  lock: async (tx: Executor, clientId: string) => {
    const [client] = await tx
      .select(columns)
      .from(clients)
      .where(and(eq(clients.id, clientId), notDeleted))
      .for('update')

    return client ?? null
  },
  /**
   * What the client still owes, in cents: open orders and orders whose chips
   * were returned but are still awaiting the settlement.
   */
  getOpenAmount: async (
    clientId: string,
    executor: Executor = db,
  ): Promise<number> => {
    const [result] = await executor
      .select({
        value:
          sql<number>`coalesce(sum(${orders.total} - ${orders.paidAmount}), 0)`.mapWith(
            Number,
          ),
      })
      .from(orders)
      .where(
        and(
          eq(orders.clientId, clientId),
          inArray(orders.status, ['OPEN', 'AWAITING_SETTLEMENT']),
          isNull(orders.deletedAt),
        ),
      )

    return result?.value ?? 0
  },
  fetch: async (search?: string): Promise<ClientWithSummary[]> => {
    const openOrder = sql`${orders.status} = 'OPEN'`
    const owing = sql`${orders.status} in ('OPEN', 'AWAITING_SETTLEMENT')`
    const pattern = search ? `%${escapeLike(search)}%` : undefined

    const rows = await db
      .select({
        ...columns,
        openOrders:
          sql<number>`count(${orders.id}) filter (where ${openOrder})`.mapWith(
            Number,
          ),
        openAmount:
          sql<number>`coalesce(sum(${orders.total} - ${orders.paidAmount}) filter (where ${owing}), 0)`.mapWith(
            Number,
          ),
        pendingPayout:
          sql<number>`coalesce(sum(${orders.payoutAmount} - ${orders.paidOutAmount}) filter (where ${orders.status} = 'AWAITING_SETTLEMENT'), 0)`.mapWith(
            Number,
          ),
      })
      .from(clients)
      .leftJoin(
        orders,
        and(eq(orders.clientId, clients.id), isNull(orders.deletedAt)),
      )
      .where(
        and(
          notDeleted,
          pattern
            ? or(ilike(clients.name, pattern), ilike(clients.document, pattern))
            : undefined,
        ),
      )
      .groupBy(clients.id)
      .orderBy(asc(clients.name))

    return rows.map((row) => ({
      ...row,
      availableLimit: Math.max(row.chipLimit - row.openAmount, 0),
    }))
  },
  getReport: async (clientId: string): Promise<ClientReport> => {
    const [report] = await db
      .select({
        totalSold: sql<number>`coalesce(sum(${orders.total}), 0)`.mapWith(
          Number,
        ),
        totalPaid: sql<number>`coalesce(sum(${orders.paidAmount}), 0)`.mapWith(
          Number,
        ),
        totalPayout:
          sql<number>`coalesce(sum(${orders.paidOutAmount}), 0)`.mapWith(
            Number,
          ),
        totalPendingPayout:
          sql<number>`coalesce(sum(${orders.payoutAmount} - ${orders.paidOutAmount}), 0)`.mapWith(
            Number,
          ),
        ordersCount: sql<number>`count(*)`.mapWith(Number),
        openOrdersCount:
          sql<number>`count(*) filter (where ${orders.status} = 'OPEN')`.mapWith(
            Number,
          ),
        awaitingSettlementCount:
          sql<number>`count(*) filter (where ${orders.status} = 'AWAITING_SETTLEMENT')`.mapWith(
            Number,
          ),
      })
      .from(orders)
      .where(
        and(
          eq(orders.clientId, clientId),
          ne(orders.status, 'CANCELED'),
          isNull(orders.deletedAt),
        ),
      )

    const totalSold = report?.totalSold ?? 0
    const totalPaid = report?.totalPaid ?? 0

    return {
      totalSold,
      totalPaid,
      totalOpen: totalSold - totalPaid,
      totalPayout: report?.totalPayout ?? 0,
      totalPendingPayout: report?.totalPendingPayout ?? 0,
      ordersCount: report?.ordersCount ?? 0,
      openOrdersCount: report?.openOrdersCount ?? 0,
      awaitingSettlementCount: report?.awaitingSettlementCount ?? 0,
    }
  },
  update: async (clientId: string, payload: UpdateClientPayload) => {
    const [client] = await db
      .update(clients)
      .set(payload)
      .where(eq(clients.id, clientId))
      .returning(columns)

    return client as Client
  },
  softDelete: async (clientId: string) => {
    await db
      .update(clients)
      .set({ deletedAt: new Date() })
      .where(eq(clients.id, clientId))
  },
}
