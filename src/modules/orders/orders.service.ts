import { db, type Executor, type Transaction } from '@/config/database'
import { AppError } from '@/shared/utils/errors/AppError'
import { formatBRL, formatRate } from '@/shared/utils/money'
import { auditsService } from '../audits/audits.service'
import type { Actor } from '../audits/audits.types'
import { chipsModel } from '../chips/chips.model'
import { assertInCirculation, chipLabel } from '../chips/chips.service'
import { clientsModel } from '../clients/clients.model'
import { settingsModel } from '../settings/settings.model'
import { ordersModel } from './orders.model'
import { calculateSettlement } from './orders.settlement'
import type {
  AddItemPayload,
  ClosePayload,
  CloseResult,
  CreateOrderPayload,
  CreateOrderResult,
  MoneyMethod,
  OrderDetails,
  OrderFilters,
  PaymentPayload,
  PaymentResult,
  UpdateOrderPayload,
} from './orders.types'

type LockedOrder = NonNullable<Awaited<ReturnType<typeof ordersModel.lock>>>

const statusLabel = {
  OPEN: 'aberta',
  CLOSED: 'finalizada',
  CANCELED: 'cancelada',
}
const methodLabel = { PIX: 'PIX', CASH: 'dinheiro', CHIPS: 'fichas' }

async function lockOpenOrder(tx: Executor, orderId: string) {
  const order = await ordersModel.lock(tx, orderId)

  if (!order) {
    throw new AppError('Comanda não encontrada', 404)
  }

  if (order.status !== 'OPEN') {
    throw new AppError(`Esta comanda já está ${statusLabel[order.status]}`, 400)
  }

  return order
}

/**
 * The client can owe up to his chip limit across all open orders. Paying
 * (advances or closing) frees the limit again.
 */
async function assertWithinLimit(
  tx: Executor,
  clientId: string,
  additional: number,
) {
  const client = await clientsModel.lock(tx, clientId)

  if (!client) {
    throw new AppError('Cliente não encontrado', 404)
  }

  const openAmount = await clientsModel.getOpenAmount(clientId, tx)
  const available = client.chipLimit - openAmount

  if (additional > available) {
    throw new AppError(
      `Limite de fichas de ${client.name} excedido. Limite: ${formatBRL(client.chipLimit)}, em aberto: ${formatBRL(openAmount)}, disponível: ${formatBRL(Math.max(available, 0))}`,
      400,
    )
  }
}

/** Recomputes the total from the items, keeping the order consistent. */
async function recalculate(tx: Executor, order: LockedOrder) {
  const total = await ordersModel.sumItems(tx, order.id)

  if (total < order.paidAmount) {
    throw new AppError(
      `O total da comanda não pode ficar menor que o valor já pago (${formatBRL(order.paidAmount)})`,
      400,
    )
  }

  await ordersModel.update(tx, order.id, { total })
}

async function getDetailsOrFail(orderId: string, executor: Executor = db) {
  const order = await ordersModel.getDetails(orderId, executor)

  if (!order) {
    throw new AppError('Comanda não encontrada', 404)
  }

  return order
}

async function getChipOrFail(tx: Executor, chipId: string) {
  const chip = await chipsModel.getById(chipId, tx)

  if (!chip) {
    throw new AppError('Ficha não encontrada', 404)
  }

  return chip
}

function buildPayment(
  method: MoneyMethod,
  amount: number,
  receivedAmount?: number,
) {
  if (method === 'PIX') {
    return { amount, receivedAmount: amount, changeAmount: 0 }
  }

  const received = receivedAmount ?? amount

  if (received < amount) {
    throw new AppError(
      `Valor recebido (${formatBRL(received)}) é menor que o valor a pagar (${formatBRL(amount)})`,
      400,
    )
  }

  return { amount, receivedAmount: received, changeAmount: received - amount }
}

async function registerPayment(
  tx: Transaction,
  order: LockedOrder,
  actor: Actor,
  payment: ReturnType<typeof buildPayment> & {
    method: keyof typeof methodLabel
  },
) {
  await ordersModel.insertPayment(tx, {
    orderId: order.id,
    receivedById: actor.id,
    ...payment,
  })

  const paidAmount = order.paidAmount + payment.amount

  await ordersModel.update(tx, order.id, { paidAmount })

  await auditsService.log(
    {
      actor,
      action: 'PAYMENT',
      entity: 'ORDER',
      entityId: order.id,
      description: `Recebeu ${formatBRL(payment.amount)} em ${methodLabel[payment.method]} na comanda #${order.code}${payment.changeAmount ? ` (troco ${formatBRL(payment.changeAmount)})` : ''}`,
      metadata: { ...payment, paidAmount, total: order.total },
    },
    tx,
  )

  return paidAmount
}

