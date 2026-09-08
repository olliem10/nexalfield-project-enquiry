#!/usr/bin/env node
/**
 * Applies any unapplied migrations from netlify/database/migrations.
 *
 * NOT part of the Netlify build. Netlify's own database extension runs the
 * files in that directory after the build, using its own migration tracker —
 * so having this run during the build meant two runners with two trackers, and
 * the second one re-ran 0000 and failed the deploy on `relation
 * "checklist_items" already exists`.
 *
 * Netlify owns migrations on deploy. This script is for running them by hand:
 * against a local `netlify dev` database, or against production from a machine
 * that can reach it.
 *
 * With no database configured it says so and exits cleanly.
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
