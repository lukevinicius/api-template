import { Elysia } from 'elysia'
import { usersModel } from '@/modules/users/users.model'
import { AppError } from '@/shared/utils/errors/AppError'
import type { UserRole } from './roles'
import { verifyAccessToken } from './tokens'

function getClientIp(headers: Record<string, string | undefined>) {
  return headers['x-forwarded-for']?.split(',')[0]?.trim() ?? null
}

/**
 * Adds the `auth` route option.
 * - `auth: true` requires any authenticated user.
 * - `auth: ['ADMIN', ...]` also requires one of the given roles.
 * The authenticated user is exposed to the handler as `user`.
 */
export const authPlugin = new Elysia({ name: 'auth-plugin' }).macro({
  auth: (roles: UserRole[] | true) => ({
    async resolve({ headers }) {
      const [scheme, token] = headers.authorization?.split(' ') ?? []

      if (scheme !== 'Bearer' || !token) {
        throw new AppError('Não autenticado', 401)
      }

      const payload = await verifyAccessToken(token).catch(() => {
        throw new AppError('Token inválido ou expirado', 401)
      })

      // Deleted users and role changes take effect immediately, without
      // waiting for the access token to expire
      const current = await usersModel.getById(payload.id)

      if (!current) {
        throw new AppError('Usuário não encontrado ou desativado', 401)
      }

      const user = { id: current.id, name: current.name, role: current.role }

      if (roles !== true && !roles.includes(user.role)) {
        throw new AppError('Você não tem permissão para esta ação', 403)
      }

      return { user, ip: getClientIp(headers) }
    },
  }),
})
