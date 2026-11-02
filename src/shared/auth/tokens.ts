import { createHash, randomBytes } from 'node:crypto'
import { createId } from '@paralleldrive/cuid2'
import { jwtVerify, SignJWT } from 'jose'
import { env } from '@/config/env'
import type { UserRole } from './roles'

export interface AuthUser {
  id: string
  name: string
  role: UserRole
}

const secret = new TextEncoder().encode(env.JWT_SECRET)

export async function signAccessToken(user: AuthUser): Promise<string> {
  return new SignJWT({ name: user.name, role: user.role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setJti(createId())
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret)
}

export async function verifyAccessToken(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ['HS256'],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  })

  if (!payload.sub || typeof payload.role !== 'string') {
    throw new Error('Invalid token payload')
  }

  return {
    id: payload.sub,
    name: String(payload.name ?? ''),
    role: payload.role as UserRole,
  }
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
