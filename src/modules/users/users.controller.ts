import { Elysia, t } from 'elysia'
import { authPlugin } from '@/shared/auth/auth.plugin'
import { ADMIN_ROLES, UserRole } from '@/shared/auth/roles'
import { optionalEnum } from '@/shared/utils/schema'
import { usersService } from './users.service'

const roleSchema = t.UnionEnum([UserRole.ADMIN, UserRole.SELLER])
const passwordSchema = t.String({ minLength: 8, maxLength: 128 })
const usernameSchema = t.String({
  minLength: 3,
  maxLength: 50,
  pattern: '^[a-zA-Z0-9._-]+$',
})

// Only admins manage users
export const usersController = new Elysia({ prefix: '/users' })
  .use(authPlugin)
  .guard({ auth: ADMIN_ROLES })
  .get('', async () => usersService.fetch())
  .get('/:userId', async ({ params }) => usersService.getById(params.userId))
  .post(
    '',
    async ({ body, user, ip, set }) => {
      set.status = 201
      return usersService.create(body, { ...user, ip })
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2, maxLength: 120 }),
        username: usernameSchema,
        password: passwordSchema,
        role: roleSchema,
      }),
    },
  )
  .put(
    '/:userId',
    async ({ params, body, user, ip }) => {
      return usersService.update(params.userId, body, { ...user, ip })
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 2, maxLength: 120 })),
        username: t.Optional(usernameSchema),
        role: optionalEnum(roleSchema.enum),
      }),
    },
  )
  .put(
    '/:userId/password',
    async ({ params, body, user, ip }) => {
      await usersService.updatePassword(params.userId, body.password, {
        ...user,
        ip,
      })

      return { message: 'Senha alterada com sucesso' }
    },
    {
      body: t.Object({ password: passwordSchema }),
    },
  )
  .delete('/:userId', async ({ params, user, ip }) => {
    await usersService.delete(params.userId, { ...user, ip })

    return { message: 'Usuário excluído com sucesso' }
  })
