import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const here = dirname(fileURLToPath(import.meta.url))

/** Applies the checked-in SQL migrations (idempotent, in order) against DATABASE_URL (Neon). */
export const migrate = async (databaseUrl: string): Promise<void> => {
  const sql = postgres(databaseUrl, { max: 1 })
  const dir = join(here, '../../drizzle')
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  try {
    for (const file of files) {
      await sql.unsafe(readFileSync(join(dir, file), 'utf8'))
    }
  } finally {
    await sql.end()
  }
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

migrate(url)
  .then(() => {
    console.log('Migration applied')
    process.exit(0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
