#!/usr/bin/env node
/**
 * Applies any unapplied migrations from db/migrations.
 *
 * NOT part of the build — Vercel's build only runs `vite build`, so a fresh
 * database (or a new migration) needs this run by hand: `DATABASE_URL=… npm
 * run db:migrate`, against a local Postgres or production from a machine that
 * can reach it.
 *
 * With no database configured it says so and exits cleanly.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

const url = process.env.DATABASE_URL

if (!url) {
  console.log('No database connection string found (DATABASE_URL). Skipping migrations.')
  process.exit(0)
}

const pool = new pg.Pool({
  connectionString: url,
  // Managed Postgres requires TLS; a local instance does not offer it.
  ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  max: 1,
})

try {
  await migrate(drizzle(pool), { migrationsFolder: 'db/migrations' })
  console.log('Database migrations are up to date.')
} catch (error) {
  console.error('Migration failed:', error)
  process.exitCode = 1
} finally {
  await pool.end()
}
