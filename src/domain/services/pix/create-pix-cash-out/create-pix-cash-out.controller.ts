import { t } from 'elysia'
import type { ElysiaApp } from '@/infra/http/server'
import { CreatePixCashOutService } from './create-pix-cash-out.service'

export const createPixCashOut = (app: ElysiaApp) => app.post(
  '/pix/cash-out',
  async ({ body, set }) => {
    const {
      transactionId,
      amount,
      name,
      document,
      email,
      phone,
      publicKey,
      secretKey,
      webhookUrl,
      pixKey,
      pixKeyType,
    } = body

    const createPixCashOutService = new CreatePixCashOutService()

    await createPixCashOutService.execute({
      transactionId,
      amount,
      name,
      document,
      email,
      phone,
      publicKey,
      secretKey,
      webhookUrl,
      pixKey,
      pixKeyType,
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
      name: t.String(),
      document: t.String(),
      email: t.String(),
      phone: t.String(),
      publicKey: t.String(),
      secretKey: t.String(),
      webhookUrl: t.String({
        description: 'URL to receive webhook notifications',
      }),
      pixKey: t.String(),
      pixKeyType: t.Enum({
        CPF: 'CPF',
        CNPJ: 'CNPJ',
        EMAIL: 'EMAIL',
        PHONE: 'PHONE',
        EVP: 'EVP',
      }),
    }),
    detail: {
      tags: ['PIX'],
      summary: 'Create PIX cash-out',
      description: 'Create a new PIX cash-out transaction',
    },
  },
)
