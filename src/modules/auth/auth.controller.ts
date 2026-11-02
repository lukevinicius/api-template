import { Elysia, t } from 'elysia'
import { authPlugin } from '@/shared/auth/auth.plugin'
import { authService } from './auth.service'

function getSessionMeta(headers: Record<string, string | undefined>) {
  return {
    ip: headers['x-forwarded-for']?.split(',')[0]?.trim() ?? null,
    userAgent: headers['user-agent'] ?? null,
  }
}

export const authController = new Elysia({ prefix: '/auth' })
  .use(authPlugin)
  .post(
    '/sign-in',
    async ({ body, headers }) => {
      return authService.signIn(body, getSessionMeta(headers))
    },
    {
      body: t.Object({
        username: t.String({ minLength: 1, maxLength: 50 }),
        password: t.String({ minLength: 1, maxLength: 128 }),
      }),
    },
  )
  .post(
    '/refresh',
    async ({ body, headers }) => {
      return authService.refresh(body.refreshToken, getSessionMeta(headers))
    },
    {
      body: t.Object({ refreshToken: t.String({ minLength: 1 }) }),
    },
  )
  .post(
    '/sign-out',
    async ({ body, headers }) => {
      await authService.signOut(body.refreshToken, getSessionMeta(headers))

      return { message: 'Sessão encerrada' }
    },
    {
      body: t.Object({ refreshToken: t.String({ minLength: 1 }) }),
    },
  )
  .get('/me', async ({ user }) => authService.me(user.id), { auth: true })
