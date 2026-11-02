import { eq } from 'drizzle-orm'
import { db, type Executor } from '@/config/database'
import { schema } from '@/database/schema'
import type { Settings, UpdateSettingsPayload } from './settings.types'

const { settings } = schema

const SETTINGS_ID = 1

const columns = {
  feeRate: settings.feeRate,
  chipLimit: settings.chipLimit,
  updatedAt: settings.updatedAt,
}

export const settingsModel = {
  /** Returns the settings row, creating it with the defaults on first use. */
  get: async (executor: Executor = db): Promise<Settings> => {
    const [current] = await executor
      .select(columns)
      .from(settings)
      .where(eq(settings.id, SETTINGS_ID))

    if (current) {
      return current
    }

    await executor
      .insert(settings)
      .values({ id: SETTINGS_ID })
      .onConflictDoNothing()

    const [created] = await executor
      .select(columns)
      .from(settings)
      .where(eq(settings.id, SETTINGS_ID))

    return created as Settings
  },
  update: async (
    payload: UpdateSettingsPayload & { updatedById: string },
  ): Promise<Settings> => {
    await settingsModel.get()

    const [updated] = await db
      .update(settings)
      .set(payload)
      .where(eq(settings.id, SETTINGS_ID))
      .returning(columns)

    return updated as Settings
  },
}
