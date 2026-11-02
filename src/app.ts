import { swagger } from '@elysiajs/swagger'
import * as Sentry from '@sentry/bun'
import { Elysia } from 'elysia'
import { AppError } from '@/shared/utils/errors/AppError'
import { env } from './config/env'
import { routes } from './config/routes'

Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: env.NODE_ENV,
  integrations: [Sentry.bunServerIntegration()],
  tracesSampleRate: 1.0,
  enableLogs: true,
})

export const app = new Elysia()
  .use(swagger({ exclude: ['/'] }))
  .onRequest(({ request, set }) => {
    console.log(`${request.method} ${request.url}`)

    set.headers['x-content-type-options'] = 'nosniff'
    set.headers['x-frame-options'] = 'DENY'
    set.headers['referrer-policy'] = 'no-referrer'
  })
  .error({ AppError })
  .onError(({ code, error, set }) => {
    switch (code) {
      case 'AppError':
        set.status = error.statusCode
        return {
          status: 'error',
          message: error.message,
        }
      case 'VALIDATION':
        set.status = 400
        return {
          status: 'error',
          message: 'Dados inválidos',
          errors: error.all.map((issue) => ({
            field: 'path' in issue ? issue.path : undefined,
            message: issue.summary ?? issue.message,
          })),
        }
      case 'PARSE':
        set.status = 400
        return { status: 'error', message: 'Corpo da requisição inválido' }
      case 'NOT_FOUND':
        set.status = 404
        return { status: 'error', message: 'Rota não encontrada' }
      default:
        set.status = 500
        console.error(error)
        Sentry.captureException(error)
        return {
          status: 'error',
          message: 'Erro interno do servidor',
        }
    }
  })
  .use(routes)

export type ElysiaApp = typeof app
