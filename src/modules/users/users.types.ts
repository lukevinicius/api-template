import type { UserRole } from '@/shared/auth/roles'

export interface CreateUserPayload {
  name: string
  username: string
  password: string
  role: UserRole
}

export interface UpdateUserPayload {
  name?: string
  username?: string
  role?: UserRole
}

export interface User {
  id: string
  name: string
  username: string
  role: UserRole
  createdAt: Date
  updatedAt: Date
}

export interface UserCredentials extends User {
  password: string
}
