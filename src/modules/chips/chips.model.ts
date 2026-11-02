import { and, asc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { decrement, increment } from '@/config/constants'
import { db, type Executor } from '@/config/database'
import { schema } from '@/database/schema'
import type { Chip, CreateChipPayload, UpdateChipPayload } from './chips.types'

const {
  chips,
  orders,
  orderItems,
  orderChipReturns,
  exchanges,
  exchangeItems,
} = schema

const notDeleted = isNull(chips.deletedAt)

const columns = {
  id: chips.id,
  price: chips.price,
  quantity: chips.quantity,
  imageUrl: chips.imageUrl,
  createdAt: chips.createdAt,
  updatedAt: chips.updatedAt,
}

export const chipsModel = {
  create: async (payload: CreateChipPayload): Promise<Chip> => {
    const [chip] = await db.insert(chips).values(payload).returning(columns)

    return chip as Chip
  },
  fetch: async (): Promise<Chip[]> => {
    return db
      .select(columns)
      .from(chips)
      .where(notDeleted)
      .orderBy(asc(chips.price))
  },
  getById: async (
    chipId: string,
    executor: Executor = db,
  ): Promise<Chip | null> => {
    const [chip] = await executor
      .select(columns)
      .from(chips)
      .where(and(eq(chips.id, chipId), notDeleted))

    return chip ?? null
  },
  getByIds: async (chipIds: string[], executor: Executor = db) => {
    if (chipIds.length === 0) return []

    return executor
      .select(columns)
      .from(chips)
      .where(and(inArray(chips.id, chipIds), notDeleted))
  },
  getByPrice: async (price: number): Promise<Chip | null> => {
    const [chip] = await db
      .select(columns)
      .from(chips)
      .where(and(eq(chips.price, price), notDeleted))

    return chip ?? null
  },
  /** Locks the chips (in a fixed order, avoiding deadlocks) until commit. */
  lockMany: async (chipIds: string[], tx: Executor) => {
    if (chipIds.length === 0) return []

    return tx
      .select(columns)
      .from(chips)
      .where(and(inArray(chips.id, chipIds), notDeleted))
      .orderBy(asc(chips.id))
      .for('update')
  },
  /**
   * Units of each chip that left the cashier and are with the clients:
   * sold - returned on closing + given in exchanges - received in exchanges.
   */
  getCirculation: async (chipIds: string[], tx: Executor) => {
    const circulation = new Map<string, number>()

    if (chipIds.length === 0) return circulation

    const ids = sql.join(
      chipIds.map((id) => sql`${id}`),
      sql`, `,
    )
    const result = await tx.execute<{ chip_id: string; quantity: string }>(sql`
      select chip_id, sum(quantity) as quantity from (
        select ${orderItems.chipId} as chip_id, ${orderItems.quantity} as quantity
        from ${orderItems}
        inner join ${orders} on ${orders.id} = ${orderItems.orderId}
        where ${orders.status} <> 'CANCELED' and ${orders.deletedAt} is null
        union all
        select ${orderChipReturns.chipId}, -${orderChipReturns.quantity}
        from ${orderChipReturns}
        inner join ${orders} on ${orders.id} = ${orderChipReturns.orderId}
        where ${orders.status} <> 'CANCELED' and ${orders.deletedAt} is null
        union all
        select ${exchangeItems.chipId},
          case when ${exchangeItems.direction} = 'OUT'
            then ${exchangeItems.quantity} else -${exchangeItems.quantity} end
        from ${exchangeItems}
        inner join ${exchanges} on ${exchanges.id} = ${exchangeItems.exchangeId}
        where ${exchanges.status} = 'DONE' and ${exchanges.deletedAt} is null
      ) movements
      where chip_id in (${ids})
      group by chip_id
    `)

    for (const row of result.rows) {
      circulation.set(row.chip_id, Number(row.quantity))
    }

    return circulation
  },
  addToStock: async (
    chipId: string,
    quantity: number,
    executor: Executor = db,
  ) => {
    const [chip] = await executor
      .update(chips)
      .set({ quantity: increment(chips.quantity, quantity) })
      .where(eq(chips.id, chipId))
      .returning(columns)

    return chip as Chip
  },
  // Atomic: only takes from the cashier when there are enough chips
  removeFromStock: async (
    chipId: string,
    quantity: number,
    executor: Executor = db,
  ) => {
    const [chip] = await executor
      .update(chips)
      .set({ quantity: decrement(chips.quantity, quantity) })
      .where(and(eq(chips.id, chipId), gte(chips.quantity, quantity)))
      .returning(columns)

    return chip ?? null
  },
  update: async (chipId: string, payload: UpdateChipPayload) => {
    const [chip] = await db
      .update(chips)
      .set(payload)
      .where(eq(chips.id, chipId))
      .returning(columns)

    return chip as Chip
  },
  softDelete: async (chipId: string) => {
    await db
      .update(chips)
      .set({ deletedAt: new Date() })
      .where(eq(chips.id, chipId))
  },
}
