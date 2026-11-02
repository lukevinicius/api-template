import { Elysia, t } from 'elysia'
import { authPlugin } from '@/shared/auth/auth.plugin'
import { ADMIN_ROLES } from '@/shared/auth/roles'
import { optionalEnum } from '@/shared/utils/schema'
import { auditActionEnum, auditEntityEnum } from './audits.schema'
import { auditsService } from './audits.service'

export const auditsController = new Elysia({ prefix: '/audits' })
  .use(authPlugin)
  .get(
    '',
    async ({ query }) => {
      return auditsService.fetch({
        action: query.action,
        entity: query.entity,
        userId: query.userId,
        entityId: query.entityId,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        page: query.page ?? 1,
        pageSize: Math.min(query.pageSize ?? 20, 100),
      })
    },
    {
      auth: ADMIN_ROLES,
      query: t.Object({
        action: optionalEnum(auditActionEnum.enumValues),
        entity: optionalEnum(auditEntityEnum.enumValues),
        userId: t.Optional(t.String()),
        entityId: t.Optional(t.String()),
        from: t.Optional(t.String({ format: 'date-time' })),
        to: t.Optional(t.String({ format: 'date-time' })),
        page: t.Optional(t.Numeric({ minimum: 1 })),
        pageSize: t.Optional(t.Numeric({ minimum: 1 })),
      }),
    },
  )
