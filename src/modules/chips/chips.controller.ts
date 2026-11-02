import { Elysia, t } from 'elysia'
import { authPlugin } from '@/shared/auth/auth.plugin'
import { ADMIN_ROLES, STAFF_ROLES } from '@/shared/auth/roles'
import { fileUrlSchema } from '@/shared/utils/schema'
import { chipsService } from './chips.service'

const priceSchema = t.Integer({ minimum: 1 })

export const chipsController = new Elysia({ prefix: '/chips' })
  .use(authPlugin)
  // Sellers need the chips to sell, exchange and receive them
  .get('', async () => chipsService.fetch(), { auth: STAFF_ROLES })
  .get('/:chipId', async ({ params }) => chipsService.get(params.chipId), {
    auth: STAFF_ROLES,
  })
  .guard({ auth: ADMIN_ROLES })
  .post(
    '',
    async ({ body, user, ip, set }) => {
      set.status = 201
      return chipsService.create(body, { id: user.id, ip })
    },
    {
      body: t.Object({
        price: priceSchema,
        quantity: t.Integer({ minimum: 0 }),
        imageUrl: fileUrlSchema,
      }),
    },
  )
  .put(
    '/:chipId',
    async ({ params, body, user, ip }) =>
      chipsService.update(params.chipId, body, { id: user.id, ip }),
    {
      body: t.Object({
        price: t.Optional(priceSchema),
        imageUrl: fileUrlSchema,
      }),
    },
  )
  .patch(
    '/:chipId/stock',
    async ({ params, body, user, ip }) =>
      chipsService.updateStock(params.chipId, body, { id: user.id, ip }),
    {
      body: t.Object({
        operation: t.UnionEnum(['add', 'remove']),
        quantity: t.Integer({ minimum: 1 }),
      }),
    },
  )
  .delete('/:chipId', async ({ params, user, ip }) => {
    await chipsService.delete(params.chipId, { id: user.id, ip })

    return { message: 'Ficha excluída com sucesso' }
  })
