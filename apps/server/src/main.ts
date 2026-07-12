import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app'

// Load apps/server/.env for local Neon (no-op if the file is missing).
loadEnv({ path: resolve(fileURLToPath(new URL('.', import.meta.url)), '../.env') })

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '0.0.0.0'

const { httpServer } = createApp()

httpServer.listen(PORT, HOST, () => {
  const db = process.env.DATABASE_URL ? 'postgres (Neon)' : 'in-memory'
  console.log(`Game server listening on http://${HOST}:${PORT} [history: ${db}]`)
})
