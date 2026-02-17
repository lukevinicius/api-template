import openapi from '@elysiajs/openapi'
import { opentelemetry } from '@elysiajs/opentelemetry'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import * as Sentry from '@sentry/bun'
import { logger } from '@tqman/nice-logger'
import { env } from '@/shared/env'
import type { ElysiaApp } from './server'

Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: env.NODE_ENV,
  ignoreErrors: ['ZodError', 'VALIDATION', 'NOT_FOUND', 'PARSE'],
  enabled: env.NODE_ENV !== 'development',
  tracesSampleRate: 1.0,
})

export const plugins = (app: ElysiaApp) =>
  app
    .use(
      logger({
        mode: 'live', // "live" or "combined" (default: "combined")
        withTimestamp: true, // optional (default: false)
        enabled: true,
        withBanner: true,
      }),
    )
    .use(
      opentelemetry({
        instrumentations: [new PgInstrumentation()],
        serviceName: 'api',
        spanProcessors: [
          new BatchSpanProcessor(
            new OTLPTraceExporter({
              url: 'http://localhost:4318/v1/traces',
            }),
          ),
        ],
      }),
    )
    .use(openapi({
      path: '/docs',
      documentation: {
        info: {
          title: 'API Template',
          description: 'API documentation for API Template microservice',
          version: '1.0.0',
          // description: "## 🔐 Autenticação por Hash (HMAC)\n\nEsta API utiliza autenticação baseada em **HMAC com SHA-256** para garantir a integridade e autenticidade das requisições.\n\nO cliente deve gerar um hash utilizando o **body bruto (raw)** da requisição e uma **chave secreta compartilhada**.\n\n---\n### 📌 Como funciona\n\n1. Monte o body da requisição em JSON.\n2. Serialize o JSON **exatamente como será enviado**.\n3. Utilize o conteúdo bruto do body como mensagem para o hash.\n4. Gere o hash usando:\n   - Algoritmo: `HMAC-SHA256`\n   - Chave: `Secret Key`\n5. Codifique o resultado em **Base64**.\n6. Envie o hash no header `X-Signature`.\n\n---\n### ⚠️ Regras importantes\n\n- O hash deve ser gerado **antes** do envio da requisição.\n- Qualquer alteração no body invalida o hash.\n- Não reordene ou formate o JSON após gerar o hash.\n- Nunca exponha a `Secret Key` no frontend.\n\n---\n### ❌ Erros comuns\n\n| Erro | Motivo |\n|------|--------|\n| Invalid signature | Body diferente do utilizado na geração do hash |\n| Invalid signature | Secret Key inválida |\n| Invalid signature | Hash mal formatado (Base64 inválido) |",
        },
        components: {
          securitySchemes: {
            "x-api-signature": {
              type: 'apiKey',
              in: 'header',
              name: 'x-api-signature',
              description: 'x-api-signature to validate the request needs to be provided in the `x-api-signature` header',
            },
          }
        },
        servers: [
          {
            url: 'http://localhost:3333',
            description: 'Development server',
          },
          {
            url: 'https://payments.guaruba.dev',
            description: 'Production server',
          },
        ],
      },
    }))
