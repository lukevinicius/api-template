import { formatBRL, formatRate } from '@/shared/utils/money'
import { auditsService } from '../audits/audits.service'
import type { Actor } from '../audits/audits.types'
import { settingsModel } from './settings.model'
import type { Settings, UpdateSettingsPayload } from './settings.types'

export const settingsService = {
  get: async (): Promise<Settings> => {
    return settingsModel.get()
  },
  update: async (
    payload: UpdateSettingsPayload,
    actor: Actor,
  ): Promise<Settings> => {
    const before = await settingsModel.get()
    const updated = await settingsModel.update({
      ...payload,
      updatedById: actor.id,
    })

    const changes: string[] = []

    if (payload.feeRate !== undefined && payload.feeRate !== before.feeRate) {
      changes.push(
        `taxa operacional de ${formatRate(before.feeRate)} para ${formatRate(payload.feeRate)}`,
      )
    }

    if (
      payload.chipLimit !== undefined &&
      payload.chipLimit !== before.chipLimit
    ) {
      changes.push(
        `limite de fichas padrão de ${formatBRL(before.chipLimit)} para ${formatBRL(payload.chipLimit)}`,
      )
    }

    if (changes.length > 0) {
      await auditsService.log({
        actor,
        action: 'UPDATE',
        entity: 'SETTINGS',
        description: `Alterou ${changes.join(' e ')}`,
        metadata: { before, changes: payload },
      })
    }

    return updated
  },
}
