import Elysia from 'elysia'
import { transactionsController } from '@/modules/transactions/transactions.controller'

export const routes = new Elysia()
  .post('/', async () => {
    return { message: `Welcome to the Template API` }
  })
  .post('/test', async () => {
    return { message: `Hello` }
  })
  .use(transactionsController)
