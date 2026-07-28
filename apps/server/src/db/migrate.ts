import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Locates the checked-in SQL.
 *
 * The relative depth differs between running from source (`src/db/migrate.ts`)
 * and from the tsup bundle (`dist/main.js`), so try both rather than assume —
 * guessing wrong means a deploy that silently applies nothing.
 */
const migrationsDir = (): string => {
  const candidates = [
    resolve(here, '../../drizzle'), // src/db  → apps/server/drizzle
    resolve(here, '../drizzle'), // dist    → apps/server/drizzle
    resolve(process.cwd(), 'drizzle'), // cwd = apps/server
    resolve(process.cwd(), 'apps/server/drizzle'), // cwd = repo root
  ]
  const found = candidates.find((dir) => existsSync(dir))
  if (!found) {
    throw new Error(
      `Could not find the drizzle/ migrations directory. Tried:\n  ${candidates.join('\n  ')}`,
    )
  }
  return found
}

/**
 * Advisory-lock key. Any constant works; it only has to be the same in every
 * instance so two containers booting at once serialize instead of racing.
 */
const LOCK_KEY = 4021571

/**
 * Applies the checked-in SQL migrations (idempotent, in filename order).
 *
 * Every file is written to be safe to re-run, so this simply replays all of
 * them each time — there is no migrations table to drift out of sync with.
 */
export const migrate = async (databaseUrl: string): Promise<void> => {
  const sql = postgres(databaseUrl, {
    max: 1,
    // "relation already exists, skipping" on every boot is pure noise.
    onnotice: () => {},
  })
  const dir = migrationsDir()
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  try {
    await sql`select pg_advisory_lock(${LOCK_KEY})`
    try {
      for (const file of files) {
        await sql.unsafe(readFileSync(join(dir, file), 'utf8'))
      }
    } finally {
      await sql`select pg_advisory_unlock(${LOCK_KEY})`
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

/**
 * Boot-time migration, with retries: a sleeping Neon instance can refuse the
 * first connection after a cold start, and a deploy shouldn't die over that.
 * A genuine failure still throws, so the deploy fails loudly instead of
 * serving new code against a schema that never arrived.
 */
export const migrateOnBoot = async (databaseUrl: string, attempts = 4): Promise<void> => {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await migrate(databaseUrl)
      console.log('Migrations applied')
      return
    } catch (err) {
      if (attempt === attempts) throw err
      const waitMs = 2 ** attempt * 1000
      console.warn(
        `Migration attempt ${attempt}/${attempts} failed ` +
          `(${(err as Error).message}); retrying in ${waitMs}ms`,
      )
      await new Promise((resolveWait) => setTimeout(resolveWait, waitMs))
    }
  }
}

/*
 * No CLI entry point lives in this file on purpose. `main.ts` imports it, and
 * tsup bundles that import straight into dist/main.js — so any "am I being run
 * directly?" check here would see the bundle's own path, fire on every boot,
 * and exit the process instead of starting the server. The CLI is a separate
 * module (`migrate-cli.ts`) that tsup never bundles.
 */
