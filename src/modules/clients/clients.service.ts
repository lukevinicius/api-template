import { isAdmin, type UserRole } from '@/shared/auth/roles'
import { AppError } from '@/shared/utils/errors/AppError'
import { formatBRL } from '@/shared/utils/money'
import { auditsService } from '../audits/audits.service'
import type { Actor } from '../audits/audits.types'
import { settingsModel } from '../settings/settings.model'
import { clientsModel } from './clients.model'
import type {
  Client,
  ClientReport,
  ClientWithSummary,
  CreateClientPayload,
  UpdateClientPayload,
} from './clients.types'

type ClientActor = Actor & { role: UserRole }

// Empty strings become null; undefined means "not sent"
const clean = (value: string | null | undefined) =>
  value === undefined ? undefined : value?.trim() || null

function normalize<T extends Partial<CreateClientPayload>>(payload: T): T {
  return {
    ...payload,
    name: payload.name?.trim(),
    document: clean(payload.document),
    phone: clean(payload.phone),
    pixKey: clean(payload.pixKey),
  } as T
}

function assertPixKey(payload: Partial<CreateClientPayload>, current?: Client) {
  const pixKey = payload.pixKey === undefined ? current?.pixKey : payload.pixKey
  const pixKeyType =
    payload.pixKeyType === undefined ? current?.pixKeyType : payload.pixKeyType

  if (pixKey && !pixKeyType) {
    throw new AppError('Informe o tipo da chave PIX', 400)
  }
}

async function assertDocumentAvailable(document: string, clientId?: string) {
  const existing = await clientsModel.getByDocument(document)

  if (existing && existing.id !== clientId) {
    throw new AppError(
      `Já existe um cliente com este documento (${existing.name})`,
      409,
    )
  }
}

export const clientsService = {
  create: async (
    payload: CreateClientPayload,
    actor: Actor,
  ): Promise<Client> => {
    const data = normalize(payload)

    assertPixKey(data)
    if (data.document) await assertDocumentAvailable(data.document)

    // Every new client starts with the limit configured by the admin
    const { chipLimit } = await settingsModel.get()
    const client = await clientsModel.create({
      ...data,
      pixKeyType: data.pixKey ? data.pixKeyType : null,
      chipLimit,
    })

    await auditsService.log({
      actor,
      action: 'CREATE',
      entity: 'CLIENT',
      entityId: client.id,
      description: `Cadastrou o cliente ${client.name} com limite de ${formatBRL(chipLimit)} em fichas`,
    })

    return client
  },
  fetch: async (search?: string): Promise<ClientWithSummary[]> => {
    return clientsModel.fetch(search?.trim() || undefined)
  },
  getById: async (clientId: string): Promise<Client> => {
    const client = await clientsModel.getById(clientId)

    if (!client) {
      throw new AppError('Cliente não encontrado', 404)
    }

    return client
  },
  /** Client with the chips owed in open orders and the limit still free. */
  getSummary: async (clientId: string): Promise<ClientWithSummary> => {
    const client = await clientsService.getById(clientId)
    const [openAmount, report] = await Promise.all([
      clientsModel.getOpenAmount(clientId),
      clientsModel.getReport(clientId),
    ])

    return {
      ...client,
      openOrders: report.openOrdersCount,
      openAmount,
      pendingPayout: report.totalPendingPayout,
      availableLimit: Math.max(client.chipLimit - openAmount, 0),
    }
  },
  getReport: async (clientId: string): Promise<ClientReport> => {
    await clientsService.getById(clientId)

    return clientsModel.getReport(clientId)
  },
  update: async (
    clientId: string,
    payload: UpdateClientPayload,
    actor: ClientActor,
  ): Promise<Client> => {
    const client = await clientsService.getById(clientId)

    if (
      payload.chipLimit !== undefined &&
      payload.chipLimit !== client.chipLimit &&
      !isAdmin(actor.role)
    ) {
      throw new AppError(
        'Apenas administradores podem alterar o limite de fichas',
        403,
      )
    }

    const data = normalize(payload)

    assertPixKey(data, client)
    if (data.document && data.document !== client.document) {
      await assertDocumentAvailable(data.document, clientId)
    }
    if (data.pixKey === null) data.pixKeyType = null

    const updated = await clientsModel.update(clientId, data)

    await auditsService.log({
      actor,
      action: 'UPDATE',
      entity: 'CLIENT',
      entityId: clientId,
      description:
        payload.chipLimit !== undefined &&
        payload.chipLimit !== client.chipLimit
          ? `Editou o cliente ${client.name} e alterou o limite de ${formatBRL(client.chipLimit)} para ${formatBRL(payload.chipLimit)}`
          : `Editou o cliente ${client.name}`,
      metadata: { before: client, changes: payload },
    })

    return updated
  },
  delete: async (clientId: string, actor: Actor): Promise<void> => {
    const client = await clientsService.getById(clientId)
    const report = await clientsModel.getReport(clientId)

    if (report.openOrdersCount > 0) {
      throw new AppError(
        'Este cliente possui uma comanda aberta. Finalize-a ou cancele-a antes de excluir',
        400,
      )
    }

    await clientsModel.softDelete(clientId)

    await auditsService.log({
      actor,
      action: 'DELETE',
      entity: 'CLIENT',
      entityId: clientId,
      description: `Excluiu o cliente ${client.name}`,
    })
  },
}
