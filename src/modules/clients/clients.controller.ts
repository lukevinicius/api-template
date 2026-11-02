import { Elysia, t } from 'elysia'
import { authPlugin } from '@/shared/auth/auth.plugin'
import { STAFF_ROLES } from '@/shared/auth/roles'
import { ordersService } from '../orders/orders.service'
import { clientsService } from './clients.service'

const nameSchema = t.String({ minLength: 2, maxLength: 120 })
const optionalText = (maxLength: number) =>
  t.Optional(t.Nullable(t.String({ maxLength })))
const pixKeyTypeSchema = t.Optional(
  t.Nullable(t.UnionEnum(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM'])),
)

const clientFields = {
  document: optionalText(30),
  phone: optionalText(30),
  pixKey: optionalText(140),
  pixKeyType: pixKeyTypeSchema,
}

export const clientsController = new Elysia({ prefix: '/clients' })
  .use(authPlugin)
  .guard({ auth: STAFF_ROLES })
  .get('', async ({ query }) => clientsService.fetch(query.search), {
    query: t.Object({ search: t.Optional(t.String()) }),
  })
  .get('/:clientId', async ({ params }) =>
    clientsService.getSummary(params.clientId),
  )
  .get('/:clientId/orders', async ({ params }) => {
    await clientsService.getById(params.clientId)

    return ordersService.fetch({ clientId: params.clientId, pageSize: 50 })
  })
  .get('/:clientId/report', async ({ params }) =>
    clientsService.getReport(params.clientId),
  )
  .post(
    '',
    async ({ body, user, ip, set }) => {
      set.status = 201
      return clientsService.create(body, { id: user.id, ip })
    },
    { body: t.Object({ name: nameSchema, ...clientFields }) },
  )
  .put(
    '/:clientId',
    async ({ params, body, user, ip }) => {
      return clientsService.update(params.clientId, body, {
        id: user.id,
        role: user.role,
        ip,
      })
    },
    {
      body: t.Object({
        name: t.Optional(nameSchema),
        ...clientFields,
        chipLimit: t.Optional(t.Integer({ minimum: 0 })),
      }),
    },
  )
  .delete('/:clientId', async ({ params, user, ip }) => {
    await clientsService.delete(params.clientId, { id: user.id, ip })

    return { message: 'Cliente excluído com sucesso' }
  })
