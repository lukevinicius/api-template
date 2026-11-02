import { db, type Executor } from '@/config/database'
import { AppError } from '@/shared/utils/errors/AppError'
import { formatBRL } from '@/shared/utils/money'
import { auditsService } from '../audits/audits.service'
import type { Actor } from '../audits/audits.types'
import { chipsModel } from '../chips/chips.model'
import { assertInCirculation, chipLabel } from '../chips/chips.service'
import { clientsModel } from '../clients/clients.model'
import { exchangesModel } from './exchanges.model'
import type {
  Exchange,
  ExchangeDirection,
  ExchangeFilters,
  ExchangeItemPayload,
  ExchangePayload,
} from './exchanges.types'

interface StockItem {
  chipId: string
  direction: ExchangeDirection
  quantity: number
  unitPrice: number
}

/** Merges repeated chips, loads their values and checks both sides match. */
async function buildItems(tx: Executor, items: ExchangeItemPayload[]) {
  const quantities = new Map<
    string,
    { direction: ExchangeDirection; quantity: number }
  >()

  for (const item of items) {
    if (item.quantity <= 0) continue
    const current = quantities.get(item.chipId)

    if (current && current.direction !== item.direction) {
      throw new AppError(
        'A mesma ficha não pode ser entregue e recebida na mesma troca',
        400,
      )
    }

    quantities.set(item.chipId, {
      direction: item.direction,
      quantity: (current?.quantity ?? 0) + item.quantity,
    })
  }

  const chips = await chipsModel.getByIds([...quantities.keys()], tx)

  if (chips.length !== quantities.size) {
    throw new AppError('Uma das fichas da troca não foi encontrada', 404)
  }

  const built = chips.map((chip) => {
    const { direction, quantity } = quantities.get(chip.id) as {
      direction: ExchangeDirection
      quantity: number
    }
    return {
      chipId: chip.id,
      direction,
      quantity,
      unitPrice: chip.price,
      total: quantity * chip.price,
    }
  })

  const sum = (direction: ExchangeDirection) =>
    built
      .filter((item) => item.direction === direction)
      .reduce((total, item) => total + item.total, 0)
  const totalIn = sum('IN')
  const totalOut = sum('OUT')

  if (totalIn === 0 || totalOut === 0) {
    throw new AppError(
      'Informe as fichas entregues pelo cliente e as fichas que ele vai receber',
      400,
    )
  }

  if (totalIn !== totalOut) {
    throw new AppError(
      `Os valores da troca não conferem: o cliente entrega ${formatBRL(totalIn)} e recebe ${formatBRL(totalOut)}`,
      400,
    )
  }

  return { items: built, total: totalIn }
}

/**
 * Moves the chips between the client and the cashier. `revert` undoes a
 * previous exchange (used on update and cancel).
 */
async function moveStock(tx: Executor, items: StockItem[], revert = false) {
  for (const item of items) {
    const entersCashier = (item.direction === 'IN') !== revert

    if (entersCashier) {
      await chipsModel.addToStock(item.chipId, item.quantity, tx)
      continue
    }

    const taken = await chipsModel.removeFromStock(
      item.chipId,
      item.quantity,
      tx,
    )

    if (!taken) {
      const chip = await chipsModel.getById(item.chipId, tx)
      throw new AppError(
        `Fichas insuficientes no caixa para a ${chipLabel({ price: item.unitPrice })}. Disponível: ${chip?.quantity ?? 0} un.`,
        400,
      )
    }
  }
}

/**
 * Net units of each chip entering the cashier. The client can only hand over
 * chips that left the cashier, so they are checked against the circulation.
 */
async function assertEntering(
  tx: Executor,
  apply: StockItem[],
  revert: StockItem[] = [],
) {
  const entering = new Map<string, number>()
  const add = (items: StockItem[], sign: number) => {
    for (const item of items) {
      const direction = item.direction === 'IN' ? 1 : -1
      entering.set(
        item.chipId,
        (entering.get(item.chipId) ?? 0) + sign * direction * item.quantity,
      )
    }
  }

  add(apply, 1)
  add(revert, -1)

  await assertInCirculation(tx, entering)
}

function describe(items: StockItem[], direction: ExchangeDirection) {
  return items
    .filter((item) => item.direction === direction)
    .map((item) => `${item.quantity}x ${formatBRL(item.unitPrice)}`)
    .join(', ')
}

