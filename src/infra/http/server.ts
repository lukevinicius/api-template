import * as Sentry from '@sentry/bun'
import { Elysia } from 'elysia'
import { AppError } from '@/domain/errors/AppError'
import { routes } from '@/infra/http/routes'
import { env } from '@/shared/env'
import { plugins } from './plugins'

const app = new Elysia()
  .error('AppError', AppError)
  .onError(({ code, error, set, request }) => {
    Sentry.captureException(error, {
      extra: {
        method: request.method,
        url: request.url,
      },
    })
    switch (code) {
      case 'AppError':
        set.status = error.statusCode
        return {
          status: error.statusCode,
          message: error.message,
        }
      case 'VALIDATION':
        set.status = 400
        return {
          type: error.type,
          issues: error.all.map((issue) => {
            return {
              schema: {
                path: issue.path,
                type: issue.schema.type,
              },
              message: issue.message,
              summary: issue.summary,
            }
          }),
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

app.use(plugins)

app.use(routes)

app.listen(env.PORT)

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
)

export type ElysiaApp = typeof app
