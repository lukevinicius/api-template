import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm'
import { db } from '@/config/database'
import { schema } from '@/database/schema'
import type { AuditFilters, CreateAuditPayload } from './audits.types'

type Executor = Pick<typeof db, 'insert'>

export const auditsModel = {
  create: async (payload: CreateAuditPayload, executor: Executor = db) => {
    await executor.insert(schema.auditLogs).values({
      userId: payload.actor?.id ?? null,
      ip: payload.actor?.ip ?? null,
      action: payload.action,
      entity: payload.entity,
      entityId: payload.entityId ?? null,
      description: payload.description,
      metadata: payload.metadata,
    })
  },
  fetch: async (filters: AuditFilters) => {
    const conditions: SQL[] = []
    const { auditLogs, users } = schema

    if (filters.action) conditions.push(eq(auditLogs.action, filters.action))
    if (filters.entity) conditions.push(eq(auditLogs.entity, filters.entity))
    if (filters.userId) conditions.push(eq(auditLogs.userId, filters.userId))
    if (filters.entityId)
      conditions.push(eq(auditLogs.entityId, filters.entityId))
    if (filters.from) conditions.push(gte(auditLogs.createdAt, filters.from))
    if (filters.to) conditions.push(lte(auditLogs.createdAt, filters.to))

    const where = conditions.length ? and(...conditions) : undefined

    const [items, [total]] = await Promise.all([
      db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          entity: auditLogs.entity,
          entityId: auditLogs.entityId,
          description: auditLogs.description,
          metadata: auditLogs.metadata,
          ip: auditLogs.ip,
          createdAt: auditLogs.createdAt,
          userId: auditLogs.userId,
          userName: users.name,
        })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.userId))
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(filters.pageSize)
        .offset((filters.page - 1) * filters.pageSize),
      db.select({ value: count() }).from(auditLogs).where(where),
    ])

    return {
      items,
      total: total?.value ?? 0,
      page: filters.page,
      pageSize: filters.pageSize,
    }
  },
}
