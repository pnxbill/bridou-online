import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Db = ReturnType<typeof createDb>

export const createDb = (databaseUrl: string) => {
  const client = postgres(databaseUrl, { max: 5, prepare: false })
  const db = drizzle(client, { schema })
  return { db, client }
}
