import { swagger } from '@elysiajs/swagger'
import * as Sentry from '@sentry/bun'
import { Elysia } from 'elysia'
import { AppError } from '@/domain/errors/AppError'
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
  .use(swagger())
  .onRequest(({ request }) => {
    console.log(`${request.method} ${request.url}`)
  })
  .error('AppError', AppError)
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
          message: 'Invalid data',
          error,
        }
      default:
        set.status = 500
        console.error(error)
        return {
          status: 'error',
          message: 'Internal server error',
        }
    }
  })

app.use(routes)

export type ElysiaApp = typeof app
