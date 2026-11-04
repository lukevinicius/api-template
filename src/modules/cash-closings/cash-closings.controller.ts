import { Elysia, t } from 'elysia'
import { authPlugin } from '@/shared/auth/auth.plugin'
import { STAFF_ROLES } from '@/shared/auth/roles'
import { cashClosingsService } from './cash-closings.service'

const centsSchema = t.Integer({ minimum: 0, maximum: 2_000_000_000 })

// The cashier is closed by whoever operates it (admins and sellers)
export const cashClosingsController = new Elysia({ prefix: '/cash-closings' })
  .use(authPlugin)
  .guard({ auth: STAFF_ROLES })
  .get(
    '',
    async ({ query }) =>
      cashClosingsService.fetch({
        page: query.page ?? 1,
        pageSize: Math.min(query.pageSize ?? 20, 100),
      }),
    {
      query: t.Object({
        page: t.Optional(t.Numeric({ minimum: 1 })),
        pageSize: t.Optional(t.Numeric({ minimum: 1 })),
      }),
    },
  )
  // Preview of the open period, before closing it
  .get(
    '/current',
    async ({ query }) => cashClosingsService.current(query.openingCash),
    {
      query: t.Object({
        openingCash: t.Optional(t.Numeric({ minimum: 0 })),
      }),
    },
  )
  .get('/:cashClosingId', async ({ params }) =>
    cashClosingsService.get(params.cashClosingId),
  )
  .post(
    '',
    async ({ body, user, ip, set }) => {
      set.status = 201
      return cashClosingsService.create(body, { id: user.id, ip })
    },
    {
      body: t.Object({
        countedCash: centsSchema,
        openingCash: t.Optional(centsSchema),
        notes: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
      }),
    },
  )
