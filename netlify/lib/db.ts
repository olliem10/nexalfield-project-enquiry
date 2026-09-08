/**
 * The Netlify Database connection.
 *
 * `getDatabase()` reports which driver the platform gave us: a plain Postgres
 * pool locally under `netlify dev`, and Neon's serverless pool in production.
 * Both are pool-shaped and both support transactions, so the rest of the server
 * never has to care which one it got.
 */
import { getDatabase } from '@netlify/database'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless'
import { drizzle as drizzleNode } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.ts'

type Database =
  | ReturnType<typeof drizzleNode<typeof schema>>
  | ReturnType<typeof drizzleNeon<typeof schema>>

let cached: Database | undefined

/**
 * Finds the connection string.
 *
 * `@netlify/database` reads `NETLIFY_DB_URL` itself, but the variable Netlify
 * documents and injects into a site is `NETLIFY_DATABASE_URL`. Rather than
 * depending on which of the two a given runtime happens to set, whichever is
 * present is passed in explicitly; if neither is, the package falls back to its
 * own lookup and raises its own (clearer) error.
 */
function connectionString(): string | undefined {
  return (
    process.env.NETLIFY_DATABASE_URL ||
    process.env.NETLIFY_DB_URL ||
    process.env.DATABASE_URL ||
    undefined
  )
}

/**
 * Reused across invocations on a warm container: opening a pool per request is
 * what exhausts a Postgres connection limit under any real load.
 */
export function getDb(): Database {
  if (cached) return cached

  const url = connectionString()
  const connection = getDatabase(url ? { connectionString: url } : {})

  cached =
    connection.driver === 'serverless'
      ? drizzleNeon(connection.pool, { schema })
      : drizzleNode(connection.pool, { schema })

  return cached
}

export { schema }
