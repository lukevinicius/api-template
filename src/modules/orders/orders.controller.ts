import { Elysia, t } from 'elysia'
import { authPlugin } from '@/shared/auth/auth.plugin'
import { STAFF_ROLES } from '@/shared/auth/roles'
import { optionalEnum } from '@/shared/utils/schema'
import { orderStatusEnum, payoutMethodEnum } from './orders.schema'
import { ordersService } from './orders.service'

// Money payments; chips are only received when closing the order
const moneyMethodSchema = t.UnionEnum(['CASH', 'PIX'])
const notesSchema = t.Optional(t.Nullable(t.String({ maxLength: 500 })))
const quantitySchema = t.Integer({ minimum: 1, maximum: 100_000 })

// Orders can be managed by admins and sellers
export const ordersController = new Elysia({ prefix: '/orders' })
  .use(authPlugin)
  .guard({ auth: STAFF_ROLES })
  .get(
    '',
    async ({ query }) =>
      ordersService.fetch({
        status: query.status,
        search: query.search,
        clientId: query.clientId,
        page: query.page,
        pageSize: Math.min(query.pageSize ?? 20, 100),
      }),
    {
      query: t.Object({
        status: optionalEnum(orderStatusEnum.enumValues),
        search: t.Optional(t.String()),
        clientId: t.Optional(t.String()),
        page: t.Optional(t.Numeric({ minimum: 1 })),
        pageSize: t.Optional(t.Numeric({ minimum: 1 })),
      }),
    },
  )
  .get('/:orderId', async ({ params }) => ordersService.get(params.orderId))
  .get('/:orderId/history', async ({ params }) =>
    ordersService.history(params.orderId),
  )
  .post(
    '',
    async ({ body, user, ip, set }) => {
      const order = await ordersService.create(body, { id: user.id, ip })
      // 200 when the client's open order is returned instead of a new one
      set.status = order.alreadyOpen ? 200 : 201
      return order
    },
    {
      body: t.Object({
        clientId: t.String({ minLength: 1 }),
        notes: notesSchema,
      }),
    },
  )
  .put(
    '/:orderId',
    async ({ params, body, user, ip }) =>
      ordersService.update(params.orderId, body, { id: user.id, ip }),
    {
      body: t.Object({
        clientId: t.Optional(t.String({ minLength: 1 })),
        notes: notesSchema,
      }),
    },
  )
  .post(
    '/:orderId/items',
    async ({ params, body, user, ip }) =>
      ordersService.addItem(params.orderId, body, { id: user.id, ip }),
    {
      body: t.Object({
        chipId: t.String({ minLength: 1 }),
        quantity: quantitySchema,
      }),
    },
  )
  .patch(
    '/:orderId/items/:itemId',
    async ({ params, body, user, ip }) =>
      ordersService.updateItem(params.orderId, params.itemId, body.quantity, {
        id: user.id,
        ip,
      }),
    { body: t.Object({ quantity: quantitySchema }) },
  )
  .delete('/:orderId/items/:itemId', async ({ params, user, ip }) =>
    ordersService.removeItem(params.orderId, params.itemId, {
      id: user.id,
      ip,
    }),
  )
  .post(
    '/:orderId/payments',
    async ({ params, body, user, ip }) =>
      ordersService.addPayment(params.orderId, body, { id: user.id, ip }),
    {
      body: t.Object({
        method: moneyMethodSchema,
        amount: t.Integer({ minimum: 1 }),
        receivedAmount: t.Optional(t.Integer({ minimum: 1 })),
      }),
    },
  )
  .post(
    '/:orderId/close',
    async ({ params, body, user, ip }) =>
      ordersService.close(params.orderId, body, { id: user.id, ip }),
    {
      body: t.Object({
        returnedChips: t.Optional(
          t.Array(
            t.Object({
              chipId: t.String({ minLength: 1 }),
              quantity: t.Integer({ minimum: 0, maximum: 100_000 }),
            }),
            { maxItems: 100 },
          ),
        ),
        payment: t.Optional(
          t.Object({
            method: moneyMethodSchema,
            receivedAmount: t.Optional(t.Integer({ minimum: 1 })),
          }),
        ),
        payoutMethod: optionalEnum(payoutMethodEnum.enumValues),
      }),
    },
  )
  .post('/:orderId/cancel', async ({ params, user, ip }) =>
    ordersService.cancel(params.orderId, { id: user.id, ip }),
  )
