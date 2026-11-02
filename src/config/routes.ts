import Elysia from 'elysia'
import { auditsController } from '@/modules/audits/audits.controller'
import { authController } from '@/modules/auth/auth.controller'
import { chipsController } from '@/modules/chips/chips.controller'
import { clientsController } from '@/modules/clients/clients.controller'
import { dashboardController } from '@/modules/dashboard/dashboard.controller'
import { exchangesController } from '@/modules/exchanges/exchanges.controller'
import { ordersController } from '@/modules/orders/orders.controller'
import { settingsController } from '@/modules/settings/settings.controller'
import { usersController } from '@/modules/users/users.controller'

export const routes = new Elysia()
  .get('/', () => ({ message: 'Welcome to the Binder Manager API' }))
  .use(authController)
  .use(usersController)
  .use(settingsController)
  .use(clientsController)
  .use(chipsController)
  .use(ordersController)
  .use(exchangesController)
  .use(dashboardController)
  .use(auditsController)
