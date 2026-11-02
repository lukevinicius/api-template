import { Elysia, t } from 'elysia'
import { authPlugin } from '@/shared/auth/auth.plugin'
import { STAFF_ROLES } from '@/shared/auth/roles'
import { optionalEnum } from '@/shared/utils/schema'
import { exchangeStatusEnum } from './exchanges.schema'
import { exchangesService } from './exchanges.service'

const exchangeBody = t.Object({
  clientId: t.Optional(t.Nullable(t.String({ minLength: 1 }))),
  notes: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
  items: t.Array(
    t.Object({
      chipId: t.String({ minLength: 1 }),
      direction: t.UnionEnum(['IN', 'OUT']),
      quantity: t.Integer({ minimum: 0, maximum: 100_000 }),
    }),
    { minItems: 2, maxItems: 100 },
  ),
})

export const exchangesController = new Elysia({ prefix: '/exchanges' })
  .use(authPlugin)
  .guard({ auth: STAFF_ROLES })
  .get(
    '',
    async ({ query }) =>
      exchangesService.fetch({
        status: query.status,
        search: query.search,
        page: query.page,
        pageSize: Math.min(query.pageSize ?? 20, 100),
      }),
    {
      query: t.Object({
        status: optionalEnum(exchangeStatusEnum.enumValues),
        search: t.Optional(t.String()),
        page: t.Optional(t.Numeric({ minimum: 1 })),
        pageSize: t.Optional(t.Numeric({ minimum: 1 })),
      }),
    },
  )
  .get('/:exchangeId', async ({ params }) =>
    exchangesService.get(params.exchangeId),
  )
  .post(
    '',
    async ({ body, user, ip, set }) => {
      set.status = 201
      return exchangesService.create(body, { id: user.id, ip })
    },
    { body: exchangeBody },
  )
  .put(
    '/:exchangeId',
    async ({ params, body, user, ip }) =>
      exchangesService.update(params.exchangeId, body, { id: user.id, ip }),
    { body: exchangeBody },
  )
  .post('/:exchangeId/cancel', async ({ params, user, ip }) =>
    exchangesService.cancel(params.exchangeId, { id: user.id, ip }),
  )
