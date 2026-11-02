import { Elysia, t } from 'elysia'
import { authPlugin } from '@/shared/auth/auth.plugin'
import { ADMIN_ROLES } from '@/shared/auth/roles'
import { dashboardService } from './dashboard.service'

export const dashboardController = new Elysia({ prefix: '/dashboard' })
  .use(authPlugin)
  .get(
    '',
    async ({ query }) =>
      dashboardService.get({
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      }),
    {
      auth: ADMIN_ROLES,
      query: t.Object({
        from: t.Optional(t.String({ format: 'date-time' })),
        to: t.Optional(t.String({ format: 'date-time' })),
      }),
    },
  )
