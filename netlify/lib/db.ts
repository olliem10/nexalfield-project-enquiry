/**
 * The database connection.
 *
 * Two ways in, chosen by where the code is running:
 *
 * - On Netlify, `@netlify/database` hands over the connection the platform
 *   provisioned, and knows whether to use a plain pool or Neon's serverless
 *   one.
 * - Anywhere else — Vercel, a plain Node host, the test harness — a normal
 *   `pg` pool over `DATABASE_URL`. That works against Neon, Supabase, RDS or a
 *   local Postgres without caring which.
 *
 * Both end up as the same Drizzle instance, so nothing downstream has to know.
 */
import { getDatabase } from '@netlify/database'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless'
import { drizzle as drizzleNode } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from '../../db/schema.ts'

type Database =
  | ReturnType<typeof drizzleNode<typeof schema>>
  | ReturnType<typeof drizzleNeon<typeof schema>>

let cached: Database | undefined

/**
 * Finds the connection string.
 *
 * `NETLIFY_DATABASE_URL` is what Netlify documents and injects;
 * `NETLIFY_DB_URL` is what `@netlify/database` reads internally; `DATABASE_URL`
 * is the convention everywhere else, including Vercel. Whichever is present
 * wins, so the same code deploys to either platform.
 */
export function connectionString(): string | undefined {
  return (
    process.env.NETLIFY_DATABASE_URL ||
    process.env.NETLIFY_DB_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    undefined
  )
}

/** Netlify sets this in both builds and function invocations. */
function onNetlify(): boolean {
  return Boolean(process.env.NETLIFY || process.env.NETLIFY_DEV)
}

function missing(): never {
  throw new Error(
    'No database is configured. Set DATABASE_URL (or NETLIFY_DATABASE_URL) to a Postgres connection string.',
  )
}

/**
 * Reused across invocations on a warm container: opening a pool per request is
 * what exhausts a Postgres connection limit under any real load. `max: 1`
 * because a serverless invocation handles one request at a time, so a larger
 * pool only multiplies idle connections across concurrent instances.
 */
export function getDb(): Database {
  if (cached) return cached

  const url = connectionString()

  if (onNetlify()) {
    // Let the platform decide between a plain pool and Neon's serverless one.
    const connection = getDatabase(url ? { connectionString: url } : {})
    cached =
      connection.driver === 'serverless'
        ? drizzleNeon(connection.pool, { schema })
        : drizzleNode(connection.pool, { schema })
    return cached
  }

  if (!url) missing()

  const local = /^(postgres(ql)?:\/\/)?[^@]*@?(localhost|127\.0\.0\.1)/.test(url)
  const pool = new pg.Pool({
    connectionString: url,
    // Managed Postgres requires TLS; a local instance does not offer it.
    ssl: local ? false : { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  })

  cached = drizzleNode(pool, { schema })
  return cached
}

export { schema }
