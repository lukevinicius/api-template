import type { Executor } from '@/config/database'
import { AppError } from '@/shared/utils/errors/AppError'
import { formatBRL } from '@/shared/utils/money'
import { auditsService } from '../audits/audits.service'
import type { Actor } from '../audits/audits.types'
import { chipsModel } from './chips.model'
import type {
  Chip,
  CreateChipPayload,
  StockOperation,
  UpdateChipPayload,
} from './chips.types'

export const chipLabel = (chip: Pick<Chip, 'price'>) =>
  `ficha de ${formatBRL(chip.price)}`

async function assertPriceAvailable(price: number, chipId?: string) {
  const existing = await chipsModel.getByPrice(price)

  if (existing && existing.id !== chipId) {
    throw new AppError(`Já existe uma ficha de ${formatBRL(price)}`, 409)
  }
}

/**
 * Chips can only enter the cashier (returns, exchanges, cancellations) if
 * they left it before: the event starts and ends with the same chips, so an
 * extra chip is a sign of fraud. `entering` is the net units per chip id.
 * Locks the chips, so concurrent movements of them wait for this transaction.
 */
export async function assertInCirculation(
  tx: Executor,
  entering: Map<string, number>,
) {
  const chipIds = [...entering]
    .filter(([, quantity]) => quantity > 0)
    .map(([chipId]) => chipId)

  if (chipIds.length === 0) return

  const chips = await chipsModel.lockMany(chipIds, tx)
  const circulation = await chipsModel.getCirculation(chipIds, tx)

  for (const chip of chips) {
    const quantity = entering.get(chip.id) ?? 0
    const available = Math.max(circulation.get(chip.id) ?? 0, 0)

    if (quantity > available) {
      throw new AppError(
        `Entrada de ${quantity} un. da ${chipLabel(chip)} recusada: só ${available} un. saíram do caixa. Confira as fichas recebidas`,
        400,
      )
    }
  }
}

export const chipsService = {
  create: async (payload: CreateChipPayload, actor: Actor): Promise<Chip> => {
    await assertPriceAvailable(payload.price)

    const chip = await chipsModel.create(payload)

    await auditsService.log({
      actor,
      action: 'CREATE',
      entity: 'CHIP',
      entityId: chip.id,
      description: `Cadastrou a ${chipLabel(chip)} com ${chip.quantity} un. no caixa`,
      metadata: { price: chip.price, quantity: chip.quantity },
    })

    return chip
  },
  fetch: async (): Promise<Chip[]> => {
    return chipsModel.fetch()
  },
  get: async (chipId: string): Promise<Chip> => {
    const chip = await chipsModel.getById(chipId)

    if (!chip) {
      throw new AppError('Ficha não encontrada', 404)
    }

    return chip
  },
  update: async (
    chipId: string,
    payload: UpdateChipPayload,
    actor: Actor,
  ): Promise<Chip> => {
    const chip = await chipsService.get(chipId)

    if (payload.price !== undefined && payload.price !== chip.price) {
      await assertPriceAvailable(payload.price, chipId)
    }

    const updated = await chipsModel.update(chipId, payload)

    await auditsService.log({
      actor,
      action: 'UPDATE',
      entity: 'CHIP',
      entityId: chipId,
      description:
        payload.price !== undefined && payload.price !== chip.price
          ? `Alterou o valor da ${chipLabel(chip)} para ${formatBRL(payload.price)}`
          : `Editou a ${chipLabel(chip)}`,
      metadata: { before: chip, changes: payload },
    })

    return updated
  },
  updateStock: async (
    chipId: string,
    payload: { operation: StockOperation; quantity: number },
    actor: Actor,
  ): Promise<Chip> => {
    const chip = await chipsService.get(chipId)

    const updated =
      payload.operation === 'add'
        ? await chipsModel.addToStock(chipId, payload.quantity)
        : await chipsModel.removeFromStock(chipId, payload.quantity)

    if (!updated) {
      throw new AppError(
        `Fichas insuficientes no caixa. Disponível: ${chip.quantity} un.`,
        400,
      )
    }

    await auditsService.log({
      actor,
      action: payload.operation === 'add' ? 'STOCK_ADD' : 'STOCK_REMOVE',
      entity: 'CHIP',
      entityId: chipId,
      description: `${payload.operation === 'add' ? 'Adicionou' : 'Removeu'} ${payload.quantity} un. da ${chipLabel(chip)} no caixa`,
      metadata: {
        quantity: payload.quantity,
        before: chip.quantity,
        after: updated.quantity,
      },
    })

    return updated
  },
  delete: async (chipId: string, actor: Actor): Promise<void> => {
    const chip = await chipsService.get(chipId)

    await chipsModel.softDelete(chipId)

    await auditsService.log({
      actor,
      action: 'DELETE',
      entity: 'CHIP',
      entityId: chipId,
      description: `Excluiu a ${chipLabel(chip)}`,
    })
  },
}
