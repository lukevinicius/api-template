import { Elysia, t } from 'elysia'
import { authPlugin } from '@/shared/auth/auth.plugin'
import { ADMIN_ROLES, STAFF_ROLES } from '@/shared/auth/roles'
import { settingsService } from './settings.service'

export const settingsController = new Elysia({ prefix: '/settings' })
  .use(authPlugin)
  // Sellers read the fee rate to preview the closing of an order
  .get('', async () => settingsService.get(), { auth: STAFF_ROLES })
  .put(
    '',
    async ({ body, user, ip }) =>
      settingsService.update(body, { id: user.id, ip }),
    {
      auth: ADMIN_ROLES,
      body: t.Object({
        feeRate: t.Optional(t.Integer({ minimum: 0, maximum: 10_000 })),
        chipLimit: t.Optional(t.Integer({ minimum: 0 })),
      }),
    },
  )
