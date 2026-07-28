import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app'
import { migrateOnBoot } from './db/migrate'

// Load apps/server/.env for local Neon (no-op if the file is missing).
loadEnv({ path: resolve(fileURLToPath(new URL('.', import.meta.url)), '../.env') })

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '0.0.0.0'

/**
 * Schema first, then serve.
 *
 * Render's start command is just `node dist/main.js`, so this is the only place
 * a deploy can pick up new tables — without it, shipping anything that needs a
 * migration means remembering to run one by hand against production. The
 * migrations are idempotent and advisory-locked, so replaying them every boot
 * is cheap and safe even with two instances starting at once.
 *
 * A genuine failure exits non-zero rather than serving: a failed deploy leaves
 * the previous version running, which beats a live server 500ing on half its
 * routes because the tables behind them never arrived.
 */
if (process.env.DATABASE_URL) {
  try {
    await migrateOnBoot(process.env.DATABASE_URL)
  } catch (err) {
    console.error('Migrations failed — refusing to start:', err)
    process.exit(1)
  }
}

const { httpServer } = createApp()

httpServer.listen(PORT, HOST, () => {
  const db = process.env.DATABASE_URL ? 'postgres (Neon)' : 'in-memory'
  console.log(`Game server listening on http://${HOST}:${PORT} [history: ${db}]`)
})
