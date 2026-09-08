#!/usr/bin/env node
/**
 * Applies any unapplied migrations from netlify/database/migrations.
 *
 * Run as part of the Netlify build, so a deploy can never reach production with
 * code that expects a column the database has not got. Drizzle records what it
 * has already run, so this is safe to run on every build.
 *
 * With no database configured it says so and exits cleanly — a first build
 * before the database is provisioned should not fail the deploy.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

const url =
  process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL || process.env.DATABASE_URL

if (!url) {
  console.log(
    'No database connection string found (NETLIFY_DATABASE_URL). Skipping migrations.\n' +
      'Provision Netlify Database, or set the variable, then redeploy.',
  )
  process.exit(0)
}

const pool = new pg.Pool({
  connectionString: url,
  // Netlify Database and most managed Postgres require TLS; a local
  // `netlify dev` instance does not offer it.
  ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  max: 1,
})

try {
  await migrate(drizzle(pool), { migrationsFolder: 'netlify/database/migrations' })
  console.log('Database migrations are up to date.')
} catch (error) {
  console.error('Migration failed:', error)
  process.exitCode = 1
} finally {
  await pool.end()
}
