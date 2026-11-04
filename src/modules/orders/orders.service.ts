import { db, type Executor, type Transaction } from '@/config/database'
import { AppError } from '@/shared/utils/errors/AppError'
import { formatBRL, formatRate } from '@/shared/utils/money'
import { auditsService } from '../audits/audits.service'
import type { Actor } from '../audits/audits.types'
import { cashMovementsModel } from '../cash-closings/cash-closings.model'
import { chipsModel } from '../chips/chips.model'
import { assertInCirculation, chipLabel } from '../chips/chips.service'
import { clientsModel } from '../clients/clients.model'
import type { Client } from '../clients/clients.types'
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
  PaymentPart,
  PaymentPayload,
  PaymentResult,
  PayoutMethod,
  PayoutPart,
  SettlePayload,
  UpdateOrderPayload,
} from './orders.types'

type LockedOrder = NonNullable<Awaited<ReturnType<typeof ordersModel.lock>>>

const statusLabel = {
  OPEN: 'aberta',
  CLOSED: 'finalizada',
  CANCELED: 'cancelada',
  AWAITING_SETTLEMENT: 'aguardando acerto',
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
  await cashMovementsModel.record(tx, [
    {
      type: 'PAYMENT',
      method: payment.method,
      amount: payment.amount,
      orderId: order.id,
      userId: actor.id,
    },
  ])

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

/** Pays (part of) the repasse due to the client. */
async function registerPayout(
  tx: Transaction,
  order: LockedOrder,
  client: Client | null,
  actor: Actor,
  method: PayoutMethod,
  amount: number,
) {
  if (method === 'PIX' && !client?.pixKey) {
    throw new AppError(
      'O cliente não possui chave PIX cadastrada. Cadastre-a ou faça o repasse em dinheiro',
      400,
    )
  }

  const pixKey = method === 'PIX' ? (client?.pixKey ?? null) : null

  await ordersModel.insertPayout(tx, {
    orderId: order.id,
    paidById: actor.id,
    method,
    amount,
    pixKey,
  })

  const paidOutAmount = order.paidOutAmount + amount

  await ordersModel.update(tx, order.id, {
    paidOutAmount,
    payoutMethod: method,
  })
  await cashMovementsModel.record(tx, [
    { type: 'PAYOUT', method, amount, orderId: order.id, userId: actor.id },
  ])

  await auditsService.log(
    {
      actor,
      action: 'PAYOUT',
      entity: 'ORDER',
      entityId: order.id,
      description: `Repassou ${formatBRL(amount)} em ${method === 'PIX' ? 'PIX' : 'dinheiro'} para ${client?.name ?? 'o cliente'} na comanda #${order.code}`,
      metadata: {
        payoutAmount: amount,
        payoutMethod: method,
        paidOutAmount,
        due: order.payoutAmount,
        pixKey: pixKey ?? undefined,
      },
    },
    tx,
  )

  return paidOutAmount
}

/** Checks the sum of the parts of a payment against what can be paid now. */
function sumParts(parts: { amount: number }[], max: number, message: string) {
  const total = parts.reduce((sum, part) => sum + part.amount, 0)

  if (total > max) {
    throw new AppError(
      `${message} (${formatBRL(total)}) não pode passar de ${formatBRL(max)}`,
      400,
    )
  }

  return total
}

/**
 * Registers a payment split in parts (part in PIX, part in cash): one
 * payment per part. Every part is checked before any of them is saved.
 */
async function registerPaymentParts(
  tx: Transaction,
  order: LockedOrder,
  actor: Actor,
  parts: PaymentPart[],
  max: number,
) {
  sumParts(parts, max, 'O pagamento')

  const payments = parts.map((part) => ({
    ...buildPayment(part.method, part.amount, part.receivedAmount),
    method: part.method,
  }))
  let paidAmount = order.paidAmount

  for (const payment of payments) {
    paidAmount = await registerPayment(
      tx,
      { ...order, paidAmount },
      actor,
      payment,
    )
  }

  return {
    paidAmount,
    changeAmount: payments.reduce((sum, p) => sum + p.changeAmount, 0),
  }
}

/** Pays (part of) the repasse, split in PIX and cash parts. */
async function registerPayoutParts(
  tx: Transaction,
  order: LockedOrder,
  client: Client | null,
  actor: Actor,
  parts: PayoutPart[],
  max: number,
) {
  sumParts(parts, max, 'O repasse')

  if (parts.some((part) => part.method === 'PIX') && !client?.pixKey) {
    throw new AppError(
      'O cliente não possui chave PIX cadastrada. Cadastre-a ou faça o repasse em dinheiro',
      400,
    )
  }

  let paidOutAmount = order.paidOutAmount

  for (const part of parts) {
    paidOutAmount = await registerPayout(
      tx,
      { ...order, paidOutAmount },
      client,
      actor,
      part.method,
      part.amount,
    )
  }

  return paidOutAmount
}

/** Records a change in the value sold on credit (ledger of the cashier). */
async function recordSale(
  tx: Executor,
  orderId: string,
  amount: number,
  actor: Actor,
) {
  await cashMovementsModel.record(tx, [
    { type: 'SALE', amount, orderId, userId: actor.id },
  ])
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
      await recordSale(tx, orderId, value, actor)

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
      await recordSale(tx, orderId, difference * item.unitPrice, actor)

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
      await recordSale(tx, orderId, -item.total, actor)

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
  /** Advance payment (adiantamento), split in PIX and cash if needed. */
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

      const { changeAmount } = await registerPaymentParts(
        tx,
        order,
        actor,
        payload.payments,
        openAmount,
      )

      return { order: await getDetailsOrFail(orderId, tx), changeAmount }
    })
  },
  /**
   * Closes the order with the chips the client returned: the operation fee
   * is charged on them and the net value pays the debt. What is left (the
   * client still owes, or the house owes the repasse) can be paid now, in
   * part or in full; otherwise the order waits for the settlement (acerto).
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
      const payments = payload.payments ?? []
      const payouts = payload.payouts ?? []

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

      if (payments.length > 0 && settlement.remainingDebt === 0) {
        throw new AppError(
          'Não há valor a receber: as fichas devolvidas já cobrem a dívida',
          400,
        )
      }

      if (payouts.length > 0 && settlement.payoutAmount === 0) {
        throw new AppError('Não há repasse a fazer nesta comanda', 400)
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

      await cashMovementsModel.record(tx, [
        {
          type: 'CHIP_RETURN',
          amount: returnedAmount,
          orderId,
          userId: actor.id,
        },
        {
          type: 'FEE',
          amount: settlement.feeAmount,
          orderId,
          userId: actor.id,
        },
      ])

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

      // The payout due is part of the order before anything is paid back
      const current: LockedOrder = {
        ...order,
        payoutAmount: settlement.payoutAmount,
      }
      let changeAmount = 0

      if (settlement.chipsApplied > 0) {
        current.paidAmount = await registerPayment(tx, current, actor, {
          method: 'CHIPS',
          amount: settlement.chipsApplied,
          receivedAmount: settlement.chipsApplied,
          changeAmount: 0,
        })
      }

      if (payments.length > 0) {
        const result = await registerPaymentParts(
          tx,
          current,
          actor,
          payments,
          settlement.remainingDebt,
        )
        current.paidAmount = result.paidAmount
        changeAmount = result.changeAmount
      }

      if (payouts.length > 0) {
        current.paidOutAmount = await registerPayoutParts(
          tx,
          current,
          client,
          actor,
          payouts,
          settlement.payoutAmount,
        )
      }

      const pendingDebt = current.total - current.paidAmount
      const pendingPayout = current.payoutAmount - current.paidOutAmount
      const awaiting = pendingDebt > 0 || pendingPayout > 0
      const now = new Date()

      await ordersModel.update(tx, orderId, {
        status: awaiting ? 'AWAITING_SETTLEMENT' : 'CLOSED',
        returnedAmount,
        feeRate,
        feeAmount: settlement.feeAmount,
        payoutAmount: settlement.payoutAmount,
        closedAt: now,
        closedById: actor.id,
        settledAt: awaiting ? null : now,
      })

      const pendingText =
        pendingDebt > 0
          ? `. Aguardando acerto: ${client?.name ?? 'o cliente'} deve ${formatBRL(pendingDebt)}`
          : pendingPayout > 0
            ? `. Aguardando acerto: repasse de ${formatBRL(pendingPayout)} pendente para ${client?.name ?? 'o cliente'}`
            : ''

      await auditsService.log(
        {
          actor,
          action: 'CLOSE',
          entity: 'ORDER',
          entityId: orderId,
          description: `Finalizou a comanda #${order.code}: ${formatBRL(order.total)} em fichas vendidas, ${formatBRL(returnedAmount)} devolvidas e ${formatBRL(current.paidOutAmount)} repassados${pendingText}`,
          metadata: {
            total: order.total,
            returnedAmount,
            pendingDebt,
            pendingPayout,
            ...settlement,
          },
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
  /**
   * Acerto of an order awaiting settlement, in full or in parts: the client
   * pays what he still owes, or the house pays the pending repasse (both can
   * be split in PIX and cash). The order is closed when nothing is left.
   */
  settle: async (
    orderId: string,
    payload: SettlePayload,
    actor: Actor,
  ): Promise<PaymentResult> => {
    return db.transaction(async (tx) => {
      const order = await ordersModel.lock(tx, orderId)

      if (!order) {
        throw new AppError('Comanda não encontrada', 404)
      }

      if (order.status !== 'AWAITING_SETTLEMENT') {
        throw new AppError(
          `Esta comanda está ${statusLabel[order.status]} e não possui acerto pendente`,
          400,
        )
      }

      const debt = order.total - order.paidAmount
      const pendingPayout = order.payoutAmount - order.paidOutAmount
      const payments = payload.payments ?? []
      const payouts = payload.payouts ?? []
      const current = { ...order }
      let changeAmount = 0

      if (debt > 0) {
        if (payouts.length > 0 || payments.length === 0) {
          throw new AppError(
            `O cliente deve ${formatBRL(debt)}: informe o pagamento`,
            400,
          )
        }

        const result = await registerPaymentParts(
          tx,
          current,
          actor,
          payments,
          debt,
        )
        current.paidAmount = result.paidAmount
        changeAmount = result.changeAmount
      } else if (pendingPayout > 0) {
        if (payments.length > 0 || payouts.length === 0) {
          throw new AppError(
            `A casa deve ${formatBRL(pendingPayout)} ao cliente: informe o repasse`,
            400,
          )
        }

        const client = await clientsModel.getById(order.clientId, tx)

        current.paidOutAmount = await registerPayoutParts(
          tx,
          current,
          client,
          actor,
          payouts,
          pendingPayout,
        )
      }

      const settled =
        current.total - current.paidAmount <= 0 &&
        current.payoutAmount - current.paidOutAmount <= 0

      if (settled) {
        await ordersModel.update(tx, orderId, {
          status: 'CLOSED',
          settledAt: new Date(),
        })

        await auditsService.log(
          {
            actor,
            action: 'CLOSE',
            entity: 'ORDER',
            entityId: orderId,
            description: `Concluiu o acerto da comanda #${order.code}`,
            metadata: {
              paidAmount: current.paidAmount,
              paidOutAmount: current.paidOutAmount,
            },
          },
          tx,
        )
      }

      return { order: await getDetailsOrFail(orderId, tx), changeAmount }
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
      // Nothing was paid: the whole sale is undone
      await recordSale(tx, orderId, -order.total, actor)

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
