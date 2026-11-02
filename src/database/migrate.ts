/**
 * Applies the pending migrations without drizzle-kit (a dev dependency that
 * is not installed in the production image). Runs before each deploy.
 *
 * Usage: bun run migrate:prod
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

const url = process.env.DATABASE_URL

async function main() {
  if (!url) {
    throw new Error('DATABASE_URL must be set')
  }

  await migrate(drizzle(url), {
    migrationsFolder: `${import.meta.dir}/migrations`,
  })

  console.log('✅ Migrations applied.')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  })
