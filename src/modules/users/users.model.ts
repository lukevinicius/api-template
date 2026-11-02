import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '@/config/database'
import { schema } from '@/database/schema'
import type {
  CreateUserPayload,
  UpdateUserPayload,
  User,
  UserCredentials,
} from './users.types'

const { users } = schema

const publicColumns = {
  id: users.id,
  name: users.name,
  username: users.username,
  role: users.role,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
}

const notDeleted = isNull(users.deletedAt)

export const usersModel = {
  create: async (payload: CreateUserPayload): Promise<User> => {
    const [user] = await db
      .insert(users)
      .values(payload)
      .returning(publicColumns)

    return user as User
  },
  getCredentialsByUsername: async (
    username: string,
  ): Promise<UserCredentials | null> => {
    const [user] = await db
      .select({ ...publicColumns, password: users.password })
      .from(users)
      .where(and(eq(users.username, username), notDeleted))

    return user ?? null
  },
  getByUsername: async (username: string): Promise<User | null> => {
    const [user] = await db
      .select(publicColumns)
      .from(users)
      .where(and(eq(users.username, username), notDeleted))

    return user ?? null
  },
  getById: async (userId: string): Promise<User | null> => {
    const [user] = await db
      .select(publicColumns)
      .from(users)
      .where(and(eq(users.id, userId), notDeleted))

    return user ?? null
  },
  fetch: async (): Promise<User[]> => {
    return db
      .select(publicColumns)
      .from(users)
      .where(notDeleted)
      .orderBy(asc(users.name))
  },
  update: async (userId: string, payload: UpdateUserPayload) => {
    const [user] = await db
      .update(users)
      .set(payload)
      .where(eq(users.id, userId))
      .returning(publicColumns)

    return user
  },
  updatePassword: async (userId: string, password: string) => {
    await db.update(users).set({ password }).where(eq(users.id, userId))
  },
  softDelete: async (userId: string) => {
    // Frees the username so it can be reused by a new user
    await db
      .update(users)
      .set({ deletedAt: new Date(), username: `deleted:${userId}` })
      .where(eq(users.id, userId))
  },
}
