import { t } from 'elysia'
import type { ElysiaApp } from '@/infra/http/server'
import { CreatePixCashInService } from './create-pix-cash-in.service'

export const createPixCashIn = (app: ElysiaApp) => app.post(
  '/pix/cash-in',
  async ({ body, set }) => {
    const {
      transactionId,
      amount,
      document,
      name,
      email,
      phone,
      publicKey,
      secretKey,
      webhookUrl,
    } = body

    const createPixCashInService = new CreatePixCashInService()

    await createPixCashInService.execute({
      transactionId,
      amount,
      document,
      name,
      email,
      phone,
      publicKey,
      secretKey,
      webhookUrl,
    })

    set.status = 200
  },
  {
    body: t.Object({
      transactionId: t.String(),
      amount: t.Number({
        description: 'Amount in cents',
        minimum: 100,
        error: 'Amount must be at least 100 cents',
      }),
      document: t.String(),
      name: t.String(),
      email: t.Optional(t.String()),
      phone: t.Optional(t.String()),
      publicKey: t.String(),
      secretKey: t.String(),
      webhookUrl: t.String({
        description: 'URL to receive transaction status updates',
      }),
    }),
    detail: {
      description: 'Create a new PIX cash-in transaction',
      tags: ['PIX'],
      summary: 'Create PIX cash-in',
    },
  },
)
