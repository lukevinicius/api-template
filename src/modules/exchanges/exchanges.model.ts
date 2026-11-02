import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  type SQL,
} from 'drizzle-orm'
import { db, type Executor } from '@/config/database'
import { schema } from '@/database/schema'
import { escapeLike } from '@/shared/utils/sql'
import type { Exchange, ExchangeFilters } from './exchanges.types'

const { exchanges, exchangeItems, clients, chips, users } = schema

const columns = {
  id: exchanges.id,
  code: exchanges.code,
  status: exchanges.status,
  clientId: exchanges.clientId,
  clientName: clients.name,
  total: exchanges.total,
  notes: exchanges.notes,
  createdByName: users.name,
  canceledAt: exchanges.canceledAt,
  createdAt: exchanges.createdAt,
  updatedAt: exchanges.updatedAt,
}

async function withItems(
  rows: Omit<Exchange, 'items'>[],
  executor: Executor = db,
): Promise<Exchange[]> {
  if (rows.length === 0) return []

  const items = await executor
    .select({
      id: exchangeItems.id,
      exchangeId: exchangeItems.exchangeId,
      chipId: exchangeItems.chipId,
      chipImageUrl: chips.imageUrl,
      direction: exchangeItems.direction,
      quantity: exchangeItems.quantity,
      unitPrice: exchangeItems.unitPrice,
      total: exchangeItems.total,
    })
    .from(exchangeItems)
    .innerJoin(chips, eq(chips.id, exchangeItems.chipId))
    .where(
      inArray(
        exchangeItems.exchangeId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(desc(exchangeItems.unitPrice))

  return rows.map((row) => ({
    ...row,
    items: items
      .filter((item) => item.exchangeId === row.id)
      .map(({ exchangeId: _, ...item }) => item),
  }))
}

export const exchangesModel = {
  fetch: async (filters: ExchangeFilters) => {
    const page = filters.page ?? 1
    const pageSize = filters.pageSize ?? 20
    const conditions: SQL[] = [isNull(exchanges.deletedAt)]

    if (filters.status) conditions.push(eq(exchanges.status, filters.status))
    if (filters.search)
      conditions.push(ilike(clients.name, `%${escapeLike(filters.search)}%`))

    const where = and(...conditions)

    const [rows, [total]] = await Promise.all([
      db
        .select(columns)
        .from(exchanges)
        .leftJoin(clients, eq(clients.id, exchanges.clientId))
        .innerJoin(users, eq(users.id, exchanges.createdById))
        .where(where)
        .orderBy(desc(exchanges.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ value: count() })
        .from(exchanges)
        .leftJoin(clients, eq(clients.id, exchanges.clientId))
        .where(where),
    ])

    return {
      items: await withItems(rows),
      total: total?.value ?? 0,
      page,
      pageSize,
    }
  },
  getById: async (
    exchangeId: string,
    executor: Executor = db,
  ): Promise<Exchange | null> => {
    const rows = await executor
      .select(columns)
      .from(exchanges)
      .leftJoin(clients, eq(clients.id, exchanges.clientId))
      .innerJoin(users, eq(users.id, exchanges.createdById))
      .where(and(eq(exchanges.id, exchangeId), isNull(exchanges.deletedAt)))

    const [exchange] = await withItems(rows, executor)

    return exchange ?? null
  },
  lock: async (tx: Executor, exchangeId: string) => {
    const [exchange] = await tx
      .select()
      .from(exchanges)
      .where(and(eq(exchanges.id, exchangeId), isNull(exchanges.deletedAt)))
      .for('update')

    return exchange ?? null
  },
  getItems: async (tx: Executor, exchangeId: string) => {
    return tx
      .select()
      .from(exchangeItems)
      .where(eq(exchangeItems.exchangeId, exchangeId))
  },
  create: async (tx: Executor, payload: typeof exchanges.$inferInsert) => {
    const [exchange] = await tx.insert(exchanges).values(payload).returning()

    return exchange
  },
  update: async (
    tx: Executor,
    exchangeId: string,
    payload: Partial<typeof exchanges.$inferInsert>,
  ) => {
    await tx.update(exchanges).set(payload).where(eq(exchanges.id, exchangeId))
  },
  replaceItems: async (
    tx: Executor,
    exchangeId: string,
    items: Omit<typeof exchangeItems.$inferInsert, 'exchangeId'>[],
  ) => {
    await tx
      .delete(exchangeItems)
      .where(eq(exchangeItems.exchangeId, exchangeId))
    await tx
      .insert(exchangeItems)
      .values(items.map((item) => ({ ...item, exchangeId })))
  },
}
