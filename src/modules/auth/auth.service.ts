import { createId } from '@paralleldrive/cuid2'
import { env } from '@/config/env'
import { createRateLimiter } from '@/shared/auth/rate-limit'
import {
  generateRefreshToken,
  hashToken,
  signAccessToken,
} from '@/shared/auth/tokens'
import { AppError } from '@/shared/utils/errors/AppError'
import { verifyPassword } from '@/shared/utils/passwords'
import { auditsService } from '../audits/audits.service'
import { usersModel } from '../users/users.model'
import type { User } from '../users/users.types'
import { authModel } from './auth.model'
import type { AuthResponse, SessionMeta, SignInPayload } from './auth.types'

// A rotated token presented again within this window is treated as a
// concurrent request (e.g. two tabs refreshing at once), not as theft.
const ROTATION_GRACE_PERIOD_MS = 10_000

const signInLimiter = createRateLimiter({ max: 5, windowMs: 15 * 60 * 1000 })

async function issueSession(
  user: User,
  meta: SessionMeta,
  familyId: string = createId(),
) {
  const refreshToken = generateRefreshToken()
  const refreshTokenExpiresAt = new Date(
    Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  )

  const stored = await authModel.create({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    familyId,
    expiresAt: refreshTokenExpiresAt,
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  const accessToken = await signAccessToken(user)

  const response: AuthResponse = {
    accessToken,
    accessTokenExpiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshToken,
    refreshTokenExpiresAt,
    user,
  }

  return { response, storedId: stored?.id as string }
}

export const authService = {
  signIn: async (
    payload: SignInPayload,
    meta: SessionMeta,
  ): Promise<AuthResponse> => {
    const limiterKey = `${payload.username.toLowerCase()}|${meta.ip ?? ''}`

    if (signInLimiter.isBlocked(limiterKey)) {
      throw new AppError(
        'Muitas tentativas de login. Tente novamente em alguns minutos',
        429,
      )
    }

    const credentials = await usersModel.getCredentialsByUsername(
      payload.username,
    )
    const isValid = await verifyPassword(
      payload.password,
      credentials?.password,
    )

    if (!credentials || !isValid) {
      signInLimiter.hit(limiterKey)
      throw new AppError('Usuário ou senha inválidos', 401)
    }

    signInLimiter.reset(limiterKey)

    const { password: _, ...user } = credentials
    const { response } = await issueSession(user, meta)

    await auditsService.log({
      actor: { id: user.id, ip: meta.ip },
      action: 'LOGIN',
      entity: 'AUTH',
      entityId: user.id,
      description: `${user.name} entrou no sistema`,
      metadata: { userAgent: meta.userAgent },
    })

    return response
  },
  refresh: async (
    refreshToken: string,
    meta: SessionMeta,
  ): Promise<AuthResponse> => {
    const invalid = new AppError('Sessão expirada. Entre novamente', 401)
    const stored = await authModel.getByHash(hashToken(refreshToken))

    if (!stored) {
      throw invalid
    }

    if (stored.revokedAt) {
      const isConcurrentRefresh =
        stored.replacedById &&
        Date.now() - stored.revokedAt.getTime() < ROTATION_GRACE_PERIOD_MS

      if (!isConcurrentRefresh) {
        // Reuse of a rotated token: it was probably stolen, so kill the chain
        await authModel.revokeFamily(stored.familyId)
      }

      throw invalid
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      await authModel.revoke(stored.id)
      throw invalid
    }

    const user = await usersModel.getById(stored.userId)

    if (!user) {
      await authModel.revokeFamily(stored.familyId)
      throw invalid
    }

    const { response, storedId } = await issueSession(
      user,
      meta,
      stored.familyId,
    )

    const rotated = await authModel.markReplaced(stored.id, storedId)

    if (!rotated) {
      // Another request rotated this token first; discard the new one
      await authModel.deleteById(storedId)
      throw invalid
    }

    return response
  },
  signOut: async (refreshToken: string, meta: SessionMeta): Promise<void> => {
    const stored = await authModel.getByHash(hashToken(refreshToken))

    if (!stored) {
      return
    }

    await authModel.revokeFamily(stored.familyId)

    await auditsService.log({
      actor: { id: stored.userId, ip: meta.ip },
      action: 'LOGOUT',
      entity: 'AUTH',
      entityId: stored.userId,
      description: 'Saiu do sistema',
    })
  },
  me: async (userId: string): Promise<User> => {
    const user = await usersModel.getById(userId)

    if (!user) {
      throw new AppError('Usuário não encontrado', 401)
    }

    return user
  },
}
