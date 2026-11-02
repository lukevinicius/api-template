import type { db } from '@/config/database'
import { auditsModel } from './audits.model'
import type { AuditFilters, CreateAuditPayload } from './audits.types'

export const auditsService = {
  /**
   * Registers a user action. Pass the transaction as `executor` so the log is
   * only persisted when the action itself is committed.
   */
  log: async (
    payload: CreateAuditPayload,
    executor?: Pick<typeof db, 'insert'>,
  ): Promise<void> => {
    await auditsModel.create(payload, executor)
  },
  fetch: async (filters: AuditFilters) => {
    return auditsModel.fetch(filters)
  },
}
