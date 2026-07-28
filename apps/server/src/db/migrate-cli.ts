import { migrate } from './migrate'

/**
 * `pnpm --filter @bridou/server db:migrate` — run migrations by hand.
 *
 * Deploys don't need this: `main.ts` migrates on boot. It stays for local work
 * against a Neon branch, and as the escape hatch when you want to apply the
 * schema without starting a server.
 *
 * It lives apart from `migrate.ts` because that module gets bundled into
 * dist/main.js; a top-level `process.exit` in there would kill the server.
 */
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
