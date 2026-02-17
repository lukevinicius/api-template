import { AppError } from '@/domain/errors/AppError'
import { env } from '@/shared/env'
import { generateSignature } from './generate-signature'

export function validateSignature(request: Request): void {
  const signature = request.headers.get('x-api-signature')

  if (!signature) {
    throw new AppError('Missing signature headers', 401)
  }

  const payload = `${env.BACKEND_PUBLIC_KEY}.${env.BACKEND_SECRET_KEY}`

  const expected = generateSignature(payload)

  const valid = Bun.deepEquals(Buffer.from(expected), Buffer.from(signature))

  if (!valid) {
    throw new AppError('Invalid signature', 401)
  }
}
