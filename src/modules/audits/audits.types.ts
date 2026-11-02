import type { auditActionEnum, auditEntityEnum } from './audits.schema'

export type AuditAction = (typeof auditActionEnum.enumValues)[number]
export type AuditEntity = (typeof auditEntityEnum.enumValues)[number]

export interface Actor {
  id: string
  ip?: string | null
}

export interface CreateAuditPayload {
  actor: Actor | null
  action: AuditAction
  entity: AuditEntity
  entityId?: string | null
  description: string
  metadata?: Record<string, unknown>
}

export interface AuditFilters {
  action?: AuditAction
  entity?: AuditEntity
  userId?: string
  entityId?: string
  from?: Date
  to?: Date
  page: number
  pageSize: number
}
