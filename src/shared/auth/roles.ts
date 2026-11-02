export const UserRole = {
  ADMIN: 'ADMIN',
  SELLER: 'SELLER',
} as const

export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export const ADMIN_ROLES: UserRole[] = [UserRole.ADMIN]
export const STAFF_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.SELLER]

export const isAdmin = (role: UserRole) => ADMIN_ROLES.includes(role)