/** Groups repeated chips and loads their current value. */
async function loadReturnedChips(
  tx: Executor,
  returned: NonNullable<ClosePayload['returnedChips']>,
) {
  const quantities = new Map<string, number>()

  for (const item of returned) {
    if (item.quantity <= 0) continue
    quantities.set(
      item.chipId,
      (quantities.get(item.chipId) ?? 0) + item.quantity,
    )
  }

  const chips = await chipsModel.getByIds([...quantities.keys()], tx)

  if (chips.length !== quantities.size) {
    throw new AppError('Uma das fichas devolvidas não foi encontrada', 404)
  }

  return chips.map((chip) => {
    const quantity = quantities.get(chip.id) ?? 0
    return { chip, quantity, total: quantity * chip.price }
  })
}

export const ordersService = {
  fetch: async (filters: OrderFilters) => {
    return ordersModel.fetch({
      ...filters,
      search: filters.search?.trim() || undefined,
    })
  },
  get: async (orderId: string): Promise<OrderDetails> => {
    return getDetailsOrFail(orderId)
  },
  /** Opens an order, or returns the client's order that is already open. */
  create: async (
    payload: CreateOrderPayload,
    actor: Actor,
  ): Promise<CreateOrderResult> => {
    return db.transaction(async (tx) => {
      // The lock serializes concurrent openings for the same client
      const client = await clientsModel.lock(tx, payload.clientId)

      if (!client) {
        throw new AppError('Cliente não encontrado', 404)
      }

      const openOrder = await ordersModel.getOpenByClient(tx, client.id)

      if (openOrder) {
        return {
          ...(await getDetailsOrFail(openOrder.id, tx)),
          alreadyOpen: true,
        }
      }

      const order = await ordersModel.create(tx, {
        clientId: client.id,
        openedById: actor.id,
        notes: payload.notes?.trim() || null,
      })

      if (!order) {
        throw new AppError('Não foi possível abrir a comanda', 500)
      }

      await auditsService.log(
        {
          actor,
          action: 'CREATE',
          entity: 'ORDER',
          entityId: order.id,
          description: `Abriu a comanda #${order.code} para ${client.name}`,
          metadata: { clientId: client.id },
        },
        tx,
      )

      return { ...(await getDetailsOrFail(order.id, tx)), alreadyOpen: false }
    })
  },
  update: async (
    orderId: string,
    payload: UpdateOrderPayload,
    actor: Actor,
  ): Promise<OrderDetails> => {
    return db.transaction(async (tx) => {
      const order = await lockOpenOrder(tx, orderId)
      const changes: string[] = []

      if (payload.clientId && payload.clientId !== order.clientId) {
        const [client, previous] = await Promise.all([
          clientsModel.getById(payload.clientId, tx),
          clientsModel.getById(order.clientId, tx),
        ])

        if (!client) {
          throw new AppError('Cliente não encontrado', 404)
        }

        // The debt of this order moves to the new client
        await assertWithinLimit(tx, client.id, order.total - order.paidAmount)

        const openOrder = await ordersModel.getOpenByClient(tx, client.id)

        if (openOrder) {
          throw new AppError(
            `${client.name} já possui a comanda #${openOrder.code} aberta`,
            400,
          )
        }

        await ordersModel.update(tx, orderId, { clientId: client.id })
        changes.push(
          `trocou o cliente de ${previous?.name ?? 'cliente removido'} para ${client.name}`,
        )
      }

      const notes =
        payload.notes === undefined ? undefined : payload.notes?.trim() || null

      if (notes !== undefined && notes !== order.notes) {
        await ordersModel.update(tx, orderId, { notes })
        changes.push(
          notes
            ? `alterou as observações para "${notes}"`
            : 'removeu as observações',
        )
      }

      if (changes.length > 0) {
        await auditsService.log(
          {
            actor,
            action: 'UPDATE',
            entity: 'ORDER',
            entityId: orderId,
            description: `Na comanda #${order.code}, ${changes.join(', ')}`,
            metadata: {
              before: { clientId: order.clientId, notes: order.notes },
              changes: payload,
            },
          },
          tx,
        )
      }

      return getDetailsOrFail(orderId, tx)
    })
  },
  history: async (orderId: string) => {
    await getDetailsOrFail(orderId)

    const { items } = await auditsService.fetch({
      entity: 'ORDER',
      entityId: orderId,
      page: 1,
      pageSize: 500,
    })

    // Oldest first: the story of the order since it was opened
    return items.reverse().map((entry) => ({
      id: entry.id,
      action: entry.action,
      description: entry.description,
      userName: entry.userName,
      createdAt: entry.createdAt,
    }))
  },
  /** Sells chips to the client on credit. */
  addItem: async (
    orderId: string,
    payload: AddItemPayload,
    actor: Actor,
  ): Promise<OrderDetails> => {
    return db.transaction(async (tx) => {
      const order = await lockOpenOrder(tx, orderId)
      const chip = await getChipOrFail(tx, payload.chipId)
      const value = payload.quantity * chip.price

      await assertWithinLimit(tx, order.clientId, value)

      const taken = await chipsModel.removeFromStock(
        chip.id,
        payload.quantity,
        tx,
      )

      if (!taken) {
        throw new AppError(
          `Fichas insuficientes no caixa para a ${chipLabel(chip)}. Disponível: ${chip.quantity} un.`,
          400,
        )
      }

      const items = await ordersModel.getItems(tx, orderId)
      // Same chip at the same value is merged in one line
      const sameItem = items.find(
        (item) => item.chipId === chip.id && item.unitPrice === chip.price,
      )

      if (sameItem) {
        const quantity = sameItem.quantity + payload.quantity

        await ordersModel.updateItem(tx, sameItem.id, {
          quantity,
          total: quantity * sameItem.unitPrice,
        })
      } else {
        await ordersModel.insertItem(tx, {
          orderId,
          chipId: chip.id,
          addedById: actor.id,
          quantity: payload.quantity,
          unitPrice: chip.price,
          total: value,
        })
      }

      await recalculate(tx, order)

      await auditsService.log(
        {
          actor,
          action: 'ITEM_ADD',
          entity: 'ORDER',
          entityId: orderId,
          description: `Vendeu ${payload.quantity}x ${chipLabel(chip)} (${formatBRL(value)}) na comanda #${order.code}`,
          metadata: {
            chipId: chip.id,
            quantity: payload.quantity,
            unitPrice: chip.price,
          },
        },
        tx,
      )

      return getDetailsOrFail(orderId, tx)
    })
  },
  updateItem: async (
    orderId: string,
    itemId: string,
    quantity: number,
    actor: Actor,
  ): Promise<OrderDetails> => {
    return db.transaction(async (tx) => {
      const order = await lockOpenOrder(tx, orderId)
      const item = await ordersModel.getItem(tx, orderId, itemId)

      if (!item) {
        throw new AppError('Ficha não encontrada nesta comanda', 404)
      }

      const difference = quantity - item.quantity
      const label = chipLabel({ price: item.unitPrice })

      if (difference > 0) {
        await assertWithinLimit(tx, order.clientId, difference * item.unitPrice)

        const taken = await chipsModel.removeFromStock(
          item.chipId,
          difference,
          tx,
        )

        if (!taken) {
          const chip = await chipsModel.getById(item.chipId, tx)
          throw new AppError(
            `Fichas insuficientes no caixa para a ${label}. Disponível: ${chip?.quantity ?? 0} un.`,
            400,
          )
        }
      } else if (difference < 0) {
        await assertInCirculation(tx, new Map([[item.chipId, -difference]]))
        await chipsModel.addToStock(item.chipId, -difference, tx)
      }

      await ordersModel.updateItem(tx, itemId, {
        quantity,
        total: quantity * item.unitPrice,
      })

      await recalculate(tx, order)

      await auditsService.log(
        {
          actor,
          action: 'ITEM_UPDATE',
          entity: 'ORDER',
          entityId: orderId,
          description: `Alterou a ${label} de ${item.quantity} para ${quantity} un. na comanda #${order.code}`,
          metadata: { itemId, before: item.quantity, after: quantity },
        },
        tx,
      )

      return getDetailsOrFail(orderId, tx)
    })
  },
  removeItem: async (
    orderId: string,
    itemId: string,
    actor: Actor,
  ): Promise<OrderDetails> => {
    return db.transaction(async (tx) => {
      const order = await lockOpenOrder(tx, orderId)
      const item = await ordersModel.getItem(tx, orderId, itemId)

      if (!item) {
        throw new AppError('Ficha não encontrada nesta comanda', 404)
      }

      await assertInCirculation(tx, new Map([[item.chipId, item.quantity]]))
      await chipsModel.addToStock(item.chipId, item.quantity, tx)
      await ordersModel.deleteItem(tx, itemId)
      await recalculate(tx, order)

      await auditsService.log(
        {
          actor,
          action: 'ITEM_REMOVE',
          entity: 'ORDER',
          entityId: orderId,
          description: `Removeu ${item.quantity}x ${chipLabel({ price: item.unitPrice })} da comanda #${order.code}`,
          metadata: {
            itemId,
            chipId: item.chipId,
            quantity: item.quantity,
          },
        },
        tx,
      )

      return getDetailsOrFail(orderId, tx)
    })
  },
  /** Advance payment (adiantamento) without closing the order. */
  addPayment: async (
    orderId: string,
    payload: PaymentPayload,
    actor: Actor,
  ): Promise<PaymentResult> => {
    return db.transaction(async (tx) => {
      const order = await lockOpenOrder(tx, orderId)
      const openAmount = order.total - order.paidAmount

      if (openAmount <= 0) {
        throw new AppError('Esta comanda não possui valor em aberto', 400)
      }

      if (payload.amount > openAmount) {
        throw new AppError(
          `O pagamento não pode ser maior que o valor em aberto (${formatBRL(openAmount)})`,
          400,
        )
      }

      const payment = buildPayment(
        payload.method,
        payload.amount,
        payload.receivedAmount,
      )

      await registerPayment(tx, order, actor, {
        ...payment,
        method: payload.method,
      })

      return {
        order: await getDetailsOrFail(orderId, tx),
        changeAmount: payment.changeAmount,
      }
    })
  },
  /**
   * Closes the order: the client returns his chips, the operation fee is
   * charged on them, the net value pays the debt and the rest is paid back.
   */
  close: async (
    orderId: string,
    payload: ClosePayload,
    actor: Actor,
  ): Promise<CloseResult> => {
    return db.transaction(async (tx) => {
      const order = await lockOpenOrder(tx, orderId)
      const client = await clientsModel.getById(order.clientId, tx)
      const { feeRate } = await settingsModel.get(tx)
      const returned = await loadReturnedChips(tx, payload.returnedChips ?? [])
      const returnedAmount = returned.reduce((sum, item) => sum + item.total, 0)

      if (order.total === 0 && returnedAmount === 0) {
        throw new AppError(
          'A comanda não possui fichas vendidas nem devolvidas. Cancele-a em vez de finalizar',
          400,
        )
      }

      // Only chips that left the cashier can be returned, per chip value
      await assertInCirculation(
        tx,
        new Map(returned.map((item) => [item.chip.id, item.quantity])),
      )

      const settlement = calculateSettlement({
        total: order.total,
        paidAmount: order.paidAmount,
        returnedAmount,
        feeRate,
      })

      if (settlement.remainingDebt > 0 && !payload.payment) {
        throw new AppError(
          `As fichas devolvidas não cobrem a dívida. Informe o pagamento de ${formatBRL(settlement.remainingDebt)}`,
          400,
        )
      }

      if (settlement.payoutAmount > 0 && !payload.payoutMethod) {
        throw new AppError(
          `Informe como o repasse de ${formatBRL(settlement.payoutAmount)} será feito ao cliente`,
          400,
        )
      }

      if (
        settlement.payoutAmount > 0 &&
        payload.payoutMethod === 'PIX' &&
        !client?.pixKey
      ) {
        throw new AppError(
          'O cliente não possui chave PIX cadastrada. Cadastre-a ou faça o repasse em dinheiro',
          400,
        )
      }

      // Returned chips go back to the cashier
      for (const item of returned) {
        await chipsModel.addToStock(item.chip.id, item.quantity, tx)
      }

      await ordersModel.insertReturns(
        tx,
        returned.map((item) => ({
          orderId,
          chipId: item.chip.id,
          receivedById: actor.id,
          quantity: item.quantity,
          unitPrice: item.chip.price,
          total: item.total,
        })),
      )

      if (returnedAmount > 0) {
        await auditsService.log(
          {
            actor,
            action: 'CHIP_RETURN',
            entity: 'ORDER',
            entityId: orderId,
            description: `Recebeu ${formatBRL(returnedAmount)} em fichas devolvidas na comanda #${order.code} (taxa de ${formatRate(feeRate)}: ${formatBRL(settlement.feeAmount)})`,
            metadata: {
              chips: returned.map((item) => ({
                chipId: item.chip.id,
                price: item.chip.price,
                quantity: item.quantity,
              })),
              feeRate,
              ...settlement,
            },
          },
          tx,
        )
      }

      let current = { ...order }
      let changeAmount = 0

      if (settlement.chipsApplied > 0) {
        current.paidAmount = await registerPayment(tx, current, actor, {
          method: 'CHIPS',
          amount: settlement.chipsApplied,
          receivedAmount: settlement.chipsApplied,
          changeAmount: 0,
        })
      }

      if (settlement.remainingDebt > 0 && payload.payment) {
        const payment = buildPayment(
          payload.payment.method,
          settlement.remainingDebt,
          payload.payment.receivedAmount,
        )

        current = {
          ...current,
          paidAmount: await registerPayment(tx, current, actor, {
            ...payment,
            method: payload.payment.method,
          }),
        }
        changeAmount = payment.changeAmount
      }

      const payoutMethod =
        settlement.payoutAmount > 0 ? (payload.payoutMethod ?? null) : null

      if (settlement.payoutAmount > 0) {
        await auditsService.log(
          {
            actor,
            action: 'PAYOUT',
            entity: 'ORDER',
            entityId: orderId,
            description: `Repassou ${formatBRL(settlement.payoutAmount)} em ${payoutMethod === 'PIX' ? 'PIX' : 'dinheiro'} para ${client?.name ?? 'o cliente'} na comanda #${order.code}`,
            metadata: {
              payoutAmount: settlement.payoutAmount,
              payoutMethod,
              pixKey: payoutMethod === 'PIX' ? client?.pixKey : undefined,
            },
          },
          tx,
        )
      }

      await ordersModel.update(tx, orderId, {
        status: 'CLOSED',
        returnedAmount,
        feeRate,
        feeAmount: settlement.feeAmount,
        payoutAmount: settlement.payoutAmount,
        payoutMethod,
        closedAt: new Date(),
        closedById: actor.id,
      })

      await auditsService.log(
        {
          actor,
          action: 'CLOSE',
          entity: 'ORDER',
          entityId: orderId,
          description: `Finalizou a comanda #${order.code}: ${formatBRL(order.total)} em fichas vendidas, ${formatBRL(returnedAmount)} devolvidas e ${formatBRL(settlement.payoutAmount)} repassados`,
          metadata: { total: order.total, returnedAmount, ...settlement },
        },
        tx,
      )

      return {
        order: await getDetailsOrFail(orderId, tx),
        changeAmount,
        settlement,
      }
    })
  },
  cancel: async (orderId: string, actor: Actor): Promise<OrderDetails> => {
    return db.transaction(async (tx) => {
      const order = await lockOpenOrder(tx, orderId)

      if (order.paidAmount > 0) {
        throw new AppError(
          `Esta comanda já recebeu ${formatBRL(order.paidAmount)} em pagamentos e não pode ser cancelada`,
          400,
        )
      }

      const items = await ordersModel.getItems(tx, orderId)
      const entering = new Map<string, number>()

      for (const item of items) {
        entering.set(
          item.chipId,
          (entering.get(item.chipId) ?? 0) + item.quantity,
        )
      }

      await assertInCirculation(tx, entering)

      for (const item of items) {
        await chipsModel.addToStock(item.chipId, item.quantity, tx)
      }

      await ordersModel.update(tx, orderId, {
        status: 'CANCELED',
        closedAt: new Date(),
        closedById: actor.id,
      })

      await auditsService.log(
        {
          actor,
          action: 'CANCEL',
          entity: 'ORDER',
          entityId: orderId,
          description: `Cancelou a comanda #${order.code}`,
          metadata: { chipsReturnedToCashier: items.length },
        },
        tx,
      )

      return getDetailsOrFail(orderId, tx)
    })
  },
}