async function getClientName(tx: Executor, clientId?: string | null) {
  if (!clientId) return null

  const client = await clientsModel.getById(clientId, tx)

  if (!client) {
    throw new AppError('Cliente não encontrado', 404)
  }

  return client.name
}

async function getOrFail(exchangeId: string, executor: Executor = db) {
  const exchange = await exchangesModel.getById(exchangeId, executor)

  if (!exchange) {
    throw new AppError('Troca não encontrada', 404)
  }

  return exchange
}

async function lockDoneExchange(tx: Executor, exchangeId: string) {
  const exchange = await exchangesModel.lock(tx, exchangeId)

  if (!exchange) {
    throw new AppError('Troca não encontrada', 404)
  }

  if (exchange.status !== 'DONE') {
    throw new AppError('Esta troca já foi cancelada', 400)
  }

  return exchange
}

export const exchangesService = {
  fetch: async (filters: ExchangeFilters) => {
    return exchangesModel.fetch({
      ...filters,
      search: filters.search?.trim() || undefined,
    })
  },
  get: async (exchangeId: string): Promise<Exchange> => {
    return getOrFail(exchangeId)
  },
  create: async (payload: ExchangePayload, actor: Actor): Promise<Exchange> => {
    return db.transaction(async (tx) => {
      const clientName = await getClientName(tx, payload.clientId)
      const { items, total } = await buildItems(tx, payload.items)

      await assertEntering(tx, items)
      await moveStock(tx, items)

      const exchange = await exchangesModel.create(tx, {
        clientId: payload.clientId ?? null,
        createdById: actor.id,
        total,
        notes: payload.notes?.trim() || null,
      })

      if (!exchange) {
        throw new AppError('Não foi possível registrar a troca', 500)
      }

      await exchangesModel.replaceItems(tx, exchange.id, items)

      await auditsService.log(
        {
          actor,
          action: 'CREATE',
          entity: 'EXCHANGE',
          entityId: exchange.id,
          description: `Registrou a troca #${exchange.code}${clientName ? ` de ${clientName}` : ''}: recebeu ${describe(items, 'IN')} e entregou ${describe(items, 'OUT')} (${formatBRL(total)})`,
          metadata: { items, total },
        },
        tx,
      )

      return getOrFail(exchange.id, tx)
    })
  },
  update: async (
    exchangeId: string,
    payload: ExchangePayload,
    actor: Actor,
  ): Promise<Exchange> => {
    return db.transaction(async (tx) => {
      const exchange = await lockDoneExchange(tx, exchangeId)
      const previousItems = await exchangesModel.getItems(tx, exchangeId)
      await getClientName(tx, payload.clientId)

      const { items, total } = await buildItems(tx, payload.items)

      await assertEntering(tx, items, previousItems)

      // Undo the previous chip movement and apply the new one
      await moveStock(tx, previousItems, true)
      await moveStock(tx, items)
      await exchangesModel.replaceItems(tx, exchangeId, items)
      await exchangesModel.update(tx, exchangeId, {
        clientId: payload.clientId ?? null,
        notes: payload.notes?.trim() || null,
        total,
      })

      await auditsService.log(
        {
          actor,
          action: 'UPDATE',
          entity: 'EXCHANGE',
          entityId: exchangeId,
          description: `Editou a troca #${exchange.code}: recebeu ${describe(items, 'IN')} e entregou ${describe(items, 'OUT')} (${formatBRL(total)})`,
          metadata: { before: previousItems, items, total },
        },
        tx,
      )

      return getOrFail(exchangeId, tx)
    })
  },
  cancel: async (exchangeId: string, actor: Actor): Promise<Exchange> => {
    return db.transaction(async (tx) => {
      const exchange = await lockDoneExchange(tx, exchangeId)
      const items = await exchangesModel.getItems(tx, exchangeId)

      await assertEntering(tx, [], items)
      await moveStock(tx, items, true)
      await exchangesModel.update(tx, exchangeId, {
        status: 'CANCELED',
        canceledAt: new Date(),
        canceledById: actor.id,
      })

      await auditsService.log(
        {
          actor,
          action: 'CANCEL',
          entity: 'EXCHANGE',
          entityId: exchangeId,
          description: `Cancelou a troca #${exchange.code} e desfez a movimentação de fichas`,
        },
        tx,
      )

      return getOrFail(exchangeId, tx)
    })
  },
}
