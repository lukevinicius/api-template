import { opentelemetry } from '@elysiajs/opentelemetry'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'

export const tracing = opentelemetry({
  instrumentations: [new PgInstrumentation()],
  serviceName: 'incon-api',
  spanProcessors: [
    new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: 'http://localhost:4318/v1/traces',
      }),
    ),
  ],
})
