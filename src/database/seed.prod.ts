/**
 * Production seed: creates only the first admin. It never erases data and is
 * safe to run more than once (skips if the username already exists).
 *
 * Usage:
 *   SEED_ADMIN_PASSWORD=... bun run seed:prod
 *
 * Optional: SEED_ADMIN_USERNAME (default "admin"),
 *           SEED_ADMIN_NAME (default "Administrador")
 */
import { usersModel } from '@/modules/users/users.model'
import { UserRole } from '@/shared/auth/roles'
import { hashPassword } from '@/shared/utils/passwords'

const username = process.env.SEED_ADMIN_USERNAME ?? 'admin'
const name = process.env.SEED_ADMIN_NAME ?? 'Administrador'
const password = process.env.SEED_ADMIN_PASSWORD

async function main() {
  if (!password || password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD must be set (min. 8 characters)')
  }

  const existing = await usersModel.getByUsername(username)
  if (existing) {
    console.log(`ℹ️  User "${username}" already exists, nothing to do.`)
    return
  }

  // The first admin has no actor to create it
  await usersModel.create({
    name,
    username,
    password: await hashPassword(password),
    role: UserRole.ADMIN,
  })

  console.log(`✅ Admin "${username}" created.`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Seed failed:', error)
    process.exit(1)
  })
