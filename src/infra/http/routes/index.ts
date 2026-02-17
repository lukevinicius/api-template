import { t } from 'elysia'
import { createPixCashIn } from '@/domain/services/pix/create-pix-cash-in/create-pix-cash-in.controller'
import { createPixCashOut } from '@/domain/services/pix/create-pix-cash-out/create-pix-cash-out.controller'
import type { ElysiaApp } from '@/infra/http/server'
import { validateSignature } from '@/shared/utils/validate-signature'

export const routes = (app: ElysiaApp) =>
  app
    // make a middleware group for /v1
    .group('/v1', {
      beforeHandle: ({ request }) => {
        return validateSignature(request)
      },
      headers: t.Object({
        'x-api-signature': t.String(
          {
            description: 'x-api-signature to validate the request',
            examples: ['abcdef1234567890']
          }
        ),
      }),
    }, (app) =>
      app
        .use(createPixCashIn)
        .use(createPixCashOut)
    )
