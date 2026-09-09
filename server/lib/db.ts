/**
 * The database connection.
 *
 * A plain `pg` pool over `DATABASE_URL` — works against Neon, Supabase, RDS or
 * a local Postgres without caring which.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from '../../db/schema.js'

type Database = ReturnType<typeof drizzle<typeof schema>>

let cached: Database | undefined

export function connectionString(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined
}

function missing(): never {
  throw new Error('No database is configured. Set DATABASE_URL to a Postgres connection string.')
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

  // The pool emits this on behalf of an idle client that hits a connection
  // problem (a managed provider closing it, a network blip) — with no
  // listener, that is an unhandled error and it crashes the whole process.
  // The next query gets a fresh connection regardless; there is nothing more
  // to do here than stop that crash.
  pool.on('error', (error) => {
    console.error('Idle database client error:', error)
  })

  cached = drizzle(pool, { schema })
  return cached
}

export { schema }
