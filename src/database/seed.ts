/**
 * Populates the database with sample data. Everything goes through the
 * services, so stock, limits, payments and audit logs follow the same rules
 * as the API.
 *
 * Usage: bun run seed  (WARNING: erases all existing data)
 */
import { sql } from 'drizzle-orm'
import { db } from '@/config/database'
import { chipsService } from '@/modules/chips/chips.service'
import { clientsService } from '@/modules/clients/clients.service'
import { exchangesService } from '@/modules/exchanges/exchanges.service'
import { ordersService } from '@/modules/orders/orders.service'
import { settingsService } from '@/modules/settings/settings.service'
import { usersModel } from '@/modules/users/users.model'
import { usersService } from '@/modules/users/users.service'
import { UserRole } from '@/shared/auth/roles'
import { hashPassword } from '@/shared/utils/passwords'

const SEED_IP = '127.0.0.1'
const K = 1000 * 100 // 1K in cents

async function reset() {
  await db.execute(sql`
    TRUNCATE TABLE
      audit_logs, refresh_tokens, exchange_items, exchanges,
      order_chip_returns, order_payments, order_items, orders,
      chips, clients, settings, users
    RESTART IDENTITY CASCADE
  `)
}

async function main() {
  console.log('🌱 Resetting database...')
  await reset()

  console.log('👤 Users...')
  // The first admin has no actor to create it
  const admin = await usersModel.create({
    name: 'Administrador',
    username: 'admin',
    password: await hashPassword('admin123'),
    role: UserRole.ADMIN,
  })
  const actor = { id: admin.id, role: admin.role, ip: SEED_IP }
  const seller = await usersService.create(
    {
      name: 'Vendedor',
      username: 'vendedor',
      password: 'vendedor123',
      role: UserRole.SELLER,
    },
    { ...admin, ip: SEED_IP },
  )
  const sellerActor = { id: seller.id, ip: SEED_IP }

  console.log('⚙️  Settings...')
  await settingsService.update({ feeRate: 1000, chipLimit: 50 * K }, actor)

  console.log('🎰 Chips...')
  const chips = []
  for (const [value, quantity] of [
    [1, 500],
    [5, 300],
    [10, 200],
    [25, 100],
    [100, 50],
  ] as const) {
    chips.push(await chipsService.create({ price: value * K, quantity }, actor))
  }
  const [chip1, chip5, chip10, chip25, chip100] = chips
  if (!chip1 || !chip5 || !chip10 || !chip25 || !chip100) return

  console.log('🧑 Clients...')
  const ana = await clientsService.create(
    {
      name: 'Ana Paula',
      document: '123.456.789-00',
      phone: '(45) 99999-0001',
      pixKey: 'ana@email.com',
      pixKeyType: 'EMAIL',
    },
    sellerActor,
  )
  const bruno = await clientsService.create(
    { name: 'Bruno Oliveira', phone: '(45) 99999-0002' },
    sellerActor,
  )
  const carlos = await clientsService.create(
    {
      name: 'Carlos Eduardo',
      document: '987.654.321-00',
      pixKey: '45999990003',
      pixKeyType: 'PHONE',
    },
    sellerActor,
  )
  await clientsService.create({ name: 'Daniela Lima' }, sellerActor)
  const eduardo = await clientsService.create(
    {
      name: 'Eduardo Santos',
      pixKey: 'eduardo@email.com',
      pixKeyType: 'EMAIL',
    },
    sellerActor,
  )
  // Only admins raise the limit
  await clientsService.update(eduardo.id, { chipLimit: 500 * K }, actor)

  console.log('🧾 Orders...')
  // Eduardo buys 300K, pays it in advance and loses them at the tables: these
  // chips are the ones the other clients return below
  let order = await ordersService.create(
    { clientId: eduardo.id, notes: 'Mesa 1' },
    sellerActor,
  )
  await ordersService.addItem(
    order.id,
    { chipId: chip100.id, quantity: 3 },
    sellerActor,
  )
  await ordersService.addPayment(
    order.id,
    { method: 'PIX', amount: 300 * K },
    sellerActor,
  )

  // Scenario 1: 25K on credit, returns 100K -> 65K paid back
  order = await ordersService.create({ clientId: ana.id }, sellerActor)
  await ordersService.addItem(
    order.id,
    { chipId: chip25.id, quantity: 1 },
    sellerActor,
  )
  await ordersService.close(
    order.id,
    {
      returnedChips: [{ chipId: chip100.id, quantity: 1 }],
      payoutMethod: 'PIX',
    },
    sellerActor,
  )

  // Scenario 2: buys nothing, returns 100K -> 90K paid back
  order = await ordersService.create({ clientId: bruno.id }, sellerActor)
  await ordersService.close(
    order.id,
    {
      returnedChips: [{ chipId: chip10.id, quantity: 10 }],
      payoutMethod: 'CASH',
    },
    sellerActor,
  )

  // Scenario 3: 25K, advance of 10K -> 75K paid back
  order = await ordersService.create({ clientId: carlos.id }, sellerActor)
  await ordersService.addItem(
    order.id,
    { chipId: chip5.id, quantity: 5 },
    sellerActor,
  )
  await ordersService.addPayment(
    order.id,
    { method: 'PIX', amount: 10 * K },
    sellerActor,
  )
  await ordersService.close(
    order.id,
    {
      returnedChips: [{ chipId: chip100.id, quantity: 1 }],
      payoutMethod: 'PIX',
    },
    sellerActor,
  )

  // Open orders
  order = await ordersService.create(
    { clientId: ana.id, notes: 'Mesa 2' },
    sellerActor,
  )
  await ordersService.addItem(
    order.id,
    { chipId: chip10.id, quantity: 2 },
    sellerActor,
  )
  await ordersService.addItem(
    order.id,
    { chipId: chip1.id, quantity: 5 },
    sellerActor,
  )
  order = await ordersService.create({ clientId: bruno.id }, sellerActor)
  await ordersService.addItem(
    order.id,
    { chipId: chip5.id, quantity: 3 },
    sellerActor,
  )
  await ordersService.addPayment(
    order.id,
    { method: 'CASH', amount: 5 * K, receivedAmount: 6 * K },
    sellerActor,
  )

  console.log('🔁 Exchanges...')
  await exchangesService.create(
    {
      clientId: ana.id,
      items: [
        { chipId: chip5.id, direction: 'IN', quantity: 1 },
        { chipId: chip1.id, direction: 'OUT', quantity: 5 },
      ],
    },
    sellerActor,
  )

  console.log(`
✅ Seed finished. Users:
   admin    / admin123     (ADMIN)
   vendedor / vendedor123  (SELLER)
`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Seed failed:', error)
    process.exit(1)
  })
