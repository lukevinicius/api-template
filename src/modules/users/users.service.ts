import type { AuthUser } from '@/shared/auth/tokens'
import { AppError } from '@/shared/utils/errors/AppError'
import { hashPassword } from '@/shared/utils/passwords'
import { auditsService } from '../audits/audits.service'
import type { Actor } from '../audits/audits.types'
import { authModel } from '../auth/auth.model'
import { usersModel } from './users.model'
import type { CreateUserPayload, UpdateUserPayload, User } from './users.types'

type ActorUser = AuthUser & Actor

async function getUserOrFail(userId: string) {
  const user = await usersModel.getById(userId)

  if (!user) {
    throw new AppError('Usuário não encontrado', 404)
  }

  return user
}

export const usersService = {
  create: async (
    payload: CreateUserPayload,
    actor: ActorUser,
  ): Promise<User> => {
    const existingUser = await usersModel.getByUsername(payload.username)

    if (existingUser) {
      throw new AppError('Este nome de usuário já está em uso', 409)
    }

    const user = await usersModel.create({
      ...payload,
      password: await hashPassword(payload.password),
    })

    await auditsService.log({
      actor,
      action: 'CREATE',
      entity: 'USER',
      entityId: user.id,
      description: `Criou o usuário ${user.name} (${user.role})`,
    })

    return user
  },
  fetch: async (): Promise<User[]> => {
    return usersModel.fetch()
  },
  getById: async (userId: string): Promise<User> => {
    return getUserOrFail(userId)
  },
  update: async (
    userId: string,
    payload: UpdateUserPayload,
    actor: ActorUser,
  ): Promise<User> => {
    const user = await getUserOrFail(userId)

    if (payload.role && actor.id === userId && payload.role !== user.role) {
      throw new AppError('Você não pode alterar o seu próprio perfil', 400)
    }

    if (payload.username && payload.username !== user.username) {
      const existingUser = await usersModel.getByUsername(payload.username)

      if (existingUser) {
        throw new AppError('Este nome de usuário já está em uso', 409)
      }
    }

    const updated = await usersModel.update(userId, payload)

    // A role change must not wait for the old session to expire
    if (payload.role && payload.role !== user.role) {
      await authModel.revokeAllForUser(userId)
    }

    await auditsService.log({
      actor,
      action: 'UPDATE',
      entity: 'USER',
      entityId: userId,
      description: `Editou o usuário ${updated?.name ?? user.name}`,
      metadata: { before: user, changes: payload },
    })

    return updated as User
  },
  updatePassword: async (
    userId: string,
    password: string,
    actor: ActorUser,
  ): Promise<void> => {
    const user = await getUserOrFail(userId)

    await usersModel.updatePassword(userId, await hashPassword(password))
    await authModel.revokeAllForUser(userId)

    await auditsService.log({
      actor,
      action: 'PASSWORD_CHANGE',
      entity: 'USER',
      entityId: userId,
      description: `Alterou a senha do usuário ${user.name}`,
    })
  },
  delete: async (userId: string, actor: ActorUser): Promise<void> => {
    if (actor.id === userId) {
      throw new AppError('Você não pode excluir o seu próprio usuário', 400)
    }

    const user = await getUserOrFail(userId)

    await usersModel.softDelete(userId)
    await authModel.revokeAllForUser(userId)

    await auditsService.log({
      actor,
      action: 'DELETE',
      entity: 'USER',
      entityId: userId,
      description: `Excluiu o usuário ${user.name}`,
    })
  },
}
