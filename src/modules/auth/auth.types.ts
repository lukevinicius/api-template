import type { User } from '../users/users.types'

export interface SignInPayload {
  username: string
  password: string
}

export interface SessionMeta {
  ip: string | null
  userAgent: string | null
}

export interface AuthResponse {
  accessToken: string
  accessTokenExpiresIn: number // seconds
  refreshToken: string
  refreshTokenExpiresAt: Date
  user: User
}
